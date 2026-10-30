/**
 * engine.js — WebRTC + Firebase / Cloudflare Signaling Chat Engine v1.5.0
 *
 * Two tiers in one file:
 *   SIMPLE   — Peer + Connection (bottom of this file). PeerJS-style: peer.host(room) / peer.join(room),
 *              conn.send(data), conn.on('data', fn). Auto-reconnect, connect timeouts, debug trace.
 *   ADVANCED — ChatEngine, CloudflareWSEngine, DirectEngine. Full control; unchanged and backward compatible.
 *              The simple tier is built on these, so everything it can do you can also do by hand.
 *
 * v1.5.0: Peer / Connection simple API; engines gain sendTo(), hasOpenChannel(), openPeerIds(), closePeer(),
 *         onError(), configurable heartbeat/grace timings, send() returns the number of channels written,
 *         CloudflareWSEngine gains onSignaling() + reconnectSignaling(); any inbound frame now counts as
 *         "peer is alive" (a backgrounded tab with throttled timers is no longer dropped by its own heartbeat)
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

function safeLog(level, ...args) {
	if (typeof console !== 'undefined' && console[level]) { try { console[level](...args); } catch {} }
}

// ============================================================================
// ADVANCED API
// BaseEngine — data channels, heartbeat, relay, peer bookkeeping
//   options: relay (group host), heartbeatMs (ping interval, 5000), timeoutMs (silence before a peer is
//   dropped, 10000), graceMs (time a "disconnected" peer gets to recover, 8000)
// ============================================================================
class BaseEngine {
	constructor({ relay = false, heartbeatMs = 5000, timeoutMs = 10000, graceMs = 8000 } = {}) {
		this.roomId = null; this.peers = new Map(); this._relay = relay;
		this._heartbeats = new Map();
		this._hb = { heartbeatMs, timeoutMs }; this._graceMs = graceMs;
		this._onMessage = null; this._onPeerConnected = null; this._onPeerDisconnected = null;
		this._onTrack = null; this._onRoute = null; this._onError = null;
	}

	// Broadcast to every open channel. Returns how many channels were written to.
	send(data) {
		const payload = this._ser(data); let sent = 0;
		this.peers.forEach(({ channel }) => { if (channel?.readyState === 'open') { try { channel.send(payload); sent++; } catch {} } });
		if (!sent) this._safeLog('warn', '[Engine] no open channels');
		return sent;
	}

	// Send to exactly one peer. Returns true if the frame was handed to an open channel.
	sendTo(peerId, data) {
		const ch = this.peers.get(peerId)?.channel;
		if (ch?.readyState !== 'open') return false;
		try { ch.send(this._ser(data)); return true; } catch { return false; }
	}

	hasOpenChannel() {
		for (const { channel } of this.peers.values()) if (channel?.readyState === 'open') return true;
		return false;
	}

	openPeerIds() {
		const ids = [];
		this.peers.forEach(({ channel }, id) => { if (channel?.readyState === 'open') ids.push(id); });
		return ids;
	}

	// Drop one peer (fires onPeerDisconnected)
	closePeer(peerId) { this._removePeer(peerId); }

	// cb({ code, error }) — non-fatal problems the engine used to only log: 'offer', 'signaling-stream', 'token', 'websocket', 'signal'
	onError(cb) { this._onError = cb; }
	_emitError(code, error) { if (this._onError) { try { this._onError({ code, error }); } catch (e) { this._safeLog('error', '[Engine] onError handler threw:', e); } } }

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
			graceMs: this._graceMs,
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
			// Any inbound frame proves the peer is alive, not just a pong (a backgrounded tab's own ping timer may be throttled)
			this._heartbeats.get(peerId)?.pong();
			if (evt.data === PING) { try { ch.send(PONG); } catch {} return; }
			if (evt.data === PONG) return;
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
		const { heartbeatMs, timeoutMs } = this._hb;
		const interval = setInterval(() => {
			if (ch.readyState !== 'open') { clearInterval(interval); this._heartbeats.delete(peerId); return; }
			if (Date.now() - lastPong > timeoutMs) {
				clearInterval(interval); this._heartbeats.delete(peerId);
				this._removePeer(peerId);
				try { ch.close(); } catch {}
				return;
			}
			try { ch.send(PING); } catch {}
		}, heartbeatMs);
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
	constructor(opts = {}) {
		super(opts);
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
					catch (e) { this._safeLog('error', '[ChatEngine] offer handling failed:', e); this._emitError('offer', e); this._removePeer(gid); }
				}
			}
		}, error => { this._safeLog('error', '[ChatEngine] stream broken:', error); this._emitError('signaling-stream', error); });
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
		}, error => { this._safeLog('error', '[ChatEngine] stream broken:', error); this._emitError('signaling-stream', error); });
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
		}, error => { this._safeLog('error', '[ChatEngine] guest candidate stream broken:', error); this._emitError('signaling-stream', error); });
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
// DirectEngine — manual SDP copy/paste signaling (single peer, id is always 'remote')
// ============================================================================
export class DirectEngine {
	constructor({ heartbeatMs = 5000, timeoutMs = 10000, graceMs = 8000 } = {}) {
		this.pc = null; this.channel = null; this._localCandidates = [];
		this._onMessage = null; this._onPeerConnected = null; this._onPeerDisconnected = null;
		this._onTrack = null; this._onRoute = null; this._onError = null; this._heartbeat = null; this._lastPong = 0; this._gone = false;
		this._hb = { heartbeatMs, timeoutMs }; this._graceMs = graceMs;
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
	// Returns true if the frame was handed to the open channel
	send(d) {
		if (this.channel?.readyState !== 'open') { this._safeLog('warn', '[DirectEngine] not open'); return false; }
		try { this.channel.send(typeof d === 'object' && !(d instanceof ArrayBuffer) && !(d instanceof Blob) ? JSON.stringify(d) : d); return true; }
		catch { return false; }
	}
	// Same shape as the other engines so code can switch engines freely; there is only one peer
	sendTo(_peerId, d) { return this.send(d); }
	hasOpenChannel() { return this.channel?.readyState === 'open'; }
	openPeerIds() { return this.hasOpenChannel() ? ['remote'] : []; }
	closePeer() { this.disconnect(); }
	onError(cb) { this._onError = cb; }
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
			graceMs: this._graceMs,
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
			this._lastPong = Date.now();   // any inbound frame proves the peer is alive
			if (evt.data === PING) { try { ch.send(PONG); } catch {} return; }
			if (evt.data === PONG) return;
			if (!this._onMessage) return;
			let d = evt.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} }
			this._onMessage(d, 'remote');
		};
	}

	_startHeartbeat(ch) {
		if (this._heartbeat) clearInterval(this._heartbeat);
		this._lastPong = Date.now();
		const { heartbeatMs, timeoutMs } = this._hb;
		this._heartbeat = setInterval(() => {
			if (ch.readyState !== 'open') { clearInterval(this._heartbeat); this._heartbeat = null; return; }
			if (Date.now() - this._lastPong > timeoutMs) {
				clearInterval(this._heartbeat); this._heartbeat = null;
				this._notifyGone();
				try { ch.close(); } catch {}
				return;
			}
			try { ch.send(PING); } catch {}
		}, heartbeatMs);
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
	constructor(opts = {}) {
		super(opts);
		this.wsUrl = CF_WS_URL;
		this._ws = null; this._outbox = [];
		this._tokenSrc = null; this._wsOpenCb = null; this._wsTries = 0; this._wsTimer = null;
		this.isHost = false;
		this._peerId = null; // our own peer ID (guest) for signal routing
		this._onSignaling = null;
	}

	init() {} // No-op to match interface

	// cb(state, info) for the signaling socket: 'connecting' | 'open' | 'reconnecting' {attempt, delayMs} | 'failed' {attempts} | 'closed'
	// 'failed' means the built-in 6 retries are used up; call reconnectSignaling() to start over.
	onSignaling(cb) { this._onSignaling = cb; }
	_sig(state, info) {
		if (!this._onSignaling) return;
		try { this._onSignaling(state, info); } catch (e) { this._safeLog('error', '[CloudflareWSEngine] onSignaling handler threw:', e); }
	}

	// Start the signaling socket over again with a fresh retry budget. Returns false if there is no room to reconnect to.
	reconnectSignaling() {
		if (!this.roomId || !this._tokenSrc) return false;
		this._wsTries = 0; clearTimeout(this._wsTimer);
		this._openWS();
		return true;
	}

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
		if (this._wsTries === 0) this._sig('connecting');
		let token;
		try { token = typeof this._tokenSrc === 'function' ? await this._tokenSrc() : this._tokenSrc; }
		catch (e) { this._safeLog('warn', '[CloudflareWSEngine] token fetch failed:', e); this._emitError('token', e); this._scheduleReconnect(); return; }
		if (this.roomId !== roomId) return; // disconnected meanwhile
		const ws = new WebSocket(`${this.wsUrl}/${roomId}?token=${encodeURIComponent(token)}`);
		this._ws = ws;
		ws.onopen = () => {
			this._wsTries = 0;
			this._sig('open');
			if (this._wsOpenCb) this._wsOpenCb();
			this._flushOutbox();
		};
		ws.onmessage = async evt => {
			let sig; try { sig = JSON.parse(evt.data); } catch { return; }
			try { await this._onSignal(sig); }
			catch (e) { this._safeLog('warn', '[CloudflareWSEngine] signal error:', e); this._emitError('signal', e); }
		};
		ws.onerror = evt => { this._safeLog('error', '[CloudflareWSEngine] WebSocket error:', evt); this._emitError('websocket', evt); };
		ws.onclose = () => {
			this._safeLog('log', '[CloudflareWSEngine] WebSocket closed');
			if (this._ws !== ws) return;
			this._ws = null;
			// The host must keep listening for new guests; a guest only needs the socket until its channel is open
			const needed = this.isHost || ![...this.peers.values()].some(p => p.channel?.readyState === 'open');
			if (this.roomId && needed) this._scheduleReconnect();
			else if (this.roomId) this._sig('closed');
		};
	}

	_scheduleReconnect() {
		if (!this.roomId) return;
		if (this._wsTries >= 6) { this._sig('failed', { attempts: this._wsTries }); return; }
		const delay = Math.min(1000 * 2 ** this._wsTries, 15000); this._wsTries++;
		this._sig('reconnecting', { attempt: this._wsTries, delayMs: delay });
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

// ============================================================================
// SIMPLE API — Peer + Connection
// A PeerJS-style layer over the engines above: one call to host, one call to join, one object per remote peer.
//
//   const host = await Peer.host('room-1', { token });
//   host.on('connection', conn => conn.on('data', d => console.log(conn.peer, d)));
//
//   const guest = await Peer.join('room-1', { token });
//   guest.on('message', ({ data }) => console.log(data));
//   guest.send({ hello: 'world' });
//
// Topology is the engines' star: one host, any number of guests. A guest talks to the host; the host talks to
// every guest. (Guest-to-guest relaying is the advanced tier: new ChatEngine({ relay: true }).)
// Everything here is built on the public engine methods, so anything it does you can also do by hand.
// ============================================================================
export const ENGINE_VERSION = '1.5.0';

class Emitter {
	constructor() { this._h = new Map(); }
	on(ev, fn) { let s = this._h.get(ev); if (!s) this._h.set(ev, s = new Set()); s.add(fn); return this; }
	once(ev, fn) { const w = (...a) => { this.off(ev, w); fn(...a); }; w._orig = fn; return this.on(ev, w); }
	off(ev, fn) { const s = this._h.get(ev); if (s) { s.delete(fn); for (const w of [...s]) if (w._orig === fn) s.delete(w); } return this; }
	removeAllListeners(ev) { if (ev) this._h.delete(ev); else this._h.clear(); return this; }
	emit(ev, ...args) {
		const s = this._h.get(ev); if (!s || !s.size) return false;
		for (const fn of [...s]) { try { fn(...args); } catch (e) { safeLog('error', `[Peer] "${ev}" handler threw:`, e); } }
		return true;
	}
}

const HELLO_V = 1;
const BYE = { __peer: 'bye' };
// Frames with a string __peer field are the Peer layer's own control frames (hello / bye) and never reach your handlers
const isCtl = d => !!d && typeof d === 'object' && !(d instanceof ArrayBuffer) && typeof d.__peer === 'string';

/**
 * One link to one remote peer.
 *   conn.peer      remote Peer id (their `id` option, or their random id)
 *   conn.metadata  whatever the remote passed as `metadata`
 *   conn.open      true while you can send
 *   conn.relayed   true if a TURN server carries this link, false if direct, null until known
 *   conn.send(data) -> true if handed to the channel. Before 'open' (and during a guest reconnect) it is queued, up to 100.
 *   conn.close()
 * Events: 'open' (also after a reconnect), 'data' (data), 'close' ({ reason }), 'route' ({ relayed, local, remote }),
 *         'reconnecting' ({ attempt, delayMs, reason }, guest side only)
 */
export class Connection extends Emitter {
	constructor(owner, gid) {
		super();
		this.peer = gid; this.gid = gid; this.metadata = null;
		this.open = false; this.closed = false; this.relayed = null; this.route = null;
		this._owner = owner; this._queue = []; this._inbox = []; this._helloTimer = null; this._hadHello = false;
	}
	get channel() { return this._owner._engine?.peers?.get(this.gid)?.channel ?? null; }   // escape hatch: the RTCDataChannel
	get pc() { return this._owner._engine?.peers?.get(this.gid)?.pc ?? null; }             // escape hatch: the RTCPeerConnection
	send(data) {
		if (this.closed) return false;
		if (!this.open) { if (this._queue.length < 100) this._queue.push(data); return false; }
		return this._owner._engine ? !!this._owner._engine.sendTo(this.gid, data) : false;
	}
	close() {
		if (this._owner.role === 'guest') this._owner.disconnect();
		else this._owner._closeConnection(this, 'local');
	}
	_flush() { const q = this._queue; this._queue = []; q.forEach(d => this.send(d)); }
}

/**
 * Peer — host a room or join one.
 *
 * new Peer(options) / Peer.host(room, options) / Peer.join(room, options)
 *   signaling          'cloudflare' (default, needs token) | 'firebase' (needs db)
 *   token              Firebase ID token, or an async function returning one (re-called on every reconnect)
 *   db                 firebase.firestore() for signaling: 'firebase'
 *   id                 your Peer id (default: random). Remote peers see it as conn.peer.
 *   metadata           any JSON value, handed to the remote as conn.metadata
 *   reconnect          { retries: 5, baseMs: 1000, maxMs: 15000 } or false. Guests rejoin automatically; hosts re-open signaling.
 *   connectTimeoutMs   how long a guest waits for the host to answer, and a host for signaling to open (default 20000)
 *   heartbeatMs / timeoutMs / graceMs   liveness tuning, see BaseEngine
 *   debug              true (console.debug) or a function(entry). Either way peer.getTrace() keeps the last 200 entries.
 *   createEngine       (engineOptions) => engine. Plug in your own signaling; must implement the shared engine interface.
 *
 * Events: 'open' (id) · 'connection' (conn, host side) · 'message' ({ from, data, connection }) · 'peer-left' (conn, host side)
 *         'route-change' ({ peer, connection, relayed, local, remote }) · 'reconnecting' ({ attempt, delayMs, reason }, guest)
 *         'reconnected' · 'disconnected' (host lost signaling) · 'signaling' (state, info) · 'track' ({ stream, from, connection })
 *         'error' (Error with .type: 'auth' | 'signaling' | 'timeout' | 'connection-lost' | 'unavailable') · 'close' ({ reason })
 */
export class Peer extends Emitter {
	constructor(opts = {}) {
		super();
		const signaling = opts.signaling || 'cloudflare';
		if (!opts.createEngine && signaling !== 'cloudflare' && signaling !== 'firebase') throw new Error('[Peer] signaling must be "cloudflare" or "firebase"');
		if (!opts.createEngine && signaling === 'firebase' && !opts.db) throw new Error('[Peer] signaling "firebase" needs { db: firebase.firestore() }');
		this._o = {
			signaling, token: opts.token ?? null, db: opts.db || null, createEngine: opts.createEngine || null, debug: opts.debug || false,
			connectTimeoutMs: opts.connectTimeoutMs ?? 20000, helloTimeoutMs: opts.helloTimeoutMs ?? 2000,
			engine: { heartbeatMs: opts.heartbeatMs, timeoutMs: opts.timeoutMs, graceMs: opts.graceMs },
		};
		const r = opts.reconnect;
		this._policy = r === false ? null : { retries: 5, baseMs: 1000, maxMs: 15000, ...(r && typeof r === 'object' ? r : {}) };
		this.id = opts.id ? String(opts.id) : Peer.makeId();
		this.metadata = opts.metadata ?? null;
		this.room = null; this.role = null; this.open = false; this.destroyed = false;
		this._engine = null; this._conns = new Map(); this._trace = []; this._started = false;
		this._retries = 0; this._retryTimer = null; this._connTimer = null;
		this._joinWait = null; this._sigWait = null; this._sigLost = false; this._sigRetries = 0; this._sigTimer = null;
	}

	static makeId() {
		try { const b = new Uint8Array(8); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
		catch { return Math.random().toString(36).slice(2, 12); }
	}
	static async host(room, opts) { const p = new Peer(opts); await p.host(room); return p; }
	static async join(room, opts) { const p = new Peer(opts); await p.join(room); return p; }

	/** Open connections. A guest has at most one (to the host); a host has one per guest. */
	get connections() { return [...this._conns.values()].filter(c => c.open); }
	/** Guest: the link to the host (null before the first connect). */
	get connection() { return this._firstConn(); }
	/** The underlying engine, for anything the simple API does not cover (media tracks, relay, raw channels). */
	get engine() { return this._engine; }
	getTrace() { return this._trace.slice(); }
	getConnection(peerId) { for (const c of this._conns.values()) if (c.peer === peerId) return c; return null; }

	/** Start a room as host. Resolves once signaling is open and guests can join. */
	async host(room) {
		this._precheck(room); this._started = true;
		this.role = 'host'; this.room = String(room);
		const eng = this._newEngine();
		const ready = this._waitSignaling(eng); ready.catch(() => {});
		try { await eng.createRoom(this.room, this._o.token); await ready; }
		catch (e) { const err = this._asError('signaling', e); this._finish('error'); this.emit('error', err); throw err; }
		this.open = true; this._log('open as host', this.room);
		this.emit('open', this.id);
		return this;
	}

	/** Join a room as guest. Resolves once the host answered and the channel is open; rejects when retries run out. */
	async join(room) {
		this._precheck(room); this._started = true;
		this.role = 'guest'; this.room = String(room);
		return new Promise((resolve, reject) => { this._joinWait = { resolve: () => resolve(this), reject }; this._guestStart(); });
	}

	/** Host: send to every guest. Guest: send to the host. Returns how many peers it was handed to. */
	send(data) {
		if (this.role === 'guest') { const c = this._firstConn(); return c && c.send(data) ? 1 : 0; }
		let n = 0; this._conns.forEach(c => { if (c.open && c.send(data)) n++; }); return n;
	}
	/** Host: send to one guest by their Peer id. */
	sendTo(peerId, data) { return this.getConnection(peerId)?.send(data) ?? false; }

	/** Leave. Tells the other side first, so it will not try to reconnect. Safe to call more than once. */
	disconnect() {
		if (this.destroyed) return;
		const eng = this._engine; let told = false;
		if (eng) this._conns.forEach(c => { if (c.open) { try { eng.sendTo(c.gid, BYE); told = true; } catch {} } });
		this._finish('local', told ? 100 : 0);
	}
	destroy() { this.disconnect(); }

	// ── internals ────────────────────────────────────────────────────────────
	_log(...a) {
		const fmt = x => { if (x instanceof Error) return x.message; if (x && typeof x === 'object') { try { return JSON.stringify(x); } catch { return String(x); } } return String(x); };
		const entry = { t: Date.now(), msg: a.map(fmt).join(' ') };
		this._trace.push(entry); if (this._trace.length > 200) this._trace.shift();
		const d = this._o.debug;
		if (typeof d === 'function') { try { d(entry); } catch {} } else if (d) safeLog('debug', `[Peer ${this.id}]`, entry.msg);
	}
	_mkErr(type, message, cause) { const e = new Error(message); e.type = type; if (cause) e.cause = cause; return e; }
	_asError(type, e) { return e && e.type ? e : this._mkErr(type, (e && e.message) || String(e), e); }
	_firstConn() { for (const c of this._conns.values()) return c; return null; }

	_precheck(room) {
		if (this.destroyed || this._started) throw this._mkErr('unavailable', '[Peer] this Peer was already used — create a new one');
		if (!room) throw this._mkErr('unavailable', '[Peer] a room name is required');
		if (this._o.createEngine) return;
		if (typeof RTCPeerConnection === 'undefined') throw this._mkErr('unavailable', '[Peer] WebRTC is not available in this browser');
		if (this._o.signaling === 'cloudflare' && !this._o.token) throw this._mkErr('auth', '[Peer] signaling "cloudflare" needs { token }: a Firebase ID token or an async function returning one');
	}

	_newEngine() {
		const o = this._o; let eng;
		if (o.createEngine) eng = o.createEngine({ ...o.engine });
		else if (o.signaling === 'firebase') { eng = new ChatEngine({ ...o.engine }); eng.init(o.db); }
		else eng = new CloudflareWSEngine({ ...o.engine });
		this._engine = eng; this._wire(eng);
		return eng;
	}

	_wire(eng) {
		const live = () => eng === this._engine && !this.destroyed;
		eng.onPeerConnected(gid => { if (live()) this._onChannelOpen(gid); });
		eng.onPeerDisconnected(gid => { if (live()) this._onChannelClosed(gid); });
		eng.onMessage((data, gid) => { if (live()) this._onData(gid, data); });
		eng.onRoute(info => { if (live()) this._onRoute(info); });
		eng.onTrack((stream, gid) => {
			if (!live()) return; const c = this._conns.get(gid);
			this.emit('track', { stream, from: c ? c.peer : gid, connection: c || null });
		});
		eng.onError(({ code, error }) => {
			if (!live()) return;
			this._log('engine error', code, error);
			if (code === 'websocket') return;   // surfaced through 'signaling' state events instead
			this.emit('error', this._mkErr(code === 'token' ? 'auth' : 'signaling', `${code}: ${(error && error.message) || error}`, error));
		});
		if (typeof eng.onSignaling === 'function') eng.onSignaling((state, info) => { if (eng === this._engine) this._onSignaling(state, info); });
	}

	_waitSignaling(eng) {
		if (typeof eng.onSignaling !== 'function') return Promise.resolve();
		const ms = this._o.connectTimeoutMs;
		return new Promise((resolve, reject) => {
			const t = setTimeout(() => { this._sigWait = null; reject(this._mkErr('timeout', `signaling did not open within ${ms}ms`)); }, ms);
			this._sigWait = { resolve: () => { clearTimeout(t); this._sigWait = null; resolve(); }, reject: e => { clearTimeout(t); this._sigWait = null; reject(e); } };
		});
	}

	_onSignaling(state, info) {
		this._log('signaling', state, info || '');
		this.emit('signaling', state, info);
		if (state === 'open') {
			if (this._sigWait) this._sigWait.resolve();
			if (this._sigLost) { this._sigLost = false; this._sigRetries = 0; clearTimeout(this._sigTimer); this.emit('reconnected'); }
			return;
		}
		if (this.role === 'guest') {
			// A guest only needs signaling until its channel opens; once it is open a closed socket is normal
			if (state === 'failed' && !this._firstConn()?.open) this._guestFailed('signaling', new Error(`signaling server unreachable after ${info?.attempts ?? '?'} attempts`));
			return;
		}
		if (state === 'failed') {
			if (this._sigWait) this._sigWait.reject(this._mkErr('signaling', 'signaling server unreachable'));
			if (this.open) this._hostResignal();
		}
		if (this.open && !this._sigLost && (state === 'reconnecting' || state === 'failed' || state === 'closed')) { this._sigLost = true; this.emit('disconnected'); }
	}

	// Host lost signaling and the engine's own retries ran out: start over with a fresh budget, with backoff
	_hostResignal() {
		const p = this._policy, eng = this._engine;
		if (!p || this._sigRetries >= p.retries) {
			this.emit('error', this._mkErr('signaling', 'lost the signaling server and gave up reconnecting: connected guests stay connected, but nobody new can join'));
			return;
		}
		const attempt = ++this._sigRetries, delayMs = Math.min(p.baseMs * 2 ** (attempt - 1), p.maxMs);
		this._log('re-opening signaling', { attempt, delayMs });
		clearTimeout(this._sigTimer);
		this._sigTimer = setTimeout(() => { if (eng === this._engine && typeof eng.reconnectSignaling === 'function') eng.reconnectSignaling(); }, delayMs);
	}

	// ── guest connect / retry ──
	async _guestStart() {
		if (this.destroyed) return;
		const eng = this._newEngine(), ms = this._o.connectTimeoutMs;
		this._log('joining', this.room);
		clearTimeout(this._connTimer);
		this._connTimer = setTimeout(() => {
			if (eng === this._engine) this._guestFailed('timeout', new Error(`the host did not answer within ${ms}ms: is a host listening in room "${this.room}"?`));
		}, ms);
		try { await eng.joinRoom(this.room, this._o.token); }
		catch (e) { if (eng === this._engine) this._guestFailed('signaling', e); }
	}

	_guestFailed(type, e) {
		if (this.destroyed) return;
		const err = this._asError(type, e);
		this._log('guest failed', type, err.message);
		this.emit('error', err);
		this._guestRetry(type, err);
	}

	_guestRetry(reason, err) {
		if (this.destroyed || this.role !== 'guest') return;
		clearTimeout(this._connTimer); clearTimeout(this._retryTimer);
		this._dropEngine();   // events from the old engine are ignored from here on
		const p = this._policy;
		if (!p || this._retries >= p.retries) { this._giveUp(reason, err); return; }
		const attempt = ++this._retries, delayMs = Math.min(p.baseMs * 2 ** (attempt - 1), p.maxMs);
		const info = { attempt, delayMs, reason };
		this._log('reconnecting', info);
		const c = this._firstConn();
		if (c && !c.closed) { c.open = false; c.emit('reconnecting', info); }
		this.emit('reconnecting', info);
		this._retryTimer = setTimeout(() => this._guestStart(), delayMs);
	}

	_giveUp(reason, err) {
		const wait = this._joinWait; this._joinWait = null;
		if (!err) { err = this._mkErr('connection-lost', 'lost the connection to the host and could not get it back'); this.emit('error', err); }
		this._finish('lost');
		if (wait) wait.reject(err);
	}

	_dropEngine() { const e = this._engine; this._engine = null; if (e) { try { e.disconnect(); } catch {} } }

	// ── channel lifecycle ──
	_onChannelOpen(gid) {
		clearTimeout(this._connTimer);
		let conn;
		if (this.role === 'guest') {
			conn = this._firstConn();
			if (conn && !conn.closed) { this._conns.delete(conn.gid); conn.gid = gid; conn._hadHello = false; }
			else conn = new Connection(this, gid);
		} else conn = new Connection(this, gid);
		this._conns.set(gid, conn);
		this._log('channel open', gid);
		this._engine.sendTo(gid, { __peer: 'hello', v: HELLO_V, id: this.id, meta: this.metadata });
		// A remote that is not a Peer never says hello: after helloTimeoutMs the link opens anyway, under its engine id
		clearTimeout(conn._helloTimer);
		conn._helloTimer = setTimeout(() => this._finishOpen(conn), this._o.helloTimeoutMs);
	}

	_onChannelClosed(gid) {
		const conn = this._conns.get(gid);
		if (!conn || conn.closed) return;
		this._log('channel closed', gid);
		if (this.role === 'host') { this._closeConnection(conn, 'lost'); return; }
		this._guestRetry('connection-lost');
	}

	_finishOpen(conn) {
		if (conn.open || conn.closed) return;
		clearTimeout(conn._helloTimer);
		if (!conn._hadHello && this.role === 'guest') conn.peer = 'host';
		conn.open = true;
		if (this.role === 'guest') {
			const first = !this.open; this.open = true; this._retries = 0;
			this._log(first ? 'open as guest' : 'reconnected', conn.peer);
			if (first) this.emit('open', this.id); else this.emit('reconnected');
			conn.emit('open');
			const wait = this._joinWait; this._joinWait = null; if (wait) wait.resolve();
		} else {
			this._log('connection', conn.peer);
			this.emit('connection', conn);
			conn.emit('open');
		}
		conn._flush();
		const inbox = conn._inbox; conn._inbox = []; inbox.forEach(d => this._deliver(conn, d));
	}

	_onData(gid, data) {
		const conn = this._conns.get(gid);
		if (!conn || conn.closed) return;
		if (isCtl(data)) { this._onControl(conn, data); return; }
		if (!conn.open) { if (conn._inbox.length < 100) conn._inbox.push(data); return; }
		this._deliver(conn, data);
	}

	_onControl(conn, f) {
		if (f.__peer === 'hello') {
			conn.peer = f.id != null ? String(f.id) : conn.gid; conn.metadata = f.meta ?? null; conn._hadHello = true;
			this._finishOpen(conn);
		} else if (f.__peer === 'bye') {
			this._log('remote said goodbye', conn.peer);
			this._closeConnection(conn, 'remote');
		}
	}

	_deliver(conn, data) {
		conn.emit('data', data);
		this.emit('message', { from: conn.peer, data, connection: conn });
	}

	_onRoute(info) {
		const conn = this._conns.get(info.peerId); if (!conn) return;
		conn.relayed = info.relayed; conn.route = { local: info.local, remote: info.remote };
		this._log('route', conn.peer, info.relayed ? 'TURN relay' : 'direct');
		conn.emit('route', { relayed: info.relayed, local: info.local, remote: info.remote });
		this.emit('route-change', { peer: conn.peer, connection: conn, relayed: info.relayed, local: info.local, remote: info.remote });
	}

	// reason: 'local' (conn.close()) | 'remote' (they said bye) | 'lost' (channel died, host side)
	_closeConnection(conn, reason) {
		if (conn.closed) return;
		if (this.role === 'guest') { if (reason === 'local') this.disconnect(); else this._finish(reason === 'remote' ? 'host-closed' : reason); return; }
		const eng = this._engine;
		conn.closed = true; conn.open = false; clearTimeout(conn._helloTimer);
		this._conns.delete(conn.gid);
		if (eng) {
			if (reason === 'local') { try { eng.sendTo(conn.gid, BYE); } catch {} setTimeout(() => { try { eng.closePeer(conn.gid); } catch {} }, 100); }
			else if (reason === 'remote') { try { eng.closePeer(conn.gid); } catch {} }
		}
		this._log('connection closed', conn.peer, reason);
		conn.emit('close', { reason });
		this.emit('peer-left', conn);
	}

	_finish(reason, disconnectDelayMs = 0) {
		if (this.destroyed) return;
		this.destroyed = true; this.open = false;
		clearTimeout(this._connTimer); clearTimeout(this._retryTimer); clearTimeout(this._sigTimer);
		if (this._sigWait) this._sigWait.reject(this._mkErr('signaling', 'closed before signaling opened'));
		const eng = this._engine; this._engine = null;
		const conns = [...this._conns.values()]; this._conns.clear();
		for (const c of conns) {
			if (c.closed) continue;
			c.closed = true; c.open = false; clearTimeout(c._helloTimer);
			c.emit('close', { reason });
			if (this.role === 'host') this.emit('peer-left', c);
		}
		if (eng) {
			if (disconnectDelayMs) setTimeout(() => { try { eng.disconnect(); } catch {} }, disconnectDelayMs);
			else { try { eng.disconnect(); } catch {} }
		}
		this._log('closed', reason);
		this.emit('close', { reason });
	}
}
