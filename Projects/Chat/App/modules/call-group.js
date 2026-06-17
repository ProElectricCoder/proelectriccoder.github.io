import { S, uid } from './state.js';
import { MY_PEER_ID } from './constants.js';
import { getActiveSess, safeSend } from './sessions.js';
import { toast, el, escH } from './utils.js';
import { getStream, closeIncomingDialog } from './call-1to1.js';
import { renderChatList } from './chat-render.js';

export async function initiateGroupCall(type) {
	const sess = getActiveSess(); if (!sess?.connected || !sess.isGroup) return;
	if (S.gcSessId) { toast('Already in a group call'); return; }
	const callId = uid();
	sess.gc = { state: 'calling', callId, type, localStream: null, pcs: new Map(), streams: new Map(), names: new Map() };
	sess.gc.names.set(MY_PEER_ID, S.displayName);
	S.gcSessId = sess.id;
	try {
		const stream = await getStream(type);
		sess.gc.localStream = stream;
		el('gcOverlay').classList.add('active');
		el('gcTitle').textContent = type === 'video' ? '📹 Group Video Call' : '🎤 Group Voice Call';
		gcAddMyTile(S.displayName, type, stream);
		safeSend(sess, { type: 'gc-invite', callId, callType: type, from: MY_PEER_ID, displayName: S.displayName });
		toast('Group call started — waiting for peers…');
	} catch (e) {
		toast('Could not start group call: ' + e.message);
		_gcCleanup(sess);
	}
}

export async function acceptGroupCall() {
	const d = el('incomingDialog'); if (!d) return;
	const callId = d.dataset.gcCallId, fromPeerId = d.dataset.gcFrom, callType = d.dataset.gcType || 'audio';
	closeIncomingDialog();
	const sess = S.sessions.get(S.callSessId);
	if (!sess) { S.callSessId = null; return; }
	sess.gc = { state: 'active', callId, type: callType, localStream: null, pcs: new Map(), streams: new Map(), names: new Map() };
	sess.gc.names.set(MY_PEER_ID, S.displayName);
	S.gcSessId = sess.id; S.callSessId = null;
	try {
		const stream = await getStream(callType);
		sess.gc.localStream = stream;
		el('gcOverlay').classList.add('active');
		el('gcTitle').textContent = callType === 'video' ? '📹 Group Video Call' : '🎤 Group Voice Call';
		gcAddMyTile(S.displayName, callType, stream);
		safeSend(sess, { type: 'gc-accept', callId, from: MY_PEER_ID, to: fromPeerId, displayName: S.displayName, callType });
	} catch (e) {
		toast('Could not join group call: ' + e.message);
		safeSend(sess, { type: 'gc-decline', callId, from: MY_PEER_ID });
		_gcCleanup(sess);
	}
}

export function declineGroupCall() {
	const d = el('incomingDialog'); if (!d) return;
	const callId = d.dataset.gcCallId;
	closeIncomingDialog();
	const sess = S.sessions.get(S.callSessId);
	if (sess) safeSend(sess, { type: 'gc-decline', callId, from: MY_PEER_ID });
	S.callSessId = null;
}

export async function _gcCreatePeer(sess, remotePeerId, asOfferer) {
	if (sess.gc.pcs.has(remotePeerId)) return sess.gc.pcs.get(remotePeerId);
	const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] });
	sess.gc.pcs.set(remotePeerId, pc);
	sess.gc.localStream?.getTracks().forEach(t => pc.addTrack(t, sess.gc.localStream));
	pc.onicecandidate = evt => { if (evt.candidate) safeSend(sess, { type: 'gc-ice', callId: sess.gc.callId, candidate: evt.candidate.toJSON(), from: MY_PEER_ID, to: remotePeerId }); };
	pc.ontrack = evt => {
		const stream = evt.streams[0] || new MediaStream([evt.track]);
		sess.gc.streams.set(remotePeerId, stream);
		const name = sess.gc.names.get(remotePeerId) || 'Peer';
		gcUpdateTile(remotePeerId, name, stream, sess.gc.type);
	};
	pc.onconnectionstatechange = () => {
		const s = pc.connectionState;
		if (s === 'failed' || s === 'closed' || s === 'disconnected') {
			sess.gc.pcs.delete(remotePeerId); sess.gc.streams.delete(remotePeerId);
			gcRemoveTile(remotePeerId);
		}
	};
	if (asOfferer) {
		const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
		safeSend(sess, { type: 'gc-offer', callId: sess.gc.callId, sdp: offer.sdp, from: MY_PEER_ID, to: remotePeerId });
	}
	return pc;
}

export function _gcCleanup(sess) {
	if (!sess) return;
	sess.gc.pcs.forEach(pc => { try { pc.close(); } catch {} });
	sess.gc.localStream?.getTracks().forEach(t => t.stop());
	if (sess.gc.state !== 'idle') safeSend(sess, { type: 'gc-end', callId: sess.gc.callId, from: MY_PEER_ID });
	sess.gc = { state: 'idle', callId: null, type: null, localStream: null, pcs: new Map(), streams: new Map(), names: new Map() };
	if (S.gcSessId === sess.id) S.gcSessId = null;
	el('gcOverlay')?.classList.remove('active');
	const grid = el('gcGrid'); if (grid) grid.innerHTML = '';
	renderChatList();
}

export function gcAddMyTile(name, type, stream) {
	const grid = el('gcGrid'); if (!grid) return;
	let tile = document.getElementById('gc-tile-me');
	if (!tile) {
		tile = document.createElement('div'); tile.className = 'gc-tile'; tile.id = 'gc-tile-me';
		tile.innerHTML = `<video id="gc-vid-me" autoplay playsinline muted></video><div class="gc-tile-av">${escH(name[0]?.toUpperCase() || 'M')}</div><div class="gc-tile-name">${escH(name)} (you)</div>`;
		grid.appendChild(tile);
	}
	if (type === 'video' && stream) {
		const vid = document.getElementById('gc-vid-me');
		if (vid) { vid.srcObject = stream; vid.style.display = 'block'; tile.querySelector('.gc-tile-av').style.display = 'none'; }
	}
	gcUpdateGridLayout();
}

export function gcUpdateTile(remotePeerId, name, stream, type) {
	const grid = el('gcGrid'); if (!grid) return;
	let tile = document.getElementById('gc-tile-' + remotePeerId);
	if (!tile) {
		tile = document.createElement('div'); tile.className = 'gc-tile'; tile.id = 'gc-tile-' + remotePeerId;
		const init = (name || 'P')[0].toUpperCase();
		tile.innerHTML = `<video id="gc-vid-${remotePeerId}" autoplay playsinline></video><div class="gc-tile-av" id="gc-av-${remotePeerId}">${escH(init)}</div><div class="gc-tile-name">${escH(name)}</div>`;
		grid.appendChild(tile); gcUpdateGridLayout();
	}
	if (stream) {
		const vid = document.getElementById('gc-vid-' + remotePeerId);
		if (vid) {
			vid.srcObject = stream; vid.play().catch(() => {});
			if (type === 'video') { vid.style.display = 'block'; const av = document.getElementById('gc-av-' + remotePeerId); if (av) av.style.display = 'none'; }
		}
	}
}

export function gcRemoveTile(peerId) { document.getElementById('gc-tile-' + peerId)?.remove(); gcUpdateGridLayout(); }

export function gcUpdateGridLayout() {
	const grid = el('gcGrid'); if (!grid) return;
	const count = grid.children.length;
	grid.className = 'gc-grid p' + Math.min(count, 6);
}
