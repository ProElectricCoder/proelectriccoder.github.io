/**
 * engine.js — WebRTC + Firebase Signaling Chat Engine  v1.1
 * ──────────────────────────────────────────────────────────
 * v1.1: relay mode for group/hub topology, per-peer ICE flush timers.
 */

const ICE_CONFIG = {
	iceServers: [
		{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
		{ urls: 'stun:stun.services.mozilla.com' },
	],
	iceCandidatePoolSize: 10,
};

/* ── ChatEngine ─────────────────────────────────────────────────────────── */

export class ChatEngine {
	/**
	 * @param {{ relay?: boolean }} opts
	 *   relay — if true, messages from one peer are re-broadcast to all others
	 *           (enables group/hub topology when this instance is the room host).
	 */
	constructor({ relay = false } = {}) {
		this.db     = null;
		this.roomId = null;
		this.peers  = new Map();        // peerId → { pc, channel }
		this._relay        = relay;
		this._unsubs       = [];
		this._flushTimers  = new Map(); // per-peer ICE candidate flush timers
		this._onMessage          = null;
		this._onPeerConnected    = null;
		this._onPeerDisconnected = null;
	}

	// ─── Public ──────────────────────────────────────────────────────────────

	init(firestoreInstance) {
		if (!firestoreInstance) throw new Error('[ChatEngine] Firestore instance required.');
		this.db = firestoreInstance;
	}

	async createRoom(roomId) {
		this._assertDB();
		this.roomId = roomId;
		const roomRef = this._roomRef(roomId);
		await roomRef.set({ createdAt: firebase.firestore.FieldValue.serverTimestamp(), host: true });

		const unsub = roomRef.collection('signals').onSnapshot(async snap => {
			for (const ch of snap.docChanges()) {
				if (ch.type !== 'added') continue;
				const signal  = ch.doc.data();
				const guestId = ch.doc.id;
				if (signal.type === 'offer' && !this.peers.has(guestId))
					await this._handleOffer(guestId, signal, roomRef);
			}
		});
		this._unsubs.push(unsub);
		return roomId;
	}

	async joinRoom(roomId) {
		this._assertDB();
		this.roomId = roomId;
		const roomRef = this._roomRef(roomId);
		const guestId = this._uid();

		const pc      = this._createPC(guestId);
		const channel = pc.createDataChannel('data', { ordered: true });
		this._bindChannel(channel, guestId);
		this.peers.set(guestId, { pc, channel });

		const pending = [];
		pc.onicecandidate = evt => {
			if (evt.candidate) {
				pending.push(evt.candidate.toJSON());
				this._flushCandidates(roomRef, guestId, pending);
			}
		};

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		const guestRef = roomRef.collection('signals').doc(guestId);
		await guestRef.set({ type: 'offer', sdp: offer.sdp, createdAt: firebase.firestore.FieldValue.serverTimestamp() });

		const unsub = guestRef.onSnapshot(async snap => {
			const data = snap.data();
			if (data?.answer && !pc.currentRemoteDescription) {
				await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.answer }));
				for (const c of (data.hostCandidates || []))
					await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
			}
		});
		this._unsubs.push(unsub);
	}

	send(data) {
		const payload = this._serialise(data);
		let sent = 0;
		this.peers.forEach(({ channel }) => {
			if (channel?.readyState === 'open') { try { channel.send(payload); sent++; } catch {} }
		});
		if (!sent) console.warn('[ChatEngine] send() — no open channels');
	}

	onMessage(cb)          { this._onMessage = cb; }
	onPeerConnected(cb)    { this._onPeerConnected = cb; }
	onPeerDisconnected(cb) { this._onPeerDisconnected = cb; }

	disconnect() {
		this._unsubs.forEach(u => { try { u(); } catch {} });
		this._unsubs = [];
		this._flushTimers.forEach(t => clearTimeout(t));
		this._flushTimers.clear();
		this.peers.forEach(({ pc, channel }) => {
			try { channel?.close(); } catch {}
			try { pc?.close();      } catch {}
		});
		this.peers.clear();
		this.roomId = null;
	}

	// ─── Private ─────────────────────────────────────────────────────────────

	async _handleOffer(guestId, signal, roomRef) {
		const pc = this._createPC(guestId);
		this.peers.set(guestId, { pc, channel: null });

		const hostCandidates = [];
		pc.onicecandidate = evt => { if (evt.candidate) hostCandidates.push(evt.candidate.toJSON()); };
		pc.ondatachannel  = evt => {
			this._bindChannel(evt.channel, guestId);
			this.peers.get(guestId).channel = evt.channel;
		};

		await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);
		await this._waitForICE(pc);

		await roomRef.collection('signals').doc(guestId).update({ answer: answer.sdp, hostCandidates });

		const snap = await roomRef.collection('signals').doc(guestId).get();
		for (const c of (snap.data()?.guestCandidates || []))
			await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
	}

	_createPC(peerId) {
		const pc = new RTCPeerConnection(ICE_CONFIG);
		pc.onconnectionstatechange = () => {
			const s = pc.connectionState;
			if (s === 'disconnected' || s === 'failed' || s === 'closed') this._removePeer(peerId);
		};
		return pc;
	}

	_bindChannel(channel, peerId) {
		channel.binaryType = 'arraybuffer';
		channel.onopen  = () => { if (this._onPeerConnected)    this._onPeerConnected(peerId); };
		channel.onclose = () => { this._removePeer(peerId); };
		channel.onerror = err => console.error(`[ChatEngine] channel error (${peerId}):`, err);
		channel.onmessage = evt => {
			if (this._relay) {
				this.peers.forEach(({ channel: ch }, pid) => {
					if (pid !== peerId && ch?.readyState === 'open') { try { ch.send(evt.data); } catch {} }
				});
			}
			if (this._onMessage) this._onMessage(this._deserialise(evt.data), peerId);
		};
	}

	_removePeer(peerId) {
		if (!this.peers.has(peerId)) return;
		this.peers.delete(peerId);
		if (this._onPeerDisconnected) this._onPeerDisconnected(peerId);
	}

	_waitForICE(pc) {
		return new Promise(resolve => {
			if (pc.iceGatheringState === 'complete') { resolve(); return; }
			const t = setTimeout(resolve, 3000);
			pc.onicegatheringstatechange = () => {
				if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
			};
		});
	}

	_flushCandidates(roomRef, guestId, candidates) {
		const prev = this._flushTimers.get(guestId);
		if (prev) clearTimeout(prev);
		const t = setTimeout(async () => {
			try { await roomRef.collection('signals').doc(guestId).update({ guestCandidates: [...candidates] }); } catch {}
			this._flushTimers.delete(guestId);
		}, 400);
		this._flushTimers.set(guestId, t);
	}

	_serialise(data) {
		if (data instanceof ArrayBuffer || data instanceof Blob) return data;
		if (typeof data === 'object') return JSON.stringify(data);
		return String(data);
	}

	_deserialise(raw) {
		if (raw instanceof ArrayBuffer) return raw;
		if (typeof raw === 'string') { try { return JSON.parse(raw); } catch {} }
		return raw;
	}

	_roomRef(roomId) { return this.db.collection('chatRooms').doc(String(roomId)); }
	_assertDB()      { if (!this.db) throw new Error('[ChatEngine] call init(db) first.'); }
	_uid()           { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

/* ── DirectEngine ─────────────────────────────────────────────────────────── */

export class DirectEngine {
	constructor() {
		this.pc                    = null;
		this.channel               = null;
		this._localCandidates      = [];
		this._onMessage            = null;
		this._onPeerConnected      = null;
		this._onPeerDisconnected   = null;
	}

	async createOffer() {
		this.pc = new RTCPeerConnection(ICE_CONFIG);
		this.channel = this.pc.createDataChannel('data', { ordered: true });
		this._bindChannel(this.channel);
		this._setupPC();
		const offer = await this.pc.createOffer();
		await this.pc.setLocalDescription(offer);
		await this._waitForICE();
		return JSON.stringify(this.pc.localDescription.toJSON());
	}

	async setAnswer(answerJson) {
		await this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(answerJson)));
	}

	async createAnswerFor(offerJson) {
		this.pc = new RTCPeerConnection(ICE_CONFIG);
		this._setupPC();
		this.pc.ondatachannel = evt => { this.channel = evt.channel; this._bindChannel(this.channel); };
		await this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerJson)));
		const answer = await this.pc.createAnswer();
		await this.pc.setLocalDescription(answer);
		await this._waitForICE();
		return JSON.stringify(this.pc.localDescription.toJSON());
	}

	getLocalCandidates() { return this._localCandidates.map(c => JSON.stringify(c)); }

	async addRemoteCandidate(json) {
		try { await this.pc.addIceCandidate(new RTCIceCandidate(JSON.parse(json))); } catch {}
	}

	send(data) {
		if (this.channel?.readyState !== 'open') { console.warn('[DirectEngine] channel not open'); return; }
		const payload = (typeof data === 'object' && !(data instanceof ArrayBuffer)) ? JSON.stringify(data) : data;
		this.channel.send(payload);
	}

	onMessage(cb)          { this._onMessage = cb; }
	onPeerConnected(cb)    { this._onPeerConnected = cb; }
	onPeerDisconnected(cb) { this._onPeerDisconnected = cb; }

	disconnect() {
		try { this.channel?.close(); } catch {}
		try { this.pc?.close();      } catch {}
		this.pc = null; this.channel = null;
	}

	_setupPC() {
		this.pc.onicecandidate = evt => { if (evt.candidate) this._localCandidates.push(evt.candidate.toJSON()); };
		this.pc.onconnectionstatechange = () => {
			const s = this.pc?.connectionState;
			if (s === 'disconnected' || s === 'failed' || s === 'closed')
				if (this._onPeerDisconnected) this._onPeerDisconnected('remote');
		};
	}

	_bindChannel(ch) {
		ch.binaryType = 'arraybuffer';
		ch.onopen    = () => { if (this._onPeerConnected)    this._onPeerConnected('remote'); };
		ch.onclose   = () => { if (this._onPeerDisconnected) this._onPeerDisconnected('remote'); };
		ch.onmessage = evt => {
			if (!this._onMessage) return;
			let data = evt.data;
			if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
			this._onMessage(data, 'remote');
		};
	}

	_waitForICE() {
		return new Promise(resolve => {
			if (this.pc.iceGatheringState === 'complete') { resolve(); return; }
			const t = setTimeout(resolve, 4000);
			this.pc.onicegatheringstatechange = () => {
				if (this.pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
			};
		});
	}
}
