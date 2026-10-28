// ── Disappearing messages ───────────────────────────────────────────────────────────────────────
// A chat can have a timer (5 minutes … 7 days). It is shared: changing it tells the other devices, and
// every message carries the timer it was sent with, so each device removes it at the same time. Expiry
// removes the message from the screen, from this device's history and from Drive backups.
// It can't stop screenshots or a modified client, and a device that is offline keeps its copy until it
// is open again.
import { S, getAid, TTL_VALID } from './state.js';
import { DB } from './db.js';
import { el, toast } from './utils.js';
import { iconSvg } from './icons.js';
import { safeSend, getActiveSess } from './sessions.js';
import { addSysMsg, renderChatList } from './chat-render.js';
import { renderPinBanner } from './library.js';
import { clearCompose } from './msg-features.js';

export const TTL_OPTIONS = [[0, 'Off'], [300, '5 minutes'], [3600, '1 hour'], [86400, '24 hours'], [604800, '7 days']];
const SHORT = { 300: '5m', 3600: '1h', 86400: '24h', 604800: '7d' };
const label = t => (TTL_OPTIONS.find(o => o[0] === t) || [0, 'Off'])[1];
const canChange = sess => !sess.isGroup || sess.myRole === 'owner' || sess.myRole === 'manager';

export function ttlSelectHtml(sess) {
	const ok = canChange(sess);
	return `<div class="f-lbl">Disappearing messages</div>
		<select class="f-in" id="ciTtlSel" onchange="App.setTtl(this.value)"${ok ? '' : ' disabled'}>${TTL_OPTIONS.map(([v, l]) => `<option value="${v}"${(sess.ttl || 0) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
		<div style="font-size:.62rem;color:var(--faint);margin-top:4px;line-height:1.5">New messages are deleted on every device after this time. It can't prevent screenshots.${ok ? '' : ' Only group owners and managers can change it.'}</div>`;
}

export function updateTtlBadge(sess) {
	const b = el('tbTtl'); if (!b) return;
	if (!sess?.ttl) { b.style.display = 'none'; return; }
	b.innerHTML = `${iconSvg('clock', .8)} ${SHORT[sess.ttl] || ''}`; b.title = `Messages disappear after ${label(sess.ttl)}`; b.style.display = 'inline-flex';
}

// Local change (Chat Info)
export function setTtl(sess, ttl) {
	if (!sess) return;
	const back = () => { const s = el('ciTtlSel'); if (s) s.value = String(sess.ttl || 0); };
	if (!TTL_VALID.has(ttl)) return back();
	if (!canChange(sess)) { toast('Only group owners and managers can change this'); return back(); }
	if (!sess.connected) { toast('Connect first so everyone gets the new timer'); return back(); }
	if (ttl === (sess.ttl || 0)) return;
	sess.ttl = ttl; DB.saveSession(sess); updateTtlBadge(sess);
	safeSend(sess, { type: 'chat-ttl', ttl, aid: getAid(), name: S.displayName });
	addSysMsg(sess, ttl ? `You set messages to disappear after ${label(ttl)}` : 'You turned off disappearing messages');
}

// Remote change
export function onTtl(sess, data, peerId) {
	if (sess.isGroup && data.aid && data.aid === getAid()) return;
	const ttl = Number(data.ttl); if (!TTL_VALID.has(ttl) || ttl === (sess.ttl || 0)) return;
	const name = String(data.name || sess.peers.get(peerId)?.name || 'Peer').slice(0, 40);
	sess.ttl = ttl; DB.saveSession(sess);
	if (S.activeId === sess.id) { updateTtlBadge(sess); const s = el('ciTtlSel'); if (s) s.value = String(ttl); }
	addSysMsg(sess, ttl ? `${name} set messages to disappear after ${label(ttl)}` : `${name} turned off disappearing messages`);
}

// ── Expiry ──────────────────────────────────────────────────────────────────────────────────────
// Removes the expired messages of one session; returns how many went
export function dropExpired(sess, now = Date.now()) {
	let n = 0;
	for (let i = sess.messages.length - 1; i >= 0; i--) {
		const m = sess.messages[i];
		if (!m.exp || m.exp > now) continue;
		sess.messages.splice(i, 1); n++;
		if (m.file?.blobUrl) { try { URL.revokeObjectURL(m.file.blobUrl); } catch {} }
		DB.deleteMessage(m);
		document.querySelector(`[data-msg-id="${String(m.id).replace(/"/g, '')}"]`)?.remove();
		if (S.compose?.id === m.id) clearCompose();
	}
	if (n) {
		const last = [...sess.messages].reverse().find(x => x.type !== 'system');
		sess.lastMessage = last ? String(last.type === 'file' ? last.file?.name || last.content : last.type === 'poll' ? 'Poll: ' + (last.poll?.q || '') : last.content || '').slice(0, 60) : null;
		DB.updateSession(sess.id, { lastMessage: sess.lastMessage });
	}
	return n;
}

export function sweepAll() {
	let any = false;
	for (const s of S.sessions.values()) if (dropExpired(s)) any = true;
	if (any) { renderChatList(); renderPinBanner(getActiveSess()); }
}

export function initTtl() {
	setInterval(sweepAll, 5000);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) sweepAll(); });
	DB.purgeExpired().catch(() => {});                       // messages of chats that are not open
	setInterval(() => DB.purgeExpired().catch(() => {}), 5 * 60 * 1000);
}
