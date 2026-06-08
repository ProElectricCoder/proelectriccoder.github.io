/**
 * app.js — P2P Chat Application v2.0
 * ProElectricCoder · /Projects/Chat/App/app.js
 *
 * Features:
 *  • Firebase Auth (Google / GitHub) + Direct WebRTC mode
 *  • AES-256-GCM message & file encryption (PBKDF2 key derivation)
 *  • File transfer with inline previews (image/audio/video/other)
 *  • Voice calls, video calls, screen sharing (via separate media RTCPeerConnection)
 *  • Dynamic CubicGradient background with live settings panel
 *  • Editable display name + profile picture from auth
 */

// ─── ⚠ Firebase Config — replace with your project's values ──────────────────
const firebaseConfig = {
	apiKey: "AIzaSyC_v49m7e5xt-FCWs0DSq7aGU7gD1aiTh4",
	authDomain: "proelectriccoder.firebaseapp.com",
	projectId: "proelectriccoder",
	storageBucket: "proelectriccoder.firebasestorage.app",
	messagingSenderId: "629115974151",
	appId: "1:629115974151:web:636737d123e4e8685c70a2",
	measurementId: "G-WEXXNE0J6Q"
};
firebase.initializeApp(firebaseConfig);
// ─────────────────────────────────────────────────────────────────────────────

import { ChatEngine, DirectEngine } from '../engine.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 32 * 1024;       // 32 KB per file transfer chunk
const ICE_CFG = {
	iceServers: [
		{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
	],
};

// ─── AES-256-GCM Crypto Module ────────────────────────────────────────────────
// Inspired by sep-crypto.js — PBKDF2 key derivation + per-message AES-GCM.
// Key is derived once from the shared password; each message gets a random IV.
const Crypt = {
	key: null,

	async derive(password) {
		const enc = new TextEncoder();
		const raw = await crypto.subtle.importKey(
			'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
		);
		this.key = await crypto.subtle.deriveKey(
			{ name: 'PBKDF2', salt: enc.encode('pec-chat-v2-salt'), iterations: 100000, hash: 'SHA-256' },
			raw,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
	},

	clear() { this.key = null; },

	async encryptText(plain) {
		if (!this.key) return null;
		const iv  = crypto.getRandomValues(new Uint8Array(12));
		const buf = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			this.key,
			new TextEncoder().encode(plain)
		);
		const out = new Uint8Array(12 + buf.byteLength);
		out.set(iv);
		out.set(new Uint8Array(buf), 12);
		return u8ToB64(out);
	},

	async decryptText(b64) {
		if (!this.key) return null;
		const arr = b64ToU8(b64);
		const dec = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: arr.slice(0, 12) },
			this.key,
			arr.slice(12)
		);
		return new TextDecoder().decode(dec);
	},

	async encryptBuffer(ab) {
		if (!this.key) return ab;
		const iv  = crypto.getRandomValues(new Uint8Array(12));
		const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, ab);
		const out = new Uint8Array(12 + enc.byteLength);
		out.set(iv);
		out.set(new Uint8Array(enc), 12);
		return out.buffer;
	},

	async decryptBuffer(ab) {
		if (!this.key) return ab;
		const arr = new Uint8Array(ab);
		return crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: arr.slice(0, 12) },
			this.key,
			arr.slice(12)
		);
	},
};

// ─── App State ────────────────────────────────────────────────────────────────
const S = {
	mode:           'firebase',
	user:           null,
	displayName:    localStorage.getItem('pec_chat_name')   || 'Anonymous',
	avatarUrl:      localStorage.getItem('pec_chat_avatar') || '',
	connected:      false,
	encryptEnabled: false,
	peerName:       'Peer',

	gradient: {
		start:     localStorage.getItem('pec_bg_start') || '#000000',
		end:       localStorage.getItem('pec_bg_end')   || '#000d1a',
		direction: localStorage.getItem('pec_bg_dir')   || 'to bottom right',
		power:     parseFloat(localStorage.getItem('pec_bg_power') || '2'),
		steps:     parseInt(  localStorage.getItem('pec_bg_steps') || '20'),
	},

	// File transfer
	inFiles:  new Map(),  // transferId -> { meta, chunks[] }

	// Media call
	mediaPc:     null,
	localStream: null,
	callType:    null,    // 'audio' | 'video' | 'screen'
	callState:   'idle',  // 'idle' | 'calling' | 'ringing' | 'active'
	callMuted:   false,
	callCamOff:  false,
	incomingCallData: null,
};

let engine        = null;
let cubicGradFn   = null;

// ─── Gradient ─────────────────────────────────────────────────────────────────
async function initGradient() {
	const mod = await import('https://proelectriccoder.github.io/ElectronCSS/CubicGradient.js');
	cubicGradFn = mod.cubicGradient;
	applyGradient();
}

function applyGradient() {
	if (!cubicGradFn) return;
	document.body.style.background = cubicGradFn(S.gradient);
	// Update preview swatch in settings if open
	const swatch = $('spGradPreview');
	if (swatch) swatch.style.background = cubicGradFn(S.gradient);
}

function saveGradient() {
	localStorage.setItem('pec_bg_start', S.gradient.start);
	localStorage.setItem('pec_bg_end',   S.gradient.end);
	localStorage.setItem('pec_bg_dir',   S.gradient.direction);
	localStorage.setItem('pec_bg_power', S.gradient.power);
	localStorage.setItem('pec_bg_steps', S.gradient.steps);
}

// ─── UI Injection ─────────────────────────────────────────────────────────────
// All panels (settings, call overlay, incoming call, lightbox) are injected by JS
// so the HTML stays lean.

function injectPanels() {
	// ── CSS ─────────────────────────────────────────────────────────────────
	const css = document.createElement('style');
	css.textContent = `
/* ── Settings overlay ── */
.sp-overlay {
	position: fixed; inset: 0; z-index: 500;
	display: flex; justify-content: flex-end;
	background: rgba(0,0,0,0.55);
	backdrop-filter: blur(4px);
	opacity: 0; pointer-events: none;
	transition: opacity 0.25s ease;
}
.sp-overlay.open { opacity: 1; pointer-events: auto; }

.sp-panel {
	width: 320px; height: 100%; max-width: 92vw;
	background: rgba(5,5,18,0.97);
	border-left: 1px solid rgba(0,255,255,0.14);
	display: flex; flex-direction: column; overflow: hidden;
	transform: translateX(28px);
	transition: transform 0.25s ease;
}
.sp-overlay.open .sp-panel { transform: translateX(0); }

.sp-head {
	display: flex; align-items: center; justify-content: space-between;
	padding: 16px 20px 14px;
	border-bottom: 1px solid rgba(0,255,255,0.1);
}
.sp-head-title { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 800; }
.sp-close {
	width: 28px; height: 28px; border-radius: 6px;
	border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
	color: rgba(232,237,248,0.55); cursor: pointer; display: flex;
	align-items: center; justify-content: center; transition: all 0.15s;
	font-size: 1.1rem; line-height: 1;
}
.sp-close:hover { background: rgba(255,68,85,0.15); color: #ff4455; border-color: rgba(255,68,85,0.3); }

.sp-body { flex: 1; overflow-y: auto; padding: 0 0 40px; }
.sp-section { padding: 18px 20px; border-bottom: 1px solid rgba(0,255,255,0.07); }
.sp-section-label {
	font-family: 'JetBrains Mono', monospace;
	font-size: 0.6rem; letter-spacing: 0.2em; text-transform: uppercase;
	color: rgba(0,255,255,0.5); margin-bottom: 14px;
}

/* Settings form controls */
.sp-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.sp-label { font-size: 0.82rem; color: rgba(232,237,248,0.7); }
.sp-field-label { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(232,237,248,0.3); margin-bottom: 5px; }

.sp-input {
	background: rgba(0,0,0,0.4); border: 1px solid rgba(0,255,255,0.12);
	border-radius: 7px; color: #e8edf8;
	font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;
	padding: 7px 10px; outline: none; transition: border-color 0.2s; width: 100%;
}
.sp-input:focus { border-color: #00ffff; }
.sp-input::placeholder { color: rgba(232,237,248,0.25); }

/* Profile */
.sp-avatar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.sp-avatar {
	width: 44px; height: 44px; border-radius: 50%;
	object-fit: cover; background: rgba(0,255,255,0.08);
	border: 1px solid rgba(0,255,255,0.2); flex-shrink: 0;
}
.sp-avatar-fallback {
	width: 44px; height: 44px; border-radius: 50%;
	background: rgba(0,255,255,0.08); border: 1px solid rgba(0,255,255,0.2);
	display: flex; align-items: center; justify-content: center;
	font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 700; color: #00ffff;
	flex-shrink: 0;
}

/* Gradient preview */
.sp-grad-preview {
	height: 48px; border-radius: 8px; border: 1px solid rgba(0,255,255,0.12);
	margin-bottom: 14px; transition: background 0.3s;
}

/* Color row */
.sp-color-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.sp-color-swatch {
	width: 32px; height: 32px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12);
	overflow: hidden; flex-shrink: 0; cursor: pointer; position: relative;
}
.sp-color-swatch input[type="color"] {
	position: absolute; inset: -4px; opacity: 0; width: calc(100% + 8px); height: calc(100% + 8px); cursor: pointer;
}
.sp-color-swatch-face { width: 100%; height: 100%; }

/* Slider row */
.sp-slider-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.sp-slider-val {
	font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: #00ffff;
	background: rgba(0,255,255,0.08); padding: 2px 8px; border-radius: 4px; min-width: 32px; text-align: center;
}
input[type="range"].sp-range {
	flex: 1; -webkit-appearance: none; height: 3px;
	background: rgba(255,255,255,0.08); border-radius: 4px; outline: none; cursor: pointer;
}
input[type="range"].sp-range::-webkit-slider-thumb {
	-webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
	background: #00ffff; border: 2px solid rgba(255,255,255,0.85);
	box-shadow: 0 0 8px rgba(0,255,255,0.5); cursor: grab;
}

/* Toggle switch */
.sp-toggle { position: relative; width: 38px; height: 21px; cursor: pointer; flex-shrink: 0; }
.sp-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
.sp-toggle-track {
	position: absolute; inset: 0; background: rgba(255,255,255,0.1);
	border: 1px solid rgba(255,255,255,0.12); border-radius: 11px; transition: all 0.2s;
}
.sp-toggle input:checked ~ .sp-toggle-track { background: #00ff88; border-color: #00ff88; }
.sp-toggle-thumb {
	position: absolute; top: 2px; left: 2px; width: 15px; height: 15px;
	background: #fff; border-radius: 50%; transition: transform 0.2s;
}
.sp-toggle input:checked ~ .sp-toggle-thumb { transform: translateX(17px); }

/* Encrypt key status */
.sp-key-status {
	font-family: 'JetBrains Mono', monospace; font-size: 0.68rem;
	padding: 4px 10px; border-radius: 4px; margin-top: 6px; display: inline-block;
}
.sp-key-status.ok  { background: rgba(0,255,136,0.1); color: #00ff88; }
.sp-key-status.off { background: rgba(255,255,255,0.04); color: rgba(232,237,248,0.3); }

/* ── Call Overlay ── */
.call-overlay {
	position: fixed; inset: 0; z-index: 600;
	background: #000;
	display: none; flex-direction: column;
}
.call-overlay.active { display: flex; }

.call-remote-video {
	flex: 1; width: 100%; object-fit: cover; background: #000; display: block;
}
.call-audio-bg {
	flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
	background: linear-gradient(to bottom, #000d1a, #000);
}
.call-audio-avatar {
	width: 80px; height: 80px; border-radius: 50%;
	background: rgba(0,255,255,0.1); border: 2px solid rgba(0,255,255,0.3);
	display: flex; align-items: center; justify-content: center;
	font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 800; color: #00ffff;
}
.call-status-text {
	font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: rgba(232,237,248,0.5);
}

.call-local-video {
	position: absolute; bottom: 90px; right: 16px;
	width: 140px; height: 105px; border-radius: 10px; overflow: hidden;
	border: 1px solid rgba(255,255,255,0.15);
	background: #111; object-fit: cover;
	display: none;
}
.call-local-video.visible { display: block; }

.call-controls {
	position: absolute; bottom: 0; left: 0; right: 0;
	display: flex; align-items: center; justify-content: center; gap: 16px;
	padding: 20px;
	background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
}
.call-ctrl-btn {
	width: 52px; height: 52px; border-radius: 50%;
	display: flex; align-items: center; justify-content: center;
	border: none; cursor: pointer; transition: all 0.18s;
}
.call-ctrl-btn svg { width: 22px; height: 22px; }
.call-ctrl-btn.mute  { background: rgba(255,255,255,0.12); color: #e8edf8; }
.call-ctrl-btn.cam   { background: rgba(255,255,255,0.12); color: #e8edf8; }
.call-ctrl-btn.end   { background: #ff4455; color: #fff; }
.call-ctrl-btn.screen { background: rgba(255,255,255,0.12); color: #e8edf8; }
.call-ctrl-btn.off   { background: rgba(255,68,85,0.25); color: #ff4455; }
.call-ctrl-btn:hover { filter: brightness(1.15); transform: scale(1.05); }

.call-type-badge {
	position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
	font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; letter-spacing: 0.1em;
	background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15);
	border-radius: 20px; padding: 4px 14px; color: rgba(232,237,248,0.7);
}

/* ── Incoming Call Dialog ── */
.incoming-dialog {
	position: fixed; inset: 0; z-index: 700;
	display: none; align-items: center; justify-content: center;
	background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
}
.incoming-dialog.active { display: flex; }
.incoming-box {
	background: rgba(5,5,18,0.98); border: 1px solid rgba(0,255,255,0.2);
	border-radius: 16px; padding: 32px 28px; text-align: center;
	display: flex; flex-direction: column; align-items: center; gap: 18px;
	max-width: 300px; width: 90%; box-shadow: 0 0 60px rgba(0,255,255,0.08);
	animation: incoming-pulse 1.5s ease-in-out infinite;
}
@keyframes incoming-pulse {
	0%,100% { box-shadow: 0 0 30px rgba(0,255,255,0.08); }
	50%      { box-shadow: 0 0 60px rgba(0,255,255,0.2); }
}
.incoming-icon { font-size: 2.8rem; }
.incoming-title { font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 800; }
.incoming-sub { font-size: 0.8rem; color: rgba(232,237,248,0.5); }
.incoming-btns { display: flex; gap: 12px; width: 100%; }

/* ── Lightbox ── */
.lightbox {
	position: fixed; inset: 0; z-index: 800;
	background: rgba(0,0,0,0.92); display: none;
	align-items: center; justify-content: center; cursor: zoom-out;
}
.lightbox.active { display: flex; }
.lightbox img { max-width: 95vw; max-height: 95vh; border-radius: 8px; object-fit: contain; }

/* ── File progress ── */
.file-progress-bar {
	height: 3px; background: rgba(0,255,255,0.15); border-radius: 2px; overflow: hidden; margin-top: 6px;
}
.file-progress-fill { height: 100%; background: #00ffff; border-radius: 2px; transition: width 0.2s; }

/* ── Encryption badge ── */
.enc-badge {
	display: inline-flex; align-items: center; gap: 3px;
	font-family: 'JetBrains Mono', monospace; font-size: 0.6rem;
	color: #00ff88; background: rgba(0,255,136,0.08);
	border: 1px solid rgba(0,255,136,0.2); border-radius: 4px; padding: 1px 6px;
	margin-left: 4px; vertical-align: middle;
}
`;
	document.head.appendChild(css);

	// ── Settings Panel ──────────────────────────────────────────────────────
	const spEl = document.createElement('div');
	spEl.id = 'settingsOverlay';
	spEl.className = 'sp-overlay';
	spEl.innerHTML = `
	<div class="sp-panel">
		<div class="sp-head">
			<span class="sp-head-title">Settings</span>
			<button class="sp-close" onclick="App.closeSettings()" aria-label="Close">&#x2715;</button>
		</div>
		<div class="sp-body">

			<!-- Profile -->
			<div class="sp-section">
				<div class="sp-section-label">Profile</div>
				<div class="sp-avatar-row">
					<div id="spAvatarWrap"></div>
					<div style="flex:1;min-width:0">
						<div class="sp-field-label">Display Name</div>
						<input type="text" class="sp-input" id="spDisplayName" placeholder="Your name…" maxlength="32">
					</div>
				</div>
				<button class="btn btn-primary btn-full" onclick="App.saveDisplayName()">Save Name</button>
			</div>

			<!-- Background gradient -->
			<div class="sp-section">
				<div class="sp-section-label">Background Gradient</div>
				<div id="spGradPreview" class="sp-grad-preview"></div>

				<div class="sp-field-label">Start Color</div>
				<div class="sp-color-row" style="margin-bottom:10px">
					<div class="sp-color-swatch">
						<div id="spStartFace" class="sp-color-swatch-face"></div>
						<input type="color" id="spStartPicker">
					</div>
					<input type="text" class="sp-input" id="spStartHex" maxlength="9" placeholder="#000000">
				</div>

				<div class="sp-field-label">End Color</div>
				<div class="sp-color-row" style="margin-bottom:12px">
					<div class="sp-color-swatch">
						<div id="spEndFace" class="sp-color-swatch-face"></div>
						<input type="color" id="spEndPicker">
					</div>
					<input type="text" class="sp-input" id="spEndHex" maxlength="9" placeholder="#000d1a">
				</div>

				<div class="sp-field-label">Direction</div>
				<select class="sp-input" id="spDirection" style="margin-bottom:12px;cursor:pointer">
					<option value="to bottom right">↘ Top-Left → Bottom-Right</option>
					<option value="to bottom">↓ Top → Bottom</option>
					<option value="to right">→ Left → Right</option>
					<option value="to bottom left">↙ Top-Right → Bottom-Left</option>
					<option value="to top right">↗ Bottom-Left → Top-Right</option>
					<option value="135deg">135°</option>
					<option value="45deg">45°</option>
				</select>

				<div class="sp-field-label">Power (easing curve)</div>
				<div class="sp-slider-row" style="margin-bottom:10px">
					<input type="range" class="sp-range" id="spPower" min="1" max="8" step="0.5" value="2">
					<div class="sp-slider-val" id="spPowerVal">2</div>
				</div>

				<div class="sp-field-label">Steps (smoothness)</div>
				<div class="sp-slider-row" style="margin-bottom:14px">
					<input type="range" class="sp-range" id="spSteps" min="4" max="32" step="2" value="20">
					<div class="sp-slider-val" id="spStepsVal">20</div>
				</div>

				<div style="display:flex;gap:8px">
					<button class="btn btn-secondary" style="flex:1" onclick="App.resetGradient()">Reset</button>
					<button class="btn btn-primary" style="flex:1" onclick="App.saveGradientSettings()">Save</button>
				</div>
			</div>

			<!-- Encryption -->
			<div class="sp-section">
				<div class="sp-section-label">Message Encryption</div>
				<div class="sp-row" style="margin-bottom:14px">
					<span class="sp-label">AES-256-GCM Encryption</span>
					<label class="sp-toggle">
						<input type="checkbox" id="spEncToggle" onchange="App.handleEncryptToggle()">
						<div class="sp-toggle-track"></div>
						<div class="sp-toggle-thumb"></div>
					</label>
				</div>
				<div id="spEncPasswordRow" style="display:none">
					<div class="sp-field-label">Shared Password (both peers must use the same)</div>
					<input type="password" class="sp-input" id="spEncPassword" placeholder="Enter shared password…" style="margin-bottom:8px">
					<button class="btn btn-primary btn-full" onclick="App.applyEncryption()">Apply Key</button>
				</div>
				<div id="spEncStatus" class="sp-key-status off">Encryption off</div>
			</div>

			<!-- About -->
			<div class="sp-section">
				<div class="sp-section-label">About</div>
				<div style="font-size:0.78rem;color:rgba(232,237,248,0.4);line-height:1.6">
					P2P Chat App · ProElectricCoder<br>
					WebRTC + Firebase signaling<br>
					<a href="/Projects/Chat/" target="_blank" style="color:#00ffff;text-decoration:none">View Documentation →</a>
				</div>
			</div>

		</div>
	</div>`;
	spEl.addEventListener('click', e => { if (e.target === spEl) App.closeSettings(); });
	document.body.appendChild(spEl);

	// ── Call Overlay ─────────────────────────────────────────────────────────
	const callEl = document.createElement('div');
	callEl.id = 'callOverlay';
	callEl.className = 'call-overlay';
	callEl.innerHTML = `
	<div id="callRemoteWrap" style="flex:1;position:relative;display:flex;flex-direction:column">
		<video id="remoteVideo" class="call-remote-video" autoplay playsinline style="display:none"></video>
		<div id="callAudioBg" class="call-audio-bg">
			<div class="call-audio-avatar" id="callPeerInitial">?</div>
			<div class="call-status-text" id="callStatusText">Connecting…</div>
		</div>
	</div>
	<video id="localVideo" class="call-local-video" autoplay playsinline muted></video>
	<div class="call-type-badge" id="callTypeBadge">Voice Call</div>
	<div class="call-controls">
		<button class="call-ctrl-btn mute" id="callMuteBtn" title="Mute" onclick="App.toggleMute()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg>
		</button>
		<button class="call-ctrl-btn cam hidden" id="callCamBtn" title="Camera" onclick="App.toggleCamera()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" d="M15.75 10.5 20.47 5.78A.75.75 0 0 1 21.75 6.286v11.428a.75.75 0 0 1-1.28.53L15.75 13.5M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
		</button>
		<button class="call-ctrl-btn end" title="End Call" onclick="App.endCall()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
		</button>
		<button class="call-ctrl-btn screen hidden" id="callScreenBtn" title="Stop sharing" onclick="App.stopScreenShare()">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"/></svg>
		</button>
	</div>`;
	document.body.appendChild(callEl);

	// ── Incoming Call Dialog ────────────────────────────────────────────────
	const incEl = document.createElement('div');
	incEl.id = 'incomingCallDialog';
	incEl.className = 'incoming-dialog';
	incEl.innerHTML = `
	<div class="incoming-box">
		<div class="incoming-icon" id="incomingIcon">📞</div>
		<div class="incoming-title" id="incomingTitle">Incoming Call</div>
		<div class="incoming-sub" id="incomingSubtitle">Voice call from Peer</div>
		<div class="incoming-btns">
			<button class="btn btn-danger" style="flex:1" onclick="App.rejectCall()">Decline</button>
			<button class="btn btn-primary" style="flex:1" onclick="App.acceptCall()">Accept</button>
		</div>
	</div>`;
	document.body.appendChild(incEl);

	// ── Lightbox ─────────────────────────────────────────────────────────────
	const lbEl = document.createElement('div');
	lbEl.id = 'lightbox';
	lbEl.className = 'lightbox';
	lbEl.onclick = () => App.closeLightbox();
	lbEl.innerHTML = `<img id="lightboxImg" src="" alt="">`;
	document.body.appendChild(lbEl);
}

// ─── Firebase Auth ────────────────────────────────────────────────────────────
function initFirebase() {
	try {
		if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
		firebase.auth().onAuthStateChanged(user => {
			S.user = user;
			if (user) {
				// Auth name / avatar (use stored custom name if set)
				const stored = localStorage.getItem('pec_chat_name');
				if (!stored) {
					S.displayName = user.displayName || 'Anonymous';
					localStorage.setItem('pec_chat_name', S.displayName);
				}
				S.avatarUrl = user.photoURL || '';
				localStorage.setItem('pec_chat_avatar', S.avatarUrl);
				renderAuthCard();
				$('fbSignInPrompt').classList.add('hidden');
				$('fbRoomControls').classList.remove('hidden');
			} else {
				$('fbAuthCard').innerHTML = '';
				$('fbAuthCard').classList.add('hidden');
				$('fbSignInPrompt').classList.remove('hidden');
				$('fbRoomControls').classList.add('hidden');
			}
			syncSettingsProfile();
		});
	} catch (e) {
		console.warn('[Chat] Firebase unavailable — Direct mode only', e.message);
	}
}

function renderAuthCard() {
	const card = $('fbAuthCard');
	const initials = (S.user?.displayName || S.displayName || '?')[0].toUpperCase();
	card.innerHTML = `
		<div class="user-card">
			<img class="user-avatar" src="${S.user?.photoURL || ''}" alt=""
				onerror="this.style.display='none'"
				style="${S.user?.photoURL ? '' : 'display:none'}">
			${S.user?.photoURL ? '' : `<div style="width:28px;height:28px;border-radius:50%;background:rgba(0,255,255,0.1);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:0.9rem;color:#00ffff;flex-shrink:0">${initials}</div>`}
			<span class="user-name">${S.displayName}</span>
		</div>
		<button class="btn btn-danger btn-full" onclick="App.signOut()">Sign Out</button>
	`;
	card.classList.remove('hidden');
}

// ─── Engine Setup ─────────────────────────────────────────────────────────────
function setupEngine(eng) {
	engine = eng;

	eng.onPeerConnected(peerId => {
		S.connected = true;
		setStatus('connected', 'Connected');
		showChatView();
		addSysMsg('Connection established ✓');
		showCallButtons(true);
		// Exchange display names
		safeSend({ type: 'handshake', displayName: S.displayName, avatarUrl: S.avatarUrl });
	});

	eng.onPeerDisconnected(() => {
		S.connected = false;
		setStatus('disconnected', 'Disconnected');
		addSysMsg('Peer disconnected');
		showCallButtons(false);
		endCallInternal(false);
	});

	eng.onMessage(handleMessage);
}

// ─── Message Protocol ─────────────────────────────────────────────────────────
async function handleMessage(data) {
	if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
	if (!(data && typeof data === 'object' && data.type)) return;

	switch (data.type) {

		case 'handshake':
			S.peerName = data.displayName || 'Peer';
			addSysMsg(`${S.peerName} joined`);
			break;

		case 'chat': {
			let text = data.text;
			let isEncrypted = !!data.encrypted;
			if (isEncrypted) {
				if (!Crypt.key) {
					addBubble('[🔒 Encrypted — set the same password in Settings]', S.peerName, 'theirs', false);
					return;
				}
				try { text = await Crypt.decryptText(text); }
				catch { addBubble('[⚠ Decryption failed — wrong key?]', S.peerName, 'theirs', false); return; }
			}
			addBubble(text, data.displayName || S.peerName, 'theirs', isEncrypted);
			break;
		}

		case 'file-meta':
			S.inFiles.set(data.id, { meta: data, chunks: [] });
			addSysMsg(`${data.displayName || S.peerName} sending ${data.name} (${fmtSize(data.size)})`);
			break;

		case 'file-chunk': {
			const f = S.inFiles.get(data.id);
			if (f) f.chunks.push(data.data);
			break;
		}

		case 'file-done':
			await receiveFileDone(data.id);
			break;

		case 'call-offer':
			handleIncomingCallOffer(data);
			break;

		case 'call-answer':
			if (S.mediaPc) {
				await S.mediaPc.setRemoteDescription(
					new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
				).catch(e => console.error('setRemoteDescription(answer):', e));
				S.callState = 'active';
				setCallStatusText('In call · ' + (S.callType || ''));
			}
			break;

		case 'call-ice':
			if (S.mediaPc && data.candidate) {
				S.mediaPc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
			}
			break;

		case 'call-end':
			endCallInternal(false);
			addSysMsg('Call ended by peer');
			break;

		case 'call-reject':
			endCallInternal(false);
			addSysMsg('Call declined by peer');
			break;

		case 'display-name':
			S.peerName = data.displayName;
			addSysMsg(`Peer renamed to ${S.peerName}`);
			break;
	}
}

// ─── Chat Rendering ───────────────────────────────────────────────────────────
function addBubble(text, from, side, encrypted = false) {
	const list = $('messages');
	const wrap = document.createElement('div');
	wrap.className = `message ${side}`;
	const encBadge = encrypted ? '<span class="enc-badge">🔒 encrypted</span>' : '';
	wrap.innerHTML = `
		<div class="message-meta">${escHtml(from)} · ${timeNow()}${encBadge}</div>
		<div class="message-bubble">${escHtml(text).replace(/\n/g, '<br>')}</div>`;
	list.appendChild(wrap);
	list.scrollTop = list.scrollHeight;
}

function addSysMsg(text) {
	const list = $('messages');
	const d = document.createElement('div');
	d.className = 'system-msg';
	d.textContent = text;
	list.appendChild(d);
	list.scrollTop = list.scrollHeight;
}

// ─── File Transfer ────────────────────────────────────────────────────────────
async function sendFile(file) {
	if (!S.connected) { toast('Not connected'); return; }
	if (file.size > 200 * 1024 * 1024) { toast('File too large (max 200 MB)'); return; }

	const id = randId();
	const isEnc = S.encryptEnabled && !!Crypt.key;
	let buf = await file.arrayBuffer();
	if (isEnc) buf = await Crypt.encryptBuffer(buf);

	const b64 = bufToB64(buf);
	const chunks = Math.ceil(b64.length / CHUNK_SIZE);

	safeSend({ type: 'file-meta', id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', chunks, encrypted: isEnc, displayName: S.displayName });

	for (let i = 0; i < chunks; i++) {
		safeSend({ type: 'file-chunk', id, index: i, data: b64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
		if (i % 8 === 0) await sleep(0); // yield every 8 chunks
	}

	safeSend({ type: 'file-done', id });
	// Show sent preview using original unencrypted buffer
	const origBuf = await file.arrayBuffer();
	renderFilePreview({ name: file.name, size: file.size, mime: file.type || 'application/octet-stream' }, URL.createObjectURL(new Blob([origBuf], { type: file.type })), 'mine', isEnc);
}

async function receiveFileDone(id) {
	const entry = S.inFiles.get(id);
	if (!entry) return;
	S.inFiles.delete(id);

	const { meta, chunks } = entry;
	let buf = b64ToBuf(chunks.join(''));

	if (meta.encrypted) {
		if (!Crypt.key) {
			addSysMsg(`⚠ Cannot decrypt ${meta.name} — no encryption key set`);
			return;
		}
		try { buf = await Crypt.decryptBuffer(buf); }
		catch { addSysMsg(`⚠ Failed to decrypt ${meta.name} — wrong key?`); return; }
	}

	const blob = new Blob([buf], { type: meta.mime });
	renderFilePreview(meta, URL.createObjectURL(blob), 'theirs', meta.encrypted);
}

function renderFilePreview(meta, url, side, encrypted = false) {
	const list = $('messages');
	const wrap = document.createElement('div');
	wrap.className = `message ${side}`;
	const from = side === 'mine' ? S.displayName : (S.peerName || 'Peer');
	const encBadge = encrypted ? '<span class="enc-badge">🔒 encrypted</span>' : '';

	let body = '';
	if (meta.mime.startsWith('image/')) {
		body = `<img src="${url}" class="preview-img" alt="${escHtml(meta.name)}" loading="lazy"
			onclick="App.openLightbox('${url}')" style="cursor:zoom-in">`;
	} else if (meta.mime.startsWith('audio/')) {
		body = `<audio controls src="${url}" style="max-width:260px;width:100%;margin:2px 0"></audio>
			<div style="font-size:0.72rem;font-family:'JetBrains Mono',monospace;color:rgba(232,237,248,0.4);margin-top:4px">${escHtml(meta.name)}</div>`;
	} else if (meta.mime.startsWith('video/')) {
		body = `<video controls src="${url}" style="max-width:300px;width:100%;border-radius:8px;display:block"></video>
			<div style="font-size:0.72rem;font-family:'JetBrains Mono',monospace;color:rgba(232,237,248,0.4);margin-top:4px">${escHtml(meta.name)}</div>`;
	} else {
		body = `<div class="file-card">
			<span style="font-size:1.6rem;flex-shrink:0">${fileEmoji(meta.mime)}</span>
			<div class="file-card-info">
				<div class="file-card-name">${escHtml(meta.name)}</div>
				<div class="file-card-size">${fmtSize(meta.size)}</div>
			</div>
			<a href="${url}" download="${escHtml(meta.name)}" class="btn btn-secondary" style="padding:6px 11px;font-size:0.7rem;flex-shrink:0">↓</a>
		</div>`;
	}

	wrap.innerHTML = `
		<div class="message-meta">${escHtml(from)} · ${timeNow()}${encBadge}</div>
		<div class="message-bubble" style="padding:8px">${body}</div>`;
	list.appendChild(wrap);
	list.scrollTop = list.scrollHeight;
}

// ─── Media Calls ──────────────────────────────────────────────────────────────
async function startCall(type) {
	if (!S.connected) { toast('Not connected'); return; }
	if (S.callState !== 'idle') { toast('Already in a call'); return; }
	S.callType  = type;
	S.callState = 'calling';

	try {
		const stream = await getMediaStream(type);
		S.localStream = stream;

		S.mediaPc = buildMediaPC();
		stream.getTracks().forEach(t => S.mediaPc.addTrack(t, stream));

		const offer = await S.mediaPc.createOffer();
		await S.mediaPc.setLocalDescription(offer);
		safeSend({ type: 'call-offer', sdp: offer.sdp, callType: type, displayName: S.displayName });

		showCallOverlay(type, stream, null);
		setCallStatusText('Calling…');
		addSysMsg(`Calling (${type})…`);
	} catch (e) {
		toast('Could not start call: ' + e.message);
		endCallInternal(false);
	}
}

async function handleIncomingCallOffer(data) {
	S.callState = 'ringing';
	S.incomingCallData = data;

	const icons = { audio: '🎤', video: '📹', screen: '🖥️' };
	$('incomingIcon').textContent    = icons[data.callType] || '📞';
	$('incomingTitle').textContent   = 'Incoming Call';
	$('incomingSubtitle').textContent = `${data.displayName || 'Peer'} — ${data.callType || 'voice'}`;
	$('incomingCallDialog').classList.add('active');
}

async function acceptCall() {
	$('incomingCallDialog').classList.remove('active');
	const data = S.incomingCallData;
	if (!data) return;
	S.callType  = data.callType;
	S.callState = 'active';

	try {
		// For screen call we still answer with camera/mic
		const answerType = data.callType === 'screen' ? 'audio' : data.callType;
		const stream = await getMediaStream(answerType);
		S.localStream = stream;

		S.mediaPc = buildMediaPC();
		stream.getTracks().forEach(t => S.mediaPc.addTrack(t, stream));

		await S.mediaPc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
		const answer = await S.mediaPc.createAnswer();
		await S.mediaPc.setLocalDescription(answer);
		safeSend({ type: 'call-answer', sdp: answer.sdp });

		showCallOverlay(data.callType, stream, null);
		setCallStatusText('In call · ' + data.callType);
		addSysMsg(`Call started (${data.callType})`);
	} catch (e) {
		toast('Could not accept call: ' + e.message);
		safeSend({ type: 'call-reject' });
		endCallInternal(false);
	}
}

function rejectCall() {
	$('incomingCallDialog').classList.remove('active');
	safeSend({ type: 'call-reject' });
	S.callState = 'idle';
	S.incomingCallData = null;
}

function buildMediaPC() {
	const pc = new RTCPeerConnection(ICE_CFG);
	pc.onicecandidate = evt => {
		if (evt.candidate) safeSend({ type: 'call-ice', candidate: evt.candidate.toJSON() });
	};
	pc.ontrack = evt => {
		const rv = $('remoteVideo');
		rv.srcObject = evt.streams[0];
		rv.style.display = 'block';
		$('callAudioBg').style.display = 'none';
	};
	pc.onconnectionstatechange = () => {
		if (pc.connectionState === 'failed') {
			endCallInternal(true);
			toast('Call connection failed');
		}
	};
	return pc;
}

async function getMediaStream(type) {
	if (type === 'screen') {
		return navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true });
	} else if (type === 'video') {
		return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
	} else {
		return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
	}
}

function showCallOverlay(type, localStream, remoteStream) {
	const overlay = $('callOverlay');
	overlay.classList.add('active');

	// Local PiP
	const lv = $('localVideo');
	if (localStream && (type === 'video' || type === 'screen')) {
		lv.srcObject = localStream;
		lv.classList.add('visible');
	} else {
		lv.classList.remove('visible');
	}

	// Remote area — initially show audio bg
	const rv = $('remoteVideo');
	rv.style.display = 'none';
	$('callAudioBg').style.display = 'flex';

	// Peer initial letter
	$('callPeerInitial').textContent = (S.peerName || 'P')[0].toUpperCase();

	// Badge
	const labels = { audio: '🎤 Voice Call', video: '📹 Video Call', screen: '🖥️ Screen Share' };
	$('callTypeBadge').textContent = labels[type] || 'Call';

	// Show/hide camera button
	$('callCamBtn').classList.toggle('hidden', type !== 'video');
	$('callScreenBtn').classList.toggle('hidden', type !== 'screen');
}

function setCallStatusText(text) {
	$('callStatusText').textContent = text;
}

function endCallInternal(notify = true) {
	if (notify && S.connected && S.callState !== 'idle') safeSend({ type: 'call-end' });

	$('incomingCallDialog').classList.remove('active');
	$('callOverlay').classList.remove('active');

	if (S.localStream) { S.localStream.getTracks().forEach(t => t.stop()); S.localStream = null; }
	if (S.mediaPc)     { S.mediaPc.close(); S.mediaPc = null; }

	S.callState   = 'idle';
	S.callType    = null;
	S.callMuted   = false;
	S.callCamOff  = false;
	S.incomingCallData = null;

	const rv = $('remoteVideo'); rv.srcObject = null;
	const lv = $('localVideo');  lv.srcObject = null; lv.classList.remove('visible');
}

function toggleMute() {
	S.callMuted = !S.callMuted;
	S.localStream?.getAudioTracks().forEach(t => t.enabled = !S.callMuted);
	const btn = $('callMuteBtn');
	btn.classList.toggle('off', S.callMuted);
	btn.title = S.callMuted ? 'Unmute' : 'Mute';
}

function toggleCamera() {
	S.callCamOff = !S.callCamOff;
	S.localStream?.getVideoTracks().forEach(t => t.enabled = !S.callCamOff);
	const btn = $('callCamBtn');
	btn.classList.toggle('off', S.callCamOff);
	btn.title = S.callCamOff ? 'Camera On' : 'Camera Off';
}

async function stopScreenShare() {
	// Stop screen tracks; optionally switch to camera
	S.localStream?.getTracks().forEach(t => t.stop());
	endCallInternal(true);
	addSysMsg('Screen share ended');
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function openSettings() {
	syncSettingsProfile();
	syncGradientControls();
	$('settingsOverlay').classList.add('open');
}

function closeSettings() {
	$('settingsOverlay').classList.remove('open');
}

function syncSettingsProfile() {
	const nameInput = $('spDisplayName');
	if (nameInput) nameInput.value = S.displayName;

	const wrap = $('spAvatarWrap');
	if (!wrap) return;
	if (S.avatarUrl) {
		wrap.innerHTML = `<img class="sp-avatar" src="${S.avatarUrl}" alt="" onerror="this.parentElement.innerHTML='<div class=sp-avatar-fallback>${(S.displayName[0] || '?').toUpperCase()}</div>'">`;
	} else {
		wrap.innerHTML = `<div class="sp-avatar-fallback">${(S.displayName[0] || '?').toUpperCase()}</div>`;
	}
}

function syncGradientControls() {
	const g = S.gradient;
	setVal('spStartHex', g.start);
	setVal('spEndHex',   g.end);
	setVal('spDirection', g.direction);
	setVal('spPower',    g.power);
	setVal('spSteps',    g.steps);
	setText('spPowerVal', g.power);
	setText('spStepsVal', g.steps);

	// Color swatches
	const sf = $('spStartFace'); if (sf) sf.style.background = g.start;
	const ef = $('spEndFace');   if (ef) ef.style.background = g.end;

	// Gradient preview bar
	applyGradient();

	// Picker sync
	const sp = $('spStartPicker'); if (sp) sp.value = g.start.slice(0, 7);
	const ep = $('spEndPicker');   if (ep) ep.value = g.end.slice(0, 7);
}

function bindGradientControls() {
	// Hex text → gradient
	on('spStartHex', 'input', e => {
		if (validHex(e.target.value)) { S.gradient.start = e.target.value; $('spStartFace').style.background = S.gradient.start; applyGradient(); }
	});
	on('spEndHex', 'input', e => {
		if (validHex(e.target.value)) { S.gradient.end = e.target.value; $('spEndFace').style.background = S.gradient.end; applyGradient(); }
	});

	// Color pickers → update hex + gradient
	on('spStartPicker', 'input', e => {
		const alpha = $('spStartHex').value.length === 9 ? $('spStartHex').value.slice(7) : '';
		S.gradient.start = e.target.value + alpha;
		setVal('spStartHex', S.gradient.start);
		$('spStartFace').style.background = S.gradient.start;
		applyGradient();
	});
	on('spEndPicker', 'input', e => {
		const alpha = $('spEndHex').value.length === 9 ? $('spEndHex').value.slice(7) : '';
		S.gradient.end = e.target.value + alpha;
		setVal('spEndHex', S.gradient.end);
		$('spEndFace').style.background = S.gradient.end;
		applyGradient();
	});

	on('spDirection', 'change', e => { S.gradient.direction = e.target.value; applyGradient(); });

	on('spPower', 'input', e => {
		S.gradient.power = parseFloat(e.target.value);
		setText('spPowerVal', S.gradient.power);
		applyGradient();
	});
	on('spSteps', 'input', e => {
		S.gradient.steps = parseInt(e.target.value);
		setText('spStepsVal', S.gradient.steps);
		applyGradient();
	});
}

// ─── Encryption ───────────────────────────────────────────────────────────────
function handleEncryptToggle() {
	const on = $('spEncToggle').checked;
	$('spEncPasswordRow').style.display = on ? 'block' : 'none';
	if (!on) {
		Crypt.clear();
		S.encryptEnabled = false;
		$('spEncStatus').textContent = 'Encryption off';
		$('spEncStatus').className = 'sp-key-status off';
	}
}

async function applyEncryption() {
	const pw = $('spEncPassword').value.trim();
	if (!pw) { toast('Enter a password first'); return; }
	try {
		await Crypt.derive(pw);
		S.encryptEnabled = true;
		$('spEncStatus').textContent = '🔒 Key derived — encryption active';
		$('spEncStatus').className = 'sp-key-status ok';
		toast('Encryption key applied');
	} catch (e) {
		toast('Key derivation failed: ' + e.message);
	}
}

// ─── Public App API ───────────────────────────────────────────────────────────
window.App = {

	// ── Auth ────────────────────────────────────────────────────────────────
	async signInGoogle() {
		try {
			const provider = new firebase.auth.GoogleAuthProvider();
			await firebase.auth().signInWithPopup(provider);
		} catch (e) { toast('Google sign-in failed: ' + e.message); }
	},

	async signInGitHub() {
		try {
			const provider = new firebase.auth.GithubAuthProvider();
			await firebase.auth().signInWithPopup(provider);
		} catch (e) { toast('GitHub sign-in failed: ' + e.message); }
	},

	async signOut() {
		try {
			await firebase.auth().signOut();
			if (engine) { engine.disconnect(); engine = null; }
			hideChatView();
			setStatus('disconnected', 'Disconnected');
			showCallButtons(false);
			S.connected = false;
		} catch (e) { toast('Sign-out failed: ' + e.message); }
	},

	// ── Mode ────────────────────────────────────────────────────────────────
	switchMode(mode) {
		S.mode = mode;
		$('tabFirebase').classList.toggle('active', mode === 'firebase');
		$('tabDirect').classList.toggle('active',   mode === 'direct');
		$('firebaseSidebar').classList.toggle('hidden', mode !== 'firebase');
		$('directSidebar').classList.toggle('hidden',   mode !== 'direct');
	},

	// ── Firebase room ────────────────────────────────────────────────────────
	async createRoom() {
		const id = $('roomIdInput').value.trim();
		if (!id) { toast('Enter a room ID'); return; }
		if (!S.user) { toast('Sign in first'); return; }

		const eng = new ChatEngine();
		eng.init(firebase.firestore());
		setupEngine(eng);
		setStatus('connecting', 'Waiting for peer…');

		try {
			await eng.createRoom(id);
			addSysMsg(`Room "${id}" created — waiting for peer to join`);
		} catch (e) {
			toast('createRoom failed: ' + e.message);
			setStatus('disconnected', 'Disconnected');
		}
	},

	async joinRoom() {
		const id = $('roomIdInput').value.trim();
		if (!id) { toast('Enter a room ID'); return; }
		if (!S.user) { toast('Sign in first'); return; }

		const eng = new ChatEngine();
		eng.init(firebase.firestore());
		setupEngine(eng);
		setStatus('connecting', 'Connecting…');

		try {
			await eng.joinRoom(id);
		} catch (e) {
			toast('joinRoom failed: ' + e.message);
			setStatus('disconnected', 'Disconnected');
		}
	},

	// ── Direct mode ──────────────────────────────────────────────────────────
	async directCreateOffer() {
		const eng = new DirectEngine();
		setupEngine(eng);
		setStatus('connecting', 'Generating offer…');

		try {
			const offer = await eng.createOffer();
			setVal('directOfferSDP', offer);
			show('directOfferGroup');
			show('directAnswerInputGroup');
			setStatus('connecting', 'Waiting for answer…');
		} catch (e) {
			toast('Offer failed: ' + e.message);
			setStatus('disconnected', 'Disconnected');
		}
	},

	async directSetAnswer() {
		const answer = $('directAnswerInput').value.trim();
		if (!answer) { toast('Paste the answer SDP first'); return; }
		if (!engine || !(engine instanceof DirectEngine)) { toast('Generate offer first'); return; }

		try {
			await engine.setAnswer(answer);
			addSysMsg('Answer applied — waiting for data channel…');
		} catch (e) {
			toast('Set answer failed: ' + e.message);
		}
	},

	async directAnswerOffer() {
		const offer = $('directRemoteOffer').value.trim();
		if (!offer) { toast('Paste the remote offer SDP first'); return; }

		const eng = new DirectEngine();
		setupEngine(eng);
		setStatus('connecting', 'Creating answer…');

		try {
			const answer = await eng.createAnswerFor(offer);
			setVal('directAnswerSDP', answer);
			show('directAnswerOutputGroup');
			setStatus('connecting', 'Waiting for connection…');
		} catch (e) {
			toast('Answer failed: ' + e.message);
			setStatus('disconnected', 'Disconnected');
		}
	},

	copyField(id) {
		const el = $(id);
		if (!el) return;
		navigator.clipboard.writeText(el.value).then(() => toast('Copied to clipboard'));
	},

	// ── Chat ─────────────────────────────────────────────────────────────────
	async sendMessage() {
		const input = $('messageInput');
		const text  = input.value.trim();
		if (!text) return;
		if (!S.connected) { toast('Not connected'); return; }

		let payload = text;
		let encrypted = false;

		if (S.encryptEnabled && Crypt.key) {
			try {
				payload   = await Crypt.encryptText(text);
				encrypted = true;
			} catch (e) {
				toast('Encryption error: ' + e.message); return;
			}
		}

		safeSend({ type: 'chat', text: payload, encrypted, displayName: S.displayName });
		addBubble(text, S.displayName, 'mine', encrypted);
		input.value = '';
		input.style.height = 'auto';
	},

	// ── Files ────────────────────────────────────────────────────────────────
	openFilePicker() { $('fileInput').click(); },
	handleFileSelect(files) { [...files].forEach(f => sendFile(f)); },
	handleDrop(e) {
		e.preventDefault();
		const files = [...(e.dataTransfer.files || [])];
		files.forEach(f => sendFile(f));
	},

	// ── Calls ────────────────────────────────────────────────────────────────
	startVoiceCall()  { startCall('audio');  },
	startVideoCall()  { startCall('video');  },
	startScreenShare(){ startCall('screen'); },
	endCall()         { endCallInternal(true); addSysMsg('Call ended'); },
	acceptCall,
	rejectCall,
	toggleMute,
	toggleCamera,
	stopScreenShare,

	// ── Settings ─────────────────────────────────────────────────────────────
	openSettings,
	closeSettings,

	saveDisplayName() {
		const name = $('spDisplayName').value.trim() || 'Anonymous';
		S.displayName = name;
		localStorage.setItem('pec_chat_name', name);
		if (S.connected) safeSend({ type: 'display-name', displayName: name });
		if (S.user) renderAuthCard();
		syncSettingsProfile();
		toast('Display name saved');
	},

	saveGradientSettings() {
		saveGradient();
		toast('Background saved');
	},

	resetGradient() {
		S.gradient = { start: '#000000', end: '#000d1a', direction: 'to bottom right', power: 2, steps: 20 };
		saveGradient();
		syncGradientControls();
		applyGradient();
	},

	handleEncryptToggle,
	applyEncryption,

	// ── Lightbox ─────────────────────────────────────────────────────────────
	openLightbox(src) { $('lightboxImg').src = src; $('lightbox').classList.add('active'); },
	closeLightbox()   { $('lightbox').classList.remove('active'); },
};

// ─── UI helpers ───────────────────────────────────────────────────────────────
function $  (id)         { return document.getElementById(id); }
function on (id, ev, fn) { const el = $(id); if (el) el.addEventListener(ev, fn); }
function setVal  (id, v) { const el = $(id); if (el) el.value = v; }
function setText (id, v) { const el = $(id); if (el) el.textContent = v; }
function show (id)       { const el = $(id); if (el) el.classList.remove('hidden'); }
function hide (id)       { const el = $(id); if (el) el.classList.add('hidden'); }

function setStatus(state, text) {
	const dot = $('statusDot');
	if (dot) { dot.className = 'status-dot ' + state; }
	setText('statusText', text);
}

function showChatView() {
	$('panelWelcome').classList.remove('active');
	const cv = $('chatView');
	cv.classList.add('active');
	cv.style.display = 'flex';
}

function hideChatView() {
	$('panelWelcome').classList.add('active');
	const cv = $('chatView');
	cv.classList.remove('active');
	cv.style.display = 'none';
}

function showCallButtons(visible) {
	$('callControlsRow').style.display = visible ? 'flex' : 'none';
}

function safeSend(data) {
	if (!engine || !S.connected) return;
	try { engine.send(data); } catch (e) { console.error('[Chat] send error:', e); }
}

function escHtml(s) {
	return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeNow() {
	return new Date().toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' });
}

function fmtSize(bytes) {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
	if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
	return (bytes / 1073741824).toFixed(1) + ' GB';
}

function fileEmoji(mime) {
	if (!mime) return '📄';
	if (mime.includes('pdf'))          return '📑';
	if (mime.includes('zip') || mime.includes('archive')) return '🗜️';
	if (mime.includes('text'))         return '📝';
	if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊';
	if (mime.includes('presentation')) return '📊';
	if (mime.includes('word'))         return '📝';
	if (mime.includes('javascript') || mime.includes('json')) return '⚙️';
	return '📄';
}

function validHex(h) { return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h); }
function randId()  { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Base64 utilities
function u8ToB64(u8)  { return btoa(String.fromCharCode(...u8)); }
function b64ToU8(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
function bufToB64(ab) {
	// Chunked to avoid call stack overflow on large buffers
	const u8 = new Uint8Array(ab);
	let str = '';
	const BLOCK = 8192;
	for (let i = 0; i < u8.length; i += BLOCK) {
		str += String.fromCharCode(...u8.subarray(i, i + BLOCK));
	}
	return btoa(str);
}
function b64ToBuf(b64) {
	const bin = atob(b64);
	const u8  = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
	return u8.buffer;
}

let _toastTimer = null;
function toast(msg, duration = 3000) {
	const el = $('toast');
	if (!el) return;
	el.textContent = msg;
	el.classList.add('show');
	clearTimeout(_toastTimer);
	_toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
	injectPanels();
	await initGradient();
	bindGradientControls();
	initFirebase();
	$('chatView').style.display = 'none';
})();
