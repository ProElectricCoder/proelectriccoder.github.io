/**
 * app.js — P2P Chat v3.6.0
 * Tasks: User ID Inbox · Peer-stuck fix (heartbeat) · Peer name/avatar · Room dedup
 *        WhatsApp formatting + read receipts + typing · Group calling (mesh) · URL invites
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. FIREBASE + IMPORTS
// ═══════════════════════════════════════════════════════════════════════════
const FB_CFG = {
	apiKey:'AIzaSyC_v49m7e5xt-FCWs0DSq7aGU7gD1aiTh4',
	authDomain:'proelectriccoder.firebaseapp.com',
	projectId:'proelectriccoder',
	storageBucket:'proelectriccoder.firebasestorage.app',
	messagingSenderId:'629115974151',
	appId:'1:629115974151:web:636737d123e4e8685c70a2',
};
firebase.initializeApp(FB_CFG);
import { ChatEngine, DirectEngine } from '../engine.js';

// ═══════════════════════════════════════════════════════════════════════════
// 2. CONSTANTS & THEMES
// ═══════════════════════════════════════════════════════════════════════════
const CHUNK_SIZE = 32 * 1024;
const MC = { stream: null, recorder: null, chunks: [], type: null };
// App-level peer ID for group call routing
const MY_PEER_ID = Math.random().toString(36).slice(2)+Date.now().toString(36);

const THEMES = {
	void:     {name:'Void',     primary:'#00ffff',secondary:'#3d6eff',accent:'#00ff99',gradEnd:'#002233'},
	amethyst: {name:'Amethyst', primary:'#a855f7',secondary:'#7c3aed',accent:'#e879f9',gradEnd:'#1a0033'},
	emerald:  {name:'Emerald',  primary:'#10b981',secondary:'#059669',accent:'#34d399',gradEnd:'#001a0f'},
	amber:    {name:'Amber',    primary:'#f59e0b',secondary:'#d97706',accent:'#fbbf24',gradEnd:'#1a0f00'},
	crimson:  {name:'Crimson',  primary:'#f43f5e',secondary:'#e11d48',accent:'#fb7185',gradEnd:'#1a0010'},
	sapphire: {name:'Sapphire', primary:'#3b82f6',secondary:'#1d4ed8',accent:'#60a5fa',gradEnd:'#001133'},
};

// ═══════════════════════════════════════════════════════════════════════════
// 2b. RINGTONE ENGINE
// ═══════════════════════════════════════════════════════════════════════════
const Ringtone = {
	_ctx: null, _interval: null, _active: false,
	start(type='incoming') {
		if(this._active)return;
		this._active=true;
		try{
			const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
			this._ctx=new AC();this._pulse(type);
			this._interval=setInterval(()=>this._pulse(type),type==='incoming'?4200:4000);
		}catch(e){console.warn('[Ringtone]',e);}
	},
	_pulse(type) {
		if(!this._ctx||!this._active)return;
		const ctx=this._ctx,t=ctx.currentTime;
		if(type==='incoming'){
			[0,0.55].forEach(offset=>{
				[880,960].forEach(freq=>{
					const osc=ctx.createOscillator(),gain=ctx.createGain();
					osc.type='sine';osc.frequency.value=freq;
					osc.connect(gain);gain.connect(ctx.destination);
					gain.gain.setValueAtTime(0,t+offset);
					gain.gain.linearRampToValueAtTime(0.13,t+offset+0.01);
					gain.gain.setValueAtTime(0.13,t+offset+0.36);
					gain.gain.linearRampToValueAtTime(0,t+offset+0.43);
					osc.start(t+offset);osc.stop(t+offset+0.45);
				});
			});
		}else{
			const osc=ctx.createOscillator(),gain=ctx.createGain();
			osc.type='sine';osc.frequency.value=440;
			osc.connect(gain);gain.connect(ctx.destination);
			gain.gain.setValueAtTime(0,t);
			gain.gain.linearRampToValueAtTime(0.06,t+0.02);
			gain.gain.setValueAtTime(0.06,t+1.2);
			gain.gain.linearRampToValueAtTime(0,t+1.3);
			osc.start(t);osc.stop(t+1.35);
		}
	},
	stop() {
		this._active=false;
		if(this._interval){clearInterval(this._interval);this._interval=null;}
		if(this._ctx){this._ctx.close().catch(()=>{});this._ctx=null;}
	}
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. SVG FILE ICONS
// ═══════════════════════════════════════════════════════════════════════════
const FICONS = {
	pdf:     {color:'#ef4444',bg:'rgba(239,68,68,.12)',  svg:'<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>'},
	image:   {color:'#22c55e',bg:'rgba(34,197,94,.12)',  svg:'<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/>'},
	audio:   {color:'#a855f7',bg:'rgba(168,85,247,.12)', svg:'<path stroke-linecap="round" stroke-linejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"/>'},
	video:   {color:'#3b82f6',bg:'rgba(59,130,246,.12)', svg:'<path stroke-linecap="round" d="M15.75 10.5 20.47 5.78A.75.75 0 0 1 21.75 6.286v11.428a.75.75 0 0 1-1.28.53L15.75 13.5M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/>'},
	archive: {color:'#f97316',bg:'rgba(249,115,22,.12)', svg:'<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"/>'},
	sheet:   {color:'#22c55e',bg:'rgba(34,197,94,.12)',  svg:'<path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c0 .621.504 1.125 1.125 1.125h15c.621 0 1.125-.504 1.125-1.125"/>'},
	code:    {color:'#00ffff',bg:'rgba(0,255,255,.1)',   svg:'<path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>'},
	slides:  {color:'#f97316',bg:'rgba(249,115,22,.12)', svg:'<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5"/>'},
	generic: {color:'#64748b',bg:'rgba(100,116,139,.1)', svg:'<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>'},
};
function getFileIcon(mime=''){
	if(mime.includes('pdf'))return FICONS.pdf;
	if(mime.startsWith('image/'))return FICONS.image;
	if(mime.startsWith('audio/'))return FICONS.audio;
	if(mime.startsWith('video/'))return FICONS.video;
	if(/zip|archive|rar|7z|tar/.test(mime))return FICONS.archive;
	if(/spreadsheet|excel|csv/.test(mime))return FICONS.sheet;
	if(/presentation|powerpoint/.test(mime))return FICONS.slides;
	if(/javascript|json|html|css|typescript|xml/.test(mime))return FICONS.code;
	return FICONS.generic;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. GZIP HELPERS
// ═══════════════════════════════════════════════════════════════════════════
async function gzip(ab){
	const cs=new CompressionStream('gzip'),w=cs.writable.getWriter();
	w.write(new Uint8Array(ab));w.close();
	const chunks=[],r=cs.readable.getReader();
	for(;;){const{done,value}=await r.read();if(done)break;chunks.push(value);}
	const len=chunks.reduce((s,c)=>s+c.length,0),out=new Uint8Array(len);let off=0;
	for(const c of chunks){out.set(c,off);off+=c.length;}
	return out.buffer;
}
async function gunzip(ab){
	const ds=new DecompressionStream('gzip'),w=ds.writable.getWriter();
	w.write(new Uint8Array(ab));w.close();
	const chunks=[],r=ds.readable.getReader();
	for(;;){const{done,value}=await r.read();if(done)break;chunks.push(value);}
	const len=chunks.reduce((s,c)=>s+c.length,0),out=new Uint8Array(len);let off=0;
	for(const c of chunks){out.set(c,off);off+=c.length;}
	return out.buffer;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. INDEXEDDB
// ═══════════════════════════════════════════════════════════════════════════
const DB={
	_db:null,
	async _open(){
		if(this._db)return this._db;
		this._db=await new Promise((res,rej)=>{
			const r=indexedDB.open('PECChatDB',3);
			r.onupgradeneeded=e=>{
				const d=e.target.result;
				if(!d.objectStoreNames.contains('sessions'))d.createObjectStore('sessions',{keyPath:'id'});
				if(!d.objectStoreNames.contains('messages')){
					const ms=d.createObjectStore('messages',{keyPath:'id'});
					ms.createIndex('sessionId','sessionId');
				}
			};
			r.onsuccess=e=>res(e.target.result);r.onerror=e=>rej(e.target.error);
		});
		return this._db;
	},
	_p(r){return new Promise((res,rej)=>{r.onsuccess=e=>res(e.target.result);r.onerror=e=>rej(e.target.error);});},
	async saveSession(s){
		const db=await this._open();
		return this._p(db.transaction('sessions','readwrite').objectStore('sessions').put({
			id:s.id,name:s.name,type:s.type,isGroup:s.isGroup,theme:s.theme,
			createdAt:s.createdAt,lastActivity:s.lastActivity,lastMessage:s.lastMessage,
			roomId:s.roomId||null,groupName:s.groupName||null,
			peerName:s.peerName||null,peerAvatar:s.peerAvatar||null,bg:s.bg||null,
			myRole:s.myRole||'member',groupIcon:s.groupIcon||null,
			groupOwner:s.groupOwner||null,groupManagers:s.groupManagers||[],
			membersData:s.membersData||{}
		}));
	},
	async saveMessage(m){
		const db=await this._open();
		const toSave={...m};
		if(toSave.file){
			toSave.file={...toSave.file};delete toSave.file.blobUrl;
			if(toSave.file.dataUrl&&(toSave.file.size>512*1024||!toSave.file.mime?.startsWith('image/')))delete toSave.file.dataUrl;
		}
		return this._p(db.transaction('messages','readwrite').objectStore('messages').put(toSave));
	},
	async getSessions(){
		const db=await this._open();
		const all=await this._p(db.transaction('sessions','readonly').objectStore('sessions').getAll());
		return all.sort((a,b)=>(b.lastActivity||0)-(a.lastActivity||0));
	},
	async getMessages(sid){
		const db=await this._open();
		const idx=db.transaction('messages','readonly').objectStore('messages').index('sessionId');
		const all=await this._p(idx.getAll(sid));
		return all.sort((a,b)=>a.timestamp-b.timestamp);
	},
	async updateSession(id,partial){
		const db=await this._open();
		const st=db.transaction('sessions','readwrite').objectStore('sessions');
		const ex=await this._p(st.get(id));
		if(ex)return this._p(st.put({...ex,...partial}));
	},
	async deleteSession(id){
		const db=await this._open();
		const t=db.transaction(['sessions','messages'],'readwrite');
		t.objectStore('sessions').delete(id);
		const idx=t.objectStore('messages').index('sessionId');
		const keys=await this._p(idx.getAllKeys(id));
		keys.forEach(k=>t.objectStore('messages').delete(k));
	},
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. CRYPTO
// ═══════════════════════════════════════════════════════════════════════════
const Crypt={
	key:null,
	async derive(pw){
		const enc=new TextEncoder();
		const raw=await crypto.subtle.importKey('raw',enc.encode(pw),{name:'PBKDF2'},false,['deriveKey']);
		this.key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:enc.encode('pec-chat-v3'),iterations:100000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
	},
	clear(){this.key=null;},
	async encText(plain){
		if(!this.key)return null;
		const iv=crypto.getRandomValues(new Uint8Array(12));
		const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},this.key,new TextEncoder().encode(plain));
		const out=new Uint8Array(12+ct.byteLength);out.set(iv);out.set(new Uint8Array(ct),12);
		return btoa(String.fromCharCode(...out));
	},
	async decText(b64){
		if(!this.key)return null;
		const arr=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
		const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:arr.slice(0,12)},this.key,arr.slice(12));
		return new TextDecoder().decode(pt);
	},
	async encBuf(ab){
		if(!this.key)return ab;
		const iv=crypto.getRandomValues(new Uint8Array(12));
		const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},this.key,ab);
		const out=new Uint8Array(12+ct.byteLength);out.set(iv);out.set(new Uint8Array(ct),12);
		return out.buffer;
	},
	async decBuf(ab){
		if(!this.key)return ab;
		const arr=new Uint8Array(ab);
		return crypto.subtle.decrypt({name:'AES-GCM',iv:arr.slice(0,12)},this.key,arr.slice(12));
	},
};

// ═══════════════════════════════════════════════════════════════════════════
// 7. APP STATE
// ═══════════════════════════════════════════════════════════════════════════
const S={
	sessions:new Map(),activeId:null,user:null,
	displayName:localStorage.getItem('pec_name')||'Anonymous',
	avatarUrl:localStorage.getItem('pec_avatar')||'',
	encEnabled:false,cubicGradFn:null,gradActive:1,
	callSessId:null,callTimer:null,callStarted:null,filterQ:'',
	wakeLockEnabled:localStorage.getItem('pec_wakelock')==='true',wakeLockObj:null,
	gcSessId:null, // active group call session
	_pendingInvite:null,
};
function makeSess(opts){
	return{
		id:opts.id||'sess_'+Date.now()+'_'+uid(),
		name:opts.name||'New Chat',type:opts.type||'firebase',
		isGroup:opts.isGroup||false,theme:opts.theme||'void',
		createdAt:opts.createdAt||Date.now(),lastActivity:opts.lastActivity||Date.now(),
		lastMessage:opts.lastMessage||null,roomId:opts.roomId||null,groupName:opts.groupName||null,
		peerName:opts.peerName||null,peerAvatar:opts.peerAvatar||null,bg:opts.bg||null,
		myRole:opts.myRole||'member',groupIcon:opts.groupIcon||null,
		groupOwner:opts.groupOwner||null,groupManagers:opts.groupManagers||[],
		membersData:opts.membersData||{},
		isHost:false,engine:null,connected:false,
		peers:new Map(),messages:[],unread:0,
		inFiles:new Map(),_metaUnsub:null,
		// Typing
		typingPeers:new Set(),_typingTimers:{},
		// Group call state
		gc:{state:'idle',callId:null,type:null,localStream:null,pcs:new Map(),streams:new Map(),names:new Map()},
		call:{
			mediaPc:null,localStream:null,remoteStream:null,type:null,sourceType:null,
			state:'idle',muted:false,camOff:false,incoming:null,iceQueue:[],
			audioCtx:null,audioAnalyser:null,audioSource:null,audioDrawTimer:null,
			cardMsgId:null,callStartedAt:null
		},
	};
}
function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}

// ═══════════════════════════════════════════════════════════════════════════
// 7b. USER INBOX — Anyone can DM you via your UID as room ID
// ═══════════════════════════════════════════════════════════════════════════
const Inbox={
	engine:null,
	_gidMap:new Map(), // gid -> sessId
	start(){
		if(!S.user||this.engine)return;
		const roomId=S.user.uid;
		this.engine=new ChatEngine();
		this.engine.init(firebase.firestore());
		this.engine.onPeerConnected(gid=>this._onConnect(gid,roomId));
		this.engine.onPeerDisconnected(gid=>this._onDisconnect(gid));
		this.engine.onMessage((data,gid)=>this._onMsg(data,gid));
		this.engine.createRoom(roomId).catch(e=>console.warn('[Inbox]',e));
	},
	stop(){
		this.engine?.disconnect();this.engine=null;this._gidMap.clear();
	},
	_onConnect(gid,roomId){
		// Find existing unconnected inbox session or create new one
		let sess=S.sessions.get(this._gidMap.get(gid));
		if(!sess){
			sess=[...S.sessions.values()].find(s=>s.roomId===roomId&&!s.isGroup&&!s.connected);
			if(!sess){
				sess=makeSess({name:'New DM',type:'firebase',roomId});
				sess.isHost=true;
				S.sessions.set(sess.id,sess);
				DB.saveSession(sess);
			}
		}
		this._gidMap.set(gid,sess.id);
		sess.connected=true;
		sess.peers.set(gid,{name:'Peer',avatar:'',myPeerId:''});
		sess.engine=this._mkEngine(gid);
		if(S.activeId===sess.id){setStatus('connected','Connected');enableCallBtns(sess.connected);}
		addSysMsg(sess,'Connected ✓');
		safeSend(sess,{type:'handshake',displayName:S.displayName,avatarUrl:S.avatarUrl,myPeerId:MY_PEER_ID,isGroup:false,groupName:''});
		renderChatList();
	},
	_onDisconnect(gid){
		const sess=S.sessions.get(this._gidMap.get(gid));if(!sess)return;
		sess.peers.delete(gid);
		if(sess.peers.size===0){
			sess.connected=false;
			if(S.activeId===sess.id){setStatus('disconnected','Disconnected');enableCallBtns(false);}
		}
		addSysMsg(sess,'Peer left');renderChatList();
	},
	_onMsg(data,gid){
		const sess=S.sessions.get(this._gidMap.get(gid));
		if(sess)handleMsg(sess,data,gid);
	},
	_mkEngine(gid){
		const self=this;
		return{
			send(data){
				if(!self.engine)return;
				const peer=self.engine.peers.get(gid);
				if(peer?.channel?.readyState==='open')try{peer.channel.send(self.engine._ser(data));}catch{}
			},
			disconnect(){}
		};
	},
};

// ═══════════════════════════════════════════════════════════════════════════
// 8. FILE QUEUE
// ═══════════════════════════════════════════════════════════════════════════
const FQ={
	items:[],
	add(files){for(const f of files)this.items.push({id:uid(),file:f,url:URL.createObjectURL(f)});renderFQ();},
	remove(id){const i=this.items.find(x=>x.id===id);if(i)URL.revokeObjectURL(i.url);this.items=this.items.filter(x=>x.id!==id);renderFQ();},
	clear(){this.items.forEach(i=>URL.revokeObjectURL(i.url));this.items=[];renderFQ();},
};
function renderFQ(){
	const wrap=el('fqWrap');if(!wrap)return;
	wrap.classList.toggle('has-files',FQ.items.length>0);
	wrap.innerHTML=FQ.items.map(item=>{
		const pt=previewType(item.file.type,item.file.name),fi=getFileIcon(item.file.type);
		const thumb=pt==='image'?`<img src="${item.url}" alt="">`:`<svg class="fq-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="${fi.color}">${fi.svg}</svg>`;
		const short=item.file.name.length>9?item.file.name.slice(0,8)+'…':item.file.name;
		return`<div class="fq-item"><div class="fq-thumb" style="${pt!=='image'?'background:'+fi.bg:''}">${thumb}</div><div class="fq-lbl">${escH(short)}</div><button class="fq-rm" onclick="App.removeQueuedFile('${item.id}')" title="Remove">×</button></div>`;
	}).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. FILE PREVIEW SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
function previewType(mime,name){
	mime=mime||'';const ext=((name||'').split('.').pop()||'').toLowerCase();
	if(mime.startsWith('image/')||/^(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)$/.test(ext))return'image';
	if(mime.startsWith('video/')||/^(mp4|webm|ogg|mov|avi|mkv|m4v)$/.test(ext))return'video';
	if(mime.startsWith('audio/')||/^(mp3|wav|ogg|aac|flac|m4a|opus)$/.test(ext))return'audio';
	if(mime==='application/pdf'||ext==='pdf')return'pdf';
	if(mime==='text/html'||/^(html|htm)$/.test(ext))return'html';
	const CODE=/^(js|ts|jsx|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|json|xml|yaml|yml|sh|bash|css|scss|less|vue|svelte|sql|md|graphql|toml|ini|dockerfile)$/;
	if(CODE.test(ext))return'code';
	if(mime.startsWith('text/')||/^(txt|log|csv)$/.test(ext))return'text';
	return'generic';
}
function extToLang(ext){
	return({js:'javascript',ts:'typescript',jsx:'jsx',tsx:'tsx',py:'python',java:'java',c:'c',cpp:'cpp',cs:'csharp',go:'go',rs:'rust',rb:'ruby',php:'php',json:'json',xml:'xml',yaml:'yaml',yml:'yaml',sh:'bash',bash:'bash',css:'css',scss:'scss',less:'less',html:'markup',htm:'markup',md:'markdown',sql:'sql',graphql:'graphql',vue:'markup',svelte:'markup',toml:'toml',ini:'ini',dockerfile:'docker'})[ext]||'plain';
}
function buildFileCard(meta,url,sending=false,progress=0,batchFiles=[]){
	const pt=previewType(meta.mime,meta.name),fi=getFileIcon(meta.mime);
	const batchAttr=escH(JSON.stringify(batchFiles));
	let preview='';
	if(url&&pt!=='generic'){
		switch(pt){
			case'image':preview=`<div class="fp-preview"><img src="${url}" alt="${escH(meta.name)}" loading="lazy" onclick="App.openLightbox('${url}')"></div>`;break;
			case'video':preview=`<div class="fp-preview"><video src="${url}" controls preload="metadata"></video></div>`;break;
			case'audio':preview=`<div class="fp-preview fp-audio"><audio src="${url}" controls></audio></div>`;break;
			case'pdf':  preview=`<div class="fp-preview fp-doc"><iframe src="${url}" sandbox="allow-scripts allow-same-origin" title="${escH(meta.name)}"></iframe></div>`;break;
			case'html': preview=`<div class="fp-preview fp-doc fp-html-lazy" data-src="${url}" data-batch="${batchAttr}"><div class="fp-spinner">Loading preview…</div></div>`;break;
			case'code':case'text':{
				const ext=(meta.name.split('.').pop()||'').toLowerCase();
				preview=`<div class="fp-preview fp-code-wrap fp-text-lazy" data-src="${url}" data-ext="${ext}" data-ptype="${pt}"><div class="fp-spinner">Loading…</div></div>`;
				break;
			}
		}
	}
	const info=`<div class="fp-info"><div class="fp-icon" style="background:${fi.bg}"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="${fi.color}">${fi.svg}</svg></div><div class="fp-meta"><div class="fp-fname">${escH(meta.name)}</div><div class="fp-fsize">${sending?`<span class="fp-pct">0%</span>`:fmtSz(meta.size)}</div></div>${url&&!sending?`<a href="${url}" download="${escH(meta.name)}" class="fp-dl" title="Download"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg></a>`:''}</div>`;
	const bar=sending?`<div class="fp-bar"><div class="fp-bar-fill" style="width:${progress*100}%"></div></div>`:'';
	return`<div class="fp-card${sending?' fp-sending':''}">${preview}${info}${bar}</div>`;
}
function loadLazy(root){
	if(!root||!root.querySelectorAll)return;
	root.querySelectorAll('.fp-html-lazy[data-src]').forEach(async el=>{
		const src=el.dataset.src;let batch=[];try{batch=JSON.parse(el.dataset.batch||'[]');}catch{}
		el.removeAttribute('data-src');el.removeAttribute('data-batch');el.classList.remove('fp-html-lazy');
		try{
			let html=await fetch(src).then(r=>r.text());
			for(const f of batch){const safe=f.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');html=html.replace(new RegExp(safe,'g'),f.url);}
			const blobUrl=URL.createObjectURL(new Blob([html],{type:'text/html'}));
			el.innerHTML=`<iframe src="${blobUrl}" sandbox="allow-scripts allow-same-origin"></iframe>`;
		}catch{el.innerHTML=`<div class="fp-err">Preview unavailable</div>`;}
	});
	root.querySelectorAll('.fp-text-lazy[data-src]').forEach(async el=>{
		const src=el.dataset.src,ext=el.dataset.ext,ptype=el.dataset.ptype;
		el.removeAttribute('data-src');el.classList.remove('fp-text-lazy');
		try{
			const text=await fetch(src).then(r=>r.text());
			const lang=ptype==='code'?extToLang(ext):'plain';
			el.innerHTML=`<pre class="fp-pre"><code class="language-${lang}">${escH(text)}</code></pre>`;
			if(window.Prism)Prism.highlightElement(el.querySelector('code'));
		}catch{el.innerHTML=`<div class="fp-err">Preview unavailable</div>`;}
	});
}
function getBatchSiblings(sess,batchId,excludeId){
	if(!batchId||!sess)return[];
	return sess.messages.filter(m=>m.type==='file'&&m.file?.batchId===batchId&&m.id!==excludeId&&m.file?.blobUrl).map(m=>({name:m.file.name,url:m.file.blobUrl}));
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. THEME MANAGER
// ═══════════════════════════════════════════════════════════════════════════
function applyTheme(themeId,sess=null,animate=true){
	const th=THEMES[themeId]||THEMES.void;
	const root=document.documentElement;
	root.style.setProperty('--tp',th.primary);root.style.setProperty('--ts',th.secondary);
	root.style.setProperty('--ta',th.accent);root.style.setProperty('--tb',rgba(th.primary,.12));
	root.style.setProperty('--tbh',rgba(th.primary,.28));root.style.setProperty('--tbg',rgba(th.primary,.11));
	root.style.setProperty('--tbb',rgba(th.primary,.18));root.style.setProperty('--tg',rgba(th.primary,.25));
	const bgE=sess?.bg?.endColor||th.gradEnd,bgSt=sess?.bg?.startColor||'#000000';
	const bgP=sess?.bg?.power??2.5,bgS=sess?.bg?.steps??20,bgDir=sess?.bg?.direction||'to bottom right';
	const grad=computeGrad(bgE,bgP,bgS,bgDir,bgSt);
	const bg1=el('gradBg1'),bg2=el('gradBg2');
	if(!bg1||!bg2||!animate){if(bg1)bg1.style.background=grad;return;}
	if(S.gradActive===1){
		bg2.style.background=grad;requestAnimationFrame(()=>{bg2.style.opacity='1';});
		setTimeout(()=>{bg1.style.transition='none';bg1.style.opacity='0';setTimeout(()=>{bg1.style.transition='';}  ,50);S.gradActive=2;},460);
	}else{
		bg1.style.background=grad;requestAnimationFrame(()=>{bg1.style.opacity='1';});
		setTimeout(()=>{bg2.style.transition='none';bg2.style.opacity='0';setTimeout(()=>{bg2.style.transition='';}  ,50);S.gradActive=1;},460);
	}
}
function computeGrad(endColor,power=2.5,steps=20,direction='to bottom right',startColor='#000000'){
	if(!S.cubicGradFn)return`linear-gradient(${direction},${startColor},${endColor})`;
	return S.cubicGradFn({direction,start:startColor,end:endColor,steps,power}).css;
}
function rgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${a})`;}

// ═══════════════════════════════════════════════════════════════════════════
// 10b. CALL CARD SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
function buildCallCard(cd){
	if(!cd)return'';
	const{callType='audio',status='calling',duration=0}=cd;
	const isVid=callType==='video';
	const icons={calling:'📞',active:'📞',completed:isVid?'📹':'📞',declined:'📵',missed:'📵',cancelled:'📞'};
	const titles={audio:'Voice Call',video:'Video Call',screen:'Screen Share'};
	const dur=duration>0?`${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}`:'';
	const metas={calling:'Calling…',active:'In call…',completed:dur||'Call ended',declined:'Declined',missed:'Missed call',cancelled:'Cancelled'};
	return`<div class="call-card ${status}"><div class="call-card-icon">${icons[status]||'📞'}</div><div class="call-card-body"><div class="call-card-title">${titles[callType]||'Voice Call'}</div><div class="call-card-meta">${metas[status]||status}</div></div></div>`;
}
function createCallCard(sess,mine,callType,status,duration=0){
	const msgId='call_'+Date.now()+'_'+uid();
	const sender=mine?S.displayName:(sess.peerName||peerName(sess,'remote'));
	const callData={callType,status,duration};
	const m={id:msgId,sessionId:sess.id,type:'call',content:(callType==='video'?'📹':'📞')+' '+status,sender,mine,timestamp:Date.now(),enc:false,callData};
	sess.messages.push(m);sess.lastMessage=(callType==='video'?'📹 Video Call':'📞 Voice Call');sess.lastActivity=m.timestamp;
	DB.saveMessage(m);DB.updateSession(sess.id,{lastMessage:sess.lastMessage,lastActivity:sess.lastActivity});
	if(S.activeId===sess.id){const c=el('messages');if(c){renderCallCardFromMsg(c,m);c.scrollTop=c.scrollHeight;}}
	renderChatList();return msgId;
}
function updateCallCard(sess,msgId,status,duration=0){
	const m=sess.messages.find(x=>x.id===msgId);
	if(m&&m.callData){m.callData.status=status;m.callData.duration=duration;DB.saveMessage(m);}
	const wrapper=document.querySelector(`[data-msg-id="${msgId}"]`);
	if(wrapper){const bubble=wrapper.querySelector('.msg-bubble');if(bubble)bubble.innerHTML=buildCallCard(m?.callData||{callType:'audio',status,duration});}
}
function renderCallCardFromMsg(container,m){
	const side=m.mine?'mine':'theirs';
	const d=document.createElement('div');d.className=`msg ${side}`;d.dataset.msgId=m.id;
	d.innerHTML=`<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}</div><div class="msg-bubble" style="padding:0;background:none!important;border:none!important">${buildCallCard(m.callData)}</div>`;
	container.appendChild(d);
}

// ═══════════════════════════════════════════════════════════════════════════
// 10c. BACKGROUND DIRECTION GRID
// ═══════════════════════════════════════════════════════════════════════════
const DIR_GRID=[['to top left','↖'],['to top','↑'],['to top right','↗'],['to left','←'],null,['to right','→'],['to bottom left','↙'],['to bottom','↓'],['to bottom right','↘']];
function makeDirGrid(cur){
	return DIR_GRID.map(d=>d===null?'<div style="width:36px;height:36px"></div>':`<button class="bg-dir-btn${d[0]===cur?' active':''}" onclick="App.setBgDir('${d[0]}')" title="${d[0]}">${d[1]}</button>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// 10d. TEXT FORMATTING (WhatsApp-style)
// ═══════════════════════════════════════════════════════════════════════════
function formatText(raw){
	let s=escH(raw);
	s=s.replace(/```([\s\S]*?)```/g,'<code class="fmt-block">$1</code>');
	s=s.replace(/`([^`\n]+)`/g,'<code class="fmt-code">$1</code>');
	s=s.replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>');
	s=s.replace(/_([^_\n]+)_/g,'<em>$1</em>');
	s=s.replace(/~([^~\n]+)~/g,'<s>$1</s>');
	s=s.replace(/\n/g,'<br>');
	return s;
}
function ticksHtml(ticks){
	if(!ticks)return'';
	const double=ticks>=2,read=ticks>=3;
	const color=read?'var(--tp)':'rgba(232,237,248,.35)';
	return`<span class="msg-ticks" style="color:${color}">${double?'✓✓':'✓'}</span>`;
}
function updateTicksDOM(msgId,ticks){
	const d=document.querySelector(`[data-msg-id="${msgId}"] .msg-ticks`);
	if(!d)return;
	const read=ticks>=3,double=ticks>=2;
	d.style.color=read?'var(--tp)':'rgba(232,237,248,.35)';
	d.textContent=double?'✓✓':'✓';
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
function getActiveSess(){return S.sessions.get(S.activeId)||null;}

async function selectSess(id,closeSidebar=true){
	const sess=S.sessions.get(id);if(!sess)return;
	if(S.activeId===id){if(closeSidebar&&isMobile())closeSidebarUI();return;}
	const prev=getActiveSess();if(prev){prev.unread=0;renderChatList();}
	S.activeId=id;sess.unread=0;
	applyTheme(sess.theme,sess);renderTopbar(sess);
	await renderMessages(sess);
	el('welcomePanel').style.display='none';
	const cv=el('chatView');cv.classList.remove('hidden');cv.style.display='flex';
	// Send read receipts for pending messages
	if(sess.connected){
		const unreadIds=sess.messages.filter(m=>!m.mine&&m.type==='text'&&m.ticks===0).map(m=>m.id);
		if(unreadIds.length)safeSend(sess,{type:'msg-read',msgIds:unreadIds});
	}
	renderChatList();
	if(closeSidebar&&isMobile())closeSidebarUI();
}

async function deleteSess(id){
	const sess=S.sessions.get(id);if(!sess)return;
	sess._metaUnsub?.();sess.engine?.disconnect();
	S.sessions.delete(id);await DB.deleteSession(id);
	if(S.activeId===id){S.activeId=null;el('chatView').classList.add('hidden');el('welcomePanel').style.display='';applyTheme('void',null,false);}
	renderChatList();
}

function setThemeForSess(sessId,themeId){
	const sess=S.sessions.get(sessId);if(!sess)return;
	sess.theme=themeId;DB.saveSession(sess);DB.updateSession(sessId,{theme:themeId});
	if(S.activeId===sessId)applyTheme(themeId,sess);renderChatList();
}

// Helper: find or create firebase session for a given roomId (dedup, Task 4)
function findSessByRoomId(rid,isGroup=false){
	return[...S.sessions.values()].find(s=>s.roomId===rid&&s.isGroup===isGroup)||null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. ENGINE BINDING
// ═══════════════════════════════════════════════════════════════════════════
function bindEngine(sess,engine){
	sess.engine=engine;
	engine.onPeerConnected(peerId=>{
		sess.connected=true;sess.peers.set(peerId,{name:'Peer',avatar:'',myPeerId:''});
		if(S.activeId===sess.id){setStatus('connected','Connected');enableCallBtns(true);}
		addSysMsg(sess,'Connected ✓');
		safeSend(sess,{type:'handshake',displayName:S.displayName,avatarUrl:S.avatarUrl,myPeerId:MY_PEER_ID,isGroup:sess.isGroup,groupName:sess.groupName||''});
		if(sess.isGroup&&sess.isHost){
			const members=[...sess.peers.entries()].map(([pid,p])=>({pid,name:p.name}));
			safeSend(sess,{type:'group-members',members});
		}
		renderChatList();
	});
	engine.onPeerDisconnected(peerId=>{
		const pname=sess.peers.get(peerId)?.name||'Peer';
		sess.peers.delete(peerId);
		if(sess.peers.size===0){
			sess.connected=false;
			if(S.activeId===sess.id){setStatus('disconnected','Disconnected');enableCallBtns(false);}
			if(S.callSessId===sess.id)endCallInternal(sess,false);
		}
		addSysMsg(sess,`${pname} left`);renderChatList();
	});
	engine.onMessage((data,peerId)=>handleMsg(sess,data,peerId));
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. MESSAGE PROTOCOL
// ═══════════════════════════════════════════════════════════════════════════
async function handleMsg(sess,data,peerId){
	if(typeof data==='string'){try{data=JSON.parse(data);}catch{}}
	if(!(data&&typeof data==='object'&&data.type))return;
	switch(data.type){
		case'handshake':
			sess.peers.set(peerId,{name:data.displayName||'Peer',avatar:data.avatarUrl||'',myPeerId:data.myPeerId||peerId});
			sess.peerName=data.displayName||'Peer';
			sess.peerAvatar=data.avatarUrl||'';
			// Task 3: rename non-group rooms to peer's display name if still using roomId as name
			if(!sess.isGroup&&sess.name===sess.roomId&&data.displayName){
				sess.name=data.displayName;
			}
			DB.saveSession(sess);
			addSysMsg(sess,`${data.displayName||'Peer'} joined`);
			if(S.activeId===sess.id)renderTopbar(sess);renderChatList();break;
		case'group-members':
			for(const m of(data.members||[]))if(!sess.peers.has(m.pid))sess.peers.set(m.pid,{name:m.name,avatar:'',myPeerId:''});
			if(S.activeId===sess.id)renderTopbar(sess);break;
		case'chat':{
			let txt=data.text,enc=!!data.encrypted;
			if(enc){
				if(!Crypt.key){addBubble(sess,'[🔒 Encrypted — set same password in Settings]',data.displayName||'Peer',false,false);return;}
				try{txt=await Crypt.decText(txt);}catch{addBubble(sess,'[⚠ Decryption failed]',data.displayName||'Peer',false,false);return;}
			}
			const msgId=addBubble(sess,txt,data.displayName||peerName(sess,peerId),false,enc);
			// Send delivered receipt
			if(msgId&&sess.connected)safeSend(sess,{type:'msg-delivered',msgId});
			break;
		}
		case'msg-delivered':{
			const dm=sess.messages.find(m=>m.id===data.msgId&&m.mine&&m.ticks===1);
			if(dm){dm.ticks=2;DB.saveMessage(dm);updateTicksDOM(dm.id,2);}
			break;
		}
		case'msg-read':{
			for(const msgId of(data.msgIds||[])){
				const rm=sess.messages.find(m=>m.id===msgId&&m.mine);
				if(rm&&(rm.ticks||0)<3){rm.ticks=3;DB.saveMessage(rm);updateTicksDOM(rm.id,3);}
			}
			break;
		}
		case'typing':{
			if(!sess.typingPeers)sess.typingPeers=new Set();
			sess.typingPeers.add(data.displayName||peerName(sess,peerId));
			if(S.activeId===sess.id)updateTypingIndicator(sess);
			clearTimeout(sess._typingTimers?.[data.displayName]);
			if(!sess._typingTimers)sess._typingTimers={};
			sess._typingTimers[data.displayName]=setTimeout(()=>{
				sess.typingPeers?.delete(data.displayName);
				if(S.activeId===sess.id)updateTypingIndicator(sess);
			},3000);
			break;
		}
		case'typing-stop':{
			sess.typingPeers?.delete(data.displayName);
			if(S.activeId===sess.id)updateTypingIndicator(sess);
			break;
		}
		case'file-meta':sess.inFiles.set(data.id,{meta:data,chunks:[]});break;
		case'file-chunk':{const f=sess.inFiles.get(data.id);if(f)f.chunks.push(data.data);break;}
		case'file-done':await receiveFile(sess,data.id,peerId);break;
		case'call-offer':
			if(sess.call.state!=='idle'){safeSend(sess,{type:'call-reject',reason:'busy'});return;}
			if(S.callSessId!==null&&S.callSessId!==sess.id){safeSend(sess,{type:'call-reject',reason:'busy'});return;}
			sess.call.incoming=data;sess.call.state='ringing';S.callSessId=sess.id;
			showIncomingDialog(sess,data,false);break;
		case'call-answer':
			if(sess.call.mediaPc&&sess.call.state==='calling'){
				await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:data.sdp})).catch(e=>console.error('[WebRTC] Answer SDP error:',e));
				if(sess.call.iceQueue?.length){for(const cand of sess.call.iceQueue)await sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(cand)).catch(()=>{});sess.call.iceQueue=[];}
				setCallStatusTxt('In call · '+(sess.call.type||''));
			}break;
		case'call-ice':
			if(data.candidate){
				if(sess.call.mediaPc&&sess.call.mediaPc.remoteDescription){sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(()=>{});}
				else{if(!sess.call.iceQueue)sess.call.iceQueue=[];sess.call.iceQueue.push(data.candidate);}
			}break;
		case'call-renego':
			if(sess.call.mediaPc&&(sess.call.state==='active'||sess.call.state==='calling')){
				try{
					await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:data.sdp}));
					const ans=await sess.call.mediaPc.createAnswer();
					await sess.call.mediaPc.setLocalDescription(ans);
					safeSend(sess,{type:'call-renego-ok',sdp:ans.sdp});
				}catch(e){console.error('[WebRTC] Renego error',e);}
			}break;
		case'call-renego-ok':
			if(sess.call.mediaPc&&(sess.call.state==='active'||sess.call.state==='calling')){
				try{await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:data.sdp}));}catch(e){console.error('[WebRTC] Renego-ok error',e);}
			}break;
		case'call-end':{
			const wasActive=sess.call.state==='active';
			const dur=wasActive&&S.callStarted?Math.floor((Date.now()-S.callStarted)/1000):0;
			if(sess.call.state==='ringing'&&!sess.call.cardMsgId){createCallCard(sess,false,sess.call.incoming?.callType||'audio','missed',0);}
			else if(sess.call.cardMsgId){updateCallCard(sess,sess.call.cardMsgId,wasActive?'completed':'cancelled',dur);}
			endCallInternal(sess,false,null,true);break;
		}
		case'call-reject':{
			if(sess.call.cardMsgId)updateCallCard(sess,sess.call.cardMsgId,'declined',0);
			endCallInternal(sess,false,null,true);break;
		}
		case'display-name':{
			const old=sess.peers.get(peerId)?.name||'Peer';
			if(sess.peers.has(peerId))sess.peers.get(peerId).name=data.displayName;
			sess.peerName=data.displayName;DB.saveSession(sess);
			if(S.activeId===sess.id)renderTopbar(sess);
			addSysMsg(sess,`${old} → ${data.displayName}`);break;
		}
		// ── Group call signaling ──
		case'gc-invite':
			if(data.from===MY_PEER_ID)break;
			if(S.gcSessId)break; // Already in a group call
			sess.gc.callId=data.callId;sess.gc.type=data.callType;
			sess.gc.names.set(data.from,data.displayName||'Peer');
			S.callSessId=sess.id;
			showIncomingDialog(sess,{callType:data.callType,displayName:data.displayName||'Group'},true,data.callId,data.from);
			break;
		case'gc-accept':
			if(data.from===MY_PEER_ID)break;
			if(sess.gc.callId!==data.callId)break;
			sess.gc.names.set(data.from,data.displayName||'Peer');
			if(sess.gc.state==='calling'||sess.gc.state==='active'){
				sess.gc.state='active';
				// Polite peer: higher ID creates offer
				if(MY_PEER_ID>data.from){_gcCreatePeer(sess,data.from,true);}
				// else wait for their offer
				// Send peer list to new joiner so they know who else is in the call
				const peerList=[...sess.gc.pcs.keys()].map(pid=>({myPeerId:pid,name:sess.gc.names.get(pid)||'Peer'}));
				peerList.push({myPeerId:MY_PEER_ID,name:S.displayName});
				safeSend(sess,{type:'gc-peer-list',callId:data.callId,peers:peerList,to:data.from,from:MY_PEER_ID});
			}
			break;
		case'gc-peer-list':
			if(data.to!==MY_PEER_ID)break;
			if(sess.gc.callId!==data.callId)break;
			for(const peer of(data.peers||[])){
				if(peer.myPeerId===MY_PEER_ID)continue;
				sess.gc.names.set(peer.myPeerId,peer.name);
				if(!sess.gc.pcs.has(peer.myPeerId)&&MY_PEER_ID>peer.myPeerId){_gcCreatePeer(sess,peer.myPeerId,true);}
			}
			break;
		case'gc-decline':
			if(data.callId===sess.gc.callId&&sess.gc.state==='idle'){
				// Clean up our waiting state if needed
				S.callSessId=null;
				closeIncomingDialog();
			}
			break;
		case'gc-offer':
			if(data.to!==MY_PEER_ID)break;
			if(sess.gc.callId!==data.callId)break;
			(async()=>{
				const pc=sess.gc.pcs.get(data.from)||await _gcCreatePeer(sess,data.from,false);
				if(!pc)return;
				try{
					await pc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:data.sdp}));
					const ans=await pc.createAnswer();
					await pc.setLocalDescription(ans);
					safeSend(sess,{type:'gc-answer',callId:data.callId,sdp:ans.sdp,from:MY_PEER_ID,to:data.from});
				}catch(e){console.error('[GC offer]',e);}
			})();
			break;
		case'gc-answer':
			if(data.to!==MY_PEER_ID)break;
			if(sess.gc.callId!==data.callId)break;
			{const pc=sess.gc.pcs.get(data.from);if(pc)pc.setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:data.sdp})).catch(e=>console.error('[GC answer]',e));}
			break;
		case'gc-ice':
			if(data.to!==MY_PEER_ID)break;
			if(sess.gc.callId!==data.callId)break;
			{const pc=sess.gc.pcs.get(data.from);if(pc?.remoteDescription)pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(()=>{});}
			break;
		case'gc-end':
			if(sess.gc.callId!==data.callId)break;
			{
				const pc=sess.gc.pcs.get(data.from);
				if(pc){pc.close();sess.gc.pcs.delete(data.from);sess.gc.streams.delete(data.from);}
				gcRemoveTile(data.from);
				if(sess.gc.pcs.size===0&&sess.gc.state==='active'){
					_gcCleanup(sess);
					toast('Group call ended');
				}
			}
			break;
	}
}
function peerName(sess,peerId){return sess.peers.get(peerId)?.name||'Peer';}
function safeSend(sess,data){if(!sess?.engine||!sess.connected)return;try{sess.engine.send(data);}catch(e){console.error('[send]',e);}}

// Typing indicator
function updateTypingIndicator(sess){
	const txtEl=el('statusText');if(!txtEl||S.activeId!==sess.id)return;
	const typers=[...(sess.typingPeers||[])];
	if(typers.length>0){
		txtEl.innerHTML=`<span class="typing-status">${escH(typers.join(', '))} typing<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span></span>`;
	}else{
		txtEl.textContent=sess.connected?`${sess.peers.size} peer${sess.peers.size!==1?'s':''} connected`:'Disconnected';
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. CHAT RENDERING
// ═══════════════════════════════════════════════════════════════════════════
function renderChatList(){
	const container=el('chatList');if(!container)return;
	const q=S.filterQ.toLowerCase();
	const items=[...S.sessions.values()].filter(s=>!q||s.name.toLowerCase().includes(q)).sort((a,b)=>b.lastActivity-a.lastActivity);
	if(!items.length){container.innerHTML=`<div style="padding:24px 14px;text-align:center;font-size:.75rem;color:var(--faint)">No chats yet.<br>Use the + button to start one.</div>`;return;}
	container.innerHTML=items.map(s=>{
		const th=THEMES[s.theme]||THEMES.void;
		const initials=s.name.slice(0,2).toUpperCase();
		const isActive=s.id===S.activeId;
		const inCall=(S.callSessId===s.id||S.gcSessId===s.id);
		const dotClass=s.connected?(inCall?'ci-dot call':'ci-dot on'):'ci-dot';
		const unreadBadge=s.unread>0?`<div class="ci-badge">${s.unread>99?'99+':s.unread}</div>`:'';
		const time=s.lastActivity?relTime(s.lastActivity):'';
		const type=s.isGroup?'👥':(s.type==='direct'?'⚡':'🔗');
		// Task 3: show peerAvatar for any non-group chat that has one
		let avHtml=`${initials}<div class="${dotClass}"></div>`;
		if(s.isGroup&&s.groupIcon){
			avHtml=`<img src="${escH(s.groupIcon)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'"><div class="${dotClass}"></div>`;
		}else if(!s.isGroup&&s.peerAvatar){
			avHtml=`<img src="${escH(s.peerAvatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'"><div class="${dotClass}"></div>`;
		}
		// Task 3: show peer name as primary name for non-group rooms
		const displayName=(!s.isGroup&&s.peerName&&s.peerName!==s.name)?s.peerName:s.name;
		return`<div class="chat-item${isActive?' active':''}" onclick="App.selectChat('${s.id}')">
			<div class="ci-av" style="color:${th.primary};border-color:${isActive?th.primary:'rgba(255,255,255,.1)'}">
				${avHtml}
			</div>
			<div class="ci-info">
				<div class="ci-name">${escH(displayName)} <span style="opacity:.4;font-size:.7em">${type}</span></div>
				<div class="ci-prev">${escH(s.lastMessage||(s.connected?'Connected':'Not connected'))}</div>
			</div>
			<div class="ci-meta"><div class="ci-time">${time}</div>${unreadBadge}</div>
		</div>`;
	}).join('');
}

function renderTopbar(sess){
	const avEl=el('topbarAv'),nameEl=el('topbarName'),dotEl=el('statusDot'),txtEl=el('statusText');
	if(!avEl)return;
	const th=THEMES[sess.theme]||THEMES.void;
	// Task 3: show peerAvatar for any non-group with peerAvatar
	if(sess.isGroup&&sess.groupIcon){
		avEl.innerHTML=`<img src="${escH(sess.groupIcon)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`;avEl.style.border='none';
	}else if(!sess.isGroup&&sess.peerAvatar){
		avEl.innerHTML=`<img src="${escH(sess.peerAvatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`;avEl.style.border='none';
	}else{
		avEl.innerHTML=sess.name.slice(0,2).toUpperCase();avEl.style.color=th.primary;avEl.style.border='';
	}
	// Task 3: show peer name as primary for non-group
	const displayName=(!sess.isGroup&&sess.peerName)?sess.peerName:sess.name;
	nameEl.textContent=displayName;
	dotEl.className='status-dot '+(sess.connected?'connected':'');
	txtEl.textContent=sess.connected?`${sess.peers.size} peer${sess.peers.size!==1?'s':''} connected`:'Disconnected';
	enableCallBtns(sess.connected);
}
function setStatus(state,text){
	const d=el('statusDot');if(d)d.className='status-dot '+state;
	const t=el('statusText');if(t)t.textContent=text;
}
function enableCallBtns(on){
	['btnVoice','btnVideo'].forEach(id=>{const b=el(id);if(b)b.disabled=!on;});
}
async function renderMessages(sess){
	const container=el('messages');if(!container)return;
	container.innerHTML='';
	if(!sess.messages.length)sess.messages=await DB.getMessages(sess.id);
	for(const m of sess.messages)renderMsgItem(container,m);
	container.scrollTop=container.scrollHeight;
}
function renderMsgItem(container,m){
	if(m.type==='system'){const d=document.createElement('div');d.className='sys-msg';d.textContent=m.content;container.appendChild(d);return;}
	if(m.type==='file'){renderFileBubbleFromMsg(container,m);return;}
	if(m.type==='call'){renderCallCardFromMsg(container,m);return;}
	const side=m.mine?'mine':'theirs';
	const enc=m.enc?'<span class="enc-badge">🔒 enc</span>':'';
	const ticks=m.mine?ticksHtml(m.ticks||1):'';
	const d=document.createElement('div');d.className=`msg ${side}`;d.dataset.msgId=m.id;
	d.innerHTML=`<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}${enc}${ticks}</div>
		<div class="msg-bubble">${formatText(m.content)}</div>`;
	container.appendChild(d);
}
// addBubble returns msgId for delivered receipt
function addBubble(sess,text,sender,mine,enc=false){
	const m={id:'msg_'+Date.now()+'_'+uid(),sessionId:sess.id,type:'text',content:text,sender,mine,timestamp:Date.now(),enc,ticks:mine?1:0};
	sess.messages.push(m);sess.lastMessage=text.slice(0,60);sess.lastActivity=m.timestamp;
	DB.saveMessage(m);DB.updateSession(sess.id,{lastMessage:sess.lastMessage,lastActivity:sess.lastActivity});
	if(!mine&&S.activeId!==sess.id){sess.unread++;renderChatList();}
	if(S.activeId===sess.id){const c=el('messages');if(c){renderMsgItem(c,m);c.scrollTop=c.scrollHeight;}renderChatList();}
	else renderChatList();
	return m.id;
}
function addSysMsg(sess,text){
	const m={id:'sys_'+Date.now()+'_'+uid(),sessionId:sess.id,type:'system',content:text,sender:'',mine:false,timestamp:Date.now(),enc:false};
	sess.messages.push(m);DB.saveMessage(m);
	if(S.activeId===sess.id){const c=el('messages');if(c){renderMsgItem(c,m);c.scrollTop=c.scrollHeight;}}
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. FILE TRANSFER
// ═══════════════════════════════════════════════════════════════════════════
async function sendFile(file,sess,batchId){
	if(!sess)sess=getActiveSess();
	if(!sess?.connected){toast('Not connected');return;}
	if(file.size>500*1024*1024){toast('Max 500 MB per file');return;}
	const xferId='ft_'+Date.now()+'_'+uid(),isEnc=S.encEnabled&&!!Crypt.key;
	const localUrl=URL.createObjectURL(file);
	const meta={name:file.name,size:file.size,mime:file.type||'application/octet-stream'};
	const msgId=addSendingFileBubble(sess,meta,localUrl,xferId,batchId);
	try{
		let buf=await file.arrayBuffer();buf=await gzip(buf);
		if(isEnc)buf=await Crypt.encBuf(buf);
		const b64=bufB64(buf),nChunks=Math.ceil(b64.length/CHUNK_SIZE);
		safeSend(sess,{type:'file-meta',id:xferId,name:file.name,origSize:file.size,compressedSize:buf.byteLength,mime:file.type||'application/octet-stream',chunks:nChunks,encrypted:isEnc,compressed:true,batchId:batchId||null,displayName:S.displayName});
		for(let i=0;i<nChunks;i++){
			safeSend(sess,{type:'file-chunk',id:xferId,index:i,data:b64.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE)});
			if(i%4===0){await sleep(0);updateXferProgress(msgId,(i+1)/nChunks);}
		}
		safeSend(sess,{type:'file-done',id:xferId});
		finalizeFileBubble(msgId,meta,localUrl,isEnc,sess,batchId);
	}catch(e){toast('Send failed: '+e.message);URL.revokeObjectURL(localUrl);removeFileBubble(msgId);}
}
async function receiveFile(sess,id,peerId){
	const entry=sess.inFiles.get(id);if(!entry)return;
	sess.inFiles.delete(id);
	const{meta,chunks}=entry;let buf=b64Buf(chunks.join(''));
	if(meta.encrypted){if(!Crypt.key){addSysMsg(sess,`⚠ Cannot decrypt ${meta.name}`);return;}try{buf=await Crypt.decBuf(buf);}catch{addSysMsg(sess,`⚠ Decrypt failed: ${meta.name}`);return;}}
	if(meta.compressed){try{buf=await gunzip(buf);}catch{addSysMsg(sess,`⚠ Decompress failed: ${meta.name}`);return;}}
	const blob=new Blob([buf],{type:meta.mime});
	const url=URL.createObjectURL(blob);
	addFileBubble(sess,{name:meta.name,size:meta.origSize||meta.size,mime:meta.mime},url,false,meta.encrypted,meta.batchId||null,peerId);
}
function addSendingFileBubble(sess,meta,url,xferId,batchId){
	const msgId='msg_'+Date.now()+'_'+uid();
	if(S.activeId===sess.id){
		const c=el('messages');if(!c)return msgId;
		const d=document.createElement('div');d.className='msg mine';d.dataset.msgId=msgId;
		d.innerHTML=`<div class="msg-meta">${escH(S.displayName)} · ${fmtTime(Date.now())}</div><div class="msg-bubble fp-bubble">${buildFileCard(meta,url,true,0)}</div>`;
		c.appendChild(d);c.scrollTop=c.scrollHeight;loadLazy(d);
	}
	return msgId;
}
function updateXferProgress(msgId,pct){
	const d=document.querySelector(`[data-msg-id="${msgId}"]`);if(!d)return;
	const bar=d.querySelector('.fp-bar-fill');if(bar)bar.style.width=(pct*100).toFixed(0)+'%';
	const pctEl=d.querySelector('.fp-pct');if(pctEl)pctEl.textContent=Math.round(pct*100)+'%';
}
function finalizeFileBubble(msgId,meta,url,enc,sess,batchId){
	const d=document.querySelector(`[data-msg-id="${msgId}"]`);
	if(d){const bub=d.querySelector('.msg-bubble');if(bub){bub.innerHTML=buildFileCard(meta,url,false,0,getBatchSiblings(sess,batchId,msgId));loadLazy(bub);}}
	const m={id:msgId,sessionId:sess.id,type:'file',content:meta.name,sender:S.displayName,mine:true,timestamp:Date.now(),enc,file:{name:meta.name,size:meta.size,mime:meta.mime,blobUrl:url,batchId:batchId||null}};
	sess.messages.push(m);sess.lastMessage='📎 '+meta.name;sess.lastActivity=m.timestamp;
	DB.saveMessage(m);DB.updateSession(sess.id,{lastMessage:sess.lastMessage,lastActivity:sess.lastActivity});
	renderChatList();
}
function removeFileBubble(msgId){document.querySelector(`[data-msg-id="${msgId}"]`)?.remove();}
function addFileBubble(sess,meta,url,mine,enc,batchId,peerId){
	const sender=mine?S.displayName:peerName(sess,peerId||'remote');
	const m={id:'file_'+Date.now()+'_'+uid(),sessionId:sess.id,type:'file',content:meta.name,sender,mine,timestamp:Date.now(),enc,file:{name:meta.name,size:meta.size,mime:meta.mime,blobUrl:url,batchId:batchId||null}};
	sess.messages.push(m);sess.lastMessage='📎 '+meta.name;sess.lastActivity=m.timestamp;
	DB.saveMessage(m);DB.updateSession(sess.id,{lastMessage:sess.lastMessage,lastActivity:sess.lastActivity});
	if(!mine&&S.activeId!==sess.id)sess.unread++;
	if(S.activeId===sess.id){
		const c=el('messages');if(!c){renderChatList();return;}
		const batchSiblings=getBatchSiblings(sess,batchId,m.id);
		const d=document.createElement('div');d.className=`msg ${mine?'mine':'theirs'}`;d.dataset.msgId=m.id;
		d.innerHTML=`<div class="msg-meta">${escH(sender)} · ${fmtTime(m.timestamp)}${enc?'<span class="enc-badge">🔒 enc</span>':''}</div><div class="msg-bubble fp-bubble">${buildFileCard(meta,url,false,0,batchSiblings)}</div>`;
		c.appendChild(d);c.scrollTop=c.scrollHeight;loadLazy(d);
	}
	renderChatList();
}
function renderFileBubbleFromMsg(container,m){
	const side=m.mine?'mine':'theirs';
	const enc=m.enc?'<span class="enc-badge">🔒 enc</span>':'';
	const meta=m.file||{name:m.content,size:0,mime:'application/octet-stream'};
	const url=meta.blobUrl||meta.dataUrl||null;
	const batchFiles=[];
	if(meta.batchId&&m.sessionId){const sess=S.sessions.get(m.sessionId);if(sess)batchFiles.push(...getBatchSiblings(sess,meta.batchId,m.id));}
	const d=document.createElement('div');d.className=`msg ${side}`;d.dataset.msgId=m.id;
	d.innerHTML=`<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}${enc}</div><div class="msg-bubble fp-bubble">${buildFileCard(meta,url,false,0,batchFiles)}</div>`;
	container.appendChild(d);loadLazy(d);
}

// ═══════════════════════════════════════════════════════════════════════════
// 17. WEBRTC 1:1 CALLING
// ═══════════════════════════════════════════════════════════════════════════
async function initiateCall(type){
	const sess=getActiveSess();
	if(!sess?.connected){toast('Not connected');return;}
	if(sess.isGroup){initiateGroupCall(type);return;}
	if(sess.call.state!=='idle'){toast('Already in a call');return;}
	if(S.callSessId!==null){toast('End current call first');return;}
	sess.call.type=type;sess.call.state='calling';S.callSessId=sess.id;sess.call.iceQueue=[];
	try{
		const stream=await getStream(type);
		sess.call.localStream=stream;
		showCallOverlay(sess,stream);
		sess.call.mediaPc=buildMediaPC(sess);
		stream.getTracks().forEach(t=>sess.call.mediaPc.addTrack(t,stream));
		const offer=await sess.call.mediaPc.createOffer();
		await sess.call.mediaPc.setLocalDescription(offer);
		safeSend(sess,{type:'call-offer',sdp:offer.sdp,callType:type,displayName:S.displayName});
		sess.call.cardMsgId=createCallCard(sess,true,type,'calling');
		Ringtone.start('outgoing');
		setCallStatusTxt('Ringing…');
	}catch(e){
		console.error('[WebRTC] initiateCall error:',e);
		toast('Could not start call: '+e.message);
		endCallInternal(sess,false,'cancelled',true);
	}
}
function buildMediaPC(sess){
	const pc=new RTCPeerConnection({iceServers:[{urls:['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}]});
	pc.onicecandidate=evt=>{if(evt.candidate)safeSend(sess,{type:'call-ice',candidate:evt.candidate.toJSON()});};
	pc.onicecandidateerror=evt=>console.error('[ICE error]',evt.errorCode,evt.errorText);
	pc.ontrack=evt=>{
		const rv=el('callRemoteVid');if(!rv)return;
		if(!sess.call.remoteStream)sess.call.remoteStream=new MediaStream();
		const rs=sess.call.remoteStream;
		const existing=rs.getTracks().find(t=>t.kind===evt.track.kind);
		if(existing)rs.removeTrack(existing);
		rs.addTrack(evt.track);rv.srcObject=rs;rv.play().catch(()=>{});
		if(evt.track.kind==='video'){rv.style.display='block';const ab=el('callAudioBg');if(ab)ab.style.display='none';}
		if(sess.call.state==='active')App.startAudioVisualizer(rs);
	};
	pc.onnegotiationneeded=async()=>{
		if(sess.call.state!=='active'||pc.signalingState!=='stable')return;
		try{const offer=await pc.createOffer();await pc.setLocalDescription(offer);safeSend(sess,{type:'call-renego',sdp:offer.sdp});}
		catch(e){console.error('[WebRTC] renegotiation error',e);}
	};
	pc.onconnectionstatechange=()=>{
		const s=pc.connectionState;
		if(s==='connected'){
			Ringtone.stop();sess.call.state='active';sess.call.callStartedAt=Date.now();
			setCallStatusTxt('In call · '+(sess.call.type||''));startCallTimer();
			if(sess.call.cardMsgId)updateCallCard(sess,sess.call.cardMsgId,'active',0);
			if(sess.call.remoteStream)App.startAudioVisualizer(sess.call.remoteStream);
		}
		if(s==='failed'||s==='closed'){endCallInternal(sess,true,'cancelled',false);toast('Call connection failed');}
	};
	return pc;
}
async function acceptCall(){
	closeIncomingDialog();
	const sess=S.sessions.get(S.callSessId);if(!sess?.call.incoming)return;
	const data=sess.call.incoming;
	sess.call.type=data.callType;sess.call.state='connecting';
	try{
		const stream=await getStream(data.callType==='screen'?'audio':data.callType);
		sess.call.localStream=stream;showCallOverlay(sess,stream);
		sess.call.mediaPc=buildMediaPC(sess);
		stream.getTracks().forEach(t=>sess.call.mediaPc.addTrack(t,stream));
		await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:data.sdp}));
		if(sess.call.iceQueue?.length){for(const cand of sess.call.iceQueue)await sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(cand)).catch(()=>{});sess.call.iceQueue=[];}
		const answer=await sess.call.mediaPc.createAnswer();
		await sess.call.mediaPc.setLocalDescription(answer);
		safeSend(sess,{type:'call-answer',sdp:answer.sdp});
		sess.call.cardMsgId=createCallCard(sess,false,data.callType,'active');
		sess.call.callStartedAt=Date.now();setCallStatusTxt('Connecting…');
	}catch(e){
		console.error('[WebRTC] acceptCall error:',e);toast('Could not accept call: '+e.message);
		safeSend(sess,{type:'call-reject'});endCallInternal(sess,false,'declined',true);
	}
}
function rejectCall(){
	closeIncomingDialog();
	const sess=S.sessions.get(S.callSessId);
	if(sess){const cid=createCallCard(sess,false,sess.call.incoming?.callType||'audio','declined',0);sess.call.cardMsgId=cid;safeSend(sess,{type:'call-reject'});endCallInternal(sess,false,null,true);}
}
function endCallInternal(sess,notify=true,reason=null,_skipCardUpdate=false){
	if(!sess)sess=S.sessions.get(S.callSessId);if(!sess)return;
	const prevState=sess.call.state,prevCardMsgId=sess.call.cardMsgId,prevType=sess.call.type||'audio',prevIncoming=sess.call.incoming;
	const duration=(prevState==='active'&&S.callStarted)?Math.floor((Date.now()-S.callStarted)/1000):0;
	if(!reason){
		if(prevState==='active')reason='completed';
		else if(prevState==='calling'||prevState==='connecting')reason=notify?'cancelled':'missed';
		else if(prevState==='ringing')reason=notify?'declined':'missed';
		else reason='cancelled';
	}
	if(notify&&sess.connected&&prevState!=='idle')safeSend(sess,{type:'call-end'});
	Ringtone.stop();App.stopAudioVisualizer();closeIncomingDialog();hideCallOverlay();stopCallTimer();
	sess.call.localStream?.getTracks().forEach(t=>t.stop());
	sess.call.remoteStream?.getTracks().forEach(t=>t.stop());
	try{sess.call.mediaPc?.close();}catch{}
	if(!_skipCardUpdate){
		if(prevCardMsgId){updateCallCard(sess,prevCardMsgId,reason,duration);}
		else if(prevState==='ringing'){createCallCard(sess,false,prevIncoming?.callType||prevType,reason,0);}
	}
	sess.call={mediaPc:null,localStream:null,remoteStream:null,type:null,sourceType:null,state:'idle',muted:false,camOff:false,incoming:null,iceQueue:[],audioCtx:null,audioAnalyser:null,audioSource:null,audioDrawTimer:null,cardMsgId:null,callStartedAt:null};
	if(S.callSessId===sess.id)S.callSessId=null;
	renderChatList();
}
async function getStream(type){
	return navigator.mediaDevices.getUserMedia(type==='video'?{video:true,audio:true}:{audio:true,video:false});
}
async function callToggleSource(){
	const sess=S.sessions.get(S.callSessId);if(!sess?.call.mediaPc)return;
	const pc=sess.call.mediaPc,isScreen=sess.call.sourceType==='screen',btn=el('callSrcBtn');
	const ICON_SCREEN=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>`;
	const ICON_CAM=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/></svg>`;
	try{
		let newStream;
		if(isScreen){newStream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});sess.call.sourceType='camera';}
		else{
			newStream=await navigator.mediaDevices.getDisplayMedia({video:{cursor:'always'}});
			sess.call.sourceType='screen';
			newStream.getVideoTracks()[0].addEventListener('ended',()=>{sess.call.sourceType='camera';callToggleSource().catch(()=>{});});
		}
		const newVid=newStream.getVideoTracks()[0];if(!newVid)return;
		const vidSender=pc.getSenders().find(s=>s.track?.kind==='video');
		if(vidSender){const old=vidSender.track;await vidSender.replaceTrack(newVid);old?.stop();}
		else{const keepAudio=sess.call.localStream?.getAudioTracks()||[];pc.addTrack(newVid,new MediaStream([...keepAudio,newVid]));sess.call.localStream?.getVideoTracks().forEach(t=>t.stop());}
		const keepAudio=sess.call.localStream?.getAudioTracks()||[];
		sess.call.localStream=new MediaStream([...keepAudio,newVid]);
		const lv=el('callLocalVid');if(lv){lv.srcObject=sess.call.localStream;lv.classList.add('visible');}
		const nowScreen=sess.call.sourceType==='screen';
		if(btn){btn.title=nowScreen?'Switch to Camera':'Share Screen';btn.classList.toggle('active',nowScreen);btn.innerHTML=nowScreen?ICON_CAM:ICON_SCREEN;}
	}catch(e){toast('Source toggle failed: '+e.message);}
}
function toggleCallMute(){
	const sess=S.sessions.get(S.callSessId);if(!sess)return;
	sess.call.muted=!sess.call.muted;
	sess.call.localStream?.getAudioTracks().forEach(t=>t.enabled=!sess.call.muted);
	const btn=el('callMuteBtn');if(btn){btn.classList.toggle('active',sess.call.muted);btn.title=sess.call.muted?'Unmute':'Mute';}
}
function toggleCallCam(){
	const sess=S.sessions.get(S.callSessId);if(!sess)return;
	sess.call.camOff=!sess.call.camOff;
	sess.call.localStream?.getVideoTracks().forEach(t=>t.enabled=!sess.call.camOff);
	const btn=el('callCamBtn');if(btn){btn.classList.toggle('active',sess.call.camOff);btn.title=sess.call.camOff?'Show Camera':'Hide Camera';}
	const lv=el('callLocalVid');if(lv)lv.classList.toggle('visible',!sess.call.camOff);
}
function showCallOverlay(sess,localStream){
	const ov=el('callOverlay');if(!ov)return;
	const type=sess.call.type;ov.classList.add('active');
	sess.call.sourceType=type==='screen'?'screen':(type==='video'?'camera':null);
	const rv=el('callRemoteVid'),ab=el('callAudioBg'),lv=el('callLocalVid');
	if(rv&&!sess.call.remoteStream){rv.srcObject=null;rv.style.display='none';}
	else if(rv&&sess.call.remoteStream?.getVideoTracks().length>0)rv.style.display='block';
	if(ab){
		const names=[...sess.peers.values()].map(p=>p.name).join(', ')||'Peer';ab.style.display='flex';
		const ini=el('callAudioInitial');
		if(ini){
			if(!sess.isGroup&&sess.peerAvatar)ini.innerHTML=`<img src="${escH(sess.peerAvatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`;
			else ini.textContent=(names[0]||'P').toUpperCase();
		}
		const pn=el('callAudioName');if(pn)pn.textContent=names;
	}
	if(lv){if(localStream&&(type==='video'||type==='screen')){lv.srcObject=localStream;lv.classList.add('visible');}else lv.classList.remove('visible');}
	const badge=el('callBadge');if(badge)badge.textContent=type==='audio'?'🎤 Voice Call':type==='video'?'📹 Video Call':'🖥 Screen Share';
	const camBtn=el('callCamBtn');if(camBtn)camBtn.classList.toggle('hidden',type==='audio');
	const srcBtn=el('callSrcBtn');
	if(srcBtn){srcBtn.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>`;srcBtn.title='Share Screen';srcBtn.classList.remove('active');}
	el('callTimer').textContent='00:00';
}
function hideCallOverlay(){
	const ov=el('callOverlay');if(ov)ov.classList.remove('active');
	const rv=el('callRemoteVid');if(rv){rv.srcObject=null;rv.style.display='none';}
	const lv=el('callLocalVid');if(lv){lv.srcObject=null;lv.classList.remove('visible');}
}
function showIncomingDialog(sess,data,isGroupCall=false,gcCallId='',gcFrom=''){
	const d=el('incomingDialog');if(!d)return;
	const icons={audio:'📞',video:'📹',screen:'🖥️'};
	el('incomingIcon').textContent=icons[data.callType]||'📞';
	el('incomingCallerName').textContent=data.displayName||'Peer';
	el('incomingCallType').textContent=(isGroupCall?'👥 Group ':'')+(data.callType||'voice')+' call';
	d.dataset.isGroup=isGroupCall?'1':'0';
	d.dataset.gcCallId=gcCallId;d.dataset.gcFrom=gcFrom;
	d.dataset.gcType=data.callType||'audio';
	d.classList.add('active');
	Ringtone.start('incoming');
}
function closeIncomingDialog(){el('incomingDialog')?.classList.remove('active');Ringtone.stop();}
function setCallStatusTxt(txt){const e=el('callAudioStatus');if(e)e.textContent=txt;}
function startCallTimer(){
	stopCallTimer();S.callStarted=Date.now();
	S.callTimer=setInterval(()=>{
		const s=Math.floor((Date.now()-S.callStarted)/1000);
		const t=el('callTimer');if(t)t.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
	},1000);
}
function stopCallTimer(){if(S.callTimer){clearInterval(S.callTimer);S.callTimer=null;}S.callStarted=null;const t=el('callTimer');if(t)t.textContent='00:00';}

// ═══════════════════════════════════════════════════════════════════════════
// 17b. GROUP CALLING (mesh topology)
// ═══════════════════════════════════════════════════════════════════════════
async function initiateGroupCall(type){
	const sess=getActiveSess();if(!sess?.connected||!sess.isGroup)return;
	if(S.gcSessId){toast('Already in a group call');return;}
	const callId=uid();
	sess.gc={state:'calling',callId,type,localStream:null,pcs:new Map(),streams:new Map(),names:new Map()};
	sess.gc.names.set(MY_PEER_ID,S.displayName);
	S.gcSessId=sess.id;
	try{
		const stream=await getStream(type);
		sess.gc.localStream=stream;
		el('gcOverlay').classList.add('active');
		el('gcTitle').textContent=type==='video'?'📹 Group Video Call':'🎤 Group Voice Call';
		gcAddMyTile(S.displayName,type,stream);
		safeSend(sess,{type:'gc-invite',callId,callType:type,from:MY_PEER_ID,displayName:S.displayName});
		toast('Group call started — waiting for peers…');
	}catch(e){
		toast('Could not start group call: '+e.message);
		_gcCleanup(sess);
	}
}
async function acceptGroupCall(){
	const d=el('incomingDialog');if(!d)return;
	const callId=d.dataset.gcCallId,fromPeerId=d.dataset.gcFrom,callType=d.dataset.gcType||'audio';
	closeIncomingDialog();
	const sess=S.sessions.get(S.callSessId);
	if(!sess){S.callSessId=null;return;}
	sess.gc={state:'active',callId,type:callType,localStream:null,pcs:new Map(),streams:new Map(),names:new Map()};
	sess.gc.names.set(MY_PEER_ID,S.displayName);
	S.gcSessId=sess.id;S.callSessId=null;
	try{
		const stream=await getStream(callType);
		sess.gc.localStream=stream;
		el('gcOverlay').classList.add('active');
		el('gcTitle').textContent=callType==='video'?'📹 Group Video Call':'🎤 Group Voice Call';
		gcAddMyTile(S.displayName,callType,stream);
		safeSend(sess,{type:'gc-accept',callId,from:MY_PEER_ID,to:fromPeerId,displayName:S.displayName,callType});
	}catch(e){
		toast('Could not join group call: '+e.message);
		safeSend(sess,{type:'gc-decline',callId,from:MY_PEER_ID});
		_gcCleanup(sess);
	}
}
function declineGroupCall(){
	const d=el('incomingDialog');if(!d)return;
	const callId=d.dataset.gcCallId;
	closeIncomingDialog();
	const sess=S.sessions.get(S.callSessId);
	if(sess)safeSend(sess,{type:'gc-decline',callId,from:MY_PEER_ID});
	S.callSessId=null;
}
async function _gcCreatePeer(sess,remotePeerId,asOfferer){
	if(sess.gc.pcs.has(remotePeerId))return sess.gc.pcs.get(remotePeerId);
	const pc=new RTCPeerConnection({iceServers:[{urls:['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}]});
	sess.gc.pcs.set(remotePeerId,pc);
	sess.gc.localStream?.getTracks().forEach(t=>pc.addTrack(t,sess.gc.localStream));
	pc.onicecandidate=evt=>{if(evt.candidate)safeSend(sess,{type:'gc-ice',callId:sess.gc.callId,candidate:evt.candidate.toJSON(),from:MY_PEER_ID,to:remotePeerId});};
	pc.ontrack=evt=>{
		const stream=evt.streams[0]||new MediaStream([evt.track]);
		sess.gc.streams.set(remotePeerId,stream);
		const name=sess.gc.names.get(remotePeerId)||'Peer';
		gcUpdateTile(remotePeerId,name,stream,sess.gc.type);
	};
	pc.onconnectionstatechange=()=>{
		const s=pc.connectionState;
		if(s==='failed'||s==='closed'||s==='disconnected'){
			sess.gc.pcs.delete(remotePeerId);sess.gc.streams.delete(remotePeerId);
			gcRemoveTile(remotePeerId);
		}
	};
	if(asOfferer){
		const offer=await pc.createOffer();await pc.setLocalDescription(offer);
		safeSend(sess,{type:'gc-offer',callId:sess.gc.callId,sdp:offer.sdp,from:MY_PEER_ID,to:remotePeerId});
	}
	return pc;
}
function _gcCleanup(sess){
	if(!sess)return;
	sess.gc.pcs.forEach(pc=>{try{pc.close();}catch{}});
	sess.gc.localStream?.getTracks().forEach(t=>t.stop());
	if(sess.gc.state!=='idle')safeSend(sess,{type:'gc-end',callId:sess.gc.callId,from:MY_PEER_ID});
	sess.gc={state:'idle',callId:null,type:null,localStream:null,pcs:new Map(),streams:new Map(),names:new Map()};
	if(S.gcSessId===sess.id)S.gcSessId=null;
	el('gcOverlay')?.classList.remove('active');
	const grid=el('gcGrid');if(grid)grid.innerHTML='';
	renderChatList();
}
function gcAddMyTile(name,type,stream){
	const grid=el('gcGrid');if(!grid)return;
	let tile=document.getElementById('gc-tile-me');
	if(!tile){
		tile=document.createElement('div');tile.className='gc-tile';tile.id='gc-tile-me';
		tile.innerHTML=`<video id="gc-vid-me" autoplay playsinline muted></video><div class="gc-tile-av">${escH(name[0]?.toUpperCase()||'M')}</div><div class="gc-tile-name">${escH(name)} (you)</div>`;
		grid.appendChild(tile);
	}
	if(type==='video'&&stream){
		const vid=document.getElementById('gc-vid-me');
		if(vid){vid.srcObject=stream;vid.style.display='block';tile.querySelector('.gc-tile-av').style.display='none';}
	}
	gcUpdateGridLayout();
}
function gcUpdateTile(remotePeerId,name,stream,type){
	const grid=el('gcGrid');if(!grid)return;
	let tile=document.getElementById('gc-tile-'+remotePeerId);
	if(!tile){
		tile=document.createElement('div');tile.className='gc-tile';tile.id='gc-tile-'+remotePeerId;
		const init=(name||'P')[0].toUpperCase();
		tile.innerHTML=`<video id="gc-vid-${remotePeerId}" autoplay playsinline></video><div class="gc-tile-av" id="gc-av-${remotePeerId}">${escH(init)}</div><div class="gc-tile-name">${escH(name)}</div>`;
		grid.appendChild(tile);gcUpdateGridLayout();
	}
	if(stream){
		const vid=document.getElementById('gc-vid-'+remotePeerId);
		if(vid){vid.srcObject=stream;vid.play().catch(()=>{});
			if(type==='video'){vid.style.display='block';const av=document.getElementById('gc-av-'+remotePeerId);if(av)av.style.display='none';}
		}
	}
}
function gcRemoveTile(peerId){document.getElementById('gc-tile-'+peerId)?.remove();gcUpdateGridLayout();}
function gcUpdateGridLayout(){
	const grid=el('gcGrid');if(!grid)return;
	const count=grid.children.length;
	grid.className='gc-grid p'+Math.min(count,6);
}

// ═══════════════════════════════════════════════════════════════════════════
// 18. INJECTED PANELS
// ═══════════════════════════════════════════════════════════════════════════
function injectPanels(){
	const css=document.createElement('style');
	css.textContent=`
.panel-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .25s}
.panel-overlay.open{opacity:1;pointer-events:auto}
.panel-drawer{position:fixed;top:0;right:0;bottom:0;width:320px;max-width:94vw;background:rgba(5,5,18,.97);border-left:1px solid rgba(0,255,255,.14);display:flex;flex-direction:column;overflow:hidden;transform:translateX(30px);transition:transform .25s ease}
.panel-overlay.open .panel-drawer{transform:translateX(0)}
.panel-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px 12px;border-bottom:1px solid rgba(0,255,255,.1)}
.panel-head-title{font-family:'Syne',sans-serif;font-size:1rem;font-weight:800}
.panel-close{width:26px;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--dim);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;transition:all .15s}
.panel-close:hover{background:rgba(255,68,85,.15);color:#ff4455;border-color:rgba(255,68,85,.3)}
.panel-body{flex:1;overflow-y:auto;padding:0 0 40px}
.panel-section{padding:16px 18px;border-bottom:1px solid rgba(0,255,255,.07)}
.panel-section-lbl{font-family:'JetBrains Mono',monospace;font-size:.59rem;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,255,255,.5);margin-bottom:12px}
.sp-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.sp-label{font-size:.82rem;color:var(--dim)}
.modal-overlay{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:16px}
.modal-overlay.open{display:flex}
.modal-box{background:rgba(5,5,18,.98);border:1px solid rgba(0,255,255,.18);border-radius:14px;width:100%;max-width:420px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;border-bottom:1px solid rgba(255,255,255,.07)}
.modal-title{font-family:'Syne',sans-serif;font-size:1rem;font-weight:800}
.modal-body{flex:1;overflow-y:auto;padding:16px 18px 24px}
@media(max-width:700px){.modal-overlay{align-items:flex-end;padding:0}.modal-box{border-radius:14px 14px 0 0;max-width:100%;max-height:88vh}}
.call-overlay{position:fixed;inset:0;z-index:600;background:#000;display:none;flex-direction:column}
.call-overlay.active{display:flex}
.call-remote-vid{width:100%;height:100%;object-fit:cover;display:none;position:absolute;inset:0}
.call-audio-bg{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;position:relative;background:linear-gradient(to bottom,#000d1a,#000)}
.call-rings{position:absolute;inset:0;pointer-events:none}
.call-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(0,255,255,.3);animation:callring 2.4s ease-out infinite}
.call-ring:nth-child(2){animation-delay:.8s}.call-ring:nth-child(3){animation-delay:1.6s}
.call-ring.vol-active{animation:none;transition:transform .08s ease-out;border-color:rgba(0,255,255,.6);opacity:.4}
.call-ring.vol-active:nth-child(2){border-color:rgba(0,255,255,.4);opacity:.3}
.call-ring.vol-active:nth-child(3){border-color:rgba(0,255,255,.2);opacity:.2}
@keyframes callring{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.8);opacity:0}}
.call-audio-av{width:80px;height:80px;border-radius:50%;background:rgba(0,255,255,.1);border:2px solid rgba(0,255,255,.3);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;color:var(--tp);z-index:1;overflow:hidden}
.call-audio-peer{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800;z-index:1}
.call-audio-status{font-family:'JetBrains Mono',monospace;font-size:.75rem;color:rgba(232,237,248,.5);z-index:1}
.call-timer-wrap{font-family:'JetBrains Mono',monospace;font-size:.9rem;color:rgba(232,237,248,.7);letter-spacing:.06em;z-index:1}
.call-local-vid{position:absolute;bottom:100px;right:14px;width:130px;height:98px;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.15);background:#111;object-fit:cover;display:none;z-index:2}
.call-local-vid.visible{display:block}
.call-badge{position:absolute;top:14px;left:50%;transform:translateX(-50%);font-family:'JetBrains Mono',monospace;font-size:.65rem;letter-spacing:.1em;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:4px 13px;color:rgba(232,237,248,.7);z-index:3}
.call-controls{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:18px;padding:22px 16px;background:linear-gradient(to top,rgba(0,0,0,.9),transparent);z-index:4}
.call-ctrl{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:all .18s}
.call-ctrl svg{width:24px;height:24px}
.call-ctrl.mute,.call-ctrl.cam,.call-ctrl.src{background:rgba(255,255,255,.14);color:#e8edf8}
.call-ctrl.end{background:#ff4455;color:#fff}
.call-ctrl.active{background:rgba(255,68,85,.25);color:#ff4455}
.call-ctrl:hover{filter:brightness(1.18);transform:scale(1.06)}
.incoming-overlay{position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center}
.incoming-overlay.active{display:flex}
.incoming-box{background:rgba(5,5,18,.98);border:1px solid rgba(0,255,255,.2);border-radius:16px;padding:30px 26px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;max-width:280px;width:90%;animation:inpulse 1.5s ease-in-out infinite}
@keyframes inpulse{0%,100%{box-shadow:0 0 25px rgba(0,255,255,.08)}50%{box-shadow:0 0 55px rgba(0,255,255,.2)}}
.incoming-big-icon{font-size:3rem}.incoming-caller{font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800}.incoming-type{font-size:.78rem;color:var(--dim)}
#lightbox{position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;cursor:zoom-out}
#lightbox.open{display:flex}
#lightbox img{max-width:95vw;max-height:95vh;border-radius:8px;object-fit:contain}
#themePicker{position:fixed;z-index:450;background:rgba(5,5,18,.97);border:1px solid rgba(0,255,255,.2);border-radius:11px;padding:14px 16px;display:none;flex-direction:column;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.5)}
#themePicker.open{display:flex}
.tp-title{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
/* Call Card */
.call-card{display:flex;align-items:center;gap:11px;padding:10px 13px;min-width:190px;max-width:250px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}
.call-card-icon{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;background:rgba(255,255,255,.08)}
.call-card.completed .call-card-icon{background:rgba(34,197,94,.15)}
.call-card.missed .call-card-icon,.call-card.declined .call-card-icon,.call-card.cancelled .call-card-icon{background:rgba(239,68,68,.14)}
.call-card.calling .call-card-icon,.call-card.active .call-card-icon{background:rgba(0,255,255,.1)}
.call-card-body{flex:1;min-width:0}
.call-card-title{font-size:.84rem;font-weight:600;color:var(--text)}
.call-card-meta{font-family:'JetBrains Mono',monospace;font-size:.64rem;margin-top:3px;color:var(--dim)}
.call-card.missed .call-card-meta,.call-card.declined .call-card-meta,.call-card.cancelled .call-card-meta{color:#ef4444}
.call-card.completed .call-card-meta{color:var(--ta)}
.call-card.calling .call-card-meta,.call-card.active .call-card-meta{color:var(--tp);animation:blink 1.4s ease-in-out infinite}
/* Background sliders */
.bg-slider{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;outline:none;background:rgba(255,255,255,.12);cursor:pointer}
.bg-slider::-webkit-slider-thumb{-webkit-appearance:none;width:17px;height:17px;border-radius:50%;background:var(--tp);cursor:pointer;border:2px solid rgba(0,0,0,.65);box-shadow:0 0 8px rgba(0,255,255,.35);transition:transform .1s}
.bg-slider:hover::-webkit-slider-thumb{transform:scale(1.15)}
.bg-slider::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:var(--tp);cursor:pointer;border:2px solid rgba(0,0,0,.6)}
/* Direction picker */
.bg-dir-grid{display:grid;grid-template-columns:repeat(3,36px);gap:3px}
.bg-dir-btn{width:36px;height:36px;border-radius:7px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--dim);cursor:pointer;font-size:.92rem;display:flex;align-items:center;justify-content:center;transition:all .15s;padding:0;line-height:1}
.bg-dir-btn:hover{background:rgba(255,255,255,.09);color:var(--text)}
.bg-dir-btn.active{background:var(--tb);color:var(--tp);border-color:var(--tbh)}
.bg-preview{width:100%;height:54px;border-radius:8px;border:1px solid rgba(255,255,255,.1);margin-bottom:10px;transition:background .25s}
.bg-color-row{display:flex;align-items:center;gap:7px}
.bg-color-swatch{width:22px;height:22px;border-radius:5px;border:1px solid rgba(255,255,255,.12);flex-shrink:0;pointer-events:none;transition:background .2s}
/* Member list */
.member-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.member-av{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;flex-shrink:0;overflow:hidden}
/* WhatsApp text formatting */
.msg-bubble strong{font-weight:700}
.msg-bubble em{font-style:italic}
.msg-bubble s{text-decoration:line-through;opacity:.7}
.fmt-code{font-family:'JetBrains Mono',monospace;background:rgba(255,255,255,.1);border-radius:3px;padding:1px 5px;font-size:.82em}
.fmt-block{display:block;font-family:'JetBrains Mono',monospace;background:rgba(0,0,0,.5);border-radius:6px;padding:8px 12px;font-size:.78em;margin:4px 0;white-space:pre-wrap;word-break:break-all}
/* Read ticks */
.msg-ticks{font-size:.68rem;margin-left:4px;vertical-align:middle;transition:color .2s}
/* Typing indicator */
.typing-status{display:inline-flex;align-items:center;gap:5px;color:var(--tp);font-style:italic}
.typing-dots{display:inline-flex;gap:2px;align-items:center;margin-left:2px}
.typing-dot{width:3px;height:3px;border-radius:50%;background:var(--tp);animation:typingBounce .9s ease-in-out infinite}
.typing-dot:nth-child(2){animation-delay:.2s}.typing-dot:nth-child(3){animation-delay:.4s}
@keyframes typingBounce{0%,80%,100%{transform:scale(0.6);opacity:.4}40%{transform:scale(1);opacity:1}}
/* User ID box */
.uid-box{font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--tp);background:rgba(0,255,255,.06);border:1px solid rgba(0,255,255,.2);border-radius:6px;padding:6px 10px;word-break:break-all;user-select:all;cursor:text}
/* Group call overlay */
.gc-overlay{position:fixed;inset:0;z-index:600;background:#000;display:none;flex-direction:column}
.gc-overlay.active{display:flex}
.gc-header{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(to bottom,rgba(0,0,0,.8),transparent);z-index:5}
.gc-title{font-family:'Syne',sans-serif;font-size:.9rem;font-weight:800}
.gc-grid{width:100%;height:100%;display:grid;gap:2px;background:#0a0a0a}
.gc-grid.p1{grid-template-columns:1fr}
.gc-grid.p2{grid-template-columns:1fr 1fr}
.gc-grid.p3,.gc-grid.p4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.gc-grid.p5,.gc-grid.p6{grid-template-columns:1fr 1fr 1fr}
.gc-tile{position:relative;background:#111;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:100px}
.gc-tile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none}
.gc-tile-av{width:60px;height:60px;border-radius:50%;background:rgba(0,255,255,.1);border:2px solid rgba(0,255,255,.3);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:800;color:var(--tp)}
.gc-tile-name{position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:.68rem;background:rgba(0,0,0,.65);padding:2px 8px;border-radius:10px;width:fit-content;margin:0 auto;z-index:2}
.gc-controls{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:16px;padding:20px;background:linear-gradient(to top,rgba(0,0,0,.9),transparent);z-index:4}
.gc-muted{opacity:.5}
`;
	document.head.appendChild(css);

	// Settings panel
	const sp=document.createElement('div');sp.id='settingsOverlay';sp.className='panel-overlay';
	sp.innerHTML=`<div class="panel-drawer">
	<div class="panel-head"><span class="panel-head-title">Settings</span><button class="panel-close" onclick="App.closeSettings()">✕</button></div>
	<div class="panel-body">
		<div class="panel-section">
			<div class="panel-section-lbl">Profile</div>
			<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
				<div id="spAvatarWrap" style="flex-shrink:0"></div>
				<div style="flex:1;min-width:0"><div class="f-lbl">Display Name</div><input class="f-in" id="spName" placeholder="Your name…" maxlength="32"></div>
			</div>
			<button class="btn btn-p btn-full" onclick="App.saveName()">Save Name</button>
		</div>
		<div class="panel-section">
			<div class="panel-section-lbl">Your Chat ID (share this so others can DM you)</div>
			<div id="spUserId" class="uid-box" style="margin-bottom:8px">Sign in to see your ID</div>
			<button class="btn btn-s btn-full" onclick="App.copyUserId()">📋 Copy ID</button>
		</div>
		<div class="panel-section">
			<div class="panel-section-lbl">Preferences</div>
			<div class="sp-row">
				<div class="col" style="gap:2px"><span class="sp-label">Keep screen awake</span><span style="font-size:.65rem;color:var(--faint)">Prevents mobile disconnects</span></div>
				<label class="toggle"><input type="checkbox" id="spWakeToggle" onchange="App.handleWakeToggle()"><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
			</div>
		</div>
		<div class="panel-section">
			<div class="panel-section-lbl">Message Encryption (AES-256-GCM)</div>
			<div class="sp-row" style="margin-bottom:12px"><span class="sp-label">Enable encryption</span>
				<label class="toggle"><input type="checkbox" id="spEncToggle" onchange="App.handleEncToggle()"><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
			</div>
			<div id="spEncPwRow" style="display:none" class="col">
				<div class="f-grp"><div class="f-lbl">Shared password</div><input type="password" class="f-in" id="spEncPw" placeholder="Password…"></div>
				<button class="btn btn-p btn-full" onclick="App.applyEncKey()">Apply Key</button>
			</div>
			<div id="spEncStatus" style="font-family:'JetBrains Mono',monospace;font-size:.68rem;margin-top:8px;color:var(--faint)">Encryption off</div>
		</div>
		<div class="panel-section"><div class="panel-section-lbl">Sign In (for Firebase rooms)</div><div id="spAuthArea"></div></div>
		<div class="panel-section"><div class="panel-section-lbl">About</div>
			<div style="font-size:.78rem;color:rgba(232,237,248,.4);line-height:1.7">P2P Chat v3.6.0 · ProElectricCoder<br>WebRTC + Firebase signaling</div>
		</div>
	</div></div>`;
	sp.addEventListener('click',e=>{if(e.target===sp)App.closeSettings();});
	document.getElementById('panels').appendChild(sp);

	// New chat modal
	const nc=document.createElement('div');nc.id='newChatModal';nc.className='modal-overlay';
	nc.innerHTML=`<div class="modal-box">
	<div class="modal-head"><span class="modal-title" id="ncTitle">New Chat</span><button class="panel-close" onclick="App.closeNewChat()">✕</button></div>
	<div style="padding:12px 18px 0"><div class="tabs" id="ncTabs">
		<button class="tab active" id="ncTabDirect" onclick="App.ncSwitchTab('direct')">Direct</button>
		<button class="tab" id="ncTabRoom" onclick="App.ncSwitchTab('room')">Room</button>
		<button class="tab" id="ncTabGroup" onclick="App.ncSwitchTab('group')">Group</button>
	</div></div>
	<div class="modal-body">
		<div id="ncDirect">
			<div class="tabs" style="margin-bottom:14px"><button class="tab active" id="ncSubCaller" onclick="App.ncDirectSub('caller')">I'll Call</button><button class="tab" id="ncSubCallee" onclick="App.ncDirectSub('callee')">I'll Answer</button></div>
			<div id="ncCallerFlow" class="col">
				<div class="note-box">ℹ️ <span>Generate an offer SDP, share it with the other person, paste their answer to connect.</span></div>
				<button class="btn btn-p btn-full" onclick="App.directGenOffer()">Generate Offer SDP</button>
				<div class="f-grp hidden" id="ncOfferGroup"><div class="f-lbl">Your offer — share this</div><div class="copy-block"><textarea class="f-in" id="ncOfferSDP" readonly rows="3" style="padding-right:52px"></textarea><button class="copy-btn" onclick="App.copyField('ncOfferSDP')">copy</button></div></div>
				<div class="f-grp hidden" id="ncAnswerInputGroup"><div class="f-lbl">Paste their answer SDP</div><textarea class="f-in" id="ncAnswerInput" placeholder="Paste answer…" rows="3"></textarea><button class="btn btn-p btn-full" onclick="App.directConnect()">Connect</button></div>
			</div>
			<div id="ncCalleeFlow" class="col hidden">
				<div class="note-box">ℹ️ <span>Paste the offer from the other person, generate your answer and share it back.</span></div>
				<div class="f-grp"><div class="f-lbl">Paste their offer SDP</div><textarea class="f-in" id="ncRemoteOffer" placeholder="Paste offer…" rows="3"></textarea></div>
				<div class="f-grp"><div class="f-lbl">Chat name (optional)</div><input class="f-in" id="ncCalleeName" placeholder="Name this chat…"></div>
				<button class="btn btn-s btn-full" onclick="App.directGenAnswer()">Create Answer SDP</button>
				<div class="f-grp hidden" id="ncAnswerOutGroup"><div class="f-lbl">Your answer — send this back</div><div class="copy-block"><textarea class="f-in" id="ncAnswerSDP" readonly rows="3" style="padding-right:52px"></textarea><button class="copy-btn" onclick="App.copyField('ncAnswerSDP')">copy</button></div></div>
			</div>
		</div>
		<div id="ncRoom" class="col hidden"><div id="ncRoomAuth"></div>
			<div class="note-box" style="margin-bottom:10px">💡 <span>Use someone's <strong>Chat ID</strong> (from their Settings) as Room ID to DM them directly.</span></div>
			<div class="f-grp"><div class="f-lbl">Room ID / Chat ID</div><input class="f-in" id="ncRoomId" placeholder="room-id or user-chat-id"></div>
			<div class="row"><button class="btn btn-p" style="flex:1" onclick="App.fbCreateRoom()">Create Room</button><button class="btn btn-s" style="flex:1" onclick="App.fbJoinRoom()">Join Room</button></div>
		</div>
		<div id="ncGroup" class="col hidden"><div id="ncGroupAuth"></div>
			<div class="f-grp"><div class="f-lbl">Group Name</div><input class="f-in" id="ncGroupName" placeholder="My Group"></div>
			<div class="f-grp"><div class="f-lbl">Room ID (shared with members)</div><div class="row"><input class="f-in" id="ncGroupRoomId" placeholder="group-room-id" style="flex:1"><button class="btn btn-s" onclick="App.ncGenRoomId()" style="padding:7px 10px;flex-shrink:0">⟳</button></div></div>
			<div class="row"><button class="btn btn-p" style="flex:1" onclick="App.fbCreateGroup()">Create Group</button><button class="btn btn-s" style="flex:1" onclick="App.fbJoinGroup()">Join Group</button></div>
		</div>
	</div></div>`;
	nc.addEventListener('click',e=>{if(e.target===nc)App.closeNewChat();});
	document.getElementById('panels').appendChild(nc);

	// 1:1 Call overlay
	const co=document.createElement('div');co.id='callOverlay';co.className='call-overlay';
	co.innerHTML=`
	<video id="callRemoteVid" class="call-remote-vid" autoplay playsinline></video>
	<div id="callAudioBg" class="call-audio-bg">
		<div style="position:relative;width:120px;height:120px;display:flex;align-items:center;justify-content:center">
			<div class="call-rings"><div class="call-ring"></div><div class="call-ring"></div><div class="call-ring"></div></div>
			<div class="call-audio-av" id="callAudioInitial">P</div>
		</div>
		<div class="call-audio-peer" id="callAudioName">Peer</div>
		<div class="call-audio-status" id="callAudioStatus">Connecting…</div>
		<div class="call-timer-wrap" id="callTimer">00:00</div>
	</div>
	<video id="callLocalVid" class="call-local-vid" autoplay playsinline muted></video>
	<div class="call-badge" id="callBadge">Voice Call</div>
	<div class="call-controls">
		<button class="call-ctrl mute" id="callMuteBtn" title="Mute" onclick="App.callToggleMute()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg></button>
		<button class="call-ctrl cam hidden" id="callCamBtn" title="Hide Camera" onclick="App.callToggleCam()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" d="M15.75 10.5 20.47 5.78A.75.75 0 0 1 21.75 6.286v11.428a.75.75 0 0 1-1.28.53L15.75 13.5M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/></svg></button>
		<button class="call-ctrl src" id="callSrcBtn" title="Share Screen" onclick="App.callToggleSource()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg></button>
		<button class="call-ctrl end" title="End call" onclick="App.callEnd()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button>
	</div>`;
	document.getElementById('panels').appendChild(co);

	// Group call overlay
	const gco=document.createElement('div');gco.id='gcOverlay';gco.className='gc-overlay';
	gco.innerHTML=`
	<div class="gc-header">
		<span class="gc-title" id="gcTitle">🎤 Group Call</span>
		<span id="gcTimer" style="font-family:'JetBrains Mono',monospace;font-size:.75rem;color:var(--dim)"></span>
	</div>
	<div class="gc-grid p1" id="gcGrid"></div>
	<div class="gc-controls">
		<button class="call-ctrl mute" id="gcMuteBtn" title="Mute" onclick="App.gcToggleMute()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg></button>
		<button class="call-ctrl cam" id="gcCamBtn" title="Toggle Camera" onclick="App.gcToggleCam()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" d="M15.75 10.5 20.47 5.78A.75.75 0 0 1 21.75 6.286v11.428a.75.75 0 0 1-1.28.53L15.75 13.5M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/></svg></button>
		<button class="call-ctrl end" title="Leave call" onclick="App.gcEnd()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button>
	</div>`;
	document.getElementById('panels').appendChild(gco);

	// Incoming call/group call dialog
	const ic=document.createElement('div');ic.id='incomingDialog';ic.className='incoming-overlay';
	ic.innerHTML=`<div class="incoming-box">
		<div class="incoming-big-icon" id="incomingIcon">📞</div>
		<div class="incoming-caller" id="incomingCallerName">Peer</div>
		<div class="incoming-type" id="incomingCallType">Voice call</div>
		<div class="row" style="width:100%;gap:12px">
			<button class="btn btn-d btn-full" onclick="App.callDecline()">Decline</button>
			<button class="btn btn-p btn-full" onclick="App.callAccept()">Accept</button>
		</div>
	</div>`;
	document.getElementById('panels').appendChild(ic);

	const lb=document.createElement('div');lb.id='lightbox';lb.onclick=()=>App.closeLightbox();
	lb.innerHTML=`<img id="lbImg" src="" alt="">`;
	document.getElementById('panels').appendChild(lb);

	const tp=document.createElement('div');tp.id='themePicker';
	tp.innerHTML=`<div class="tp-title">Chat Theme</div><div class="theme-swatches" id="themeSwatches"></div>`;
	document.body.appendChild(tp);
	document.addEventListener('click',e=>{if(tp.classList.contains('open')&&!tp.contains(e.target)&&e.target.id!=='btnTheme')tp.classList.remove('open');});

	const ci=document.createElement('div');ci.id='chatInfoOverlay';ci.className='panel-overlay';
	ci.innerHTML=`<div class="panel-drawer">
	<div class="panel-head"><span class="panel-head-title">Chat Info</span><button class="panel-close" onclick="App.closeChatInfo()">✕</button></div>
	<div class="panel-body">
		<div class="panel-section" id="ciDetails"></div>
		<div class="panel-section" id="ciBgConf"></div>
		<div class="panel-section"><div class="panel-section-lbl">Theme Presets</div><div class="theme-swatches" id="ciThemeSwatches"></div></div>
		<div class="panel-section"><div class="panel-section-lbl">Members</div><div id="ciMembers"></div></div>
		<div class="panel-section col" style="gap:8px">
			<button class="btn btn-d btn-full" id="ciDisconnectBtn" onclick="App.ciDisconnect()">Disconnect</button>
			<button class="btn btn-d btn-full" onclick="App.ciDelete()">Delete Chat</button>
		</div>
	</div></div>`;
	ci.addEventListener('click',e=>{if(e.target===ci)App.closeChatInfo();});
	document.getElementById('panels').appendChild(ci);

	const capM=document.createElement('div');capM.id='captureModal';capM.className='modal-overlay';
	capM.innerHTML=`<div class="modal-box" style="max-width:340px;padding:20px">
		<video id="mcVideo" autoplay playsinline muted style="width:100%;border-radius:10px;background:#000;display:none;max-height:300px;object-fit:cover;margin-bottom:14px"></video>
		<div id="mcAudioVis" style="display:none;font-size:3.5rem;margin:20px 0;text-align:center;animation:pulseMedia 1.5s infinite alternate">🎙️</div>
		<div id="mcActions" class="col" style="width:100%;gap:8px"></div>
	</div>`;
	document.getElementById('panels').appendChild(capM);
}

// ═══════════════════════════════════════════════════════════════════════════
// 19. PANEL LOGIC
// ═══════════════════════════════════════════════════════════════════════════
function openSettings(){
	const o=el('settingsOverlay');if(!o)return;
	const ni=el('spName');if(ni)ni.value=S.displayName;
	const wt=el('spWakeToggle');if(wt)wt.checked=S.wakeLockEnabled;
	const aw=el('spAvatarWrap');
	if(aw){
		const letter=(S.displayName[0]||'?').toUpperCase();
		aw.innerHTML=S.avatarUrl
			?`<img src="${S.avatarUrl}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--tbh)" onerror="this.style.display='none'">`
			:`<div style="width:44px;height:44px;border-radius:50%;background:rgba(0,255,255,.08);border:1px solid var(--tbh);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800;color:var(--tp)">${letter}</div>`;
	}
	// Task 1: show user ID
	const uid_el=el('spUserId');
	if(uid_el)uid_el.textContent=S.user?S.user.uid:'Sign in to get your Chat ID';
	syncAuthSection('spAuthArea');o.classList.add('open');
}
function syncAuthSection(cid){
	const a=el(cid);if(!a)return;
	if(S.user){
		a.innerHTML=`<div class="auth-card" style="margin-bottom:8px"><img class="auth-av" src="${S.user.photoURL||''}" onerror="this.style.display='none'"><span class="auth-name">${escH(S.user.displayName||S.displayName)}</span></div>
		<button class="btn btn-d btn-full" onclick="App.signOut()">Sign Out</button>`;
	}else{
		a.innerHTML=`<div class="col">
			<button class="sign-in-btn" onclick="App.signInGoogle()"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23F44336' d='M15.5 8.15c0-.5-.04-1.01-.13-1.5H8v2.84h4.21a3.6 3.6 0 0 1-1.56 2.37v1.97h2.53C14.7 12.35 15.5 10.4 15.5 8.15z'/%3E%3Cpath fill='%234CAF50' d='M8 16c2.14 0 3.94-.71 5.25-1.92l-2.53-1.96c-.71.48-1.62.76-2.72.76-2.09 0-3.86-1.41-4.49-3.3H.9v2.03A7.99 7.99 0 0 0 8 16z'/%3E%3Cpath fill='%23FFC107' d='M3.51 9.58A4.8 4.8 0 0 1 3.26 8c0-.55.09-1.08.25-1.58V4.39H.9A8 8 0 0 0 0 8c0 1.29.31 2.51.9 3.61l2.61-2.03z'/%3E%3Cpath fill='%231565C0' d='M8 3.18c1.17 0 2.23.4 3.06 1.2L13.6 1.8C12.09.4 10.19-.4 8 0a8 8 0 0 0-7.1 4.39l2.62 2.03C4.14 4.6 5.91 3.18 8 3.18z'/%3E%3C/svg%3E" alt="">Sign in with Google</button>
			<button class="sign-in-btn" onclick="App.signInGitHub()"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>Sign in with GitHub</button>
		</div>`;
	}
}
const NC={tab:'direct',directSub:'caller',pendingEngine:null,pendingSessId:null};
function openNewChat(tab='direct'){
	NC.tab=tab;el('newChatModal').classList.add('open');ncSwitchTab(tab);
	if(tab==='room'||tab==='group')syncAuthSection(tab==='room'?'ncRoomAuth':'ncGroupAuth');
}
function ncSwitchTab(tab){
	NC.tab=tab;
	['direct','room','group'].forEach(t=>{
		el('ncTab'+t.charAt(0).toUpperCase()+t.slice(1))?.classList.toggle('active',t===tab);
		el('nc'+t.charAt(0).toUpperCase()+t.slice(1))?.classList.toggle('hidden',t!==tab);
	});
	el('ncTitle').textContent=tab==='direct'?'Direct Chat':tab==='room'?'Join / Create Room':'Group Chat';
}
function ncDirectSub(sub){
	NC.directSub=sub;
	el('ncSubCaller')?.classList.toggle('active',sub==='caller');el('ncSubCallee')?.classList.toggle('active',sub==='callee');
	el('ncCallerFlow')?.classList.toggle('hidden',sub!=='caller');el('ncCalleeFlow')?.classList.toggle('hidden',sub!=='callee');
}
function openThemePicker(){
	const tp=el('themePicker');if(!tp)return;
	const sw=el('themeSwatches');if(!sw)return;
	const sess=getActiveSess();
	sw.innerHTML=Object.entries(THEMES).map(([id,th])=>`<div class="t-sw${sess?.theme===id?' active':''}" title="${th.name}" style="background:${th.primary}" onclick="App.pickTheme('${id}')"></div>`).join('');
	const btn=el('btnTheme');const rect=btn?.getBoundingClientRect()||{bottom:60,right:window.innerWidth};
	tp.style.top=(rect.bottom+8)+'px';tp.style.right=(window.innerWidth-rect.right)+'px';
	tp.classList.add('open');
}

function openChatInfo(){
	const sess=getActiveSess();if(!sess)return;
	const canEdit=sess.myRole==='owner'||sess.myRole==='manager';
	const roleLabel=sess.myRole==='owner'?'👑 Owner':sess.myRole==='manager'?'⭐ Manager':'👤 Member';
	const d=el('ciDetails');
	if(d){
		d.innerHTML=`
		${sess.isGroup?`<div style="font-family:'JetBrains Mono',monospace;font-size:.65rem;color:var(--dim);margin-bottom:10px">Role: <span style="color:var(--tp)">${roleLabel}</span></div>`:''}
		<div class="panel-section-lbl">Chat Name</div>
		<div class="row" style="margin-bottom:12px">
			<input class="f-in" id="ciChatName" value="${escH(sess.name)}" placeholder="Name this chat...">
			<button class="btn btn-s" onclick="App.renameChat()">Save</button>
		</div>
		${sess.isGroup&&canEdit?`
		<div class="panel-section-lbl">Group Icon URL</div>
		<div class="row" style="margin-bottom:12px;align-items:center;gap:8px">
			${sess.groupIcon?`<img src="${escH(sess.groupIcon)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid var(--tbh)" onerror="this.style.display='none'">`:''}
			<input class="f-in" id="ciGroupIconUrl" value="${escH(sess.groupIcon||'')}" placeholder="https://… icon URL" style="flex:1">
			<button class="btn btn-s" onclick="App.saveGroupIcon()">Set</button>
		</div>`:''}
		<div class="panel-section-lbl">Details</div>
		<div class="col" style="gap:6px;font-size:.82rem;color:var(--dim)">
			<div><span style="color:var(--faint)">Type:</span> ${sess.isGroup?'Group':sess.type==='direct'?'Direct':'Firebase Room'}</div>
			${sess.roomId?`<div><span style="color:var(--faint)">Room ID:</span> <code style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--tp)">${escH(sess.roomId)}</code></div>`:''}
			<div><span style="color:var(--faint)">Status:</span> ${sess.connected?'<span style="color:var(--ta)">Connected</span>':'Disconnected'}</div>
		</div>
		${sess.roomId?`<div class="row" style="margin-top:10px;gap:7px">
			<button class="btn btn-s" style="flex:1" onclick="App.copyInviteLink()">🔗 Copy Invite Link</button>
			${S.user&&!sess.isGroup?`<button class="btn btn-s" style="flex:1" onclick="App.copyUserId()">🪪 My ID</button>`:''}
		</div>`:''}`;
	}
	const bgEnd=sess.bg?.endColor||THEMES[sess.theme]?.gradEnd||'#002233';
	const bgStart=sess.bg?.startColor||'#000000',bgPow=sess.bg?.power??2.5,bgSteps=sess.bg?.steps??20,bgDir=sess.bg?.direction||'to bottom right';
	const prevGrad=computeGrad(bgEnd,bgPow,bgSteps,bgDir,bgStart);
	const bgConf=el('ciBgConf');
	if(bgConf){
		bgConf.innerHTML=`
		<div class="panel-section-lbl">Background</div>
		<div class="bg-preview" id="ciBgPreview" style="background:${prevGrad}"></div>
		<div class="col" style="gap:14px">
			<div><div class="f-lbl" style="margin-bottom:6px">Direction</div><div class="bg-dir-grid">${makeDirGrid(bgDir)}</div></div>
			<div class="row" style="gap:10px">
				<div style="flex:1;min-width:0"><div class="f-lbl">Start</div><div class="bg-color-row" style="margin-top:5px"><div class="bg-color-swatch" id="ciBgStartSwatch" style="background:${bgStart}"></div><input type="color" id="ciBgStart" value="${bgStart}" oninput="document.getElementById('ciBgStartSwatch').style.background=this.value;App.livePreviewBg()" style="flex:1;height:28px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(0,0,0,.4);cursor:pointer;padding:0 3px"></div></div>
				<div style="flex:1;min-width:0"><div class="f-lbl">End</div><div class="bg-color-row" style="margin-top:5px"><div class="bg-color-swatch" id="ciBgEndSwatch" style="background:${bgEnd}"></div><input type="color" id="ciBgColor" value="${bgEnd}" oninput="document.getElementById('ciBgEndSwatch').style.background=this.value;App.livePreviewBg()" style="flex:1;height:28px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(0,0,0,.4);cursor:pointer;padding:0 3px"></div></div>
			</div>
			<div>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div class="f-lbl" style="margin:0">Curve power</div><code id="ciPowVal" style="font-size:.7rem;color:var(--tp);font-family:'JetBrains Mono',monospace">${bgPow.toFixed(1)}</code></div>
				<input type="range" class="bg-slider" id="ciBgPower" min="0.3" max="6" step="0.1" value="${bgPow}" oninput="document.getElementById('ciPowVal').textContent=parseFloat(this.value).toFixed(1);App.livePreviewBg()">
				<div style="display:flex;justify-content:space-between;font-size:.57rem;color:var(--faint);margin-top:3px"><span>Linear</span><span>Smooth</span><span>Sharp</span></div>
			</div>
			<div>
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div class="f-lbl" style="margin:0">Color steps</div><code id="ciStepVal" style="font-size:.7rem;color:var(--tp);font-family:'JetBrains Mono',monospace">${bgSteps}</code></div>
				<input type="range" class="bg-slider" id="ciBgSteps" min="2" max="64" step="1" value="${bgSteps}" oninput="document.getElementById('ciStepVal').textContent=this.value;App.livePreviewBg()">
				<div style="display:flex;justify-content:space-between;font-size:.57rem;color:var(--faint);margin-top:3px"><span>2</span><span>32</span><span>64</span></div>
			</div>
			<div class="row" style="gap:7px"><button class="btn btn-p" style="flex:1" onclick="App.updateBg()">Apply</button><button class="btn btn-s" onclick="App.resetBg()">↺ Reset</button></div>
		</div>`;
	}
	const cs=el('ciThemeSwatches');
	if(cs)cs.innerHTML=Object.entries(THEMES).map(([id,th])=>`<div class="t-sw${sess.theme===id?' active':''}" title="${th.name}" style="background:${th.primary}" onclick="App.pickTheme('${id}');App.closeChatInfo()"></div>`).join('');
	const cm=el('ciMembers');
	if(cm){
		const hasMeta=sess.isGroup&&Object.keys(sess.membersData||{}).length>0;
		if(hasMeta){
			const myUid=S.user?.uid,owner=sess.groupOwner,managers=sess.groupManagers||[];
			cm.innerHTML=Object.entries(sess.membersData).map(([uid,m])=>{
				const isOwner=uid===owner,isManager=managers.includes(uid),isMe=uid===myUid;
				const badge=isOwner?`<span style="color:#fbbf24;font-size:.64rem">👑 Owner</span>`:isManager?`<span style="color:var(--tp);font-size:.64rem">⭐ Manager</span>`:`<span style="color:var(--faint);font-size:.64rem">👤 Member</span>`;
				const action=sess.myRole==='owner'&&!isOwner&&!isMe?`<button class="btn btn-s" style="padding:2px 8px;font-size:.6rem" onclick="App.${isManager?'demoteManager':'promoteManager'}('${uid}')">${isManager?'Demote':'Promote'}</button>`:'';
				const avHtml=m.avatar?`<img src="${escH(m.avatar)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:(m.name||'?')[0].toUpperCase();
				return`<div class="member-row"><div class="member-av">${avHtml}</div><div style="flex:1;min-width:0"><div style="font-size:.82rem;font-weight:500">${escH(m.name||'Member')}${isMe?' <span style="opacity:.45">(you)</span>':''}</div>${badge}</div>${action}</div>`;
			}).join('');
		}else{
			const members=[...sess.peers.entries()];
			cm.innerHTML=`<div style="font-size:.82rem;color:var(--dim);line-height:1.8">`+(members.length?members.map(([,p])=>`<div>👤 ${escH(p.name)}</div>`).join('')+`<div>👤 ${escH(S.displayName)} (you)</div>`:`<div>👤 ${escH(S.displayName)} (you)</div>`)+`</div>`;
		}
	}
	const db=el('ciDisconnectBtn');if(db)db.textContent=sess.connected?'Disconnect':'Reconnect';
	el('chatInfoOverlay')?.classList.add('open');
}

// ═══════════════════════════════════════════════════════════════════════════
// 19b. GROUP METADATA
// ═══════════════════════════════════════════════════════════════════════════
function subscribeGroupMeta(sess){
	if(!sess.roomId||sess.type!=='firebase')return;
	if(sess._metaUnsub){sess._metaUnsub();sess._metaUnsub=null;}
	try{
		const unsub=firebase.firestore().collection('chatRooms').doc(sess.roomId).onSnapshot(snap=>{
			const data=snap.data();if(!data?.meta)return;
			const meta=data.meta;
			if(meta.name&&meta.name!==sess.name&&sess.isGroup){
				const old=sess.name;sess.name=meta.name;sess.groupName=meta.name;
				if(old!==meta.name)addSysMsg(sess,`Group renamed to "${meta.name}"`);
			}
			if(meta.icon!==undefined)sess.groupIcon=meta.icon||null;
			sess.groupOwner=meta.owner||null;sess.groupManagers=meta.managers||[];sess.membersData=meta.members||{};
			if(meta.owner===S.user?.uid)sess.myRole='owner';
			else if((meta.managers||[]).includes(S.user?.uid))sess.myRole='manager';
			else sess.myRole='member';
			DB.saveSession(sess);renderChatList();
			if(S.activeId===sess.id)renderTopbar(sess);
		},err=>console.warn('[GroupMeta]',err));
		sess._metaUnsub=unsub;
	}catch(e){console.warn('[GroupMeta subscribe]',e);}
}
async function writeGroupMeta(sess,partial){
	if(!sess.roomId||!S.user)return;
	try{await firebase.firestore().collection('chatRooms').doc(sess.roomId).set({meta:partial},{merge:true});}
	catch(e){console.error('[GroupMeta write]',e);toast('Update failed: '+e.message);}
}

// ═══════════════════════════════════════════════════════════════════════════
// 20. FIREBASE AUTH
// ═══════════════════════════════════════════════════════════════════════════
function initFirebase(){
	firebase.auth().onAuthStateChanged(user=>{
		S.user=user;
		if(user){
			if(!localStorage.getItem('pec_name')){S.displayName=user.displayName||'Anonymous';localStorage.setItem('pec_name',S.displayName);}
			S.avatarUrl=user.photoURL||'';localStorage.setItem('pec_avatar',S.avatarUrl);
			// Task 1: Start inbox
			Inbox.start();
			// Task 7: Handle pending invite
			if(S._pendingInvite){
				const rid=S._pendingInvite;S._pendingInvite=null;
				setTimeout(()=>_autoJoinRoom(rid),600);
			}
			// Re-subscribe firebase sessions to group meta
			S.sessions.forEach(sess=>{
				if(sess.type==='firebase'&&sess.roomId)subscribeGroupMeta(sess);
			});
		}else{
			Inbox.stop();
		}
		syncAuthSection('spAuthArea');syncAuthSection('ncRoomAuth');syncAuthSection('ncGroupAuth');
	});
}

async function _autoJoinRoom(rid){
	if(!S.user){toast('Sign in to join via invite link');return;}
	const existing=findSessByRoomId(rid,false);
	if(existing){await selectSess(existing.id);toast('Opened existing room');return;}
	const sess=makeSess({name:rid,type:'firebase',roomId:rid});
	const eng=new ChatEngine();eng.init(firebase.firestore());
	S.sessions.set(sess.id,sess);bindEngine(sess,eng);
	try{
		await eng.joinRoom(rid);
		await writeGroupMeta(sess,{members:{[S.user.uid]:{name:S.displayName,avatar:S.avatarUrl,role:'member',joinedAt:Date.now()}}});
		subscribeGroupMeta(sess);
		await DB.saveSession(sess);await selectSess(sess.id);toast('Joined via invite link ✓');
	}catch(e){toast('Could not join: '+e.message);S.sessions.delete(sess.id);}
}

// ═══════════════════════════════════════════════════════════════════════════
// 21. UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function el(id){return document.getElementById(id);}
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtTime(ts){return new Date(ts).toLocaleTimeString('default',{hour:'2-digit',minute:'2-digit'});}
function fmtSz(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function isMobile(){return window.innerWidth<=700;}
function openSidebarUI(){el('sidebar')?.classList.add('open');el('sidebarBackdrop')?.classList.add('open');}
function closeSidebarUI(){el('sidebar')?.classList.remove('open');el('sidebarBackdrop')?.classList.remove('open');}
function relTime(ts){const d=Date.now()-ts,m=Math.floor(d/60000),h=Math.floor(d/3600000);if(d<60000)return'now';if(d<3600000)return m+'m';if(d<86400000)return h+'h';return new Date(ts).toLocaleDateString('default',{month:'short',day:'numeric'});}
function bufB64(ab){const u8=new Uint8Array(ab);let s='';const B=8192;for(let i=0;i<u8.length;i+=B)s+=String.fromCharCode(...u8.subarray(i,i+B));return btoa(s);}
function b64Buf(b64){const bin=atob(b64);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return u8.buffer;}
let _toastTmr=null;
function toast(msg,ms=3000){const e=el('toast');if(!e)return;e.textContent=msg;e.classList.add('show');clearTimeout(_toastTmr);_toastTmr=setTimeout(()=>e.classList.remove('show'),ms);}
async function requestWakeLock(){
	if(!S.wakeLockEnabled||!('wakeLock' in navigator))return;
	try{S.wakeLockObj=await navigator.wakeLock.request('screen');}catch(e){console.warn('Wake Lock failed:',e);}
}
function releaseWakeLock(){if(S.wakeLockObj){S.wakeLockObj.release().catch(()=>{});S.wakeLockObj=null;}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.wakeLockEnabled)requestWakeLock();});

// ═══════════════════════════════════════════════════════════════════════════
// 22. window.App
// ═══════════════════════════════════════════════════════════════════════════
window.App={
	openSidebar(){openSidebarUI();},
	closeSidebar(){closeSidebarUI();},
	filterChats(q){S.filterQ=q;renderChatList();},
	async selectChat(id){await selectSess(id,true);},
	pickTheme(id){const sess=getActiveSess();if(!sess)return;setThemeForSess(sess.id,id);el('themePicker')?.classList.remove('open');},
	newChat(tab){openNewChat(tab);},
	closeNewChat(){el('newChatModal')?.classList.remove('open');NC.pendingEngine=null;NC.pendingSessId=null;},
	ncSwitchTab(t){ncSwitchTab(t);},
	ncDirectSub(s){ncDirectSub(s);},
	ncGenRoomId(){const i=el('ncGroupRoomId');if(i)i.value='room-'+Math.random().toString(36).slice(2,8);},
	async directGenOffer(){
		const eng=new DirectEngine(),sessId='sess_'+Date.now()+'_'+uid();
		const sess=makeSess({id:sessId,name:'Direct Chat',type:'direct'});
		S.sessions.set(sessId,sess);NC.pendingEngine=eng;NC.pendingSessId=sessId;
		bindEngine(sess,eng);setStatus('connecting','Generating offer…');
		try{
			const offer=await eng.createOffer();
			el('ncOfferSDP').value=offer;
			el('ncOfferGroup')?.classList.remove('hidden');el('ncAnswerInputGroup')?.classList.remove('hidden');
			await DB.saveSession(sess);renderChatList();toast('Offer generated — share it with your peer');
		}catch(e){toast('Error: '+e.message);S.sessions.delete(sessId);}
	},
	async directConnect(){
		const ans=el('ncAnswerInput')?.value.trim();if(!ans){toast('Paste the answer SDP first');return;}
		const eng=NC.pendingEngine;if(!eng){toast('Generate an offer first');return;}
		try{await eng.setAnswer(ans);this.closeNewChat();toast('Connecting…');}catch(e){toast('Error: '+e.message);}
	},
	async directGenAnswer(){
		const offer=el('ncRemoteOffer')?.value.trim();if(!offer){toast('Paste the remote offer first');return;}
		const name=el('ncCalleeName')?.value.trim()||'Direct Chat';
		const eng=new DirectEngine(),sess=makeSess({name,type:'direct'});
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);
		try{
			const answer=await eng.createAnswerFor(offer);
			el('ncAnswerSDP').value=answer;el('ncAnswerOutGroup')?.classList.remove('hidden');
			await DB.saveSession(sess);renderChatList();toast('Answer generated — send it back');
		}catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async fbCreateRoom(){
		if(!S.user){toast('Sign in first');return;}
		const rid=el('ncRoomId')?.value.trim()||'room-'+Math.random().toString(36).slice(2,8);
		// Task 4: dedup
		const existing=findSessByRoomId(rid,false);
		if(existing){
			if(!existing.connected){const eng=new ChatEngine();eng.init(firebase.firestore());bindEngine(existing,eng);(existing.isHost?eng.createRoom(rid):eng.joinRoom(rid)).catch(e=>toast(e.message));subscribeGroupMeta(existing);}
			await selectSess(existing.id);this.closeNewChat();return;
		}
		const sess=makeSess({name:rid,type:'firebase',roomId:rid});
		sess.isHost=true;sess.myRole='owner';sess.groupOwner=S.user.uid;
		const eng=new ChatEngine();eng.init(firebase.firestore());
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);setStatus('connecting','Waiting for peers…');
		try{
			await eng.createRoom(rid);
			await writeGroupMeta(sess,{name:rid,icon:'',owner:S.user.uid,managers:[],members:{[S.user.uid]:{name:S.displayName,avatar:S.avatarUrl,role:'owner',joinedAt:Date.now()}}});
			subscribeGroupMeta(sess);
			await DB.saveSession(sess);await selectSess(sess.id);this.closeNewChat();
			addSysMsg(sess,`Room "${rid}" created — share this ID`);toast('Room created');
		}catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async fbJoinRoom(){
		if(!S.user){toast('Sign in first');return;}
		const rid=el('ncRoomId')?.value.trim();if(!rid){toast('Enter a room ID');return;}
		// Task 4: dedup
		const existing=findSessByRoomId(rid,false);
		if(existing){
			if(!existing.connected){const eng=new ChatEngine();eng.init(firebase.firestore());bindEngine(existing,eng);eng.joinRoom(rid).catch(e=>toast(e.message));subscribeGroupMeta(existing);}
			await selectSess(existing.id);this.closeNewChat();return;
		}
		const sess=makeSess({name:rid,type:'firebase',roomId:rid});
		const eng=new ChatEngine();eng.init(firebase.firestore());
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);setStatus('connecting','Joining room…');
		try{
			await eng.joinRoom(rid);
			await writeGroupMeta(sess,{members:{[S.user.uid]:{name:S.displayName,avatar:S.avatarUrl,role:'member',joinedAt:Date.now()}}});
			subscribeGroupMeta(sess);
			await DB.saveSession(sess);await selectSess(sess.id);this.closeNewChat();
		}catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async fbCreateGroup(){
		if(!S.user){toast('Sign in first');return;}
		const gname=el('ncGroupName')?.value.trim()||'My Group';
		const rid=el('ncGroupRoomId')?.value.trim()||'grp-'+Math.random().toString(36).slice(2,8);
		// Task 4: dedup
		const existing=findSessByRoomId(rid,true);
		if(existing){await selectSess(existing.id);this.closeNewChat();return;}
		const sess=makeSess({name:gname,type:'firebase',isGroup:true,roomId:rid,groupName:gname});
		sess.isHost=true;sess.myRole='owner';sess.groupOwner=S.user.uid;
		const eng=new ChatEngine({relay:true});eng.init(firebase.firestore());
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);
		try{
			await eng.createRoom(rid);
			await writeGroupMeta(sess,{name:gname,icon:'',owner:S.user.uid,ownerName:S.displayName,ownerAvatar:S.avatarUrl,managers:[],members:{[S.user.uid]:{name:S.displayName,avatar:S.avatarUrl,role:'owner',joinedAt:Date.now()}},createdAt:firebase.firestore.FieldValue.serverTimestamp()});
			subscribeGroupMeta(sess);
			await DB.saveSession(sess);await selectSess(sess.id);this.closeNewChat();
			addSysMsg(sess,`Group "${gname}" created · Room: ${rid}`);toast('Group created');
		}catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async fbJoinGroup(){
		if(!S.user){toast('Sign in first');return;}
		const rid=el('ncGroupRoomId')?.value.trim();if(!rid){toast('Enter room ID');return;}
		const existing=findSessByRoomId(rid,true);
		if(existing){await selectSess(existing.id);this.closeNewChat();return;}
		const gname=el('ncGroupName')?.value.trim()||rid;
		const sess=makeSess({name:gname,type:'firebase',isGroup:true,roomId:rid,groupName:gname});
		const eng=new ChatEngine({relay:false});eng.init(firebase.firestore());
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);
		try{
			await eng.joinRoom(rid);
			await writeGroupMeta(sess,{members:{[S.user.uid]:{name:S.displayName,avatar:S.avatarUrl,role:'member',joinedAt:Date.now()}}});
			subscribeGroupMeta(sess);
			await DB.saveSession(sess);await selectSess(sess.id);this.closeNewChat();
		}catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async sendMsg(){
		const inp=el('msgInput');const text=inp?.value.trim();
		const sess=getActiveSess();if(!sess?.connected){toast('Not connected');return;}
		// Stop typing indicator
		if(sess?.connected){safeSend(sess,{type:'typing-stop',displayName:S.displayName});}
		clearTimeout(this._typingTimer);
		if(text){
			let payload=text,enc=false;
			if(S.encEnabled&&Crypt.key){try{payload=await Crypt.encText(text);enc=true;}catch(e){toast('Encrypt error: '+e.message);return;}}
			safeSend(sess,{type:'chat',text:payload,encrypted:enc,displayName:S.displayName});
			addBubble(sess,text,S.displayName,true,enc);
			if(inp){inp.value='';inp.style.height='auto';}
		}
		if(FQ.items.length>0){
			const batchId=FQ.items.length>1?'batch_'+Date.now():null;
			const toSend=[...FQ.items];FQ.clear();
			for(const{file}of toSend)await sendFile(file,sess,batchId);
		}
	},
	// Typing indicator (Task 5)
	_typingTimer:null,
	onTyping(){
		const sess=getActiveSess();if(!sess?.connected)return;
		safeSend(sess,{type:'typing',displayName:S.displayName});
		clearTimeout(this._typingTimer);
		this._typingTimer=setTimeout(()=>{if(sess?.connected)safeSend(sess,{type:'typing-stop',displayName:S.displayName});},2000);
	},
	async renameChat(){
		const sess=getActiveSess();if(!sess)return;
		const newName=el('ciChatName')?.value.trim();if(!newName)return;
		sess.name=newName;if(sess.isGroup)sess.groupName=newName;
		DB.saveSession(sess);
		if(sess.roomId&&S.user&&(sess.myRole==='owner'||sess.myRole==='manager'))await writeGroupMeta(sess,{name:newName});
		renderChatList();renderTopbar(sess);toast('Chat renamed');
	},
	livePreviewBg(){
		const endC=el('ciBgColor')?.value||'#002233',stC=el('ciBgStart')?.value||'#000000';
		const p=parseFloat(el('ciBgPower')?.value||2.5),steps=parseInt(el('ciBgSteps')?.value||20);
		const sess=getActiveSess(),dir=sess?.bg?.direction||'to bottom right';
		const grad=computeGrad(endC,p,steps,dir,stC);
		const prev=el('ciBgPreview');if(prev)prev.style.background=grad;
	},
	setBgDir(dir){
		const sess=getActiveSess();if(!sess)return;
		if(!sess.bg)sess.bg={};sess.bg.direction=dir;
		document.querySelectorAll('.bg-dir-btn').forEach(b=>b.classList.toggle('active',b.title===dir));
		this.livePreviewBg();
	},
	updateBg(){
		const sess=getActiveSess();if(!sess)return;
		if(!sess.bg)sess.bg={};
		sess.bg.endColor=el('ciBgColor').value;sess.bg.startColor=el('ciBgStart')?.value||'#000000';
		sess.bg.power=parseFloat(el('ciBgPower').value);sess.bg.steps=parseInt(el('ciBgSteps').value);
		DB.saveSession(sess);applyTheme(sess.theme,sess);this.livePreviewBg();
	},
	resetBg(){const sess=getActiveSess();if(!sess)return;sess.bg=null;DB.saveSession(sess);applyTheme(sess.theme,sess);openChatInfo();},
	async saveGroupIcon(){
		const sess=getActiveSess();if(!sess||!sess.roomId)return;
		const icon=el('ciGroupIconUrl')?.value.trim()||'';
		sess.groupIcon=icon||null;await writeGroupMeta(sess,{icon});
		DB.saveSession(sess);if(S.activeId===sess.id)renderTopbar(sess);renderChatList();toast('Group icon updated');
	},
	async promoteManager(uid){
		const sess=getActiveSess();if(!sess||sess.myRole!=='owner')return;
		const managers=[...(sess.groupManagers||[])];if(!managers.includes(uid))managers.push(uid);
		await writeGroupMeta(sess,{managers});toast('Promoted to manager');
	},
	async demoteManager(uid){
		const sess=getActiveSess();if(!sess||sess.myRole!=='owner')return;
		const managers=(sess.groupManagers||[]).filter(m=>m!==uid);
		await writeGroupMeta(sess,{managers});toast('Demoted from manager');
	},
	async openCapture(type){
		MC.type=type;const mo=el('captureModal');mo.classList.add('open');
		const vid=el('mcVideo'),vis=el('mcAudioVis'),acts=el('mcActions');
		vid.style.display=type==='audio'?'none':'block';vis.style.display=type==='audio'?'block':'none';
		acts.innerHTML=`<div style="text-align:center;font-size:0.8rem;color:var(--faint)">Accessing media...</div>`;
		try{
			MC.stream=await navigator.mediaDevices.getUserMedia({audio:true,video:type!=='audio'});
			if(type!=='audio')vid.srcObject=MC.stream;
			if(type==='camera'){
				acts.innerHTML=`<button class="btn btn-p btn-full" onclick="App.capturePhoto()">📸 Take Photo</button>
					<button class="btn btn-d btn-full" style="background:rgba(255,68,85,.15)" onclick="App.startRecord('video')">🔴 Record Video</button>
					<button class="btn btn-s btn-full" onclick="App.closeCapture()">Cancel</button>`;
			}else{
				acts.innerHTML=`<button class="btn btn-d btn-full" style="background:rgba(255,68,85,.15)" onclick="App.startRecord('audio')">🔴 Record Audio</button>
					<button class="btn btn-s btn-full" onclick="App.closeCapture()">Cancel</button>`;
			}
		}catch(e){acts.innerHTML=`<div style="color:#ff4455;font-size:0.8rem;margin-bottom:10px;text-align:center">Error: ${e.message}</div><button class="btn btn-s btn-full" onclick="App.closeCapture()">Close</button>`;}
	},
	closeCapture(){el('captureModal')?.classList.remove('open');if(MC.stream)MC.stream.getTracks().forEach(t=>t.stop());MC.stream=null;MC.recorder=null;MC.chunks=[];},
	capturePhoto(){
		const vid=el('mcVideo'),canvas=document.createElement('canvas');
		canvas.width=vid.videoWidth;canvas.height=vid.videoHeight;canvas.getContext('2d').drawImage(vid,0,0);
		canvas.toBlob(blob=>{FQ.add([new File([blob],`Photo_${Date.now()}.jpg`,{type:'image/jpeg'})]);App.closeCapture();},'image/jpeg',0.9);
	},
	startRecord(recType){
		MC.chunks=[];
		try{
			MC.recorder=new MediaRecorder(MC.stream);
			MC.recorder.ondataavailable=e=>{if(e.data.size>0)MC.chunks.push(e.data);};
			MC.recorder.onstop=()=>{
				const mime=recType==='audio'?'audio/webm':'video/webm';
				FQ.add([new File(MC.chunks,`${recType.charAt(0).toUpperCase()+recType.slice(1)}_${Date.now()}.webm`,{type:mime})]);
				App.closeCapture();
			};
			MC.recorder.start();
			el('mcActions').innerHTML=`<button class="btn btn-d btn-full" onclick="App.stopRecord()">⏹ Stop Recording</button>`;
		}catch(e){toast('MediaRecorder error: '+e.message);}
	},
	stopRecord(){if(MC.recorder&&MC.recorder.state!=='inactive')MC.recorder.stop();},
	openFilePicker(){el('fileInput')?.click();},
	handleFileSelect(fs){FQ.add([...fs]);},
	handleDrop(e){e.preventDefault();FQ.add([...(e.dataTransfer.files||[])]);},
	removeQueuedFile(id){FQ.remove(id);},
	copyField(id){const e=el(id);if(e)navigator.clipboard.writeText(e.value).then(()=>toast('Copied'));},
	// Task 7: Invite link
	copyInviteLink(){
		const sess=getActiveSess();if(!sess?.roomId){toast('No room to link');return;}
		const b64=btoa(sess.roomId);
		const url=`${location.origin}${location.pathname}?invite=${encodeURIComponent(b64)}`;
		navigator.clipboard.writeText(url).then(()=>toast('Invite link copied!')).catch(()=>prompt('Copy this link:',url));
	},
	// Task 1: Copy user ID
	copyUserId(){
		const uid_val=S.user?.uid;
		if(!uid_val){toast('Sign in to get your Chat ID');return;}
		navigator.clipboard.writeText(uid_val).then(()=>toast('Chat ID copied!')).catch(()=>prompt('Your Chat ID:',uid_val));
	},
	startCall(type){initiateCall(type);},
	callAccept(){
		const d=el('incomingDialog');
		if(d?.dataset.isGroup==='1'){acceptGroupCall();return;}
		acceptCall();
	},
	callDecline(){
		const d=el('incomingDialog');
		if(d?.dataset.isGroup==='1'){declineGroupCall();return;}
		rejectCall();
	},
	callEnd(){
		const s=S.sessions.get(S.callSessId);if(!s)return;
		const reason=s.call.state==='active'?'completed':'cancelled';
		const dur=(s.call.state==='active'&&S.callStarted)?Math.floor((Date.now()-S.callStarted)/1000):0;
		if(s.call.cardMsgId)updateCallCard(s,s.call.cardMsgId,reason,dur);
		endCallInternal(s,true,null,true);
	},
	callToggleMute(){toggleCallMute();},
	callToggleCam(){toggleCallCam();},
	callToggleSource(){callToggleSource();},
	// Group call controls
	gcToggleMute(){
		const sess=S.sessions.get(S.gcSessId);if(!sess)return;
		const gc=sess.gc;
		const muted=!el('gcMuteBtn').classList.contains('active');
		gc.localStream?.getAudioTracks().forEach(t=>t.enabled=!muted);
		el('gcMuteBtn').classList.toggle('active',muted);el('gcMuteBtn').title=muted?'Unmute':'Mute';
	},
	gcToggleCam(){
		const sess=S.sessions.get(S.gcSessId);if(!sess)return;
		const gc=sess.gc;
		const off=!el('gcCamBtn').classList.contains('active');
		gc.localStream?.getVideoTracks().forEach(t=>t.enabled=!off);
		el('gcCamBtn').classList.toggle('active',off);el('gcCamBtn').title=off?'Show Camera':'Hide Camera';
	},
	gcEnd(){const sess=S.sessions.get(S.gcSessId);if(sess)_gcCleanup(sess);},
	startAudioVisualizer(stream){
		this.stopAudioVisualizer();
		try{
			const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
			const ctx=new AC(),analyser=ctx.createAnalyser();analyser.fftSize=256;
			const clone=stream.clone(),source=ctx.createMediaStreamSource(clone);source.connect(analyser);
			const callSess=S.sessions.get(S.callSessId);if(!callSess)return;
			callSess.call.audioCtx=ctx;callSess.call.audioAnalyser=analyser;callSess.call.audioSource=source;
			const dataArray=new Uint8Array(analyser.frequencyBinCount);
			const rings=document.querySelectorAll('.call-ring');rings.forEach(r=>r.classList.add('vol-active'));
			function draw(){
				if(!callSess||callSess.call.state!=='active')return;
				callSess.call.audioDrawTimer=requestAnimationFrame(draw);
				analyser.getByteFrequencyData(dataArray);
				let sum=0;for(let i=0;i<dataArray.length;i++)sum+=dataArray[i];
				const avg=sum/dataArray.length,intensity=avg/60;
				if(rings[0])rings[0].style.transform=`scale(${Math.min(1+intensity*.15,1.5)})`;
				if(rings[1])rings[1].style.transform=`scale(${Math.min(1+intensity*.4,2.2)})`;
				if(rings[2])rings[2].style.transform=`scale(${Math.min(1+intensity*.8,3.2)})`;
			}
			draw();
		}catch(e){console.warn('[AudioViz]',e);}
	},
	stopAudioVisualizer(){
		const callSess=S.sessions.get(S.callSessId);
		if(callSess){
			if(callSess.call.audioDrawTimer)cancelAnimationFrame(callSess.call.audioDrawTimer);
			if(callSess.call.audioSource)callSess.call.audioSource.disconnect();
			if(callSess.call.audioCtx&&callSess.call.audioCtx.state!=='closed')callSess.call.audioCtx.close().catch(()=>{});
			callSess.call.audioCtx=null;callSess.call.audioAnalyser=null;callSess.call.audioSource=null;callSess.call.audioDrawTimer=null;
		}
		document.querySelectorAll('.call-ring').forEach(r=>{r.classList.remove('vol-active');r.style.transform='';});
	},
	openSettings(){openSettings();},
	closeSettings(){el('settingsOverlay')?.classList.remove('open');},
	saveName(){
		const n=el('spName')?.value.trim()||'Anonymous';S.displayName=n;localStorage.setItem('pec_name',n);
		const sess=getActiveSess();if(sess?.connected)safeSend(sess,{type:'display-name',displayName:n});
		toast('Name saved');
	},
	handleWakeToggle(){
		S.wakeLockEnabled=el('spWakeToggle')?.checked;localStorage.setItem('pec_wakelock',S.wakeLockEnabled);
		if(S.wakeLockEnabled)requestWakeLock();else releaseWakeLock();
	},
	handleEncToggle(){
		const on=el('spEncToggle')?.checked;
		el('spEncPwRow').style.display=on?'block':'none';
		if(!on){Crypt.clear();S.encEnabled=false;el('spEncStatus').textContent='Encryption off';el('spEncStatus').style.color='var(--faint)';}
	},
	async applyEncKey(){
		const pw=el('spEncPw')?.value.trim();if(!pw){toast('Enter a password');return;}
		try{await Crypt.derive(pw);S.encEnabled=true;el('spEncStatus').textContent='🔒 Key active';el('spEncStatus').style.color='var(--ta)';toast('Encryption key applied');}
		catch(e){toast('Key error: '+e.message);}
	},
	async signInGoogle(){try{await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());}catch(e){toast(e.message);}},
	async signInGitHub(){try{await firebase.auth().signInWithPopup(new firebase.auth.GithubAuthProvider());}catch(e){toast(e.message);}},
	async signOut(){
		Inbox.stop();
		await firebase.auth().signOut();
		const sess=getActiveSess();if(sess){sess.engine?.disconnect();sess.connected=false;}
		syncAuthSection('spAuthArea');toast('Signed out');
	},
	openThemePicker(){openThemePicker();},
	openChatInfo(){openChatInfo();},
	closeChatInfo(){el('chatInfoOverlay')?.classList.remove('open');},
	ciDisconnect(){
		const sess=getActiveSess();if(!sess)return;
		if(sess.connected){
			sess._metaUnsub?.();sess._metaUnsub=null;
			sess.engine?.disconnect();sess.connected=false;
			setStatus('disconnected','Disconnected');enableCallBtns(false);
		}else{
			if(sess.type==='direct'){toast('Create a new offer to reconnect direct chats');return;}
			if(!S.user){toast('Sign in to reconnect to rooms');return;}
			const eng=new ChatEngine({relay:sess.isGroup});eng.init(firebase.firestore());
			bindEngine(sess,eng);setStatus('connecting','Reconnecting...');
			if(sess.isHost)eng.createRoom(sess.roomId).catch(e=>toast(e.message));
			else eng.joinRoom(sess.roomId).catch(e=>toast(e.message));
			subscribeGroupMeta(sess);
		}
		this.closeChatInfo();renderChatList();
	},
	ciDelete(){const sess=getActiveSess();if(sess){this.closeChatInfo();deleteSess(sess.id);}},
	openLightbox(src){el('lbImg').src=src;el('lightbox').classList.add('open');},
	closeLightbox(){el('lightbox').classList.remove('open');},
	previewBg(){this.livePreviewBg();},
};

// ═══════════════════════════════════════════════════════════════════════════
// 23. INIT
// ═══════════════════════════════════════════════════════════════════════════
(async function init(){
	// Task 7: Check URL invite param before anything else
	const inviteParam=new URLSearchParams(location.search).get('invite');
	if(inviteParam){
		let rid=inviteParam;
		try{rid=atob(inviteParam);}catch{}
		S._pendingInvite=rid.trim();
		history.replaceState({},'',location.pathname);
	}

	injectPanels();
	try{const mod=await import('https://proelectriccoder.github.io/ElectronCSS/CubicGradient.js');S.cubicGradFn=mod.cubicGradient;}catch{}
	applyTheme('void',null,false);
	initFirebase();
	if(S.wakeLockEnabled)requestWakeLock();
	try{
		const saved=await DB.getSessions();
		// Task 4: dedup on load — keep one session per roomId
		const seenRoomIds=new Set();
		for(const sd of saved){
			if(sd.roomId&&!sd.isGroup){
				if(seenRoomIds.has(sd.roomId))continue; // skip duplicate
				seenRoomIds.add(sd.roomId);
			}
			const sess=makeSess(sd);
			S.sessions.set(sess.id,sess);
		}
		renderChatList();
	}catch(e){console.warn('[DB] load failed:',e);}
})();
