// ── Notifications, per-chat mute and the unread count in the tab title ──────────────────────────
// Browser notifications are shown while the app is open in another tab/window (this is a P2P app, the
// connection lives in the page). Encrypted messages never put their text in a notification.
import { S } from './state.js';
import { DB } from './db.js';
import { el, toast } from './utils.js';
import { iconSvg } from './icons.js';
import { selectSess, getActiveSess } from './sessions.js';
import { renderChatList } from './chat-render.js';
import { markActiveRead } from './receipts.js';

let baseTitle = 'P2P Chat';
const supported = () => typeof Notification !== 'undefined';

export async function setNotify(on) {
	if (on) {
		if (!supported()) { toast('Notifications are not supported in this browser'); return false; }
		let p = Notification.permission;
		if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } }
		if (p !== 'granted') { toast('Notifications are blocked — allow them in your browser settings'); return false; }
	}
	S.notify = on; localStorage.setItem('pec_notify', String(on));
	return on;
}

export function notifyMessage(sess, m) {
	if (!S.notify || !supported() || Notification.permission !== 'granted') return;
	if (sess.muted || m.mine || (!document.hidden && S.activeId === sess.id)) return;
	const title = sess.isGroup ? `${m.sender} · ${sess.name}` : (sess.peerName || m.sender || sess.name);
	let body;
	if (m.enc) body = 'New encrypted message';
	else if (m.type === 'poll') body = 'Poll: ' + (m.poll?.q || '');
	else if (m.type === 'file') body = 'Sent a file: ' + (m.file?.name || m.content || '');
	else body = String(m.content || '').slice(0, 140);
	try {
		const n = new Notification(title, { body, tag: sess.id, renotify: true });
		n.onclick = () => { window.focus(); selectSess(sess.id); n.close(); };
	} catch {}
}

export function updateTitle() {
	let total = 0; for (const s of S.sessions.values()) if (!s.muted) total += s.unread || 0;
	document.title = (total ? `(${total > 99 ? '99+' : total}) ` : '') + baseTitle;
}

export function updateMuteBtn(sess) {
	const b = el('btnMute'); if (!b) return;
	b.innerHTML = iconSvg(sess?.muted ? 'bellOff' : 'bell', 1.1);
	b.title = sess?.muted ? 'Unmute notifications for this chat' : 'Mute notifications for this chat';
	b.classList.toggle('active', !!sess?.muted);
}

export function toggleMute(sess = getActiveSess()) {
	if (!sess) return;
	sess.muted = !sess.muted; DB.saveSession(sess);
	renderChatList(); updateMuteBtn(sess); updateTitle();
	toast(sess.muted ? 'Chat muted' : 'Chat unmuted');
}

export function initNotify() {
	baseTitle = document.title || baseTitle;
	document.addEventListener('visibilitychange', () => { updateTitle(); if (!document.hidden) markActiveRead(getActiveSess()); });
	addEventListener('focus', () => markActiveRead(getActiveSess()));
}
