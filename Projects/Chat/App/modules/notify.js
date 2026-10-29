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
	if (on) { registerSW(); unlockAudio(); }
	return on;
}

// ── Sound ────────────────────────────────────────────────────────────────────────────────────────
// Browsers only let a page make sound after the user has touched it, so the audio context is unlocked on
// the first tap/click/key and reused for every message after that.
let actx = null, lastPing = 0;
function audio() {
	if (actx) return actx;
	const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
	try { actx = new AC(); } catch { actx = null; }
	return actx;
}
function unlockAudio() { const c = audio(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }

export function playPing() {
	if (!S.sound) return;
	const now = Date.now(); if (now - lastPing < 600) return;   // a burst of messages is one sound
	const c = audio(); if (!c) return; lastPing = now;
	const go = () => {
		const t = c.currentTime, g = c.createGain();
		g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
		g.connect(c.destination);
		[[880, 0], [1318.5, 0.11]].forEach(([f, d]) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(t + d); o.stop(t + d + 0.26); });
	};
	if (c.state === 'suspended') c.resume().then(go).catch(() => {}); else go();
}

export function setSound(on) { S.sound = !!on; localStorage.setItem('pec_sound', String(S.sound)); if (on) { unlockAudio(); lastPing = 0; playPing(); } }

// ── System notification ─────────────────────────────────────────────────────────────────────────
// Through the service worker when there is one (the only way on phones), otherwise a plain Notification.
let swReg = null;
async function registerSW() {
	if (!('serviceWorker' in navigator)) return;
	try { swReg = await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('[notify] service worker unavailable:', e.message); }
}
// navigator.serviceWorker.ready never resolves when the page is outside the worker's scope, so wait on our own registration
async function activeReg() {
	if (!swReg) return null;
	if (swReg.active) return swReg;
	const w = swReg.installing || swReg.waiting; if (!w) return null;
	await new Promise(res => { const t = setTimeout(res, 4000); w.addEventListener('statechange', () => { if (w.state === 'activated') { clearTimeout(t); res(); } }); });
	return swReg.active ? swReg : null;
}
async function showSystem(title, opts, sessId) {
	opts = { ...opts, tag: sessId, renotify: true, data: { sessId }, icon: new URL('/Favicon.svg', location.href).href };
	const reg = await activeReg().catch(() => null);
	if (reg) { try { await reg.showNotification(title, opts); return true; } catch {} }
	try {
		const n = new Notification(title, opts);
		n.onclick = () => { window.focus(); selectSess(sessId); n.close(); };
		return true;
	} catch { return false; }
}

function describe(m) {
	if (m.enc) return 'New encrypted message';
	if (m.type === 'poll') return 'Poll: ' + (m.poll?.q || '');
	if (m.type === 'file') return (m.file?.voice ? 'Voice message' : 'Sent a file: ' + (m.file?.name || m.content || ''));
	return String(m.content || '').slice(0, 140);
}

// Called for every incoming message
export function notifyMessage(sess, m) {
	if (sess.muted || m.mine) return;
	const watching = !document.hidden && S.activeId === sess.id;
	if (watching) return;                                          // already looking at it
	const title = sess.isGroup ? `${m.sender} · ${sess.name}` : (sess.peerName || m.sender || sess.name);
	const body = describe(m);
	playPing();
	if (!document.hidden) { toast(`${title}: ${body}`.slice(0, 120), 4000); return; }   // visible but on another chat: in-page banner
	if (S.notify && supported() && Notification.permission === 'granted') showSystem(title, { body }, sess.id);
}

// Settings → Notifications: shows one right away so it's obvious whether it works
export async function testNotify() {
	playPing();
	if (S.notify && supported() && Notification.permission === 'granted') await showSystem('Notifications are on', { body: 'You will be alerted about new messages.' }, 'test');
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
	for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlockAudio, { once: false, passive: true });
	if (S.notify) registerSW();
	navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'open-chat' && e.data.sessId && S.sessions.has(e.data.sessId)) selectSess(e.data.sessId); });
	document.addEventListener('visibilitychange', () => { updateTitle(); if (!document.hidden) markActiveRead(getActiveSess()); });
	addEventListener('focus', () => markActiveRead(getActiveSess()));
}
