// ── Voice messages ──────────────────────────────────────────────────────────────────────────────
// Mic button → recording bar with a live level meter → send. A voice note is an ordinary file transfer
// (compressed and encrypted like any file) that also carries { dur, peaks } so the receiver can draw a
// waveform. Small voice notes are kept in the local chat history so they can be played after a reload.
import { S } from './state.js';
import { el, toast } from './utils.js';
import { iconSvg } from './icons.js';
import { getActiveSess } from './sessions.js';
import { sendFile } from './file-transfer.js';

const MAX_MS = 5 * 60 * 1000, MIN_MS = 800, BARS = 40;
let rec = null;

const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
	.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
export const fmtDur = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

function downsample(arr, n) {
	if (!arr.length) return Array.from({ length: n }, () => 15);
	const out = [];
	for (let i = 0; i < n; i++) {
		const a = Math.floor(i * arr.length / n), b = Math.max(a + 1, Math.floor((i + 1) * arr.length / n));
		out.push(Math.max(...arr.slice(a, b)));
	}
	const top = Math.max(...out, 1);
	return out.map(v => Math.max(8, Math.round(v / top * 100)));   // normalise so quiet notes still look alive
}

function drawBar() {
	if (!rec) return;
	const s = (Date.now() - rec.t0) / 1000;
	const t = el('vbTime'); if (t) t.textContent = fmtDur(s);
	const w = el('vbWave'); if (w) w.innerHTML = rec.peaks.slice(-32).map(p => `<i style="height:${Math.max(10, p)}%"></i>`).join('');
	if (Date.now() - rec.t0 > MAX_MS) { toast('5 minute limit reached'); finishVoice(true); }
}

export async function startVoice() {
	const sess = getActiveSess(); if (!sess?.connected) { toast('Not connected'); return; }
	if (rec) return;
	if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Voice recording is not supported in this browser'); return; }
	let stream;
	try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
	catch (e) { toast(e.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Microphone unavailable: ' + e.message); return; }
	const mime = pickMime();
	let recorder;
	try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
	catch (e) { stream.getTracks().forEach(t => t.stop()); toast('Could not start recording: ' + e.message); return; }
	rec = { sess, stream, recorder, chunks: [], peaks: [], t0: Date.now(), mime: recorder.mimeType || mime || 'audio/webm' };
	recorder.ondataavailable = e => { if (e.data.size) rec?.chunks.push(e.data); };
	try {   // level meter for the waveform
		const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 512;
		ctx.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize);
		rec.ctx = ctx;
		rec.meter = setInterval(() => { an.getByteTimeDomainData(buf); let mx = 0; for (const v of buf) mx = Math.max(mx, Math.abs(v - 128)); rec?.peaks.push(Math.min(100, Math.round(mx / 128 * 160))); }, 100);
	} catch {}
	rec.tick = setInterval(drawBar, 150);
	recorder.start(250);
	el('voiceBar').style.display = 'flex'; drawBar();
}

export function finishVoice(send) {
	const r = rec; if (!r) return; rec = null;
	clearInterval(r.tick); clearInterval(r.meter);
	const ms = Date.now() - r.t0;
	const bar = el('voiceBar'); if (bar) bar.style.display = 'none';
	const done = async () => {
		r.stream.getTracks().forEach(t => t.stop()); r.ctx?.close().catch(() => {});
		if (!send) return;
		if (ms < MIN_MS || !r.chunks.length) { toast('Too short — hold the recording a little longer'); return; }
		if (!r.sess.connected) { toast('Not connected'); return; }
		const type = r.mime.split(';')[0], ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
		const file = new File(r.chunks, `Voice_${Date.now()}.${ext}`, { type });
		await sendFile(file, r.sess, null, { voice: { dur: Math.round(ms / 100) / 10, peaks: downsample(r.peaks, BARS) } });
	};
	r.recorder.onstop = done;
	if (r.recorder.state !== 'inactive') r.recorder.stop(); else done();
}

// ── Playing voice bubbles ───────────────────────────────────────────────────────────────────────
const cardOf = n => n?.closest?.('.vn-card');
const audioOf = c => c?.querySelector('audio');

function setPlayIcon(card, playing) { const b = card.querySelector('.vn-play'); if (b) b.innerHTML = iconSvg(playing ? 'pause' : 'play', 1.1); }
function paint(card, a) {
	const dur = Number(card.querySelector('.vn-time')?.dataset.dur) || (isFinite(a.duration) ? a.duration : 0);
	const ratio = dur ? Math.min(1, a.currentTime / dur) : 0;
	const p = card.querySelector('.vn-prog'); if (p) p.style.width = (ratio * 100) + '%';
	const t = card.querySelector('.vn-time'); if (t) t.textContent = fmtDur(a.paused && !a.currentTime ? dur : (a.currentTime || 0));
}

// Handles clicks on a voice bubble; returns true when the click was for the player
export function voiceClick(e) {
	const play = e.target.closest('[data-vn-play]'), seek = e.target.closest('[data-vn-seek]');
	const card = cardOf(play || seek); if (!card) return false;
	const a = audioOf(card); if (!a) return true;
	if (play) {
		if (a.paused) {
			document.querySelectorAll('#messages .vn-card audio').forEach(o => { if (o !== a && !o.paused) o.pause(); });
			a.play().catch(() => toast('Could not play this voice message'));
		} else a.pause();
	} else {
		const r = seek.getBoundingClientRect(), dur = Number(card.querySelector('.vn-time')?.dataset.dur) || (isFinite(a.duration) ? a.duration : 0);
		if (dur) { a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; paint(card, a); }
	}
	return true;
}

export function initVoice() {
	const c = el('messages'); if (!c) return;
	// media events do not bubble, so listen in the capture phase
	c.addEventListener('timeupdate', e => { const card = cardOf(e.target); if (card) paint(card, e.target); }, true);
	c.addEventListener('play', e => { const card = cardOf(e.target); if (card) setPlayIcon(card, true); }, true);
	c.addEventListener('pause', e => { const card = cardOf(e.target); if (card) { setPlayIcon(card, false); paint(card, e.target); } }, true);
	c.addEventListener('ended', e => { const card = cardOf(e.target); if (card) { e.target.currentTime = 0; setPlayIcon(card, false); paint(card, e.target); } }, true);
	const cancel = el('vbCancel'), send = el('vbSend');
	if (cancel) cancel.innerHTML = iconSvg('trash', 1.05);
	if (send) send.innerHTML = iconSvg('send', 1.05);
}
