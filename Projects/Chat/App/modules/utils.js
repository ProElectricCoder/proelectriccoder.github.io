import { S } from './state.js';

// ── DOM ────────────────────────────────────────────────────────────────────
export function el(id) { return document.getElementById(id); }

// ── String / HTML ──────────────────────────────────────────────────────────
export function escH(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ── Time / size ────────────────────────────────────────────────────────────
export function fmtTime(ts) {
	return new Date(ts).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' });
}

export function fmtSz(b) {
	if (b < 1024)     return b + ' B';
	if (b < 1048576)  return (b / 1024).toFixed(1) + ' KB';
	return (b / 1048576).toFixed(1) + ' MB';
}

export function relTime(ts) {
	const d = Date.now() - ts;
	const m = Math.floor(d / 60000);
	const h = Math.floor(d / 3600000);
	if (d < 60000)    return 'now';
	if (d < 3600000)  return m + 'm';
	if (d < 86400000) return h + 'h';
	return new Date(ts).toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

// ── Async ──────────────────────────────────────────────────────────────────
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Viewport ───────────────────────────────────────────────────────────────
export function isMobile() { return window.innerWidth <= 700; }

// ── Sidebar ────────────────────────────────────────────────────────────────
export function openSidebarUI() {
	el('sidebar')?.classList.add('open');
	el('sidebarBackdrop')?.classList.add('open');
}

export function closeSidebarUI() {
	el('sidebar')?.classList.remove('open');
	el('sidebarBackdrop')?.classList.remove('open');
}

// ── Buffer ↔ Base64 ────────────────────────────────────────────────────────
export function bufB64(ab) {
	const u8 = new Uint8Array(ab);
	let s = '';
	const B = 8192;
	for (let i = 0; i < u8.length; i += B) s += String.fromCharCode(...u8.subarray(i, i + B));
	return btoa(s);
}

export function b64Buf(b64) {
	const bin = atob(b64);
	const u8 = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
	return u8.buffer;
}

// ── Toast ──────────────────────────────────────────────────────────────────
let _toastTmr = null;
export function toast(msg, ms = 3000) {
	const e = el('toast');
	if (!e) return;
	e.textContent = msg;
	e.classList.add('show');
	clearTimeout(_toastTmr);
	_toastTmr = setTimeout(() => e.classList.remove('show'), ms);
}

// ── Wake Lock ──────────────────────────────────────────────────────────────
export async function requestWakeLock() {
	if (!S.wakeLockEnabled || !('wakeLock' in navigator)) return;
	try { S.wakeLockObj = await navigator.wakeLock.request('screen'); }
	catch (e) { console.warn('Wake Lock failed:', e); }
}

export function releaseWakeLock() {
	if (S.wakeLockObj) { S.wakeLockObj.release().catch(() => {}); S.wakeLockObj = null; }
}
