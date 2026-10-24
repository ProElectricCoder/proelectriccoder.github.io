/**
 * engine.js — WebRTC + Firebase / Cloudflare Signaling Chat Engine v1.4.0
 * v1.4.0: STUN + free TURN fallback (getIceConfig), route detection direct vs TURN relay (onRoute),
 *         8s grace before a "disconnected" peer is dropped, incremental ICE trickle (Firebase + WS),
 *         WS signaling outbox / reconnect / per-guest answer routing, CloudflareWSEngine pinned to CF_WS_URL,
 *         shared BaseEngine for ChatEngine and CloudflareWSEngine
 * v1.3.0: Heartbeat (fixes stuck Connected state), Smart relay targeting
 */

// CloudflareWSEngine always connects here (a wsUrl passed to the constructor is ignored).
export const CF_WS_URL = 'wss://proelectriccoder.pages.dev/api/ChatRooms';

const BASE_ICE_SERVERS = [
	{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
	{ urls: 'stun:stun.cloudflare.com:3478' },
	// Free public TURN relay (Open Relay Project / Metered). Only carries traffic when no direct path works.
	{
		urls: [
			'turn:openrelay.metered.ca:80',
			'turn:openrelay.metered.ca:443',
			'turn:openrelay.metered.ca:443?transport=tcp',
			'turns:openrelay.metered.ca:443?transport=tcp',
		],
		username: 'openrelayproject',
		credential: 'openrelayproject',
	},
];

// Own TURN credentials (e.g. a free Metered account) can be added without a code change:
//   localStorage.setItem('pec_ice_servers', JSON.stringify([{ urls: 'turn:…', username: '…', credential: '…' }]))
function customIceServers() {
	try {
		const raw = typeof localStorage !== 'undefined' && localStorage.getItem('pec_ice_servers');
		const arr = raw && JSON.parse(raw);
		return Array.isArray(arr) ? arr.filter(s => s && s.urls) : [];
	} catch { return []; }
}

export function getIceConfig() {
	return { iceServers: [...customIceServers(), ...BASE_ICE_SERVERS], iceCandidatePoolSize: 4 };
}

/**
 * Inspect the selected ICE candidate pair.
 * Resolves to { relayed, local, remote } (candidate types) or null if it can't be determined.
 * relayed === true means a TURN server carries the traffic, i.e. direct P2P was not possible.
 */
export async function detectRoute(pc, tries = 4) {
	for (let i = 0; i < tries; i++) {
		try {
			const stats = await pc.getStats();
			const byId = new Map(); let pair = null;
			stats.forEach(r => byId.set(r.id, r));
			stats.forEach(r => {
				if (r.type === 'transport' && r.selectedCandidatePairId && byId.has(r.selectedCandidatePairId)) pair = byId.get(r.selectedCandidatePairId);
			});
			if (!pair) stats.forEach(r => {
				if (!pair && r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = r;
			});
			if (pair) {
				const lc = byId.get(pair.localCandidateId), rc = byId.get(pair.remoteCandidateId);
				if (lc || rc) return {
					relayed: lc?.candidateType === 'relay' || rc?.candidateType === 'relay',
					local: lc?.candidateType || null,
					remote: rc?.candidateType || null,
				};
			}
		} catch {}
		await new Promise(res => setTimeout(res, 400));
	}
	return null;
}

/**
 * Watch a peer connection.
 *  - onRoute(info): once connected (and again if the route changes) — info.relayed tells direct vs TURN
 *  - onDead(): connection failed/closed, or stayed "disconnected" longer than graceMs
 *    (a brief "disconnected" is normal during network changes and often recovers on its own)
 */
export function monitorPC(pc, { onRoute, onDead, graceMs = 8000 }) {
	let timer = null, last = null;
	pc.addEventListener('connectionstatechange', () => {
		const s = pc.connectionState;
		clearTimeout(timer);
		if (s === 'connected') {
			detectRoute(pc).then(info => {
				if (!info || pc.connectionState !== 'connected') return;
				if (info.relayed !== last) { last = info.relayed; if (onRoute) onRoute(info); }
			});
		} else if (s === 'disconnected') {
			timer = setTimeout(() => { if (pc.connectionState === 'disconnected') onDead(); }, graceMs);
		} else if (s === 'failed' || s === 'closed') {
			onDead();
		}
	});
}

const PING = '{"type":"__ping"}', PONG = '{"type":"__pong"}';

// ============================================================================
// BaseEngine — data channels, heartbeat, relay, peer bookkeeping
// ============================================================================
class BaseEngine {
	constructor({ relay = false } = {}) {
		this.roomId = null; this.peers = new Map(); this._relay = relay;
		this._heartbeats = new Map();
		this._onMessage = null; this._onPeerConnected = null; this._onPeerDisconnected = null;
		this._onTrack = null; this._onRoute = null;
	}

	send(data) {
		const payload = this._ser(data); let sent = 0;
		this.peers.forEach(({ channel }) => { if (channel?.readyState === 'open') { try { channel.send(payload); sent++; } catch {} } });
		if (!sent) this._safeLog('warn', '[Engine] no open channels');
	}

	onTrack(cb) { this._onTrack = cb; }
	onMessage(cb) { this._onMessage = cb; }
	onPeerConnected(cb) { this._onPeerConnected = cb; }
	onPeerDisconnected(cb) { this._onPeerDisconnected = cb; }
	// cb({ peerId, relayed, local, remote }) — relayed:true means a TURN server carries the traffic
	onRoute(cb) { this._onRoute = cb; }

	addLocalStream(peerId, stream) {
		const peer = this.peers.get(peerId);
		if (!peer || !peer.pc) return;
		stream.getTracks().forEach(track => peer.pc.addTrack(track, stream));
	}

	_createPC(peerId) {
		const pc = new RTCPeerConnection(getIceConfig());
		monitorPC(pc, {
			onRoute: info => { if (this._onRoute) this._onRoute({ peerId, ...info }); },
			onDead: () => this._removePeer(peerId),
		});
		pc.ontrack = evt => { if (this._onTrack) this._onTrack(evt.streams[0], peerId); };
		return pc;
	}

	_bindChannel(ch, peerId) {
		ch.binaryType = 'arraybuffer';
		ch.onopen = () => {
			if (this._onPeerConnected) this._onPeerConnected(peerId);
			this._startHeartbeat(ch, peerId);
		};
		ch.onclose = () => { this._removePeer(peerId); };
		ch.onerror = e => this._safeLog('error', `[Engine] ch err (${peerId}):`, e);
		ch.onmessage = evt => {
			if (evt.data === PING) { try { ch.send(PONG); } catch {} return; }
			if (evt.data === PONG) { this._heartbeats.get(peerId)?.pong(); return; }
			// Relay (group host): forward to every other peer; receivers filter on their own 'to' field
			if (this._relay) {
				this.peers.forEach(({ channel: c }, pid) => {
					if (pid !== peerId && c?.readyState === 'open') { try { c.send(evt.data); } catch {} }
				});
			}
			if (this._onMessage) this._onMessage(this._deser(evt.data), peerId);
		};
	}

	_startHeartbeat(ch, peerId) {
		const prev = this._heartbeats.get(peerId); if (prev) clearInterval(prev.interval);
		let lastPong = Date.now();
		const interval = setInterval(() => {
			if (ch.readyState !== 'open') { clearInterval(interval); this._heartbeats.delete(peerId); return; }
			if (Date.now() - lastPong > 10000) {
				clearInterval(interval); this._heartbeats.delete(peerId);
				this._removePeer(peerId);
				try { ch.close(); } catch {}
				return;
			}
			try { ch.send(PING); } catch {}
		}, 5000);
		this._heartbeats.set(peerId, { interval, pong: () => { lastPong = Date.now(); } });
	}

	_removePeer(peerId) {
		const hb = this._heartbeats.get(peerId);
		if (hb) { clearInterval(hb.interval); this._heartbeats.delete(peerId); }
		const peer = this.peers.get(peerId);
		if (!peer) return;
		this.peers.delete(peerId);
		try { peer.unsub?.(); } catch {}
		if (this._onPeerDisconnected) this._onPeerDisconnected(peerId);
		try { peer.channel?.close(); } catch {}
		try { peer.pc?.close(); } catch {}
	}

	_teardownPeers() {
		this._heartbeats.forEach(h => clearInterval(h.interval)); this._heartbeats.clear();
		this.peers.forEach(p => {
			try { p.unsub?.(); } catch {}
			try { p.channel?.close(); } catch {}
			try { p.pc?.close(); } catch {}
		});
		this.peers.clear(); this.roomId = null;
	}

	_ser(d) { if (d instanceof ArrayBuffer || d instanceof Blob) return d; if (typeof d === 'object') return JSON.stringify(d); return String(d); }
	_deser(r) { if (r instanceof ArrayBuffer) return r; if (typeof r === 'string') { try { return JSON.parse(r); } catch {} } return r; }
	_uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
	_safeLog(level, ...args) { if (typeof console !== 'undefined' && console[level]) { try { console[level](...args); } catch {} } }
}

// ============================================================================
// ChatEngine — Firebase (Firestore) signaling
// ============================================================================
export class ChatEngine extends BaseEngine {
	constructor({ relay = false } = {}) {
		super({ relay });
		this.db = null; this._unsubs = []; this._flushTimers = new Map();
	}

	init(db) { if (!db) throw new Error('[ChatEngine] Firestore required'); this.db = db; }

	async createRoom(roomId) {
		this._assertDB(); this.roomId = roomId;
		const ref = this._roomRef(roomId);
		await ref.set({ createdAt: firebase.firestore.FieldValue.serverTimestamp(), host: true }, { merge: true });
		const unsub = ref.collection('signals').onSnapshot(async snap => {
			for (const ch of snap.docChanges()) {
				if (ch.type !== 'added') continue;
				const sig = ch.doc.data(), gid = ch.doc.id;
				if (sig.type === 'offer' && !this.peers.has(gid)) {
					try { await this._handleOffer(gid, sig, ref); }
					catch (e) { this._safeLog('error', '[ChatEngine] offer handling failed:', e); this._removePeer(gid); }
				}
			}
		}, error => { this._safeLog('error', '[ChatEngine] stream broken:', error); });
		this._unsubs.push(unsub); return roomId;
	}

	async joinRoom(roomId) {
		this._assertDB(); this.roomId = roomId;
		const ref = this._roomRef(roomId), gid = this._uid();
		const pc = this._createPC(gid), ch = pc.createDataChannel('data', { ordered: true });
		const peer = { pc, channel: ch };
		this._bindChannel(ch, gid); this.peers.set(gid, peer);

		// Candidates are trickled once the offer doc exists (late TURN relay candidates included)
		const pending = []; let offerWritten = false;
		pc.onicecandidate = evt => {
			if (evt.candidate) pending.push(evt.candidate.toJSON());
			if (offerWritten && pending.length) this._flush(ref, gid, 'guestCandidates', pending, evt.candidate ? 400 : 0);
		};

		const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
		const gref = ref.collection('signals').doc(gid);
		await gref.set({ type: 'offer', sdp: offer.sdp, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
		offerWritten = true;
		if (pending.length) this._flush(ref, gid, 'guestCandidates', pending, 0);

		// Apply the answer once, then every host candidate as it arrives (serialized to avoid double setRemoteDescription)
		let applied = 0, chain = Promise.resolve();
		peer.unsub = gref.onSnapshot(snap => {
			chain = chain.then(async () => {
				const d = snap.data(); if (!d?.answer) return;
				if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: d.answer }));
				const list = d.hostCandidates || [];
				while (applied < list.length) await pc.addIceCandidate(new RTCIceCandidate(list[applied++])).catch(() => {});
			}).catch(e => this._safeLog('warn', '[ChatEngine] applying host signal failed:', e));
		}, error => { this._safeLog('error', '[ChatEngine] stream broken:', error); });
	}

	disconnect() {
		this._unsubs.forEach(u => { try { u(); } catch {} }); this._unsubs = [];
		this._flushTimers.forEach(t => clearTimeout(t)); this._flushTimers.clear();
		this._teardownPeers();
	}

	async _handleOffer(gid, sig, ref) {
		const pc = this._createPC(gid), peer = { pc, channel: null };
		this.peers.set(gid, peer);
		const gref = ref.collection('signals').doc(gid);
		const hostCandidates = []; let answered = false;
		pc.onicecandidate = evt => {
			if (evt.candidate) hostCandidates.push(evt.candidate.toJSON());
			if (answered && hostCandidates.length) this._flush(ref, gid, 'hostCandidates', hostCandidates, evt.candidate ? 400 : 0);
		};
		pc.ondatachannel = evt => { this._bindChannel(evt.channel, gid); peer.channel = evt.channel; };
		await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: sig.sdp }));
		const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
		await this._waitICE(pc, 1500);
		answered = true;
		await gref.update({ answer: ans.sdp, hostCandidates: [...hostCandidates] });

		// Guest candidates keep arriving after the answer (TURN relay candidates are slow) — apply them incrementally
		let applied = 0, chain = Promise.resolve();
		peer.unsub = gref.onSnapshot(snap => {
			chain = chain.then(async () => {
				const list = snap.data()?.guestCandidates || [];
				while (applied < list.length) await pc.addIceCandidate(new RTCIceCandidate(list[applied++])).catch(() => {});
			}).catch(() => {});
		}, error => { this._safeLog('error', '[ChatEngine] guest candidate stream broken:', error); });
	}

	_waitICE(pc, ms = 1500) {
		return new Promise(res => {
			if (pc.iceGatheringState === 'complete') { res(); return; }
			const t = setTimeout(res, ms);
			pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } };
		});
	}

	_flush(ref, gid, field, candidates, delay = 400) {
		const key = gid + ':' + field, prev = this._flushTimers.get(key); if (prev) clearTimeout(prev);
		const t = setTimeout(async () => {
			this._flushTimers.delete(key);
			try { await ref.collection('signals').doc(gid).update({ [field]: [...candidates] }); } catch {}
		}, delay);
		this._flushTimers.set(key, t);
	}

	_roomRef(id) { return this.db.collection('chatRooms').doc(String(id)); }
	_assertDB() { if (!this.db) throw new Error('[ChatEngine] call init(db) first'); }
}

// ============================================================================
// DirectEngine — manual SDP copy/paste signaling
// ============================================================================
export class DirectEngine {
	constructor() {
		this.pc = null; this.channel = null; this._localCandidates = [];
		this._onMessage = null; this._onPeerConnected = null; this._onPeerDisconnected = null;
		this._onTrack = null; this._onRoute = null; this._heartbeat = null; this._lastPong = 0; this._gone = false;
	}
	async createOffer() {
		this.pc = new RTCPeerConnection(getIceConfig());
		this.channel = this.pc.createDataChannel('data', { ordered: true });
		this._bindChannel(this.channel); this._setupPC();
		const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
		await this._waitICE(); return JSON.stringify(this.pc.localDescription.toJSON());
	}
	async setAnswer(json) { await this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(json))); }
	async createAnswerFor(json) {
		this.pc = new RTCPeerConnection(getIceConfig()); this._setupPC();
		this.pc.ondatachannel = evt => { this.channel = evt.channel; this._bindChannel(this.channel); };
		await this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(json)));
		const ans = await this.pc.createAnswer(); await this.pc.setLocalDescription(ans);
		await this._waitICE(); return JSON.stringify(this.pc.localDescription.toJSON());
	}
	send(d) {
		if (this.channel?.readyState !== 'open') { this._safeLog('warn', '[DirectEngine] not open'); return; }
		this.channel.send(typeof d === 'object' && !(d instanceof ArrayBuffer) ? JSON.stringify(d) : d);
	}
	onTrack(cb) { this._onTrack = cb; }
	addLocalStream(stream) {
		if (!this.pc) return;
		stream.getTracks().forEach(track => this.pc.addTrack(track, stream));
	}
	onMessage(cb) { this._onMessage = cb; }
	onPeerConnected(cb) { this._onPeerConnected = cb; }
	onPeerDisconnected(cb) { this._onPeerDisconnected = cb; }
	onRoute(cb) { this._onRoute = cb; }
	disconnect() {
		if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
		this._gone = true;
		try { this.channel?.close(); } catch {} try { this.pc?.close(); } catch {}
		this.pc = null; this.channel = null;
	}

	_setupPC() {
		this.pc.onicecandidate = evt => { if (evt.candidate) this._localCandidates.push(evt.candidate.toJSON()); };
		monitorPC(this.pc, {
			onRoute: info => { if (this._onRoute) this._onRoute({ peerId: 'remote', ...info }); },
			onDead: () => this._notifyGone(),
		});
		this.pc.ontrack = evt => { if (this._onTrack) this._onTrack(evt.streams[0], 'remote'); };
	}

	_notifyGone() {
		if (this._gone) return;
		this._gone = true;
		if (this._onPeerDisconnected) this._onPeerDisconnected('remote');
	}

	_bindChannel(ch) {
		ch.binaryType = 'arraybuffer';
		ch.onopen = () => {
			this._gone = false;
			if (this._onPeerConnected) this._onPeerConnected('remote');
			this._startHeartbeat(ch);
		};
		ch.onclose = () => { this._notifyGone(); };
		ch.onmessage = evt => {
			if (evt.data === PING) { try { ch.send(PONG); } catch {} return; }
			if (evt.data === PONG) { this._lastPong = Date.now(); return; }
			if (!this._onMessage) return;
			let d = evt.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} }
			this._onMessage(d, 'remote');
		};
	}

	_startHeartbeat(ch) {
		if (this._heartbeat) clearInterval(this._heartbeat);
		this._lastPong = Date.now();
		this._heartbeat = setInterval(() => {
			if (ch.readyState !== 'open') { clearInterval(this._heartbeat); this._heartbeat = null; return; }
			if (Date.now() - this._lastPong > 10000) {
				clearInterval(this._heartbeat); this._heartbeat = null;
				this._notifyGone();
				try { ch.close(); } catch {}
				return;
			}
			try { ch.send(PING); } catch {}
		}, 5000);
	}

	// Manual SDP exchange needs every candidate inside the SDP, including slow TURN relay candidates
	_waitICE() {
		return new Promise(res => {
			if (this.pc.iceGatheringState === 'complete') { res(); return; }
			const t = setTimeout(res, 6000);
			this.pc.onicegatheringstatechange = () => { if (this.pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } };
		});
	}

	_safeLog(level, ...args) { if (typeof console !== 'undefined' && console[level]) { try { console[level](...args); } catch {} } }
}

// ============================================================================
// CloudflareWSEngine — Durable Objects + WebSocket + Firebase Auth signaling
// Always connects to CF_WS_URL. `token` may be an ID-token string or an async function returning one
// (a function lets the engine fetch a fresh token when it has to reconnect the signaling socket).
// ============================================================================
export class CloudflareWSEngine extends BaseEngine {
	constructor({ relay = false } = {}) {
		super({ relay });
		this.wsUrl = CF_WS_URL;
		this._ws = null; this._outbox = [];
		this._tokenSrc = null; this._wsOpenCb = null; this._wsTries = 0; this._wsTimer = null;
		this.isHost = false;
		this._peerId = null; // our own peer ID (guest) for signal routing
	}

	init() {} // No-op to match interface

	async createRoom(roomId, token) {
		if (!token) throw new Error('[CloudflareWSEngine] Firebase ID token required');
		this.roomId = roomId; this.isHost = true; this._peerId = null;
		this._connectWS(roomId, token);
		return roomId;
	}

	async joinRoom(roomId, token) {
		if (!token) throw new Error('[CloudflareWSEngine] Firebase ID token required');
		this.roomId = roomId; this.isHost = false; this._peerId = this._uid();
		const gid = this._peerId;
		const pc = this._createPC(gid), ch = pc.createDataChannel('data', { ordered: true });
		this._bindChannel(ch, gid);
		this.peers.set(gid, { pc, channel: ch });

		// Candidates gathered before the socket is open wait in the outbox (they used to be dropped)
		pc.onicecandidate = evt => {
			if (evt.candidate) this._sendSignaling({ type: 'candidate', candidate: evt.candidate.toJSON(), from: gid });
		};

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		this._connectWS(roomId, token, () => {
			// (Re)send the offer whenever the socket opens and we're still waiting for an answer
			if (pc.signalingState === 'have-local-offer') this._sendSignaling({ type: 'offer', sdp: offer.sdp, from: gid }, true);
		});
	}

	_connectWS(roomId, tokenSrc, onOpenCb) {
		this._tokenSrc = tokenSrc; this._wsOpenCb = onOpenCb || null; this._wsTries = 0;
		this._openWS();
	}

	async _openWS() {
		clearTimeout(this._wsTimer);
		const roomId = this.roomId; if (!roomId) return;
		let token;
		try { token = typeof this._tokenSrc === 'function' ? await this._tokenSrc() : this._tokenSrc; }
		catch (e) { this._safeLog('warn', '[CloudflareWSEngine] token fetch failed:', e); this._scheduleReconnect(); return; }
		if (this.roomId !== roomId) return; // disconnected meanwhile
		const ws = new WebSocket(`${this.wsUrl}/${roomId}?token=${encodeURIComponent(token)}`);
		this._ws = ws;
		ws.onopen = () => {
			this._wsTries = 0;
			if (this._wsOpenCb) this._wsOpenCb();
			this._flushOutbox();
		};
		ws.onmessage = async evt => {
			let sig; try { sig = JSON.parse(evt.data); } catch { return; }
			try { await this._onSignal(sig); }
			catch (e) { this._safeLog('warn', '[CloudflareWSEngine] signal error:', e); }
		};
		ws.onerror = evt => { this._safeLog('error', '[CloudflareWSEngine] WebSocket error:', evt); };
		ws.onclose = () => {
			this._safeLog('log', '[CloudflareWSEngine] WebSocket closed');
			if (this._ws !== ws) return;
			this._ws = null;
			// The host must keep listening for new guests; a guest only needs the socket until its channel is open
			const needed = this.isHost || ![...this.peers.values()].some(p => p.channel?.readyState === 'open');
			if (this.roomId && needed) this._scheduleReconnect();
		};
	}

	_scheduleReconnect() {
		if (!this.roomId || this._wsTries >= 6) return;
		const delay = Math.min(1000 * 2 ** this._wsTries, 15000); this._wsTries++;
		clearTimeout(this._wsTimer);
		this._wsTimer = setTimeout(() => this._openWS(), delay);
	}

	async _onSignal(sig) {
		if (this.isHost) {
			// HOST receives signals from guests (always carry 'from')
			if (sig.type === 'offer' && sig.from && !this.peers.has(sig.from)) await this._handleOffer(sig.from, sig.sdp);
			else if (sig.type === 'candidate' && sig.from) await this._queueOrApplyCandidate(sig.from, sig.candidate);
			return;
		}
		// GUEST receives signals from the host (no 'from'); newer hosts also address them with 'to'
		if (sig.from) return;
		if (sig.to && sig.to !== this._peerId) return;
		const peer = this.peers.get(this._peerId); if (!peer) return;
		if (sig.type === 'answer') {
			if (peer.pc.signalingState === 'have-local-offer') {
				await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: sig.sdp }));
				await this._flushPendingCandidates(peer);
			}
		} else if (sig.type === 'candidate') {
			await this._queueOrApplyCandidate(this._peerId, sig.candidate);
		}
	}

	async _handleOffer(gid, sdp) {
		const pc = this._createPC(gid), peer = { pc, channel: null, _pending: [] };
		this.peers.set(gid, peer);
		pc.onicecandidate = evt => {
			if (evt.candidate) this._sendSignaling({ type: 'candidate', candidate: evt.candidate.toJSON(), to: gid });
		};
		pc.ondatachannel = evt => { this._bindChannel(evt.channel, gid); peer.channel = evt.channel; };
		await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
		await this._flushPendingCandidates(peer);
		const ans = await pc.createAnswer();
		await pc.setLocalDescription(ans);
		this._sendSignaling({ type: 'answer', sdp: ans.sdp, to: gid });
	}

	// remoteDescription (not currentRemoteDescription) so candidates arriving between setRemoteDescription
	// and the end of negotiation are applied instead of being stuck in the queue
	async _queueOrApplyCandidate(pid, candidate) {
		const peer = this.peers.get(pid);
		if (!peer) return;
		if (!peer.pc.remoteDescription) {
			if (!peer._pending) peer._pending = [];
			peer._pending.push(candidate);
		} else {
			await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
		}
	}

	async _flushPendingCandidates(peer) {
		if (!peer || !peer._pending) return;
		const list = peer._pending; peer._pending = [];
		for (const c of list) await peer.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
	}

	// Sends now when the socket is open, otherwise queues until it opens (front = true puts it first)
	_sendSignaling(payload, front = false) {
		const ws = this._ws;
		if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(payload)); } catch {} return; }
		if (front) this._outbox.unshift(payload); else this._outbox.push(payload);
	}

	_flushOutbox() {
		const ws = this._ws; if (!ws || ws.readyState !== WebSocket.OPEN) return;
		const q = this._outbox; this._outbox = [];
		for (const p of q) { try { ws.send(JSON.stringify(p)); } catch {} }
	}

	disconnect() {
		clearTimeout(this._wsTimer);
		const ws = this._ws; this._ws = null; this.roomId = null;
		if (ws) { try { ws.close(); } catch {} }
		this._outbox = [];
		this._teardownPeers();
		this._peerId = null;
	}
}
