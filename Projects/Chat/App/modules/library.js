// ── Chat library (pinned, starred, media, files, links) and the pinned-message banner ───────────
// Everything here is built from the messages already in the open chat. Pins are shared with the chat,
// stars are private to this device.
import { S } from './state.js';
import { el, escH, fmtTime, fmtSz, toast } from './utils.js';
import { iconSvg } from './icons.js';
import { getActiveSess } from './sessions.js';
import { extractUrls } from './text-format.js';
import { previewText, togglePin, toggleStar } from './msg-features.js';
import { jumpTo } from './msg-ui.js';

// ── Pinned banner ───────────────────────────────────────────────────────────────────────────────
const pinsOf = sess => sess.messages.filter(m => m.pinned && !m.deleted).sort((a, b) => b.pinned.at - a.pinned.at);

export function renderPinBanner(sess = getActiveSess()) {
	const b = el('pinBanner'); if (!b) return;
	const pins = sess ? pinsOf(sess) : [];
	if (!pins.length) { b.style.display = 'none'; return; }
	const i = (sess._pinIdx || 0) % pins.length, m = pins[i];
	el('pbIco').innerHTML = iconSvg('bookmark', 1);
	el('pbTitle').textContent = pins.length > 1 ? `Pinned message ${i + 1} of ${pins.length}` : 'Pinned message';
	el('pbText').textContent = `${m.sender}: ${previewText(m)}`.slice(0, 140);
	b.style.display = 'flex';
}

export function pinBannerClick() {
	const sess = getActiveSess(); if (!sess) return;
	const pins = pinsOf(sess); if (!pins.length) return;
	const i = (sess._pinIdx || 0) % pins.length;
	jumpTo(pins[i].id);
	sess._pinIdx = (i + 1) % pins.length; renderPinBanner(sess);   // next click shows the next pin
}

// ── Library dialog ──────────────────────────────────────────────────────────────────────────────
const TABS = [['pinned', 'Pinned'], ['starred', 'Starred'], ['media', 'Media'], ['files', 'Files'], ['links', 'Links']];
let overlay = null, tab = 'media', zoomUrls = [];

const newest = (a, b) => b.timestamp - a.timestamp;
const urlOf = m => m.file?.blobUrl || m.file?.dataUrl || null;
const isMedia = m => !m.file?.voice && /^(image|video)\//.test(m.file?.mime || '');

function collect(sess) {
	const live = sess.messages.filter(m => !m.deleted && m.type !== 'system' && m.type !== 'call');
	const files = live.filter(m => m.type === 'file').sort(newest);
	return {
		pinned: pinsOf(sess), starred: live.filter(m => m.starred).sort(newest),
		media: files.filter(isMedia), files: files.filter(m => !isMedia(m)),
		links: live.filter(m => m.type === 'text').sort(newest).flatMap(m => extractUrls(m.content).map(u => ({ m, u }))),
	};
}

const when = ts => { const d = new Date(ts); return (d.toDateString() === new Date().toDateString() ? '' : d.toLocaleDateString('default', { month: 'short', day: 'numeric' }) + ', ') + fmtTime(ts); };
const who = m => `${escH(m.sender)} · ${when(m.timestamp)}`;
const row = (m, inner, actions = '') => `<div class="lib-row"><div class="lib-main" data-lib-jump="${escH(m.id)}">${inner}<div class="lib-sub">${who(m)}</div></div>${actions}</div>`;

function body(sess, d) {
	zoomUrls = [];
	if (tab === 'media') {
		if (!d.media.length) return empty('No photos or videos yet');
		return `<div class="lib-grid">${d.media.map(m => {
			const u = urlOf(m), img = (m.file.mime || '').startsWith('image/');
			let inner;
			if (!u) inner = `<div class="lib-ph">${iconSvg('photo', 1.6)}</div>`;
			else if (img) { zoomUrls.push(u); inner = `<img src="${escH(u)}" alt="${escH(m.file.name)}" loading="lazy" data-lib-zoom="${zoomUrls.length - 1}">`; }
			else inner = `<video src="${escH(u)}" preload="metadata" muted data-lib-jump="${escH(m.id)}"></video>`;
			return `<div class="lib-tile">${inner}<div class="lib-cap" data-lib-jump="${escH(m.id)}">${escH(m.sender)} · ${when(m.timestamp)}</div></div>`;
		}).join('')}</div>`;
	}
	if (tab === 'files') {
		if (!d.files.length) return empty('No files yet');
		return d.files.map(m => {
			const u = urlOf(m), name = m.file?.voice ? 'Voice message' : m.file?.name || m.content;
			const dl = u ? `<a class="icon-btn lib-act" href="${escH(u)}" download="${escH(m.file?.name || 'file')}" title="Save">${iconSvg('file', 1)}</a>` : '';
			return row(m, `<div class="lib-title">${escH(name)}</div><div class="lib-sub">${fmtSz(m.file?.size || 0)}</div>`, dl);
		}).join('');
	}
	if (tab === 'links') {
		if (!d.links.length) return empty('No links shared yet');
		return d.links.map(({ m, u }) => {
			let host = ''; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch {}
			return row(m, `<div class="lib-title">${escH(host)}</div><a class="lib-url" href="${escH(u)}" target="_blank" rel="noopener noreferrer nofollow">${escH(u)}</a>`);
		}).join('');
	}
	const list = tab === 'pinned' ? d.pinned : d.starred;
	if (!list.length) return empty(tab === 'pinned' ? 'Nothing pinned. Tap a message and choose Pin.' : 'No starred messages. Tap a message and choose Star.');
	return list.map(m => row(m, `<div class="lib-title">${escH(previewText(m)).slice(0, 200)}</div>`,
		`<button type="button" class="icon-btn lib-act" data-lib-un="${escH(m.id)}" title="${tab === 'pinned' ? 'Unpin' : 'Unstar'}">${iconSvg(tab === 'pinned' ? 'bookmark' : 'star', 1)}</button>`)).join('');
}
const empty = t => `<div class="lib-empty">${escH(t)}</div>`;

function paint() {
	const sess = getActiveSess(); if (!overlay || !sess) return;
	const d = collect(sess);
	overlay.querySelector('.lib-tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" class="lib-tab${k === tab ? ' on' : ''}" data-lib-tab="${k}">${l}${d[k].length ? ` <span>${d[k].length}</span>` : ''}</button>`).join('');
	overlay.querySelector('.lib-body').innerHTML = body(sess, d);
}

export function closeLibrary() { overlay?.remove(); overlay = null; }

export function openLibrary(start) {
	const sess = getActiveSess(); if (!sess) return;
	closeLibrary();
	const d = collect(sess);
	tab = start || (d.pinned.length ? 'pinned' : 'media');
	overlay = document.createElement('div'); overlay.className = 'modal-overlay open';
	overlay.innerHTML = `<div class="modal-box lib-box"><div class="modal-head"><span class="modal-title">Pinned, starred &amp; shared</span><button class="panel-close" type="button" data-lib-close title="Close">${iconSvg('x', 1)}</button></div><div class="lib-tabs"></div><div class="lib-body"></div></div>`;
	overlay.addEventListener('click', e => {
		const t = e.target;
		if (t === overlay || t.closest('[data-lib-close]')) { closeLibrary(); return; }
		const tb = t.closest('[data-lib-tab]'); if (tb) { tab = tb.dataset.libTab; paint(); return; }
		const z = t.closest('[data-lib-zoom]'); if (z) { window.App?.openLightbox?.(zoomUrls[Number(z.dataset.libZoom)]); return; }
		const un = t.closest('[data-lib-un]');
		if (un) { const m = sess.messages.find(x => x.id === un.dataset.libUn); if (m) { (tab === 'pinned' ? togglePin : toggleStar)(sess, m); paint(); } return; }
		const j = t.closest('[data-lib-jump]');
		if (j && !t.closest('a')) { closeLibrary(); jumpTo(j.dataset.libJump); }
	});
	document.body.appendChild(overlay); paint();
}
