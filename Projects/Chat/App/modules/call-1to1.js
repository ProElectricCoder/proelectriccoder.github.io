import { S, uid } from './state.js';
import { getActiveSess, safeSend } from './sessions.js';
import { toast, el, escH } from './utils.js';
import { Ringtone } from './ringtone.js';
import { createCallCard, updateCallCard, patchCallMeta } from './call-card.js';
import { getIceConfig, monitorPC } from '../../engine.js';
import { iconSvg } from './icons.js';
import { initiateGroupCall } from './call-group.js';
import { renderChatList } from './chat-render.js';

// ── Call signaling over the chat's existing P2P data channel ─────────────────
// Every 1:1 call signal travels inside the *call log message*:
//   { type: 'call-log', op, callId, callType?, displayName?, meta: { sdp? | candidate? | reason? } }
// op: offer | answer | ice | renego | renego-ok | end | reject.
// The receiving side applies `meta` automatically (handleCallLog) — no manual copy/paste of WebRTC codes.
function sendCallLog(sess, op, meta = {}, extra = {}) {
	if (op === 'offer') patchCallMeta(sess, sess.call.cardMsgId, { callId: sess.call.callId, offer: meta.sdp });
	else if (op === 'answer') patchCallMeta(sess, sess.call.cardMsgId, { answer: meta.sdp });
	safeSend(sess, { type: 'call-log', op, callId: sess.call.callId, msgId: sess.call.cardMsgId, meta, ...extra });
}

// Local ICE candidates wait until the offer/answer has been sent so the peer never sees them out of order
function sendIce(sess, candidate) {
	if (!sess.call.sigOpen) { sess.call.outIce.push(candidate); return; }
	sendCallLog(sess, 'ice', { candidate });
}
function openSignaling(sess) {
	sess.call.sigOpen = true;
	const q = sess.call.outIce; sess.call.outIce = [];
	q.forEach(c => sendCallLog(sess, 'ice', { candidate: c }));
}

export async function initiateCall(type) {
	const sess = getActiveSess();
	if (!sess?.connected) { toast('Not connected'); return; }
	if (sess.isGroup) { initiateGroupCall(type); return; }
	if (sess.call.state !== 'idle') { toast('Already in a call'); return; }
	if (S.callSessId !== null) { toast('End current call first'); return; }
	sess.call.type = type; sess.call.state = 'calling'; S.callSessId = sess.id; sess.call.iceQueue = [];
	sess.call.callId = uid(); sess.call.sigOpen = false; sess.call.outIce = [];
	try {
		const stream = await getStream(type);
		sess.call.localStream = stream;
		showCallOverlay(sess, stream);
		sess.call.mediaPc = buildMediaPC(sess);
		stream.getTracks().forEach(t => sess.call.mediaPc.addTrack(t, stream));
		const offer = await sess.call.mediaPc.createOffer();
		await sess.call.mediaPc.setLocalDescription(offer);
		sess.call.cardMsgId = createCallCard(sess, true, type, 'calling', 0, { id: 'call_' + sess.call.callId, meta: { callId: sess.call.callId } });
		sendCallLog(sess, 'offer', { sdp: offer.sdp }, { callType: type, displayName: S.displayName });
		openSignaling(sess);
		Ringtone.start('outgoing');
		setCallStatusTxt('Ringing…');
	} catch (e) {
		console.error('[WebRTC] initiateCall error:', e);
		toast('Could not start call: ' + e.message);
		endCallInternal(sess, false, 'cancelled', true);
	}
}

// Tell the user how the call is routed — a TURN relay means a direct P2P path was not possible
function noteCallRoute(sess, info) {
	const route = info.relayed ? 'relay' : 'direct';
	patchCallMeta(sess, sess.call.cardMsgId, { route });
	if (info.relayed) {
		setCallStatusTxt('In call · via TURN relay');
		toast('Direct P2P was not possible, so this call is using a TURN relay server');
	} else if (sess.call.state === 'active') setCallStatusTxt('In call · direct P2P');
}

function buildMediaPC(sess) {
	const pc = new RTCPeerConnection(getIceConfig());
	pc.onicecandidate = evt => { if (evt.candidate) sendIce(sess, evt.candidate.toJSON()); };
	pc.onicecandidateerror = evt => { if (evt.errorCode !== 701) console.error('[ICE error]', evt.errorCode, evt.errorText); };
	pc.ontrack = evt => {
		const rv = el('callRemoteVid'); if (!rv) return;
		if (!sess.call.remoteStream) sess.call.remoteStream = new MediaStream();
		const rs = sess.call.remoteStream;
		const existing = rs.getTracks().find(t => t.kind === evt.track.kind);
		if (existing) rs.removeTrack(existing);
		rs.addTrack(evt.track); rv.srcObject = rs; rv.play().catch(() => {});
		if (evt.track.kind === 'video') { rv.style.display = 'block'; const ab = el('callAudioBg'); if (ab) ab.style.display = 'none'; }
		if (sess.call.state === 'active') startAudioVisualizer(rs);
	};
	pc.onnegotiationneeded = async () => {
		if (sess.call.state !== 'active' || pc.signalingState !== 'stable') return;
		try {
			const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
			sendCallLog(sess, 'renego', { sdp: offer.sdp });
		} catch (e) { console.error('[WebRTC] renegotiation error', e); }
	};
	pc.addEventListener('connectionstatechange', () => {
		if (pc.connectionState === 'connected') {
			Ringtone.stop(); sess.call.state = 'active'; sess.call.callStartedAt = Date.now();
			setCallStatusTxt('In call · ' + (sess.call.type || '')); startCallTimer();
			if (sess.call.cardMsgId) updateCallCard(sess, sess.call.cardMsgId, 'active', 0);
			if (sess.call.remoteStream) startAudioVisualizer(sess.call.remoteStream);
		}
	});
	// Route notice + drop the call only if the link stays down (not on a brief "disconnected" blip)
	monitorPC(pc, {
		onRoute: info => { if (sess.call.mediaPc === pc) noteCallRoute(sess, info); },
		onDead: () => { if (sess.call.mediaPc === pc) { endCallInternal(sess, true, 'cancelled', false); toast('Call connection failed'); } },
	});
	return pc;
}

export async function acceptCall() {
	closeIncomingDialog();
	const sess = S.sessions.get(S.callSessId); if (!sess?.call.incoming) return;
	const data = sess.call.incoming;
	sess.call.type = data.callType; sess.call.state = 'connecting'; sess.call.sigOpen = false; sess.call.outIce = [];
	try {
		const stream = await getStream(data.callType === 'screen' ? 'audio' : data.callType);
		sess.call.localStream = stream; showCallOverlay(sess, stream);
		sess.call.mediaPc = buildMediaPC(sess);
		stream.getTracks().forEach(t => sess.call.mediaPc.addTrack(t, stream));
		await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
		if (sess.call.iceQueue?.length) {
			for (const cand of sess.call.iceQueue) await sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
			sess.call.iceQueue = [];
		}
		const answer = await sess.call.mediaPc.createAnswer();
		await sess.call.mediaPc.setLocalDescription(answer);
		sendCallLog(sess, 'answer', { sdp: answer.sdp });
		openSignaling(sess);
		if (sess.call.cardMsgId) updateCallCard(sess, sess.call.cardMsgId, 'active', 0);
		sess.call.callStartedAt = Date.now(); setCallStatusTxt('Connecting…');
	} catch (e) {
		console.error('[WebRTC] acceptCall error:', e); toast('Could not accept call: ' + e.message);
		sendCallLog(sess, 'reject'); if (sess.call.cardMsgId) updateCallCard(sess, sess.call.cardMsgId, 'declined', 0);
		endCallInternal(sess, false, 'declined', true);
	}
}

export function rejectCall() {
	closeIncomingDialog();
	const sess = S.sessions.get(S.callSessId);
	if (sess) {
		if (sess.call.cardMsgId) updateCallCard(sess, sess.call.cardMsgId, 'declined', 0);
		sendCallLog(sess, 'reject');
		endCallInternal(sess, false, null, true);
	}
}

export function endCallInternal(sess, notify = true, reason = null, _skipCardUpdate = false) {
	if (!sess) sess = S.sessions.get(S.callSessId); if (!sess) return;
	const prevState = sess.call.state, prevCardMsgId = sess.call.cardMsgId, prevType = sess.call.type || 'audio', prevIncoming = sess.call.incoming;
	const prevPc = sess.call.mediaPc; // closed below; the new monitorPC guard compares against sess.call.mediaPc
	const duration = (prevState === 'active' && S.callStarted) ? Math.floor((Date.now() - S.callStarted) / 1000) : 0;
	if (!reason) {
		if (prevState === 'active') reason = 'completed';
		else if (prevState === 'calling' || prevState === 'connecting') reason = notify ? 'cancelled' : 'missed';
		else if (prevState === 'ringing') reason = notify ? 'declined' : 'missed';
		else reason = 'cancelled';
	}
	if (notify && sess.connected && prevState !== 'idle') sendCallLog(sess, 'end');
	Ringtone.stop(); stopAudioVisualizer(); closeIncomingDialog(); hideCallOverlay(); stopCallTimer();
	sess.call.localStream?.getTracks().forEach(t => t.stop());
	sess.call.remoteStream?.getTracks().forEach(t => t.stop());
	sess.call.mediaPc = null;
	try { prevPc?.close(); } catch {}
	if (!_skipCardUpdate) {
		if (prevCardMsgId) { updateCallCard(sess, prevCardMsgId, reason, duration); }
		else if (prevState === 'ringing') { createCallCard(sess, false, prevIncoming?.callType || prevType, reason, 0); }
	}
	sess.call = { mediaPc: null, localStream: null, remoteStream: null, type: null, sourceType: null, state: 'idle', muted: false, camOff: false, incoming: null, iceQueue: [], audioCtx: null, audioAnalyser: null, audioSource: null, audioDrawTimer: null, cardMsgId: null, callStartedAt: null, callId: null, sigOpen: false, outIce: [] };
	if (S.callSessId === sess.id) S.callSessId = null;
	renderChatList();
}

export async function getStream(type) {
	return navigator.mediaDevices.getUserMedia(type === 'video' ? { video: true, audio: true } : { audio: true, video: false });
}

export async function callToggleSource() {
	const sess = S.sessions.get(S.callSessId); if (!sess?.call.mediaPc) return;
	const pc = sess.call.mediaPc, isScreen = sess.call.sourceType === 'screen', btn = el('callSrcBtn');
	const ICON_SCREEN = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>`;
	const ICON_CAM = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/></svg>`;
	try {
		let newStream;
		if (isScreen) { newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); sess.call.sourceType = 'camera'; }
		else {
			newStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' } });
			sess.call.sourceType = 'screen';
			newStream.getVideoTracks()[0].addEventListener('ended', () => { sess.call.sourceType = 'camera'; callToggleSource().catch(() => {}); });
		}
		const newVid = newStream.getVideoTracks()[0]; if (!newVid) return;
		const vidSender = pc.getSenders().find(s => s.track?.kind === 'video');
		if (vidSender) { const old = vidSender.track; await vidSender.replaceTrack(newVid); old?.stop(); }
		else {
			const keepAudio = sess.call.localStream?.getAudioTracks() || [];
			pc.addTrack(newVid, new MediaStream([...keepAudio, newVid]));
			sess.call.localStream?.getVideoTracks().forEach(t => t.stop());
		}
		const keepAudio = sess.call.localStream?.getAudioTracks() || [];
		sess.call.localStream = new MediaStream([...keepAudio, newVid]);
		const lv = el('callLocalVid'); if (lv) { lv.srcObject = sess.call.localStream; lv.classList.add('visible'); }
		const nowScreen = sess.call.sourceType === 'screen';
		if (btn) { btn.title = nowScreen ? 'Switch to Camera' : 'Share Screen'; btn.classList.toggle('active', nowScreen); btn.innerHTML = nowScreen ? ICON_CAM : ICON_SCREEN; }
	} catch (e) { toast('Source toggle failed: ' + e.message); }
}

export function toggleCallMute() {
	const sess = S.sessions.get(S.callSessId); if (!sess) return;
	sess.call.muted = !sess.call.muted;
	sess.call.localStream?.getAudioTracks().forEach(t => t.enabled = !sess.call.muted);
	const btn = el('callMuteBtn'); if (btn) { btn.classList.toggle('active', sess.call.muted); btn.title = sess.call.muted ? 'Unmute' : 'Mute'; }
}

export function toggleCallCam() {
	const sess = S.sessions.get(S.callSessId); if (!sess) return;
	sess.call.camOff = !sess.call.camOff;
	sess.call.localStream?.getVideoTracks().forEach(t => t.enabled = !sess.call.camOff);
	const btn = el('callCamBtn'); if (btn) { btn.classList.toggle('active', sess.call.camOff); btn.title = sess.call.camOff ? 'Show Camera' : 'Hide Camera'; }
	const lv = el('callLocalVid'); if (lv) lv.classList.toggle('visible', !sess.call.camOff);
}

export function showCallOverlay(sess, localStream) {
	const ov = el('callOverlay'); if (!ov) return;
	const type = sess.call.type; ov.classList.add('active');
	sess.call.sourceType = type === 'screen' ? 'screen' : (type === 'video' ? 'camera' : null);
	const rv = el('callRemoteVid'), ab = el('callAudioBg'), lv = el('callLocalVid');
	if (rv && !sess.call.remoteStream) { rv.srcObject = null; rv.style.display = 'none'; }
	else if (rv && sess.call.remoteStream?.getVideoTracks().length > 0) rv.style.display = 'block';
	if (ab) {
		const names = [...sess.peers.values()].map(p => p.name).join(', ') || 'Peer'; ab.style.display = 'flex';
		const ini = el('callAudioInitial');
		if (ini) {
			if (!sess.isGroup && sess.peerAvatar) ini.innerHTML = `<img src="${escH(sess.peerAvatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`;
			else ini.textContent = (names[0] || 'P').toUpperCase();
		}
		const pn = el('callAudioName'); if (pn) pn.textContent = names;
	}
	if (lv) { if (localStream && (type === 'video' || type === 'screen')) { lv.srcObject = localStream; lv.classList.add('visible'); } else lv.classList.remove('visible'); }
	const badge = el('callBadge'); if (badge) badge.innerHTML = type === 'audio' ? iconSvg('mic') + ' Voice Call' : type === 'video' ? iconSvg('video') + ' Video Call' : iconSvg('screen') + ' Screen Share';
	const camBtn = el('callCamBtn'); if (camBtn) camBtn.classList.toggle('hidden', type === 'audio');
	const srcBtn = el('callSrcBtn');
	if (srcBtn) {
		srcBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>`;
		srcBtn.title = 'Share Screen'; srcBtn.classList.remove('active');
	}
	el('callTimer').textContent = '00:00';
}

export function hideCallOverlay() {
	const ov = el('callOverlay'); if (ov) ov.classList.remove('active');
	const rv = el('callRemoteVid'); if (rv) { rv.srcObject = null; rv.style.display = 'none'; }
	const lv = el('callLocalVid'); if (lv) { lv.srcObject = null; lv.classList.remove('visible'); }
}

export function showIncomingDialog(sess, data, isGroupCall = false, gcCallId = '', gcFrom = '') {
	const d = el('incomingDialog'); if (!d) return;
	const icons = { audio: 'phone', video: 'video', screen: 'screen' };
	el('incomingIcon').innerHTML = iconSvg(icons[data.callType] || 'phone', 1.6);
	el('incomingCallerName').textContent = data.displayName || 'Peer';
	el('incomingCallType').innerHTML = (isGroupCall ? iconSvg('group', 1) + ' Group ' : '') + escH(data.callType || 'voice') + ' call';
	d.dataset.isGroup = isGroupCall ? '1' : '0';
	d.dataset.gcCallId = gcCallId; d.dataset.gcFrom = gcFrom;
	d.dataset.gcType = data.callType || 'audio';
	d.classList.add('active');
	Ringtone.start('incoming');
}

export function closeIncomingDialog() { el('incomingDialog')?.classList.remove('active'); Ringtone.stop(); }

export function setCallStatusTxt(txt) { const e = el('callAudioStatus'); if (e) e.textContent = txt; }

export function startCallTimer() {
	stopCallTimer(); S.callStarted = Date.now();
	S.callTimer = setInterval(() => {
		const s = Math.floor((Date.now() - S.callStarted) / 1000);
		const t = el('callTimer'); if (t) t.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	}, 1000);
}

export function stopCallTimer() {
	if (S.callTimer) { clearInterval(S.callTimer); S.callTimer = null; }
	S.callStarted = null;
	const t = el('callTimer'); if (t) t.textContent = '00:00';
}

// ── Audio visualizer (volume-reactive call rings) ───────────────────────────
export function startAudioVisualizer(stream) {
	stopAudioVisualizer();
	try {
		const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
		const ctx = new AC(), analyser = ctx.createAnalyser(); analyser.fftSize = 256;
		const clone = stream.clone(), source = ctx.createMediaStreamSource(clone); source.connect(analyser);
		const callSess = S.sessions.get(S.callSessId); if (!callSess) return;
		callSess.call.audioCtx = ctx; callSess.call.audioAnalyser = analyser; callSess.call.audioSource = source;
		const dataArray = new Uint8Array(analyser.frequencyBinCount);
		const rings = document.querySelectorAll('.call-ring'); rings.forEach(r => r.classList.add('vol-active'));
		function draw() {
			if (!callSess || callSess.call.state !== 'active') return;
			callSess.call.audioDrawTimer = requestAnimationFrame(draw);
			analyser.getByteFrequencyData(dataArray);
			let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
			const avg = sum / dataArray.length, intensity = avg / 60;
			if (rings[0]) rings[0].style.transform = `scale(${Math.min(1 + intensity * .15, 1.5)})`;
			if (rings[1]) rings[1].style.transform = `scale(${Math.min(1 + intensity * .4, 2.2)})`;
			if (rings[2]) rings[2].style.transform = `scale(${Math.min(1 + intensity * .8, 3.2)})`;
		}
		draw();
	} catch (e) { console.warn('[AudioViz]', e); }
}

export function stopAudioVisualizer() {
	const callSess = S.sessions.get(S.callSessId);
	if (callSess) {
		if (callSess.call.audioDrawTimer) cancelAnimationFrame(callSess.call.audioDrawTimer);
		if (callSess.call.audioSource) callSess.call.audioSource.disconnect();
		if (callSess.call.audioCtx && callSess.call.audioCtx.state !== 'closed') callSess.call.audioCtx.close().catch(() => {});
		callSess.call.audioCtx = null; callSess.call.audioAnalyser = null; callSess.call.audioSource = null; callSess.call.audioDrawTimer = null;
	}
	document.querySelectorAll('.call-ring').forEach(r => { r.classList.remove('vol-active'); r.style.transform = ''; });
}

// ── Receive: apply a call log message's meta automatically ────────────────────
export async function handleCallLog(sess, data) {
	const meta = data.meta || {}, c = sess.call;
	if (data.op === 'offer') {
		if (c.state !== 'idle' || (S.callSessId !== null && S.callSessId !== sess.id)) {
			safeSend(sess, { type: 'call-log', op: 'reject', callId: data.callId, meta: { reason: 'busy' } }); return;
		}
		c.callId = data.callId; c.incoming = { sdp: meta.sdp, callType: data.callType, displayName: data.displayName };
		c.state = 'ringing'; S.callSessId = sess.id; c.sigOpen = false; c.outIce = [];
		// The log message exists on both sides from the first signal; its status follows the call
		c.cardMsgId = createCallCard(sess, false, data.callType, 'ringing', 0, { id: 'call_' + data.callId, meta: { callId: data.callId, offer: meta.sdp } });
		showIncomingDialog(sess, c.incoming, false);
		return;
	}
	if (!c.callId || data.callId !== c.callId) return; // stale signal from an earlier call
	switch (data.op) {
		case 'answer':
			if (c.mediaPc && c.state === 'calling') {
				patchCallMeta(sess, c.cardMsgId, { answer: meta.sdp });
				await c.mediaPc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: meta.sdp })).catch(e => console.error('[WebRTC] Answer SDP error:', e));
				if (c.iceQueue?.length) { for (const cand of c.iceQueue) await c.mediaPc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {}); c.iceQueue = []; }
				setCallStatusTxt('Connecting…');
			} break;
		case 'ice':
			if (meta.candidate) {
				if (c.mediaPc?.remoteDescription) c.mediaPc.addIceCandidate(new RTCIceCandidate(meta.candidate)).catch(() => {});
				else { if (!c.iceQueue) c.iceQueue = []; c.iceQueue.push(meta.candidate); }
			} break;
		case 'renego':
			if (c.mediaPc && (c.state === 'active' || c.state === 'calling')) {
				try {
					await c.mediaPc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: meta.sdp }));
					const ans = await c.mediaPc.createAnswer();
					await c.mediaPc.setLocalDescription(ans);
					sendCallLog(sess, 'renego-ok', { sdp: ans.sdp });
				} catch (e) { console.error('[WebRTC] Renego error', e); }
			} break;
		case 'renego-ok':
			if (c.mediaPc && (c.state === 'active' || c.state === 'calling')) {
				try { await c.mediaPc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: meta.sdp })); } catch (e) { console.error('[WebRTC] Renego-ok error', e); }
			} break;
		case 'end': {
			const wasActive = c.state === 'active', wasRinging = c.state === 'ringing';
			const dur = wasActive && S.callStarted ? Math.floor((Date.now() - S.callStarted) / 1000) : 0;
			if (c.cardMsgId) updateCallCard(sess, c.cardMsgId, wasActive ? 'completed' : wasRinging ? 'missed' : 'cancelled', dur);
			endCallInternal(sess, false, null, true); break;
		}
		case 'reject':
			if (meta.reason === 'busy') toast('User is busy');
			if (c.cardMsgId) updateCallCard(sess, c.cardMsgId, 'declined', 0);
			endCallInternal(sess, false, null, true); break;
	}
}
