/**
 * app.js — P2P Chat v3.2.0
 * Multi-chat · IndexedDB · 6 themes · Groups · Calls · GZIP files · Preview cards
 * Pure P2P with robust ICE Candidate Queueing & Error Logging
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

const THEMES = {
	void:     {name:'Void',     primary:'#00ffff',secondary:'#3d6eff',accent:'#00ff99',gradEnd:'#002233'},
	amethyst: {name:'Amethyst', primary:'#a855f7',secondary:'#7c3aed',accent:'#e879f9',gradEnd:'#1a0033'},
	emerald:  {name:'Emerald',  primary:'#10b981',secondary:'#059669',accent:'#34d399',gradEnd:'#001a0f'},
	amber:    {name:'Amber',    primary:'#f59e0b',secondary:'#d97706',accent:'#fbbf24',gradEnd:'#1a0f00'},
	crimson:  {name:'Crimson',  primary:'#f43f5e',secondary:'#e11d48',accent:'#fb7185',gradEnd:'#1a0010'},
	sapphire: {name:'Sapphire', primary:'#3b82f6',secondary:'#1d4ed8',accent:'#60a5fa',gradEnd:'#001133'},
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
	if(mime.includes('pdf'))                              return FICONS.pdf;
	if(mime.startsWith('image/'))                         return FICONS.image;
	if(mime.startsWith('audio/'))                         return FICONS.audio;
	if(mime.startsWith('video/'))                         return FICONS.video;
	if(/zip|archive|rar|7z|tar/.test(mime))               return FICONS.archive;
	if(/spreadsheet|excel|csv/.test(mime))                return FICONS.sheet;
	if(/presentation|powerpoint/.test(mime))              return FICONS.slides;
	if(/javascript|json|html|css|typescript|xml/.test(mime)) return FICONS.code;
	return FICONS.generic;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. GZIP HELPERS
// ═══════════════════════════════════════════════════════════════════════════
async function gzip(ab) {
	const cs = new CompressionStream('gzip');
	const w = cs.writable.getWriter();
	w.write(new Uint8Array(ab)); w.close();
	const chunks = []; const r = cs.readable.getReader();
	for(;;){const{done,value}=await r.read();if(done)break;chunks.push(value);}
	const len = chunks.reduce((s,c)=>s+c.length,0);
	const out = new Uint8Array(len); let off=0;
	for(const c of chunks){out.set(c,off);off+=c.length;}
	return out.buffer;
}
async function gunzip(ab) {
	const ds = new DecompressionStream('gzip');
	const w = ds.writable.getWriter();
	w.write(new Uint8Array(ab)); w.close();
	const chunks=[]; const r=ds.readable.getReader();
	for(;;){const{done,value}=await r.read();if(done)break;chunks.push(value);}
	const len=chunks.reduce((s,c)=>s+c.length,0);
	const out=new Uint8Array(len); let off=0;
	for(const c of chunks){out.set(c,off);off+=c.length;}
	return out.buffer;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. INDEXEDDB
// ═══════════════════════════════════════════════════════════════════════════
const DB = {
	_db:null,
	async _open(){
		if(this._db)return this._db;
		this._db=await new Promise((res,rej)=>{
			const r=indexedDB.open('PECChatDB',2);
			r.onupgradeneeded=e=>{
				const d=e.target.result;
				if(!d.objectStoreNames.contains('sessions'))d.createObjectStore('sessions',{keyPath:'id'});
				if(!d.objectStoreNames.contains('messages')){
					const ms=d.createObjectStore('messages',{keyPath:'id'});
					ms.createIndex('sessionId','sessionId');
				}
			};
			r.onsuccess=e=>res(e.target.result);
			r.onerror=e=>rej(e.target.error);
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
		}));
	},
	async saveMessage(m){
		const db=await this._open();
		const toSave={...m};
		if(toSave.file){
			toSave.file={...toSave.file};
			delete toSave.file.blobUrl; // session-only URL, not persisted
			if(toSave.file.dataUrl&&(toSave.file.size>512*1024||!toSave.file.mime?.startsWith('image/')))
				delete toSave.file.dataUrl;
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
};
function makeSess(opts){
	return{
		id:opts.id||'sess_'+Date.now()+'_'+uid(),
		name:opts.name||'New Chat',type:opts.type||'firebase',
		isGroup:opts.isGroup||false,theme:opts.theme||'void',
		createdAt:opts.createdAt||Date.now(),lastActivity:opts.lastActivity||Date.now(),
		lastMessage:opts.lastMessage||null,roomId:opts.roomId||null,groupName:opts.groupName||null,
		isHost:false,engine:null,connected:false,
		peers:new Map(),messages:[],unread:0,
		inFiles:new Map(),
		call:{mediaPc:null,localStream:null,type:null,sourceType:null,
		      state:'idle',muted:false,camOff:false,incoming:null,
		      iceQueue:[] // Queue incoming ICE candidates if the PC isn't initialized yet
		},
	};
}
function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}

// ═══════════════════════════════════════════════════════════════════════════
// 8. FILE QUEUE
// ═══════════════════════════════════════════════════════════════════════════
const FQ={
	items:[],
	add(files){
		for(const f of files)this.items.push({id:uid(),file:f,url:URL.createObjectURL(f)});
		renderFQ();
	},
	remove(id){
		const i=this.items.find(x=>x.id===id);if(i)URL.revokeObjectURL(i.url);
		this.items=this.items.filter(x=>x.id!==id);renderFQ();
	},
	clear(){
		this.items.forEach(i=>URL.revokeObjectURL(i.url));
		this.items=[];renderFQ();
	},
};
function renderFQ(){
	const wrap=el('fqWrap');if(!wrap)return;
	wrap.classList.toggle('has-files',FQ.items.length>0);
	wrap.innerHTML=FQ.items.map(item=>{
		const pt=previewType(item.file.type,item.file.name);
		const fi=getFileIcon(item.file.type);
		const thumb=pt==='image'
			?`<img src="${item.url}" alt="">`
			:`<svg class="fq-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="${fi.color}">${fi.svg}</svg>`;
		const short=item.file.name.length>9?item.file.name.slice(0,8)+'…':item.file.name;
		return`<div class="fq-item">
			<div class="fq-thumb" style="${pt!=='image'?'background:'+fi.bg:''}">${thumb}</div>
			<div class="fq-lbl">${escH(short)}</div>
			<button class="fq-rm" onclick="App.removeQueuedFile('${item.id}')" title="Remove">×</button>
		</div>`;
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
	return({js:'javascript',ts:'typescript',jsx:'jsx',tsx:'tsx',py:'python',java:'java',
		c:'c',cpp:'cpp',cs:'csharp',go:'go',rs:'rust',rb:'ruby',php:'php',json:'json',
		xml:'xml',yaml:'yaml',yml:'yaml',sh:'bash',bash:'bash',css:'css',scss:'scss',
		less:'less',html:'markup',htm:'markup',md:'markdown',sql:'sql',graphql:'graphql',
		vue:'markup',svelte:'markup',toml:'toml',ini:'ini',dockerfile:'docker',
	})[ext]||'plain';
}

function buildFileCard(meta,url,sending=false,progress=0,batchFiles=[]){
	const pt=previewType(meta.mime,meta.name);
	const fi=getFileIcon(meta.mime);
	const batchAttr=escH(JSON.stringify(batchFiles));
	let preview='';
	if(url&&pt!=='generic'){
		switch(pt){
			case'image':
				preview=`<div class="fp-preview"><img src="${url}" alt="${escH(meta.name)}" loading="lazy" onclick="App.openLightbox('${url}')"></div>`;
				break;
			case'video':
				preview=`<div class="fp-preview"><video src="${url}" controls preload="metadata"></video></div>`;
				break;
			case'audio':
				preview=`<div class="fp-preview fp-audio"><audio src="${url}" controls></audio></div>`;
				break;
			case'pdf':
				preview=`<div class="fp-preview fp-doc"><iframe src="${url}" sandbox="allow-scripts allow-same-origin" title="${escH(meta.name)}"></iframe></div>`;
				break;
			case'html':
				preview=`<div class="fp-preview fp-doc fp-html-lazy" data-src="${url}" data-batch="${batchAttr}"><div class="fp-spinner">Loading preview…</div></div>`;
				break;
			case'code':
			case'text':{
				const ext=(meta.name.split('.').pop()||'').toLowerCase();
				preview=`<div class="fp-preview fp-code-wrap fp-text-lazy" data-src="${url}" data-ext="${ext}" data-ptype="${pt}"><div class="fp-spinner">Loading…</div></div>`;
				break;
			}
		}
	}
	const info=`<div class="fp-info">
		<div class="fp-icon" style="background:${fi.bg}"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="${fi.color}">${fi.svg}</svg></div>
		<div class="fp-meta"><div class="fp-fname">${escH(meta.name)}</div><div class="fp-fsize">${sending?`<span class="fp-pct">0%</span>`:fmtSz(meta.size)}</div></div>
		${url&&!sending?`<a href="${url}" download="${escH(meta.name)}" class="fp-dl" title="Download"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg></a>`:''}
	</div>`;
	const bar=sending?`<div class="fp-bar"><div class="fp-bar-fill" style="width:${progress*100}%"></div></div>`:'';
	return`<div class="fp-card${sending?' fp-sending':''}">${preview}${info}${bar}</div>`;
}

function loadLazy(root){
	if(!root||!root.querySelectorAll)return;
	root.querySelectorAll('.fp-html-lazy[data-src]').forEach(async el=>{
		const src=el.dataset.src;
		let batch=[];try{batch=JSON.parse(el.dataset.batch||'[]');}catch{}
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
	return sess.messages
		.filter(m=>m.type==='file'&&m.file?.batchId===batchId&&m.id!==excludeId&&m.file?.blobUrl)
		.map(m=>({name:m.file.name,url:m.file.blobUrl}));
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. THEME MANAGER
// ═══════════════════════════════════════════════════════════════════════════
function applyTheme(themeId,animate=true){
	const th=THEMES[themeId]||THEMES.void;
	const root=document.documentElement;
	root.style.setProperty('--tp',th.primary);root.style.setProperty('--ts',th.secondary);
	root.style.setProperty('--ta',th.accent);root.style.setProperty('--tb',rgba(th.primary,.12));
	root.style.setProperty('--tbh',rgba(th.primary,.28));root.style.setProperty('--tbg',rgba(th.primary,.11));
	root.style.setProperty('--tbb',rgba(th.primary,.18));root.style.setProperty('--tg',rgba(th.primary,.25));
	const grad=computeGrad(th.gradEnd);
	const bg1=el('gradBg1'),bg2=el('gradBg2');
	if(!bg1||!bg2||!animate){if(bg1)bg1.style.background=grad;return;}
	if(S.gradActive===1){
		bg2.style.background=grad;
		requestAnimationFrame(()=>{bg2.style.opacity='1';});
		setTimeout(()=>{bg1.style.transition='none';bg1.style.opacity='0';setTimeout(()=>{bg1.style.transition='';}  ,50);S.gradActive=2;},460);
	}else{
		bg1.style.background=grad;
		requestAnimationFrame(()=>{bg1.style.opacity='1';});
		setTimeout(()=>{bg2.style.transition='none';bg2.style.opacity='0';setTimeout(()=>{bg2.style.transition='';}  ,50);S.gradActive=1;},460);
	}
}
function computeGrad(endColor){
	if(!S.cubicGradFn)return`linear-gradient(to bottom right,#000000,${endColor})`;
	return S.cubicGradFn({direction:'to bottom right',start:'#000000',end:endColor,steps:20,power:2.5}).css;
}
function rgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${a})`;}

// ═══════════════════════════════════════════════════════════════════════════
// 11. SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
function getActiveSess(){return S.sessions.get(S.activeId)||null;}

async function selectSess(id,closeSidebar=true){
	const sess=S.sessions.get(id);if(!sess)return;
	if(S.activeId===id){if(closeSidebar&&isMobile())closeSidebarUI();return;}
	const prev=getActiveSess();if(prev){prev.unread=0;renderChatList();}
	S.activeId=id;sess.unread=0;
	applyTheme(sess.theme);renderTopbar(sess);
	await renderMessages(sess);
	el('welcomePanel').style.display='none';
	const cv=el('chatView');cv.classList.remove('hidden');cv.style.display='flex';
	renderChatList();
	if(closeSidebar&&isMobile())closeSidebarUI();
}

async function deleteSess(id){
	const sess=S.sessions.get(id);if(!sess)return;
	sess.engine?.disconnect();S.sessions.delete(id);await DB.deleteSession(id);
	if(S.activeId===id){
		S.activeId=null;el('chatView').classList.add('hidden');
		el('welcomePanel').style.display='';applyTheme('void');
	}
	renderChatList();
}

function setThemeForSess(sessId,themeId){
	const sess=S.sessions.get(sessId);if(!sess)return;
	sess.theme=themeId;DB.saveSession(sess);DB.updateSession(sessId,{theme:themeId});
	if(S.activeId===sessId)applyTheme(themeId);renderChatList();
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. ENGINE BINDING
// ═══════════════════════════════════════════════════════════════════════════
function bindEngine(sess,engine){
	sess.engine=engine;
	engine.onPeerConnected(peerId=>{
		sess.connected=true;sess.peers.set(peerId,{name:'Peer',avatar:''});
		if(S.activeId===sess.id){setStatus('connected','Connected');enableCallBtns(true);}
		addSysMsg(sess,'Connected ✓');
		safeSend(sess,{type:'handshake',displayName:S.displayName,avatarUrl:S.avatarUrl,isGroup:sess.isGroup,groupName:sess.groupName||''});
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
			sess.peers.set(peerId,{name:data.displayName||'Peer',avatar:data.avatarUrl||''});
			addSysMsg(sess,`${data.displayName||'Peer'} joined`);
			if(S.activeId===sess.id)renderTopbar(sess);renderChatList();break;
		case'group-members':
			for(const m of(data.members||[]))if(!sess.peers.has(m.pid))sess.peers.set(m.pid,{name:m.name,avatar:''});
			if(S.activeId===sess.id)renderTopbar(sess);break;
		case'chat':{
			let txt=data.text,enc=!!data.encrypted;
			if(enc){
				if(!Crypt.key){addBubble(sess,'[🔒 Encrypted — set same password in Settings]',data.displayName||'Peer',false,false);return;}
				try{txt=await Crypt.decText(txt);}catch{addBubble(sess,'[⚠ Decryption failed]',data.displayName||'Peer',false,false);return;}
			}
			addBubble(sess,txt,data.displayName||peerName(sess,peerId),false,enc);break;
		}
		case'file-meta':
			sess.inFiles.set(data.id,{meta:data,chunks:[]});break;
		case'file-chunk':{
			const f=sess.inFiles.get(data.id);if(f)f.chunks.push(data.data);break;
		}
		case'file-done':
			await receiveFile(sess,data.id,peerId);break;
		case'call-offer':
			if(sess.call.state!=='idle'){safeSend(sess,{type:'call-reject',reason:'busy'});return;}
			if(S.callSessId!==null&&S.callSessId!==sess.id){safeSend(sess,{type:'call-reject',reason:'busy'});return;}
			sess.call.incoming=data;sess.call.state='ringing';S.callSessId=sess.id;
			showIncomingDialog(sess,data);break;
		case'call-answer':
			if(sess.call.mediaPc && sess.call.state==='calling'){
				await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:data.sdp})).catch(e => {
					console.error('[WebRTC Call] Error applying remote Answer SDP:', e);
				});
				// Safe application of queued ICE candidates now that remote answer is active
				if (sess.call.iceQueue && sess.call.iceQueue.length > 0) {
					console.log(`[WebRTC Call] Applying ${sess.call.iceQueue.length} queued ICE candidates to Offer-side PC`);
					for (const cand of sess.call.iceQueue) {
						await sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn('[WebRTC Call] Staged Candidate failure:', e));
					}
					sess.call.iceQueue = [];
				}
				sess.call.state='active';setCallStatusTxt('In call · '+(sess.call.type||''));startCallTimer();
			}break;
		case'call-ice':
			if (data.candidate) {
				// Apply candidate immediately if PC is generated and remote description is set
				if (sess.call.mediaPc && sess.call.mediaPc.remoteDescription) {
					sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => {
						console.warn('[WebRTC Call] Direct addIceCandidate failed:', e);
					});
				} else {
					// Otherwise, queue candidate so they do not get discarded while callee is accepting the call
					if (!sess.call.iceQueue) sess.call.iceQueue = [];
					sess.call.iceQueue.push(data.candidate);
					console.log(`[WebRTC Call] Staged ICE Candidate. Queue length: ${sess.call.iceQueue.length}`);
				}
			}
			break;
		case'call-renego':
			if(sess.call.mediaPc&&(sess.call.state==='active'||sess.call.state==='calling')){
				try{
					await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:data.sdp}));
					const ans=await sess.call.mediaPc.createAnswer();
					await sess.call.mediaPc.setLocalDescription(ans);
					safeSend(sess,{type:'call-renego-ok',sdp:ans.sdp});
				}catch(e){console.error('[WebRTC Renegotiation Offer Error]',e);}
			}break;
		case'call-renego-ok':
			if(sess.call.mediaPc&&(sess.call.state==='active'||sess.call.state==='calling')){
				try{await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:data.sdp}));}
				catch(e){console.error('[WebRTC Renegotiation Answer Error]',e);}
			}break;
		case'call-end':
			endCallInternal(sess,false);addSysMsg(sess,'Call ended by peer');break;
		case'call-reject':
			endCallInternal(sess,false);addSysMsg(sess,'Call declined');break;
		case'display-name':{
			const old=sess.peers.get(peerId)?.name||'Peer';
			if(sess.peers.has(peerId))sess.peers.get(peerId).name=data.displayName;
			addSysMsg(sess,`${old} → ${data.displayName}`);break;
		}
	}
}
function peerName(sess,peerId){return sess.peers.get(peerId)?.name||'Peer';}
function safeSend(sess,data){if(!sess?.engine||!sess.connected)return;try{sess.engine.send(data);}catch(e){console.error('[send]',e);}}

// ═══════════════════════════════════════════════════════════════════════════
// 14. CHAT RENDERING
// ═══════════════════════════════════════════════════════════════════════════
function renderChatList(){
	const container=el('chatList');if(!container)return;
	const q=S.filterQ.toLowerCase();
	const items=[...S.sessions.values()]
		.filter(s=>!q||s.name.toLowerCase().includes(q))
		.sort((a,b)=>b.lastActivity-a.lastActivity);
	if(!items.length){container.innerHTML=`<div style="padding:24px 14px;text-align:center;font-size:.75rem;color:var(--faint)">No chats yet.<br>Use the + button to start one.</div>`;return;}
	container.innerHTML=items.map(s=>{
		const th=THEMES[s.theme]||THEMES.void;
		const initials=s.name.slice(0,2).toUpperCase();
		const isActive=s.id===S.activeId;
		const dotClass=s.connected?(S.callSessId===s.id?'ci-dot call':'ci-dot on'):'ci-dot';
		const unreadBadge=s.unread>0?`<div class="ci-badge">${s.unread>99?'99+':s.unread}</div>`:'';
		const time=s.lastActivity?relTime(s.lastActivity):'';
		const type=s.isGroup?'👥':(s.type==='direct'?'⚡':'🔗');
		return`<div class="chat-item${isActive?' active':''}" onclick="App.selectChat('${s.id}')">
			<div class="ci-av" style="color:${th.primary};border-color:${isActive?th.primary:'rgba(255,255,255,.1)'}">
				${initials}<div class="${dotClass}"></div>
			</div>
			<div class="ci-info">
				<div class="ci-name">${escH(s.name)} <span style="opacity:.4;font-size:.7em">${type}</span></div>
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
	avEl.textContent=sess.name.slice(0,2).toUpperCase();avEl.style.color=th.primary;
	nameEl.textContent=sess.name;
	dotEl.className='status-dot '+(sess.connected?'connected':'');
	txtEl.textContent=sess.connected?`${sess.peers.size} peer${sess.peers.size!==1?'s':''} connected`:'Disconnected';
	enableCallBtns(sess.connected&&!sess.isGroup);
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
	const side=m.mine?'mine':'theirs';
	const enc=m.enc?'<span class="enc-badge">🔒 enc</span>':'';
	const d=document.createElement('div');d.className=`msg ${side}`;
	d.innerHTML=`<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}${enc}</div>
		<div class="msg-bubble">${escH(m.content).replace(/\n/g,'<br>')}</div>`;
	container.appendChild(d);
}
function addBubble(sess,text,sender,mine,enc=false){
	const m={id:'msg_'+Date.now()+'_'+uid(),sessionId:sess.id,type:'text',content:text,sender,mine,timestamp:Date.now(),enc};
	sess.messages.push(m);sess.lastMessage=text.slice(0,60);sess.lastActivity=m.timestamp;
	DB.saveMessage(m);DB.updateSession(sess.id,{lastMessage:sess.lastMessage,lastActivity:sess.lastActivity});
	if(!mine&&S.activeId!==sess.id){sess.unread++;renderChatList();}
	if(S.activeId===sess.id){const c=el('messages');if(c){renderMsgItem(c,m);c.scrollTop=c.scrollHeight;}renderChatList();}
	else renderChatList();
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
	const xferId='ft_'+Date.now()+'_'+uid();
	const isEnc=S.encEnabled&&!!Crypt.key;
	const localUrl=URL.createObjectURL(file);
	const meta={name:file.name,size:file.size,mime:file.type||'application/octet-stream'};
	const msgId=addSendingFileBubble(sess,meta,localUrl,xferId,batchId);
	try{
		let buf=await file.arrayBuffer();
		buf=await gzip(buf);
		if(isEnc)buf=await Crypt.encBuf(buf);
		const b64=bufB64(buf);
		const nChunks=Math.ceil(b64.length/CHUNK_SIZE);
		safeSend(sess,{type:'file-meta',id:xferId,name:file.name,origSize:file.size,
			compressedSize:buf.byteLength,mime:file.type||'application/octet-stream',
			chunks:nChunks,encrypted:isEnc,compressed:true,batchId:batchId||null,displayName:S.displayName});
		for(let i=0;i<nChunks;i++){
			safeSend(sess,{type:'file-chunk',id:xferId,index:i,data:b64.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE)});
			if(i%4===0){await sleep(0);updateXferProgress(msgId,(i+1)/nChunks);}
		}
		safeSend(sess,{type:'file-done',id:xferId});
		finalizeFileBubble(msgId,meta,localUrl,isEnc,sess,batchId);
	}catch(e){
		toast('Send failed: '+e.message);
		URL.revokeObjectURL(localUrl);
		removeFileBubble(msgId);
	}
}

async function receiveFile(sess,id,peerId){
	const entry=sess.inFiles.get(id);if(!entry)return;
	sess.inFiles.delete(id);
	const{meta,chunks}=entry;
	let buf=b64Buf(chunks.join(''));
	if(meta.encrypted){
		if(!Crypt.key){addSysMsg(sess,`⚠ Cannot decrypt ${meta.name}`);return;}
		try{buf=await Crypt.decBuf(buf);}catch{addSysMsg(sess,`⚠ Decrypt failed: ${meta.name}`);return;}
	}
	if(meta.compressed){
		try{buf=await gunzip(buf);}catch{addSysMsg(sess,`⚠ Decompress failed: ${meta.name}`);return;}
	}
	const blob=new Blob([buf],{type:meta.mime});
	const url=URL.createObjectURL(blob);
	addFileBubble(sess,{name:meta.name,size:meta.origSize||meta.size,mime:meta.mime},url,false,meta.encrypted,meta.batchId||null,peerId);
}

function addSendingFileBubble(sess,meta,url,xferId,batchId){
	const msgId='msg_'+Date.now()+'_'+uid();
	if(S.activeId===sess.id){
		const c=el('messages');if(!c)return msgId;
		const d=document.createElement('div');
		d.className='msg mine';d.dataset.msgId=msgId;
		d.innerHTML=`<div class="msg-meta">${escH(S.displayName)} · ${fmtTime(Date.now())}</div>
			<div class="msg-bubble fp-bubble">${buildFileCard(meta,url,true,0)}</div>`;
		c.appendChild(d);c.scrollTop=c.scrollHeight;loadLazy(d);
	}
	return msgId;
}

// ═══════════════════════════════════════════════════════════════════════════
// 16. MEDIA CALLS
// ═══════════════════════════════════════════════════════════════════════════
function updateXferProgress(msgId,pct){
	const d=document.querySelector(`[data-msg-id="${msgId}"]`);if(!d)return;
	const bar=d.querySelector('.fp-bar-fill');if(bar)bar.style.width=(pct*100).toFixed(0)+'%';
	const pctEl=d.querySelector('.fp-pct');if(pctEl)pctEl.textContent=Math.round(pct*100)+'%';
}

function finalizeFileBubble(msgId,meta,url,enc,sess,batchId){
	const d=document.querySelector(`[data-msg-id="${msgId}"]`);
	if(d){
		const bub=d.querySelector('.msg-bubble');
		if(bub){bub.innerHTML=buildFileCard(meta,url,false,0,getBatchSiblings(sess,batchId,msgId));loadLazy(bub);}
	}
	const m={id:msgId,sessionId:sess.id,type:'file',content:meta.name,
		sender:S.displayName,mine:true,timestamp:Date.now(),enc,
		file:{name:meta.name,size:meta.size,mime:meta.mime,blobUrl:url,batchId:batchId||null}};
	sess.messages.push(m);sess.lastMessage='📎 '+meta.name;sess.lastActivity=m.timestamp;
	DB.saveMessage(m);DB.updateSession(sess.id,{lastMessage:sess.lastMessage,lastActivity:sess.lastActivity});
	renderChatList();
}

function removeFileBubble(msgId){document.querySelector(`[data-msg-id="${msgId}"]`)?.remove();}

function addFileBubble(sess,meta,url,mine,enc,batchId,peerId){
	const sender=mine?S.displayName:peerName(sess,peerId||'remote');
	const m={id:'file_'+Date.now()+'_'+uid(),sessionId:sess.id,type:'file',content:meta.name,
		sender,mine,timestamp:Date.now(),enc,
		file:{name:meta.name,size:meta.size,mime:meta.mime,blobUrl:url,batchId:batchId||null}};
	sess.messages.push(m);sess.lastMessage='📎 '+meta.name;sess.lastActivity=m.timestamp;
	DB.saveMessage(m);DB.updateSession(sess.id,{lastMessage:sess.lastMessage,lastActivity:sess.lastActivity});
	if(!mine&&S.activeId!==sess.id)sess.unread++;
	if(S.activeId===sess.id){
		const c=el('messages');if(!c){renderChatList();return;}
		const batchSiblings=getBatchSiblings(sess,batchId,m.id);
		const d=document.createElement('div');d.className=`msg ${mine?'mine':'theirs'}`;d.dataset.msgId=m.id;
		d.innerHTML=`<div class="msg-meta">${escH(sender)} · ${fmtTime(m.timestamp)}${enc?'<span class="enc-badge">🔒 enc</span>':''}</div>
			<div class="msg-bubble fp-bubble">${buildFileCard(meta,url,false,0,batchSiblings)}</div>`;
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
	if(meta.batchId&&m.sessionId){
		const sess=S.sessions.get(m.sessionId);
		if(sess)batchFiles.push(...getBatchSiblings(sess,meta.batchId,m.id));
	}
	const d=document.createElement('div');d.className=`msg ${side}`;d.dataset.msgId=m.id;
	d.innerHTML=`<div class="msg-meta">${escH(m.sender)} · ${fmtTime(m.timestamp)}${enc}</div>
		<div class="msg-bubble fp-bubble">${buildFileCard(meta,url,false,0,batchFiles)}</div>`;
	container.appendChild(d);loadLazy(d);
}

// ═══════════════════════════════════════════════════════════════════════════
// 16. MEDIA CALLS
// ═══════════════════════════════════════════════════════════════════════════
async function initiateCall(type){
	const sess=getActiveSess();
	if(!sess?.connected){toast('Not connected');return;}
	if(sess.call.state!=='idle'){toast('Already in a call');return;}
	if(sess.isGroup){toast('Calls in direct sessions only');return;}
	if(S.callSessId!==null){toast('End current call first');return;}
	sess.call.type=type;sess.call.state='calling';S.callSessId=sess.id;
	sess.call.iceQueue = []; // Clear current candidate queue
	try{
		const stream=await getStream(type);
		sess.call.localStream=stream;
		sess.call.mediaPc=buildMediaPC(sess);
		stream.getTracks().forEach(t=>sess.call.mediaPc.addTrack(t,stream));
		const offer=await sess.call.mediaPc.createOffer();
		await sess.call.mediaPc.setLocalDescription(offer);
		safeSend(sess,{type:'call-offer',sdp:offer.sdp,callType:type,displayName:S.displayName});
		showCallOverlay(sess,stream);
		setCallStatusTxt('Ringing…');
		addSysMsg(sess,`Calling (${type})…`);
	}catch(e){
		console.error('[WebRTC Call] Could not initiate calling phase:', e);
		toast('Could not start call: '+e.message);
		endCallInternal(sess,false);
	}
}

function buildMediaPC(sess){
	const pc=new RTCPeerConnection({iceServers:[{urls:['stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}]});
	let remoteStream=null;
	pc.onicecandidate=evt=>{
		if(evt.candidate) {
			safeSend(sess,{type:'call-ice',candidate:evt.candidate.toJSON()});
		}
	};
	pc.onicecandidateerror=evt=>{
		console.error('[WebRTC Call ICE Error Handler] Target:', evt.url, 'Code:', evt.errorCode, 'Message:', evt.errorText);
	};
	
	// Critical fix: robust ontrack accumulates into a single MediaStream
	pc.ontrack=evt=>{
		const rv=el('callRemoteVid');if(!rv)return;
		if(!remoteStream){remoteStream=new MediaStream();rv.srcObject=remoteStream;}
		const existing=remoteStream.getTracks().find(t=>t.kind===evt.track.kind);
		if(existing)remoteStream.removeTrack(existing);
		remoteStream.addTrack(evt.track);
		rv.play().catch(e => console.error('[WebRTC Call] Error auto-playing remote stream:', e));
		if(evt.track.kind==='video'){
			rv.style.display='block';
			const ab=el('callAudioBg');if(ab)ab.style.display='none';
		}
	};
	// Renegotiation for source toggle (addTrack during active call)
	pc.onnegotiationneeded=async()=>{
		if(sess.call.state!=='active')return;
		try{
			const offer=await pc.createOffer();
			await pc.setLocalDescription(offer);
			safeSend(sess,{type:'call-renego',sdp:offer.sdp});
		}catch(e){console.error('[WebRTC Call PC Renegotiation error]',e);}
	};
	pc.onconnectionstatechange=()=>{
		const s=pc.connectionState;
		console.log(`[WebRTC Call] Connection state for PC changed: "${s}"`);
		if(s==='connected'){
			sess.call.state='active';
			setCallStatusTxt('In call · '+(sess.call.type||''));
			startCallTimer();
		}
		if(s==='failed'||s==='closed'){
			console.error(`[WebRTC Call Failed] PC connection closed/errored out with state: ${s}`);
			endCallInternal(sess,true);
			toast('Call connection failed');
		}
	};
	return pc;
}

async function acceptCall(){
	closeIncomingDialog();
	const sess=S.sessions.get(S.callSessId);if(!sess?.call.incoming)return;
	const data=sess.call.incoming;
	sess.call.type=data.callType;sess.call.state='active';
	try{
		const stream=await getStream(data.callType==='screen'?'audio':data.callType);
		sess.call.localStream=stream;
		sess.call.mediaPc=buildMediaPC(sess);
		
		// SetRemoteDescription FIRST to establish target schema, then addTrack & drain queued ICE candidates
		await sess.call.mediaPc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:data.sdp}));
		stream.getTracks().forEach(t=>sess.call.mediaPc.addTrack(t,stream));
		
		// Process queued candidates generated while the dialog was active
		if (sess.call.iceQueue && sess.call.iceQueue.length > 0) {
			console.log(`[WebRTC Call] Applying ${sess.call.iceQueue.length} queued ICE candidates to Answer-side PC`);
			for (const cand of sess.call.iceQueue) {
				await sess.call.mediaPc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn('[WebRTC Call] Staged Candidate failure:', e));
			}
			sess.call.iceQueue = [];
		}
		
		const answer=await sess.call.mediaPc.createAnswer();
		await sess.call.mediaPc.setLocalDescription(answer);
		safeSend(sess,{type:'call-answer',sdp:answer.sdp});
		showCallOverlay(sess,stream);
		setCallStatusTxt('In call · '+data.callType);
		startCallTimer();
		addSysMsg(sess,`Call started (${data.callType})`);
	}catch(e){
		console.error('[WebRTC Call] Accept call sequence failure:', e);
		toast('Could not accept call: '+e.message);
		safeSend(sess,{type:'call-reject'});
		endCallInternal(sess,false);
	}
}

function rejectCall(){
	closeIncomingDialog();
	const sess=S.sessions.get(S.callSessId);
	if(sess){safeSend(sess,{type:'call-reject'});endCallInternal(sess,false);}
}

function endCallInternal(sess,notify=true){
	if(!sess)sess=S.sessions.get(S.callSessId);if(!sess)return;
	if(notify&&sess.connected&&sess.call.state!=='idle')safeSend(sess,{type:'call-end'});
	closeIncomingDialog();hideCallOverlay();stopCallTimer();
	sess.call.localStream?.getTracks().forEach(t=>t.stop());
	try{sess.call.mediaPc?.close();}catch{}
	sess.call={mediaPc:null,localStream:null,type:null,sourceType:null,state:'idle',muted:false,camOff:false,incoming:null,iceQueue:[]};
	if(S.callSessId===sess.id)S.callSessId=null;
	renderChatList();
}

async function getStream(type){
	try {
		if(type==='video') return await navigator.mediaDevices.getUserMedia({video:true,audio:true});
		return await navigator.mediaDevices.getUserMedia({audio:true,video:false});
	} catch (err) {
		console.error(`[WebRTC Call] navigator.mediaDevices.getUserMedia failed for "${type}":`, err);
		throw err;
	}
}

async function callToggleSource(){
	const sess=S.sessions.get(S.callSessId);if(!sess?.call.mediaPc)return;
	const pc=sess.call.mediaPc;
	const isScreen=sess.call.sourceType==='screen';
	const btn=el('callSrcBtn');
	const ICON_SCREEN=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>`;
	const ICON_CAM=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/></svg>`;
	try{
		let newStream;
		if(isScreen){
			newStream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
			sess.call.sourceType='camera';
		}else{
			newStream=await navigator.mediaDevices.getDisplayMedia({video:{cursor:'always'}});
			sess.call.sourceType='screen';
			newStream.getVideoTracks()[0].addEventListener('ended',()=>{sess.call.sourceType='camera';callToggleSource().catch(()=>{});});
		}
		const newVid=newStream.getVideoTracks()[0];if(!newVid)return;
		const vidSender=pc.getSenders().find(s=>s.track?.kind==='video');
		if(vidSender){
			const old=vidSender.track;await vidSender.replaceTrack(newVid);old?.stop();
		}else{
			const keepAudio=sess.call.localStream?.getAudioTracks()||[];
			pc.addTrack(newVid,new MediaStream([...keepAudio,newVid]));
			sess.call.localStream?.getVideoTracks().forEach(t=>t.stop());
		}
		const keepAudio=sess.call.localStream?.getAudioTracks()||[];
		sess.call.localStream=new MediaStream([...keepAudio,newVid]);
		const lv=el('callLocalVid');if(lv){lv.srcObject=sess.call.localStream;lv.classList.add('visible');}
		const nowScreen=sess.call.sourceType==='screen';
		if(btn){btn.title=nowScreen?'Switch to Camera':'Share Screen';btn.classList.toggle('active',nowScreen);btn.innerHTML=nowScreen?ICON_CAM:ICON_SCREEN;}
	}catch(e){
		console.error('[WebRTC Call] Source shift failure:', e);
		toast('Source toggle failed: '+e.message);
	}
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
	const type=sess.call.type;
	ov.classList.add('active');
	sess.call.sourceType=type==='screen'?'screen':(type==='video'?'camera':null);
	const rv=el('callRemoteVid'),ab=el('callAudioBg'),lv=el('callLocalVid');
	if(rv){rv.srcObject=null;rv.style.display='none';}
	if(ab){
		const names=[...sess.peers.values()].map(p=>p.name).join(', ')||'Peer';
		ab.style.display='flex';
		const ini=el('callAudioInitial');if(ini)ini.textContent=(names[0]||'P').toUpperCase();
		const pn=el('callAudioName');if(pn)pn.textContent=names;
	}
	if(lv){
		if(localStream&&(type==='video'||type==='screen')){lv.srcObject=localStream;lv.classList.add('visible');}
		else lv.classList.remove('visible');
	}
	const badge=el('callBadge');
	if(badge)badge.textContent=type==='audio'?'🎤 Voice Call':type==='video'?'📹 Video Call':'🖥 Screen Share';
	const camBtn=el('callCamBtn');if(camBtn)camBtn.classList.toggle('hidden',type==='audio');
	const srcBtn=el('callSrcBtn');
	if(srcBtn){
		srcBtn.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>`;
		srcBtn.title='Share Screen';srcBtn.classList.remove('active');
	}
	el('callTimer').textContent='00:00';
}
function hideCallOverlay(){
	const ov=el('callOverlay');if(ov)ov.classList.remove('active');
	const rv=el('callRemoteVid');if(rv){rv.srcObject=null;rv.style.display='none';}
	const lv=el('callLocalVid');if(lv){lv.srcObject=null;lv.classList.remove('visible');}
}
function showIncomingDialog(sess,data){
	const d=el('incomingDialog');if(!d)return;
	const icons={audio:'📞',video:'📹',screen:'🖥️'};
	el('incomingIcon').textContent=icons[data.callType]||'📞';
	el('incomingCallerName').textContent=data.displayName||'Peer';
	el('incomingCallType').textContent=(data.callType||'voice')+' call';
	d.classList.add('active');
}
function closeIncomingDialog(){el('incomingDialog')?.classList.remove('active');}
function setCallStatusTxt(txt){const e=el('callAudioStatus');if(e)e.textContent=txt;}
function startCallTimer(){
	S.callStarted=Date.now();
	S.callTimer=setInterval(()=>{
		const s=Math.floor((Date.now()-S.callStarted)/1000);
		const t=el('callTimer');if(t)t.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
	},1000);
}
function stopCallTimer(){if(S.callTimer){clearInterval(S.callTimer);S.callTimer=null;}S.callStarted=null;const t=el('callTimer');if(t)t.textContent='00:00';}

// ═══════════════════════════════════════════════════════════════════════════
// 17. INJECTED PANELS
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
.call-rings{position:absolute;width:120px;height:120px}
.call-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(0,255,255,.3);animation:callring 2.4s ease-out infinite}
.call-ring:nth-child(2){animation-delay:.8s}.call-ring:nth-child(3){animation-delay:1.6s}
@keyframes callring{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.8);opacity:0}}
.call-audio-av{width:80px;height:80px;border-radius:50%;background:rgba(0,255,255,.1);border:2px solid rgba(0,255,255,.3);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;color:var(--tp);z-index:1}
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
			<div class="panel-section-lbl">Message Encryption (AES-256-GCM)</div>
			<div class="sp-row" style="margin-bottom:12px"><span class="sp-label">Enable encryption</span>
				<label class="toggle"><input type="checkbox" id="spEncToggle" onchange="App.handleEncToggle()"><div class="toggle-track"></div><div class="toggle-thumb"></div></label>
			</div>
			<div id="spEncPwRow" style="display:none" class="col">
				<div class="f-grp"><div class="f-lbl">Shared password (both peers need the same)</div><input type="password" class="f-in" id="spEncPw" placeholder="Password…"></div>
				<button class="btn btn-p btn-full" onclick="App.applyEncKey()">Apply Key</button>
			</div>
			<div id="spEncStatus" style="font-family:'JetBrains Mono',monospace;font-size:.68rem;margin-top:8px;color:var(--faint)">Encryption off</div>
		</div>
		<div class="panel-section"><div class="panel-section-lbl">Sign In (for Firebase rooms)</div><div id="spAuthArea"></div></div>
		<div class="panel-section"><div class="panel-section-lbl">About</div>
			<div style="font-size:.78rem;color:rgba(232,237,248,.4);line-height:1.7">P2P Chat v3.2 · ProElectricCoder<br>WebRTC + Firebase signaling<br>
				<a href="/Projects/Chat/" target="_blank" style="color:var(--tp);text-decoration:none">Documentation →</a>
			</div>
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
			<div class="f-grp"><div class="f-lbl">Room ID</div><input class="f-in" id="ncRoomId" placeholder="my-room-id"></div>
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

	// Call overlay
	const co=document.createElement('div');co.id='callOverlay';co.className='call-overlay';
	co.innerHTML=`
	<video id="callRemoteVid" class="call-remote-vid" autoplay playsinline></video>
	<div id="callAudioBg" class="call-audio-bg">
		<div class="call-rings"><div class="call-ring"></div><div class="call-ring"></div><div class="call-ring"></div></div>
		<div class="call-audio-av" id="callAudioInitial">P</div>
		<div class="call-audio-peer" id="callAudioName">Peer</div>
		<div class="call-audio-status" id="callAudioStatus">Connecting…</div>
		<div class="call-timer-wrap" id="callTimer">00:00</div>
	</div>
	<video id="callLocalVid" class="call-local-vid" autoplay playsinline muted></video>
	<div class="call-badge" id="callBadge">Voice Call</div>
	<div class="call-controls">
		<button class="call-ctrl mute" id="callMuteBtn" title="Mute" onclick="App.callToggleMute()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg>
		</button>
		<button class="call-ctrl cam hidden" id="callCamBtn" title="Hide Camera" onclick="App.callToggleCam()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" d="M15.75 10.5 20.47 5.78A.75.75 0 0 1 21.75 6.286v11.428a.75.75 0 0 1-1.28.53L15.75 13.5M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
		</button>
		<button class="call-ctrl src" id="callSrcBtn" title="Share Screen" onclick="App.callToggleSource()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>
		</button>
		<button class="call-ctrl end" title="End call" onclick="App.callEnd()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
		</button>
	</div>`;
	document.getElementById('panels').appendChild(co);

	// Incoming call
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

	// Lightbox
	const lb=document.createElement('div');lb.id='lightbox';lb.onclick=()=>App.closeLightbox();
	lb.innerHTML=`<img id="lbImg" src="" alt="">`;
	document.getElementById('panels').appendChild(lb);

	// Theme picker
	const tp=document.createElement('div');tp.id='themePicker';
	tp.innerHTML=`<div class="tp-title">Chat Theme</div><div class="theme-swatches" id="themeSwatches"></div>`;
	document.body.appendChild(tp);
	document.addEventListener('click',e=>{if(tp.classList.contains('open')&&!tp.contains(e.target)&&e.target.id!=='btnTheme')tp.classList.remove('open');});

	// Chat info panel
	const ci=document.createElement('div');ci.id='chatInfoOverlay';ci.className='panel-overlay';
	ci.innerHTML=`<div class="panel-drawer">
	<div class="panel-head"><span class="panel-head-title">Chat Info</span><button class="panel-close" onclick="App.closeChatInfo()">✕</button></div>
	<div class="panel-body">
		<div class="panel-section" id="ciDetails"></div>
		<div class="panel-section"><div class="panel-section-lbl">Theme</div><div class="theme-swatches" id="ciThemeSwatches"></div></div>
		<div class="panel-section"><div class="panel-section-lbl">Members</div><div id="ciMembers" style="font-size:.82rem;color:var(--dim);line-height:1.8"></div></div>
		<div class="panel-section col" style="gap:8px">
			<button class="btn btn-d btn-full" id="ciDisconnectBtn" onclick="App.ciDisconnect()">Disconnect</button>
			<button class="btn btn-d btn-full" onclick="App.ciDelete()">Delete Chat</button>
		</div>
	</div></div>`;
	ci.addEventListener('click',e=>{if(e.target===ci)App.closeChatInfo();});
	document.getElementById('panels').appendChild(ci);
}

// ═══════════════════════════════════════════════════════════════════════════
// 18. PANEL LOGIC
// ═══════════════════════════════════════════════════════════════════════════
function openSettings(){
	const o=el('settingsOverlay');if(!o)return;
	const ni=el('spName');if(ni)ni.value=S.displayName;
	const aw=el('spAvatarWrap');
	if(aw){
		const letter=(S.displayName[0]||'?').toUpperCase();
		aw.innerHTML=S.avatarUrl
			?`<img src="${S.avatarUrl}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--tbh)" onerror="this.style.display='none'">`
			:`<div style="width:44px;height:44px;border-radius:50%;background:rgba(0,255,255,.08);border:1px solid var(--tbh);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800;color:var(--tp)">${letter}</div>`;
	}
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
	el('ncSubCaller')?.classList.toggle('active',sub==='caller');
	el('ncSubCallee')?.classList.toggle('active',sub==='callee');
	el('ncCallerFlow')?.classList.toggle('hidden',sub!=='caller');
	el('ncCalleeFlow')?.classList.toggle('hidden',sub!=='callee');
}
function openThemePicker(){
	const tp=el('themePicker');if(!tp)return;
	const sw=el('themeSwatches');if(!sw)return;
	const sess=getActiveSess();
	sw.innerHTML=Object.entries(THEMES).map(([id,th])=>
		`<div class="t-sw${sess?.theme===id?' active':''}" title="${th.name}" style="background:${th.primary}" onclick="App.pickTheme('${id}')"></div>`
	).join('');
	const btn=el('btnTheme');const rect=btn?.getBoundingClientRect()||{bottom:60,right:window.innerWidth};
	tp.style.top=(rect.bottom+8)+'px';tp.style.right=(window.innerWidth-rect.right)+'px';
	tp.classList.add('open');
}
function openChatInfo(){
	const sess=getActiveSess();if(!sess)return;
	const d=el('ciDetails');
	if(d)d.innerHTML=`<div class="panel-section-lbl">Details</div>
		<div class="col" style="gap:6px;font-size:.82rem;color:var(--dim)">
			<div><span style="color:var(--faint)">Name:</span> ${escH(sess.name)}</div>
			<div><span style="color:var(--faint)">Type:</span> ${sess.isGroup?'Group':sess.type==='direct'?'Direct':'Firebase Room'}</div>
			${sess.roomId?`<div><span style="color:var(--faint)">Room ID:</span> <code style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--tp)">${escH(sess.roomId)}</code></div>`:''}
			<div><span style="color:var(--faint)">Status:</span> ${sess.connected?'<span style="color:var(--ta)">Connected</span>':'Disconnected'}</div>
		</div>`;
	const cs=el('ciThemeSwatches');
	if(cs)cs.innerHTML=Object.entries(THEMES).map(([id,th])=>
		`<div class="t-sw${sess.theme===id?' active':''}" title="${th.name}" style="background:${th.primary}" onclick="App.pickTheme('${id}');App.closeChatInfo()"></div>`
	).join('');
	const cm=el('ciMembers');
	if(cm){
		const members=[...sess.peers.entries()];
		cm.innerHTML=members.length
			?members.map(([,p])=>`<div>👤 ${escH(p.name)}</div>`).join('')+`<div>👤 ${escH(S.displayName)} (you)</div>`
			:`<div>👤 ${escH(S.displayName)} (you)</div>`;
	}
	const db=el('ciDisconnectBtn');if(db)db.textContent=sess.connected?'Disconnect':'Reconnect';
	el('chatInfoOverlay')?.classList.add('open');
}

// ═══════════════════════════════════════════════════════════════════════════
// 19. FIREBASE AUTH
// ═══════════════════════════════════════════════════════════════════════════
function initFirebase(){
	firebase.auth().onAuthStateChanged(user=>{
		S.user=user;
		if(user){
			if(!localStorage.getItem('pec_name')){S.displayName=user.displayName||'Anonymous';localStorage.setItem('pec_name',S.displayName);}
			S.avatarUrl=user.photoURL||'';localStorage.setItem('pec_avatar',S.avatarUrl);
		}
		syncAuthSection('spAuthArea');syncAuthSection('ncRoomAuth');syncAuthSection('ncGroupAuth');
	});
}

// ═══════════════════════════════════════════════════════════════════════════
// 20. UTILITIES
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

// ═══════════════════════════════════════════════════════════════════════════
// 21. window.App
// ═══════════════════════════════════════════════════════════════════════════
window.App={
	openSidebar(){openSidebarUI();},
	closeSidebar(){closeSidebarUI();},
	filterChats(q){S.filterQ=q;renderChatList();},
	async selectChat(id){await selectSess(id,true);},
	pickTheme(id){const sess=getActiveSess();if(!sess)return;setThemeForSess(sess.id,id);el('themePicker')?.classList.remove('open');renderChatList();},
	newChat(tab){openNewChat(tab);},
	closeNewChat(){el('newChatModal')?.classList.remove('open');NC.pendingEngine=null;NC.pendingSessId=null;},
	ncSwitchTab(t){ncSwitchTab(t);},
	ncDirectSub(s){ncDirectSub(s);},
	ncGenRoomId(){const i=el('ncGroupRoomId');if(i)i.value='room-'+Math.random().toString(36).slice(2,8);},
	async directGenOffer(){
		const eng=new DirectEngine();
		const sessId='sess_'+Date.now()+'_'+uid();
		const sess=makeSess({id:sessId,name:'Direct Chat',type:'direct'});
		S.sessions.set(sessId,sess);NC.pendingEngine=eng;NC.pendingSessId=sessId;
		bindEngine(sess,eng);setStatus('connecting','Generating offer…');
		try{
			const offer=await eng.createOffer();
			el('ncOfferSDP').value=offer;
			el('ncOfferGroup')?.classList.remove('hidden');
			el('ncAnswerInputGroup')?.classList.remove('hidden');
			await DB.saveSession(sess);renderChatList();toast('Offer generated — share it with your peer');
		}catch(e){toast('Error: '+e.message);S.sessions.delete(sessId);}
	},
	async directConnect(){
		const ans=el('ncAnswerInput')?.value.trim();if(!ans){toast('Paste the answer SDP first');return;}
		const eng=NC.pendingEngine;if(!eng){toast('Generate an offer first');return;}
		try{await eng.setAnswer(ans);this.closeNewChat();toast('Connecting…');}
		catch(e){toast('Error: '+e.message);}
	},
	async directGenAnswer(){
		const offer=el('ncRemoteOffer')?.value.trim();if(!offer){toast('Paste the remote offer first');return;}
		const name=el('ncCalleeName')?.value.trim()||'Direct Chat';
		const eng=new DirectEngine();const sess=makeSess({name,type:'direct'});
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
		const sess=makeSess({name:rid,type:'firebase',roomId:rid});sess.isHost=true;
		const eng=new ChatEngine();eng.init(firebase.firestore());
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);setStatus('connecting','Waiting for peers…');
		try{await eng.createRoom(rid);await DB.saveSession(sess);await selectSess(sess.id);this.closeNewChat();addSysMsg(sess,`Room "${rid}" created — share this ID`);toast('Room created');}
		catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async fbJoinRoom(){
		if(!S.user){toast('Sign in first');return;}
		const rid=el('ncRoomId')?.value.trim();if(!rid){toast('Enter a room ID');return;}
		const sess=makeSess({name:rid,type:'firebase',roomId:rid});
		const eng=new ChatEngine();eng.init(firebase.firestore());
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);setStatus('connecting','Joining room…');
		try{await eng.joinRoom(rid);await DB.saveSession(sess);await selectSess(sess.id);this.closeNewChat();}
		catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async fbCreateGroup(){
		if(!S.user){toast('Sign in first');return;}
		const gname=el('ncGroupName')?.value.trim()||'My Group';
		const rid=el('ncGroupRoomId')?.value.trim()||'grp-'+Math.random().toString(36).slice(2,8);
		const sess=makeSess({name:gname,type:'firebase',isGroup:true,roomId:rid,groupName:gname});
		sess.isHost=true;const eng=new ChatEngine({relay:true});eng.init(firebase.firestore());
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);
		try{await eng.createRoom(rid);await DB.saveSession(sess);await selectSess(sess.id);this.closeNewChat();addSysMsg(sess,`Group "${gname}" created · Room: ${rid}`);toast('Group created');}
		catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async fbJoinGroup(){
		if(!S.user){toast('Sign in first');return;}
		const rid=el('ncGroupRoomId')?.value.trim();if(!rid){toast('Enter room ID');return;}
		const gname=el('ncGroupName')?.value.trim()||rid;
		const sess=makeSess({name:gname,type:'firebase',isGroup:true,roomId:rid,groupName:gname});
		const eng=new ChatEngine({relay:false});eng.init(firebase.firestore());
		S.sessions.set(sess.id,sess);bindEngine(sess,eng);
		try{await eng.joinRoom(rid);await DB.saveSession(sess);await selectSess(sess.id);this.closeNewChat();}
		catch(e){toast('Error: '+e.message);S.sessions.delete(sess.id);}
	},
	async sendMsg(){
		const inp=el('msgInput');const text=inp?.value.trim();
		const sess=getActiveSess();if(!sess?.connected){toast('Not connected');return;}
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
	openFilePicker(){el('fileInput')?.click();},
	handleFileSelect(fs){FQ.add([...fs]);},
	handleDrop(e){e.preventDefault();FQ.add([...(e.dataTransfer.files||[])]);},
	removeQueuedFile(id){FQ.remove(id);},
	copyField(id){const e=el(id);if(e)navigator.clipboard.writeText(e.value).then(()=>toast('Copied'));},
	startCall(type){initiateCall(type);},
	callAccept(){acceptCall();},
	callDecline(){rejectCall();},
	callEnd(){const s=S.sessions.get(S.callSessId);endCallInternal(s,true);if(s)addSysMsg(s,'Call ended');},
	callToggleMute(){toggleCallMute();},
	callToggleCam(){toggleCallCam();},
	callToggleSource(){callToggleSource();},
	openSettings(){openSettings();},
	closeSettings(){el('settingsOverlay')?.classList.remove('open');},
	saveName(){
		const n=el('spName')?.value.trim()||'Anonymous';S.displayName=n;localStorage.setItem('pec_name',n);
		const sess=getActiveSess();if(sess?.connected)safeSend(sess,{type:'display-name',displayName:n});
		toast('Name saved');
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
		await firebase.auth().signOut();
		const sess=getActiveSess();if(sess){sess.engine?.disconnect();sess.connected=false;}
		syncAuthSection('spAuthArea');toast('Signed out');
	},
	openThemePicker(){openThemePicker();},
	openChatInfo(){openChatInfo();},
	closeChatInfo(){el('chatInfoOverlay')?.classList.remove('open');},
	ciDisconnect(){
		const sess=getActiveSess();if(!sess)return;
		if(sess.connected){sess.engine?.disconnect();sess.connected=false;setStatus('disconnected','Disconnected');enableCallBtns(false);}
		this.closeChatInfo();renderChatList();
	},
	ciDelete(){const sess=getActiveSess();if(sess){this.closeChatInfo();deleteSess(sess.id);}},
	openLightbox(src){el('lbImg').src=src;el('lightbox').classList.add('open');},
	closeLightbox(){el('lightbox').classList.remove('open');},
};

// ═══════════════════════════════════════════════════════════════════════════
// 22. INIT
// ═══════════════════════════════════════════════════════════════════════════
(async function init(){
	injectPanels();
	try{const mod=await import('https://proelectriccoder.github.io/ElectronCSS/CubicGradient.js');S.cubicGradFn=mod.cubicGradient;}catch{}
	applyTheme('void',false);
	initFirebase();
	try{
		const saved=await DB.getSessions();
		for(const sd of saved){const sess=makeSess(sd);S.sessions.set(sess.id,sess);}
		renderChatList();
	}catch(e){console.warn('[DB] load failed:',e);}
})();
