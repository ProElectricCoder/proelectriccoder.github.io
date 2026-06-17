export function injectPanels() {
	const css = document.createElement('style');
	css.textContent = `
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
	const sp = document.createElement('div'); sp.id = 'settingsOverlay'; sp.className = 'panel-overlay';
	sp.innerHTML = `<div class="panel-drawer">
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
	sp.addEventListener('click', e => { if (e.target === sp) App.closeSettings(); });
	document.getElementById('panels').appendChild(sp);

	// New chat modal
	const nc = document.createElement('div'); nc.id = 'newChatModal'; nc.className = 'modal-overlay';
	nc.innerHTML = `<div class="modal-box">
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
	nc.addEventListener('click', e => { if (e.target === nc) App.closeNewChat(); });
	document.getElementById('panels').appendChild(nc);

	// 1:1 Call overlay
	const co = document.createElement('div'); co.id = 'callOverlay'; co.className = 'call-overlay';
	co.innerHTML = `
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
	const gco = document.createElement('div'); gco.id = 'gcOverlay'; gco.className = 'gc-overlay';
	gco.innerHTML = `
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
	const ic = document.createElement('div'); ic.id = 'incomingDialog'; ic.className = 'incoming-overlay';
	ic.innerHTML = `<div class="incoming-box">
		<div class="incoming-big-icon" id="incomingIcon">📞</div>
		<div class="incoming-caller" id="incomingCallerName">Peer</div>
		<div class="incoming-type" id="incomingCallType">Voice call</div>
		<div class="row" style="width:100%;gap:12px">
			<button class="btn btn-d btn-full" onclick="App.callDecline()">Decline</button>
			<button class="btn btn-p btn-full" onclick="App.callAccept()">Accept</button>
		</div>
	</div>`;
	document.getElementById('panels').appendChild(ic);

	const lb = document.createElement('div'); lb.id = 'lightbox'; lb.onclick = () => App.closeLightbox();
	lb.innerHTML = `<img id="lbImg" src="" alt="">`;
	document.getElementById('panels').appendChild(lb);

	const tp = document.createElement('div'); tp.id = 'themePicker';
	tp.innerHTML = `<div class="tp-title">Chat Theme</div><div class="theme-swatches" id="themeSwatches"></div>`;
	document.body.appendChild(tp);
	document.addEventListener('click', e => { if (tp.classList.contains('open') && !tp.contains(e.target) && e.target.id !== 'btnTheme') tp.classList.remove('open'); });

	const ci = document.createElement('div'); ci.id = 'chatInfoOverlay'; ci.className = 'panel-overlay';
	ci.innerHTML = `<div class="panel-drawer">
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
	ci.addEventListener('click', e => { if (e.target === ci) App.closeChatInfo(); });
	document.getElementById('panels').appendChild(ci);

	const capM = document.createElement('div'); capM.id = 'captureModal'; capM.className = 'modal-overlay';
	capM.innerHTML = `<div class="modal-box" style="max-width:340px;padding:20px">
		<video id="mcVideo" autoplay playsinline muted style="width:100%;border-radius:10px;background:#000;display:none;max-height:300px;object-fit:cover;margin-bottom:14px"></video>
		<div id="mcAudioVis" style="display:none;font-size:3.5rem;margin:20px 0;text-align:center;animation:pulseMedia 1.5s infinite alternate">🎙️</div>
		<div id="mcActions" class="col" style="width:100%;gap:8px"></div>
	</div>`;
	document.getElementById('panels').appendChild(capM);
}
