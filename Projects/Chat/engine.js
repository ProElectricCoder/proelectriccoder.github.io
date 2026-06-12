/**
 * engine.js — WebRTC + Firebase Signaling Chat Engine v1.2.0
 * Pure P2P (No TURN Servers) - Added Media Track Support
 */
const ICE_CONFIG = {
	iceServers:[
		{urls:['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']},
		{urls:'stun:stun.services.mozilla.com'},
	],
	iceCandidatePoolSize:10,
};

export class ChatEngine {
	constructor({relay=false}={}) {
		this.db=null; this.roomId=null; this.peers=new Map();
		this._relay=relay; this._unsubs=[]; this._flushTimers=new Map();
		this._onMessage=null; this._onPeerConnected=null; this._onPeerDisconnected=null;
		this._onTrack=null; // <--- NEW: Listener for media streams
	}
	init(db){if(!db)throw new Error('[ChatEngine] Firestore required');this.db=db;}
	
	async createRoom(roomId){
		this._assertDB(); this.roomId=roomId;
		const ref=this._roomRef(roomId);
		await ref.set({createdAt:firebase.firestore.FieldValue.serverTimestamp(),host:true});
		const unsub=ref.collection('signals').onSnapshot(async snap=>{
			for(const ch of snap.docChanges()){
				if(ch.type!=='added')continue;
				const sig=ch.doc.data(),gid=ch.doc.id;
				if(sig.type==='offer'&&!this.peers.has(gid))await this._handleOffer(gid,sig,ref);
			}
		}, error => {
			console.error("[ChatEngine] Firestore stream broken:", error);
		});
		this._unsubs.push(unsub); return roomId;
	}
	
	async joinRoom(roomId){
		this._assertDB(); this.roomId=roomId;
		const ref=this._roomRef(roomId),gid=this._uid();
		const pc=this._createPC(gid),ch=pc.createDataChannel('data',{ordered:true});
		this._bindChannel(ch,gid); this.peers.set(gid,{pc,channel:ch});
		const pending=[];
		pc.onicecandidate=evt=>{if(evt.candidate){pending.push(evt.candidate.toJSON());this._flush(ref,gid,pending);}};
		const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
		const gref=ref.collection('signals').doc(gid);
		await gref.set({type:'offer',sdp:offer.sdp,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
		const unsub=gref.onSnapshot(async snap=>{
			const d=snap.data();
			if(d?.answer&&!pc.currentRemoteDescription){
				await pc.setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:d.answer}));
				for(const c of(d.hostCandidates||[]))await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});
			}
		}, error => {
			console.error("[ChatEngine] Firestore stream broken:", error);
		});
		this._unsubs.push(unsub);
	}

	send(data){
		const payload=this._ser(data); let sent=0;
		this.peers.forEach(({channel})=>{if(channel?.readyState==='open'){try{channel.send(payload);sent++;}catch{}}});
		if(!sent)console.warn('[ChatEngine] no open channels');
	}

	// --- NEW MEDIA METHODS ---
	onTrack(cb) { this._onTrack = cb; }
	
	addLocalStream(peerId, stream) {
		const peer = this.peers.get(peerId);
		if (!peer || !peer.pc) return;
		stream.getTracks().forEach(track => {
			peer.pc.addTrack(track, stream);
		});
	}
	// -------------------------

	onMessage(cb){this._onMessage=cb;}
	onPeerConnected(cb){this._onPeerConnected=cb;}
	onPeerDisconnected(cb){this._onPeerDisconnected=cb;}
	
	disconnect(){
		this._unsubs.forEach(u=>{try{u();}catch{}});this._unsubs=[];
		this._flushTimers.forEach(t=>clearTimeout(t));this._flushTimers.clear();
		this.peers.forEach(({pc,channel})=>{try{channel?.close();}catch{}try{pc?.close();}catch{}});
		this.peers.clear(); this.roomId=null;
	}
	
	async _handleOffer(gid,sig,ref){
		const pc=this._createPC(gid); this.peers.set(gid,{pc,channel:null});
		const hostCandidates=[];
		pc.onicecandidate=evt=>{if(evt.candidate)hostCandidates.push(evt.candidate.toJSON());};
		pc.ondatachannel=evt=>{this._bindChannel(evt.channel,gid);this.peers.get(gid).channel=evt.channel;};
		await pc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:sig.sdp}));
		const ans=await pc.createAnswer(); await pc.setLocalDescription(ans);
		await this._waitICE(pc);
		await ref.collection('signals').doc(gid).update({answer:ans.sdp,hostCandidates});
		const snap=await ref.collection('signals').doc(gid).get();
		for(const c of(snap.data()?.guestCandidates||[]))await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});
	}
	
	_createPC(peerId){
		const pc=new RTCPeerConnection(ICE_CONFIG);
		pc.onconnectionstatechange=()=>{
			const s=pc.connectionState;
			if(s==='disconnected'||s==='failed'||s==='closed')this._removePeer(peerId);
		};
		
		// <--- NEW: Listen for remote video/audio tracks
		pc.ontrack = (evt) => {
			if (this._onTrack) this._onTrack(evt.streams[0], peerId);
		};

		return pc;
	}
	
	_bindChannel(ch,peerId){
		ch.binaryType='arraybuffer';
		ch.onopen=()=>{if(this._onPeerConnected)this._onPeerConnected(peerId);};
		ch.onclose=()=>{this._removePeer(peerId);};
		ch.onerror=e=>console.error(`[ChatEngine] ch err (${peerId}):`,e);
		ch.onmessage=evt=>{
			if(this._relay){
				this.peers.forEach(({channel:c},pid)=>{if(pid!==peerId&&c?.readyState==='open'){try{c.send(evt.data);}catch{}}});
			}
			if(this._onMessage)this._onMessage(this._deser(evt.data),peerId);
		};
	}
	
	_removePeer(peerId){if(!this.peers.has(peerId))return;this.peers.delete(peerId);if(this._onPeerDisconnected)this._onPeerDisconnected(peerId);}
	
	_waitICE(pc){
		return new Promise(res=>{
			if(pc.iceGatheringState==='complete'){res();return;}
			const t=setTimeout(res,3000);
			pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);res();}};
		});
	}
	
	_flush(ref,gid,candidates){
		const prev=this._flushTimers.get(gid);if(prev)clearTimeout(prev);
		const t=setTimeout(async()=>{
			try{await ref.collection('signals').doc(gid).update({guestCandidates:[...candidates]});}catch{}
			this._flushTimers.delete(gid);
		},400);
		this._flushTimers.set(gid,t);
	}
	
	_ser(d){if(d instanceof ArrayBuffer||d instanceof Blob)return d;if(typeof d==='object')return JSON.stringify(d);return String(d);}
	_deser(r){if(r instanceof ArrayBuffer)return r;if(typeof r==='string'){try{return JSON.parse(r);}catch{}}return r;}
	_roomRef(id){return this.db.collection('chatRooms').doc(String(id));}
	_assertDB(){if(!this.db)throw new Error('[ChatEngine] call init(db) first');}
	_uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}
}

export class DirectEngine {
	constructor(){
		this.pc=null;this.channel=null;this._localCandidates=[];
		this._onMessage=null;this._onPeerConnected=null;this._onPeerDisconnected=null;
		this._onTrack=null; // <--- NEW
	}
	async createOffer(){
		this.pc=new RTCPeerConnection(ICE_CONFIG);
		this.channel=this.pc.createDataChannel('data',{ordered:true});
		this._bindChannel(this.channel);this._setupPC();
		const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);
		await this._waitICE();return JSON.stringify(this.pc.localDescription.toJSON());
	}
	async setAnswer(json){await this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(json)));}
	async createAnswerFor(json){
		this.pc=new RTCPeerConnection(ICE_CONFIG);this._setupPC();
		this.pc.ondatachannel=evt=>{this.channel=evt.channel;this._bindChannel(this.channel);};
		await this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(json)));
		const ans=await this.pc.createAnswer();await this.pc.setLocalDescription(ans);
		await this._waitICE();return JSON.stringify(this.pc.localDescription.toJSON());
	}
	send(d){
		if(this.channel?.readyState!=='open'){console.warn('[DirectEngine] not open');return;}
		this.channel.send(typeof d==='object'&&!(d instanceof ArrayBuffer)?JSON.stringify(d):d);
	}

	// --- NEW MEDIA METHODS ---
	onTrack(cb) { this._onTrack = cb; }
	addLocalStream(stream) {
		if (!this.pc) return;
		stream.getTracks().forEach(track => {
			this.pc.addTrack(track, stream);
		});
	}
	// -------------------------

	onMessage(cb){this._onMessage=cb;}
	onPeerConnected(cb){this._onPeerConnected=cb;}
	onPeerDisconnected(cb){this._onPeerDisconnected=cb;}
	disconnect(){try{this.channel?.close();}catch{}try{this.pc?.close();}catch{}this.pc=null;this.channel=null;}
	
	_setupPC(){
		this.pc.onicecandidate=evt=>{if(evt.candidate)this._localCandidates.push(evt.candidate.toJSON());};
		this.pc.onconnectionstatechange=()=>{const s=this.pc?.connectionState;if(s==='disconnected'||s==='failed'||s==='closed')if(this._onPeerDisconnected)this._onPeerDisconnected('remote');};
		
		// <--- NEW: Listen for remote video/audio tracks
		this.pc.ontrack = (evt) => {
			if (this._onTrack) this._onTrack(evt.streams[0], 'remote');
		};
	}
	
	_bindChannel(ch){
		ch.binaryType='arraybuffer';
		ch.onopen=()=>{if(this._onPeerConnected)this._onPeerConnected('remote');};
		ch.onclose=()=>{if(this._onPeerDisconnected)this._onPeerDisconnected('remote');};
		ch.onmessage=evt=>{if(!this._onMessage)return;let d=evt.data;if(typeof d==='string'){try{d=JSON.parse(d);}catch{}}this._onMessage(d,'remote');};
	}
	
	_waitICE(){
		return new Promise(res=>{
			if(this.pc.iceGatheringState==='complete'){res();return;}
			const t=setTimeout(res,4000);
			this.pc.onicegatheringstatechange=()=>{if(this.pc.iceGatheringState==='complete'){clearTimeout(t);res();}};
		});
	}
}
