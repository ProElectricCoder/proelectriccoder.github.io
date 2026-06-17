import { S } from './state.js';
import { getActiveSess, safeSend } from './sessions.js';
import { toast, el, escH } from './utils.js';
import { Ringtone } from './ringtone.js';
import { createCallCard, updateCallCard } from './call-card.js';
import { initiateGroupCall } from './call-group.js';
import { renderChatList } from './chat-render.js';

export async function initiateCall(type) {
	const sess = getActiveSess();
	if (!sess?.connected) { toast('Not connected'); return; }
	if (sess.isGroup) { initiateGroupCall(type); return; }
	if (sess.call.state !== 'idle') { toast('Already in a call'); return; }
	if (S.callSessId !== null) { toast('End current call first'); return; }
	sess.call.type = type; sess.call.state = 'calling'; S.callSessId = sess.id; sess.call.iceQueue = [];
	try {
		const stream = await getStream(type);
		sess.call.localStream = stream;
		showCallOverlay(sess, stream);
		sess.call.mediaPc = buildMediaPC(sess);
		stream.getTracks().forEach(t => sess.call.mediaPc.addTrack(t, stream));
		const offer = await sess.call.mediaPc.createOffer();
		await sess.call.mediaPc.setLocalDescription(offer);
		safeSend(sess, { type: 'call-offer', sdp: offer.sdp, callType: type, displayName: S.displayName });
		sess.call.cardMsgId = createCallCard(sess, true, type, 'calling');
		Ringtone.start('outgoing');
		setCallStatusTxt('Ringing…');
	} catch (e) {
		console.error('[WebRTC] initiateCall error:', e);
		toast('Could not start call: ' + e.message);
		endCallInternal(sess, false, 'cancelled', true);
	}
}

function buildMediaPC(sess) {
	const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] });
	pc.onicecandidate = evt => { if (evt.candidate) safeSend(sess, { type: 'call-ice', candidate: evt.candidate.toJSON() }); };
	pc.onicecandidateerror = evt => console.error('[ICE error]', evt.errorCode, evt.errorText);
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
			safeSend(sess, { type: 'call-renego', sdp: offer.sdp });
		} catch (e) { console.error('[WebRTC] renegotiation error', e); }
	};
	pc.onconnectionstatechange = () => {
		const s = pc.connectionState;
		if (s === 'connected') {
			Ringtone.stop(); sess.call.state = 'active'; sess.call.callStartedAt = Date.now();
			setCallStatusTxt('In call · ' + (sess.call.type || '')); startCallTimer();
			if (sess.call.cardMsgId) updateCallCard(sess, sess.call.cardMsgId, 'active', 0);
			if (sess.call.remoteStream) startAudioVisualizer(sess.call.remoteStream);
		}
		if (s === 'failed' || s === 'closed') { endCallInternal(sess, true, 'cancelled', false); toast('Call connection failed'); }
	};
	return pc;
}

export async function acceptCall() {
	closeIncomingDialog();
	const sess = S.sessions.get(S.callSessId); if (!sess?.call.incoming) return;
	const data = sess.call.incoming;
	sess.call.type = data.callType; sess.call.state = 'connecting';
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
		safeSend(sess, { type: 'call-answer', sdp: answer.sdp });
		sess.call.cardMsgId = createCallCard(sess, false, data.callType, 'active');
		sess.call.callStartedAt = Date.now(); setCallStatusTxt('Connecting…');
	} catch (e) {
		console.error('[WebRTC] acceptCall error:', e); toast('Could not accept call: ' + e.message);
		safeSend(sess, { type: 'call-reject' }); endCallInternal(sess, false, 'declined', true);
	}
}

export function rejectCall() {
	closeIncomingDialog();
	const sess = S.sessions.get(S.callSessId);
	if (sess) {
		const cid = createCallCard(sess, false, sess.call.incoming?.callType || 'audio', 'declined', 0);
		sess.call.cardMsgId = cid;
		safeSend(sess, { type: 'call-reject' });
		endCallInternal(sess, false, null, true);
	}
}

export function endCallInternal(sess, notify = true, reason = null, _skipCardUpdate = false) {
	if (!sess) sess = S.sessions.get(S.callSessId); if (!sess) return;
	const prevState = sess.call.state, prevCardMsgId = sess.call.cardMsgId, prevType = sess.call.type || 'audio', prevIncoming = sess.call.incoming;
	const duration = (prevState === 'active' && S.callStarted) ? Math.floor((Date.now() - S.callStarted) / 1000) : 0;
	if (!reason) {
		if (prevState === 'active') reason = 'completed';
		else if (prevState === 'calling' || prevState === 'connecting') reason = notify ? 'cancelled' : 'missed';
		else if (prevState === 'ringing') reason = notify ? 'declined' : 'missed';
		else reason = 'cancelled';
	}
	if (notify && sess.connected && prevState !== 'idle') safeSend(sess, { type: 'call-end' });
	Ringtone.stop(); stopAudioVisualizer(); closeIncomingDialog(); hideCallOverlay(); stopCallTimer();
	sess.call.localStream?.getTracks().forEach(t => t.stop());
	sess.call.remoteStream?.getTracks().forEach(t => t.stop());
	try { sess.call.mediaPc?.close(); } catch {}
	if (!_skipCardUpdate) {
		if (prevCardMsgId) { updateCallCard(sess, prevCardMsgId, reason, duration); }
		else if (prevState === 'ringing') { createCallCard(sess, false, prevIncoming?.callType || prevType, reason, 0); }
	}
	sess.call = { mediaPc: null, localStream: null, remoteStream: null, type: null, sourceType: null, state: 'idle', muted: false, camOff: false, incoming: null, iceQueue: [], audioCtx: null, audioAnalyser: null, audioSource: null, audioDrawTimer: null, cardMsgId: null, callStartedAt: null };
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
	const badge = el('callBadge'); if (badge) badge.textContent = type === 'audio' ? '🎤 Voice Call' : type === 'video' ? '📹 Video Call' : '🖥 Screen Share';
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
	const icons = { audio: '📞', video: '📹', screen: '🖥️' };
	el('incomingIcon').textContent = icons[data.callType] || '📞';
	el('incomingCallerName').textContent = data.displayName || 'Peer';
	el('incomingCallType').textContent = (isGroupCall ? '👥 Group ' : '') + (data.callType || 'voice') + ' call';
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
