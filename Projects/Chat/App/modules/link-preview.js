// ── Link previews (Open Graph) ─────────────────────────────────────────────
// The first link in a text message gets a preview card. The page is fetched by our Cloudflare function
// (functions/api/og.js) — never by this browser — and the preview image is served through the same function,
// so the linked site never sees the reader's address. Encrypted messages are not previewed, and the whole
// feature can be switched off in Settings.
import { S } from './state.js';
import { escH } from './utils.js';
import { extractUrls } from './text-format.js';

const API = 'https://proelectriccoder.pages.dev/api/og';
const cache = new Map(); // url -> Promise<preview | null>

export function fetchPreview(url) {
	if (cache.has(url)) return cache.get(url);
	const p = (async () => {
		const r = await fetch(`${API}?url=${encodeURIComponent(url)}`);
		if (!r.ok) return null;
		const d = await r.json();
		return d && (d.title || d.description || d.image) ? d : null;
	})().catch(() => null);
	cache.set(url, p);
	return p;
}

const isHttp = u => /^https?:\/\//i.test(u || '');

export function previewCardHtml(d, url) {
	const href = isHttp(d.url) ? d.url : url;
	const img = d.image && d.image.startsWith(API + '?img=')
		? `<img class="lp-img" src="${escH(d.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
	const site = escH(d.siteName || d.host || '');
	const title = escH(d.title || d.host || href);
	const desc = d.description ? `<div class="lp-desc">${escH(d.description)}</div>` : '';
	return `<a class="link-preview" href="${escH(href)}" target="_blank" rel="noopener noreferrer nofollow">${img}<div class="lp-body"><div class="lp-site">${site}</div><div class="lp-title">${title}</div>${desc}</div></a>`;
}

// Adds the preview card under a rendered message (msgEl is the `.msg` element)
export function attachLinkPreview(msgEl, m, container) {
	if (!S.linkPreviews || m.type !== 'text' || m.enc) return;
	const url = extractUrls(m.content)[0]; if (!url) return;
	fetchPreview(url).then(d => {
		if (!d || !msgEl.isConnected) return;
		const stick = container.scrollHeight - container.scrollTop - container.clientHeight < 120; // keep following the chat
		const wrap = document.createElement('div'); wrap.className = 'link-preview-wrap';
		wrap.innerHTML = previewCardHtml(d, url);
		msgEl.appendChild(wrap);
		const follow = () => { if (stick) container.scrollTop = container.scrollHeight; };
		follow(); wrap.querySelector('img')?.addEventListener('load', follow);
	});
}
