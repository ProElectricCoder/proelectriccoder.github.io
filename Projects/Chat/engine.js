/**
 * engine.js — WebRTC + Firebase Signaling Chat Engine  v1.0
 * ──────────────────────────────────────────────────────────
 * Reusable real-time communication engine.
 *
 * ⚠ Prerequisites (host page must provide before calling init()):
 *    • firebase.initializeApp(config) already called
 *    • firebase.firestore() available
 *
 * Features:
 *    • Peer-to-peer data channels (text, JSON, binary)
 *    • Firebase Firestore used only for room signaling
 *    • Basic multi-peer mesh via per-connection signal documents
 *    • Graceful cleanup and reconnect helpers
 *
 * API:
 *    engine.init(db)              — inject Firestore instance
 *    engine.createRoom(roomId)    — become host for a room
 *    engine.joinRoom(roomId)      — join an existing room
 *    engine.send(data)            — broadcast to all connected peers
 *    engine.onMessage(cb)         — receive messages from peers
 *    engine.onPeerConnected(cb)   — peer joined
 *    engine.onPeerDisconnected(cb)— peer left
 *    engine.disconnect()          — clean up all connections
 */

/* ── ICE / STUN configuration ──────────────────────────────────────────── */
const ICE_CONFIG = {
	iceServers: [
		{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
		{ urls: 'stun:stun.services.mozilla.com' }
	],
	iceCandidatePoolSize: 10
};

/* ── ChatEngine ─────────────────────────────────────────────────────────── */
export class ChatEngine {
	constructor() {
		/** @type {firebase.firestore.Firestore|null} */
		this.db = null;

		/** @type {string|null} */
		this.roomId = null;

		/**
		 * Map of peerId → { pc: RTCPeerConnection, channel: RTCDataChannel|null }
		 * For mesh: each pair of peers has its own entry.
		 * @type {Map<string, {pc: RTCPeerConnection, channel: RTCDataChannel|null}>}
		 */
		this.peers = new Map();

		/** Active Firestore unsubscribe functions */
		this._unsubs = [];

		/* Callbacks */
		this._onMessage = null;
		this._onPeerConnected = null;
		this._onPeerDisconnected = null;
	}

	// ─── Initialisation ──────────────────────────────────────────────────────

	/**
	 * Inject the Firestore instance obtained from the host page.
	 * Must be called before createRoom() or joinRoom().
	 *
	 * @param {firebase.firestore.Firestore} firestoreInstance
	 */
	init(firestoreInstance) {
		if (!firestoreInstance) throw new Error('[ChatEngine] Firestore instance is required.');
		this.db = firestoreInstance;
	}

	// ─── Room management ─────────────────────────────────────────────────────

	/**
	 * Create a room and wait for the first peer to join.
	 * Caller becomes the "host" side (creates offer).
	 *
	 * @param {string} roomId
	 * @returns {Promise<string>} the room ID
	 */
	async createRoom(roomId) {
		this._assertDB();
		this.roomId = roomId;

		const roomRef = this._roomRef(roomId);

		// Initialise room document (overwrites any stale data)
		await roomRef.set({
			createdAt: firebase.firestore.FieldValue.serverTimestamp(),
			host: true
		});

		// Listen for incoming join signals: when a guest sets their offer on the
		// signals/{guestId} document, host responds with an answer.
		const signalsRef = roomRef.collection('signals');
		const unsub = signalsRef.onSnapshot(async (snap) => {
			for (const change of snap.docChanges()) {
				if (change.type !== 'added') continue;
				const signal = change.doc.data();
				const guestId = change.doc.id;

				// Only handle offers addressed to host (type === 'offer')
				if (signal.type === 'offer' && !this.peers.has(guestId)) {
					await this._handleOffer(guestId, signal, roomRef);
				}
			}
		});
		this._unsubs.push(unsub);

		return roomId;
	}

	/**
	 * Join an existing room.
	 * Guest creates an offer, sends it to the room, then waits for the host answer.
	 *
	 * @param {string} roomId
	 * @returns {Promise<void>}
	 */
	async joinRoom(roomId) {
		this._assertDB();
		this.roomId = roomId;

		const roomRef = this._roomRef(roomId);
		const guestId = this._uid();

		const pc = this._createPC(guestId);
		const channel = pc.createDataChannel('data', { ordered: true });
		this._bindChannel(channel, guestId);
		this.peers.set(guestId, { pc, channel });

		// Accumulate ICE candidates before remote desc is set
		const pendingCandidates = [];
		pc.onicecandidate = (evt) => {
			if (evt.candidate) {
				pendingCandidates.push(evt.candidate.toJSON());
				// Flush to Firestore lazily
				this._flushCandidates(roomRef, guestId, 'guest', pendingCandidates);
			}
		};

		// Create offer
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);

		// Write offer to room signals collection
		const guestSignalRef = roomRef.collection('signals').doc(guestId);
		await guestSignalRef.set({
			type: 'offer',
			sdp: offer.sdp,
			createdAt: firebase.firestore.FieldValue.serverTimestamp()
		});

		// Wait for host answer
		const answerUnsub = guestSignalRef.onSnapshot(async (snap) => {
			const data = snap.data();
			if (data?.answer && !pc.currentRemoteDescription) {
				await pc.setRemoteDescription(new RTCSessionDescription({
					type: 'answer',
					sdp: data.answer
				}));
				// Apply host ICE candidates
				if (data.hostCandidates) {
					for (const c of data.hostCandidates) {
						await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
					}
				}
			}
		});
		this._unsubs.push(answerUnsub);
	}

	// ─── Messaging ───────────────────────────────────────────────────────────

	/**
	 * Send data to all connected peers.
	 * Accepts: string, number, object (serialised to JSON), ArrayBuffer, Blob.
	 *
	 * @param {string|number|object|ArrayBuffer|Blob} data
	 */
	send(data) {
		const payload = this._serialise(data);

		let sent = 0;
		this.peers.forEach(({ channel }) => {
			if (channel && channel.readyState === 'open') {
				try {
					channel.send(payload);
					sent++;
				} catch (err) {
					console.warn('[ChatEngine] send() failed for a peer:', err);
				}
			}
		});

		if (sent === 0) {
			console.warn('[ChatEngine] send() — no open channels. Is a peer connected?');
		}
	}

	// ─── Callback registration ───────────────────────────────────────────────

	/**
	 * @param {(data: any, peerId: string) => void} callback
	 */
	onMessage(callback) { this._onMessage = callback; }

	/**
	 * @param {(peerId: string) => void} callback
	 */
	onPeerConnected(callback) { this._onPeerConnected = callback; }

	/**
	 * @param {(peerId: string) => void} callback
	 */
	onPeerDisconnected(callback) { this._onPeerDisconnected = callback; }

	// ─── Cleanup ─────────────────────────────────────────────────────────────

	/** Tear down all connections and Firestore listeners. */
	disconnect() {
		this._unsubs.forEach(u => { try { u(); } catch {} });
		this._unsubs = [];

		this.peers.forEach(({ pc, channel }) => {
			try { if (channel) channel.close(); } catch {}
			try { if (pc)      pc.close();      } catch {}
		});
		this.peers.clear();

		this.roomId = null;
	}

	// ─── Private — peer creation ─────────────────────────────────────────────

	/** Handle an incoming offer from a guest (host side). */
	async _handleOffer(guestId, signal, roomRef) {
		const pc = this._createPC(guestId);
		this.peers.set(guestId, { pc, channel: null });

		// Host's ICE candidates
		const hostCandidates = [];
		pc.onicecandidate = (evt) => {
			if (evt.candidate) hostCandidates.push(evt.candidate.toJSON());
		};

		// Incoming data channel
		pc.ondatachannel = (evt) => {
			const channel = evt.channel;
			this._bindChannel(channel, guestId);
			this.peers.get(guestId).channel = channel;
		};

		await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);

		// Wait for ICE gathering to complete (or timeout)
		await this._waitForICE(pc);

		// Write answer + host candidates back to the guest signal doc
		await roomRef.collection('signals').doc(guestId).update({
			answer: answer.sdp,
			hostCandidates
		});

		// Apply any guest candidates stored in the signal
		const guestSnap = await roomRef.collection('signals').doc(guestId).get();
		const guestCandidates = guestSnap.data()?.guestCandidates || [];
		for (const c of guestCandidates) {
			await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
		}
	}

	_createPC(peerId) {
		const pc = new RTCPeerConnection(ICE_CONFIG);

		pc.onconnectionstatechange = () => {
			const state = pc.connectionState;
			if (state === 'disconnected' || state === 'failed' || state === 'closed') {
				this._removePeer(peerId);
			}
		};

		return pc;
	}

	_bindChannel(channel, peerId) {
		channel.binaryType = 'arraybuffer';

		channel.onopen = () => {
			if (this._onPeerConnected) this._onPeerConnected(peerId);
		};

		channel.onclose = () => {
			this._removePeer(peerId);
		};

		channel.onerror = (err) => {
			console.error(`[ChatEngine] Channel error (peer: ${peerId}):`, err);
		};

		channel.onmessage = (evt) => {
			if (!this._onMessage) return;
			const data = this._deserialise(evt.data);
			this._onMessage(data, peerId);
		};
	}

	_removePeer(peerId) {
		if (!this.peers.has(peerId)) return;
		this.peers.delete(peerId);
		if (this._onPeerDisconnected) this._onPeerDisconnected(peerId);
	}

	// ─── Private — ICE helpers ───────────────────────────────────────────────

	/** Wait for ICE gathering to finish (or up to 3 seconds). */
	_waitForICE(pc) {
		return new Promise((resolve) => {
			if (pc.iceGatheringState === 'complete') { resolve(); return; }
			const timeout = setTimeout(resolve, 3000);
			pc.onicegatheringstatechange = () => {
				if (pc.iceGatheringState === 'complete') {
					clearTimeout(timeout);
					resolve();
				}
			};
		});
	}

	/** Debounced flush of ICE candidates to Firestore. */
	_flushCandidates(roomRef, guestId, role, candidates) {
		if (this._flushTimer) clearTimeout(this._flushTimer);
		this._flushTimer = setTimeout(async () => {
			try {
				await roomRef.collection('signals').doc(guestId).update({
					guestCandidates: [...candidates]
				});
			} catch {}
		}, 400);
	}

	// ─── Private — serialisation ─────────────────────────────────────────────

	_serialise(data) {
		if (data instanceof ArrayBuffer || data instanceof Blob) return data;
		if (typeof data === 'object') return JSON.stringify(data);
		return String(data);
	}

	_deserialise(raw) {
		if (raw instanceof ArrayBuffer) return raw;
		if (typeof raw === 'string') {
			try { return JSON.parse(raw); } catch {}
		}
		return raw;
	}

	// ─── Private — Firestore helpers ─────────────────────────────────────────

	_roomRef(roomId) {
		return this.db.collection('chatRooms').doc(String(roomId));
	}

	_assertDB() {
		if (!this.db) throw new Error('[ChatEngine] Call init(db) with a Firestore instance first.');
	}

	_uid() {
		return Math.random().toString(36).slice(2) + Date.now().toString(36);
	}
}

/* ── DirectEngine — no Firebase, manual SDP exchange ───────────────────── */

/**
 * DirectEngine provides peer-to-peer connectivity WITHOUT Firebase.
 * Signaling is done manually: generate an offer, share it out-of-band,
 * receive the remote answer.
 *
 * API (mirrors ChatEngine where possible):
 *    engine.createOffer()          → Promise<string>  (SDP offer string)
 *    engine.setAnswer(sdpString)   → Promise<void>
 *    engine.getLocalCandidates()   → string[] (JSON ICE candidates)
 *    engine.addRemoteCandidate(c)  → void
 *    engine.createAnswerFor(offer) → Promise<string>  (SDP answer string)
 *    engine.send(data)             → void
 *    engine.onMessage(cb)
 *    engine.onPeerConnected(cb)
 *    engine.onPeerDisconnected(cb)
 *    engine.disconnect()
 */
export class DirectEngine {
	constructor() {
		this.pc = null;
		this.channel = null;
		this._localCandidates = [];
		this._onMessage = null;
		this._onPeerConnected = null;
		this._onPeerDisconnected = null;
	}

	/** Caller side: create offer, returns SDP string to share with remote peer. */
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

	/** Caller side: apply the answer SDP received from the remote peer. */
	async setAnswer(answerJson) {
		const desc = JSON.parse(answerJson);
		await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
	}

	/** Callee side: receive remote offer and return answer SDP string. */
	async createAnswerFor(offerJson) {
		this.pc = new RTCPeerConnection(ICE_CONFIG);
		this._setupPC();

		this.pc.ondatachannel = (evt) => {
			this.channel = evt.channel;
			this._bindChannel(this.channel);
		};

		const offer = JSON.parse(offerJson);
		await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
		const answer = await this.pc.createAnswer();
		await this.pc.setLocalDescription(answer);
		await this._waitForICE();
		return JSON.stringify(this.pc.localDescription.toJSON());
	}

	/** Returns accumulated local ICE candidates (as JSON strings). */
	getLocalCandidates() {
		return this._localCandidates.map(c => JSON.stringify(c));
	}

	/** Add a remote ICE candidate (pass the JSON string). */
	async addRemoteCandidate(candidateJson) {
		try {
			await this.pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidateJson)));
		} catch (err) {
			console.warn('[DirectEngine] addRemoteCandidate failed:', err);
		}
	}

	send(data) {
		if (!this.channel || this.channel.readyState !== 'open') {
			console.warn('[DirectEngine] send() — channel not open yet.');
			return;
		}
		const payload = (typeof data === 'object' && !(data instanceof ArrayBuffer))
			? JSON.stringify(data) : data;
		this.channel.send(payload);
	}

	onMessage(cb) { this._onMessage = cb; }
	onPeerConnected(cb) { this._onPeerConnected = cb; }
	onPeerDisconnected(cb) { this._onPeerDisconnected = cb; }

	disconnect() {
		try { if (this.channel) this.channel.close(); } catch {}
		try { if (this.pc)      this.pc.close();      } catch {}
		this.pc = null;
		this.channel = null;
	}

	// ─── Private ─────────────────────────────────────────────────────────────

	_setupPC() {
		this.pc.onicecandidate = (evt) => {
			if (evt.candidate) this._localCandidates.push(evt.candidate.toJSON());
		};
		this.pc.onconnectionstatechange = () => {
			const s = this.pc?.connectionState;
			if (s === 'disconnected' || s === 'failed' || s === 'closed') {
				if (this._onPeerDisconnected) this._onPeerDisconnected('remote');
			}
		};
	}

	_bindChannel(ch) {
		ch.binaryType = 'arraybuffer';
		ch.onopen  = () => { if (this._onPeerConnected) this._onPeerConnected('remote'); };
		ch.onclose = () => { if (this._onPeerDisconnected) this._onPeerDisconnected('remote'); };
		ch.onmessage = (evt) => {
			if (!this._onMessage) return;
			let data = evt.data;
			if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
			this._onMessage(data, 'remote');
		};
	}

	_waitForICE() {
		return new Promise((resolve) => {
			if (this.pc.iceGatheringState === 'complete') { resolve(); return; }
			const timeout = setTimeout(resolve, 4000);
			this.pc.onicegatheringstatechange = () => {
				if (this.pc.iceGatheringState === 'complete') {
					clearTimeout(timeout);
					resolve();
				}
			};
		});
	}
}