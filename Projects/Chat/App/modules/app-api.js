import { MC } from './constants.js';
import { S, uid, makeSess } from './state.js';
import { DB } from './db.js';
import { openSidebarUI, closeSidebarUI, el, toast, requestWakeLock, releaseWakeLock } from './utils.js';
import { Crypt } from './crypto.js';
import { FQ } from './file-queue.js';
import { sendFile } from './file-transfer.js';
import { computeGrad, applyTheme } from './theme.js';
import { renderChatList, renderTopbar, setStatus, enableCallBtns, addBubble, addSysMsg } from './chat-render.js';
import { getActiveSess, selectSess, setThemeForSess, findSessByRoomId, deleteSess, safeSend } from './sessions.js';
import { updateCallCard } from './call-card.js';
import { bindEngine } from './protocol.js';
import { subscribeGroupMeta, writeGroupMeta } from './group-meta.js';
import {
	openNewChat, ncSwitchTab, ncDirectSub, NC,
	openSettings, syncAuthSection, openThemePicker, openChatInfo,
} from './panels-ui.js';
import {
	initiateCall, acceptCall, rejectCall, endCallInternal,
	toggleCallMute, toggleCallCam, callToggleSource,
	startAudioVisualizer, stopAudioVisualizer,
} from './call-1to1.js';
import { acceptGroupCall, declineGroupCall, _gcCleanup } from './call-group.js';
import { Inbox } from './inbox.js';
import { ChatEngine, DirectEngine } from '../../engine.js';

export const App = {
	openSidebar() { openSidebarUI(); },
	closeSidebar() { closeSidebarUI(); },
	filterChats(q) { S.filterQ = q; renderChatList(); },
	async selectChat(id) { await selectSess(id, true); },
	pickTheme(id) { const sess = getActiveSess(); if (!sess) return; setThemeForSess(sess.id, id); el('themePicker')?.classList.remove('open'); },
	newChat(tab) { openNewChat(tab); },
	closeNewChat() { el('newChatModal')?.classList.remove('open'); NC.pendingEngine = null; NC.pendingSessId = null; },
	ncSwitchTab(t) { ncSwitchTab(t); },
	ncDirectSub(s) { ncDirectSub(s); },
	ncGenRoomId() { const i = el('ncGroupRoomId'); if (i) i.value = 'room-' + Math.random().toString(36).slice(2, 8); },

	async directGenOffer() {
		const eng = new DirectEngine(), sessId = 'sess_' + Date.now() + '_' + uid();
		const sess = makeSess({ id: sessId, name: 'Direct Chat', type: 'direct' });
		S.sessions.set(sessId, sess); NC.pendingEngine = eng; NC.pendingSessId = sessId;
		bindEngine(sess, eng); setStatus('connecting', 'Generating offer…');
		try {
			const offer = await eng.createOffer();
			el('ncOfferSDP').value = offer;
			el('ncOfferGroup')?.classList.remove('hidden'); el('ncAnswerInputGroup')?.classList.remove('hidden');
			await DB.saveSession(sess); renderChatList(); toast('Offer generated — share it with your peer');
		} catch (e) { toast('Error: ' + e.message); S.sessions.delete(sessId); }
	},
	async directConnect() {
		const ans = el('ncAnswerInput')?.value.trim(); if (!ans) { toast('Paste the answer SDP first'); return; }
		const eng = NC.pendingEngine; if (!eng) { toast('Generate an offer first'); return; }
		try { await eng.setAnswer(ans); this.closeNewChat(); toast('Connecting…'); } catch (e) { toast('Error: ' + e.message); }
	},
	async directGenAnswer() {
		const offer = el('ncRemoteOffer')?.value.trim(); if (!offer) { toast('Paste the remote offer first'); return; }
		const name = el('ncCalleeName')?.value.trim() || 'Direct Chat';
		const eng = new DirectEngine(), sess = makeSess({ name, type: 'direct' });
		S.sessions.set(sess.id, sess); bindEngine(sess, eng);
		try {
			const answer = await eng.createAnswerFor(offer);
			el('ncAnswerSDP').value = answer; el('ncAnswerOutGroup')?.classList.remove('hidden');
			await DB.saveSession(sess); renderChatList(); toast('Answer generated — send it back');
		} catch (e) { toast('Error: ' + e.message); S.sessions.delete(sess.id); }
	},

	async fbCreateRoom() {
		if (!S.user) { toast('Sign in first'); return; }
		const rid = el('ncRoomId')?.value.trim() || 'room-' + Math.random().toString(36).slice(2, 8);
		const existing = findSessByRoomId(rid, false);
		if (existing) {
			if (!existing.connected) {
				const eng = new ChatEngine(); eng.init(firebase.firestore()); bindEngine(existing, eng);
				(existing.isHost ? eng.createRoom(rid) : eng.joinRoom(rid)).catch(e => toast(e.message));
				subscribeGroupMeta(existing);
			}
			await selectSess(existing.id); this.closeNewChat(); return;
		}
		const sess = makeSess({ name: rid, type: 'firebase', roomId: rid });
		sess.isHost = true; sess.myRole = 'owner'; sess.groupOwner = S.user.uid;
		const eng = new ChatEngine(); eng.init(firebase.firestore());
		S.sessions.set(sess.id, sess); bindEngine(sess, eng); setStatus('connecting', 'Waiting for peers…');
		try {
			await eng.createRoom(rid);
			await writeGroupMeta(sess, { name: rid, icon: '', owner: S.user.uid, managers: [], members: { [S.user.uid]: { name: S.displayName, avatar: S.avatarUrl, role: 'owner', joinedAt: Date.now() } } });
			subscribeGroupMeta(sess);
			await DB.saveSession(sess); await selectSess(sess.id); this.closeNewChat();
			addSysMsg(sess, `Room "${rid}" created — share this ID`); toast('Room created');
		} catch (e) { toast('Error: ' + e.message); S.sessions.delete(sess.id); }
	},
	async fbJoinRoom() {
		if (!S.user) { toast('Sign in first'); return; }
		const rid = el('ncRoomId')?.value.trim(); if (!rid) { toast('Enter a room ID'); return; }
		const existing = findSessByRoomId(rid, false);
		if (existing) {
			if (!existing.connected) {
				const eng = new ChatEngine(); eng.init(firebase.firestore()); bindEngine(existing, eng);
				eng.joinRoom(rid).catch(e => toast(e.message)); subscribeGroupMeta(existing);
			}
			await selectSess(existing.id); this.closeNewChat(); return;
		}
		const sess = makeSess({ name: rid, type: 'firebase', roomId: rid });
		const eng = new ChatEngine(); eng.init(firebase.firestore());
		S.sessions.set(sess.id, sess); bindEngine(sess, eng); setStatus('connecting', 'Joining room…');
		try {
			await eng.joinRoom(rid);
			await writeGroupMeta(sess, { members: { [S.user.uid]: { name: S.displayName, avatar: S.avatarUrl, role: 'member', joinedAt: Date.now() } } });
			subscribeGroupMeta(sess);
			await DB.saveSession(sess); await selectSess(sess.id); this.closeNewChat();
		} catch (e) { toast('Error: ' + e.message); S.sessions.delete(sess.id); }
	},
	async fbCreateGroup() {
		if (!S.user) { toast('Sign in first'); return; }
		const gname = el('ncGroupName')?.value.trim() || 'My Group';
		const rid = el('ncGroupRoomId')?.value.trim() || 'grp-' + Math.random().toString(36).slice(2, 8);
		const existing = findSessByRoomId(rid, true);
		if (existing) { await selectSess(existing.id); this.closeNewChat(); return; }
		const sess = makeSess({ name: gname, type: 'firebase', isGroup: true, roomId: rid, groupName: gname });
		sess.isHost = true; sess.myRole = 'owner'; sess.groupOwner = S.user.uid;
		const eng = new ChatEngine({ relay: true }); eng.init(firebase.firestore());
		S.sessions.set(sess.id, sess); bindEngine(sess, eng);
		try {
			await eng.createRoom(rid);
			await writeGroupMeta(sess, { name: gname, icon: '', owner: S.user.uid, ownerName: S.displayName, ownerAvatar: S.avatarUrl, managers: [], members: { [S.user.uid]: { name: S.displayName, avatar: S.avatarUrl, role: 'owner', joinedAt: Date.now() } }, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
			subscribeGroupMeta(sess);
			await DB.saveSession(sess); await selectSess(sess.id); this.closeNewChat();
			addSysMsg(sess, `Group "${gname}" created · Room: ${rid}`); toast('Group created');
		} catch (e) { toast('Error: ' + e.message); S.sessions.delete(sess.id); }
	},
	async fbJoinGroup() {
		if (!S.user) { toast('Sign in first'); return; }
		const rid = el('ncGroupRoomId')?.value.trim(); if (!rid) { toast('Enter room ID'); return; }
		const existing = findSessByRoomId(rid, true);
		if (existing) { await selectSess(existing.id); this.closeNewChat(); return; }
		const gname = el('ncGroupName')?.value.trim() || rid;
		const sess = makeSess({ name: gname, type: 'firebase', isGroup: true, roomId: rid, groupName: gname });
		const eng = new ChatEngine({ relay: false }); eng.init(firebase.firestore());
		S.sessions.set(sess.id, sess); bindEngine(sess, eng);
		try {
			await eng.joinRoom(rid);
			await writeGroupMeta(sess, { members: { [S.user.uid]: { name: S.displayName, avatar: S.avatarUrl, role: 'member', joinedAt: Date.now() } } });
			subscribeGroupMeta(sess);
			await DB.saveSession(sess); await selectSess(sess.id); this.closeNewChat();
		} catch (e) { toast('Error: ' + e.message); S.sessions.delete(sess.id); }
	},

	async sendMsg() {
		const inp = el('msgInput'); const text = inp?.value.trim();
		const sess = getActiveSess(); if (!sess?.connected) { toast('Not connected'); return; }
		// Stop typing indicator
		if (sess?.connected) { safeSend(sess, { type: 'typing-stop', displayName: S.displayName }); }
		clearTimeout(this._typingTimer);
		if (text) {
			let payload = text, enc = false;
			if (S.encEnabled && Crypt.key) { try { payload = await Crypt.encText(text); enc = true; } catch (e) { toast('Encrypt error: ' + e.message); return; } }
			safeSend(sess, { type: 'chat', text: payload, encrypted: enc, displayName: S.displayName });
			addBubble(sess, text, S.displayName, true, enc);
			if (inp) { inp.value = ''; inp.style.height = 'auto'; }
		}
		if (FQ.items.length > 0) {
			const batchId = FQ.items.length > 1 ? 'batch_' + Date.now() : null;
			const toSend = [...FQ.items]; FQ.clear();
			for (const { file } of toSend) await sendFile(file, sess, batchId);
		}
	},
	// Typing indicator
	_typingTimer: null,
	onTyping() {
		const sess = getActiveSess(); if (!sess?.connected) return;
		safeSend(sess, { type: 'typing', displayName: S.displayName });
		clearTimeout(this._typingTimer);
		this._typingTimer = setTimeout(() => { if (sess?.connected) safeSend(sess, { type: 'typing-stop', displayName: S.displayName }); }, 2000);
	},
	async renameChat() {
		const sess = getActiveSess(); if (!sess) return;
		const newName = el('ciChatName')?.value.trim(); if (!newName) return;
		sess.name = newName; if (sess.isGroup) sess.groupName = newName;
		DB.saveSession(sess);
		if (sess.roomId && S.user && (sess.myRole === 'owner' || sess.myRole === 'manager')) await writeGroupMeta(sess, { name: newName });
		renderChatList(); renderTopbar(sess); toast('Chat renamed');
	},
	livePreviewBg() {
		const endC = el('ciBgColor')?.value || '#002233', stC = el('ciBgStart')?.value || '#000000';
		const p = parseFloat(el('ciBgPower')?.value || 2.5), steps = parseInt(el('ciBgSteps')?.value || 20);
		const sess = getActiveSess(), dir = sess?.bg?.direction || 'to bottom right';
		const grad = computeGrad(endC, p, steps, dir, stC);
		const prev = el('ciBgPreview'); if (prev) prev.style.background = grad;
	},
	setBgDir(dir) {
		const sess = getActiveSess(); if (!sess) return;
		if (!sess.bg) sess.bg = {}; sess.bg.direction = dir;
		document.querySelectorAll('.bg-dir-btn').forEach(b => b.classList.toggle('active', b.title === dir));
		this.livePreviewBg();
	},
	updateBg() {
		const sess = getActiveSess(); if (!sess) return;
		if (!sess.bg) sess.bg = {};
		sess.bg.endColor = el('ciBgColor').value; sess.bg.startColor = el('ciBgStart')?.value || '#000000';
		sess.bg.power = parseFloat(el('ciBgPower').value); sess.bg.steps = parseInt(el('ciBgSteps').value);
		DB.saveSession(sess); applyTheme(sess.theme, sess); this.livePreviewBg();
	},
	resetBg() { const sess = getActiveSess(); if (!sess) return; sess.bg = null; DB.saveSession(sess); applyTheme(sess.theme, sess); openChatInfo(); },
	async saveGroupIcon() {
		const sess = getActiveSess(); if (!sess || !sess.roomId) return;
		const icon = el('ciGroupIconUrl')?.value.trim() || '';
		sess.groupIcon = icon || null; await writeGroupMeta(sess, { icon });
		DB.saveSession(sess); if (S.activeId === sess.id) renderTopbar(sess); renderChatList(); toast('Group icon updated');
	},
	async promoteManager(uid) {
		const sess = getActiveSess(); if (!sess || sess.myRole !== 'owner') return;
		const managers = [...(sess.groupManagers || [])]; if (!managers.includes(uid)) managers.push(uid);
		await writeGroupMeta(sess, { managers }); toast('Promoted to manager');
	},
	async demoteManager(uid) {
		const sess = getActiveSess(); if (!sess || sess.myRole !== 'owner') return;
		const managers = (sess.groupManagers || []).filter(m => m !== uid);
		await writeGroupMeta(sess, { managers }); toast('Demoted from manager');
	},

	async openCapture(type) {
		MC.type = type; const mo = el('captureModal'); mo.classList.add('open');
		const vid = el('mcVideo'), vis = el('mcAudioVis'), acts = el('mcActions');
		vid.style.display = type === 'audio' ? 'none' : 'block'; vis.style.display = type === 'audio' ? 'block' : 'none';
		acts.innerHTML = `<div style="text-align:center;font-size:0.8rem;color:var(--faint)">Accessing media...</div>`;
		try {
			MC.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type !== 'audio' });
			if (type !== 'audio') vid.srcObject = MC.stream;
			if (type === 'camera') {
				acts.innerHTML = `<button class="btn btn-p btn-full" onclick="App.capturePhoto()">📸 Take Photo</button>
					<button class="btn btn-d btn-full" style="background:rgba(255,68,85,.15)" onclick="App.startRecord('video')">🔴 Record Video</button>
					<button class="btn btn-s btn-full" onclick="App.closeCapture()">Cancel</button>`;
			} else {
				acts.innerHTML = `<button class="btn btn-d btn-full" style="background:rgba(255,68,85,.15)" onclick="App.startRecord('audio')">🔴 Record Audio</button>
					<button class="btn btn-s btn-full" onclick="App.closeCapture()">Cancel</button>`;
			}
		} catch (e) { acts.innerHTML = `<div style="color:#ff4455;font-size:0.8rem;margin-bottom:10px;text-align:center">Error: ${e.message}</div><button class="btn btn-s btn-full" onclick="App.closeCapture()">Close</button>`; }
	},
	closeCapture() { el('captureModal')?.classList.remove('open'); if (MC.stream) MC.stream.getTracks().forEach(t => t.stop()); MC.stream = null; MC.recorder = null; MC.chunks = []; },
	capturePhoto() {
		const vid = el('mcVideo'), canvas = document.createElement('canvas');
		canvas.width = vid.videoWidth; canvas.height = vid.videoHeight; canvas.getContext('2d').drawImage(vid, 0, 0);
		canvas.toBlob(blob => { FQ.add([new File([blob], `Photo_${Date.now()}.jpg`, { type: 'image/jpeg' })]); App.closeCapture(); }, 'image/jpeg', 0.9);
	},
	startRecord(recType) {
		MC.chunks = [];
		try {
			MC.recorder = new MediaRecorder(MC.stream);
			MC.recorder.ondataavailable = e => { if (e.data.size > 0) MC.chunks.push(e.data); };
			MC.recorder.onstop = () => {
				const mime = recType === 'audio' ? 'audio/webm' : 'video/webm';
				FQ.add([new File(MC.chunks, `${recType.charAt(0).toUpperCase() + recType.slice(1)}_${Date.now()}.webm`, { type: mime })]);
				App.closeCapture();
			};
			MC.recorder.start();
			el('mcActions').innerHTML = `<button class="btn btn-d btn-full" onclick="App.stopRecord()">⏹ Stop Recording</button>`;
		} catch (e) { toast('MediaRecorder error: ' + e.message); }
	},
	stopRecord() { if (MC.recorder && MC.recorder.state !== 'inactive') MC.recorder.stop(); },
	openFilePicker() { el('fileInput')?.click(); },
	handleFileSelect(fs) { FQ.add([...fs]); },
	handleDrop(e) { e.preventDefault(); FQ.add([...(e.dataTransfer.files || [])]); },
	removeQueuedFile(id) { FQ.remove(id); },
	copyField(id) { const e = el(id); if (e) navigator.clipboard.writeText(e.value).then(() => toast('Copied')); },
	// Invite link
	copyInviteLink() {
		const sess = getActiveSess(); if (!sess?.roomId) { toast('No room to link'); return; }
		const b64 = btoa(sess.roomId);
		const url = `${location.origin}${location.pathname}?invite=${encodeURIComponent(b64)}`;
		navigator.clipboard.writeText(url).then(() => toast('Invite link copied!')).catch(() => prompt('Copy this link:', url));
	},
	// Copy user ID
	copyUserId() {
		const uid_val = S.user?.uid;
		if (!uid_val) { toast('Sign in to get your Chat ID'); return; }
		navigator.clipboard.writeText(uid_val).then(() => toast('Chat ID copied!')).catch(() => prompt('Your Chat ID:', uid_val));
	},

	startCall(type) { initiateCall(type); },
	callAccept() {
		const d = el('incomingDialog');
		if (d?.dataset.isGroup === '1') { acceptGroupCall(); return; }
		acceptCall();
	},
	callDecline() {
		const d = el('incomingDialog');
		if (d?.dataset.isGroup === '1') { declineGroupCall(); return; }
		rejectCall();
	},
	callEnd() {
		const s = S.sessions.get(S.callSessId); if (!s) return;
		const reason = s.call.state === 'active' ? 'completed' : 'cancelled';
		const dur = (s.call.state === 'active' && S.callStarted) ? Math.floor((Date.now() - S.callStarted) / 1000) : 0;
		if (s.call.cardMsgId) updateCallCard(s, s.call.cardMsgId, reason, dur);
		endCallInternal(s, true, null, true);
	},
	callToggleMute() { toggleCallMute(); },
	callToggleCam() { toggleCallCam(); },
	callToggleSource() { callToggleSource(); },
	// Group call controls
	gcToggleMute() {
		const sess = S.sessions.get(S.gcSessId); if (!sess) return;
		const gc = sess.gc;
		const muted = !el('gcMuteBtn').classList.contains('active');
		gc.localStream?.getAudioTracks().forEach(t => t.enabled = !muted);
		el('gcMuteBtn').classList.toggle('active', muted); el('gcMuteBtn').title = muted ? 'Unmute' : 'Mute';
	},
	gcToggleCam() {
		const sess = S.sessions.get(S.gcSessId); if (!sess) return;
		const gc = sess.gc;
		const off = !el('gcCamBtn').classList.contains('active');
		gc.localStream?.getVideoTracks().forEach(t => t.enabled = !off);
		el('gcCamBtn').classList.toggle('active', off); el('gcCamBtn').title = off ? 'Show Camera' : 'Hide Camera';
	},
	gcEnd() { const sess = S.sessions.get(S.gcSessId); if (sess) _gcCleanup(sess); },
	startAudioVisualizer(stream) { startAudioVisualizer(stream); },
	stopAudioVisualizer() { stopAudioVisualizer(); },

	openSettings() { openSettings(); },
	closeSettings() { el('settingsOverlay')?.classList.remove('open'); },
	saveName() {
		const n = el('spName')?.value.trim() || 'Anonymous'; S.displayName = n; localStorage.setItem('pec_name', n);
		const sess = getActiveSess(); if (sess?.connected) safeSend(sess, { type: 'display-name', displayName: n });
		toast('Name saved');
	},
	handleWakeToggle() {
		S.wakeLockEnabled = el('spWakeToggle')?.checked; localStorage.setItem('pec_wakelock', S.wakeLockEnabled);
		if (S.wakeLockEnabled) requestWakeLock(); else releaseWakeLock();
	},
	handleEncToggle() {
		const on = el('spEncToggle')?.checked;
		el('spEncPwRow').style.display = on ? 'block' : 'none';
		if (!on) { Crypt.clear(); S.encEnabled = false; el('spEncStatus').textContent = 'Encryption off'; el('spEncStatus').style.color = 'var(--faint)'; }
	},
	async applyEncKey() {
		const pw = el('spEncPw')?.value.trim(); if (!pw) { toast('Enter a password'); return; }
		try { await Crypt.derive(pw); S.encEnabled = true; el('spEncStatus').textContent = '🔒 Key active'; el('spEncStatus').style.color = 'var(--ta)'; toast('Encryption key applied'); }
		catch (e) { toast('Key error: ' + e.message); }
	},
	async signInGoogle() { try { await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()); } catch (e) { toast(e.message); } },
	async signInGitHub() { try { await firebase.auth().signInWithPopup(new firebase.auth.GithubAuthProvider()); } catch (e) { toast(e.message); } },
	async signOut() {
		Inbox.stop();
		await firebase.auth().signOut();
		const sess = getActiveSess(); if (sess) { sess.engine?.disconnect(); sess.connected = false; }
		syncAuthSection('spAuthArea'); toast('Signed out');
	},
	openThemePicker() { openThemePicker(); },
	openChatInfo() { openChatInfo(); },
	closeChatInfo() { el('chatInfoOverlay')?.classList.remove('open'); },
	ciDisconnect() {
		const sess = getActiveSess(); if (!sess) return;
		if (sess.connected) {
			sess._metaUnsub?.(); sess._metaUnsub = null;
			sess.engine?.disconnect(); sess.connected = false;
			setStatus('disconnected', 'Disconnected'); enableCallBtns(false);
		} else {
			if (sess.type === 'direct') { toast('Create a new offer to reconnect direct chats'); return; }
			if (!S.user) { toast('Sign in to reconnect to rooms'); return; }
			const eng = new ChatEngine({ relay: sess.isGroup }); eng.init(firebase.firestore());
			bindEngine(sess, eng); setStatus('connecting', 'Reconnecting...');
			if (sess.isHost) eng.createRoom(sess.roomId).catch(e => toast(e.message));
			else eng.joinRoom(sess.roomId).catch(e => toast(e.message));
			subscribeGroupMeta(sess);
		}
		this.closeChatInfo(); renderChatList();
	},
	ciDelete() { const sess = getActiveSess(); if (sess) { this.closeChatInfo(); deleteSess(sess.id); } },
	openLightbox(src) { el('lbImg').src = src; el('lightbox').classList.add('open'); },
	closeLightbox() { el('lightbox').classList.remove('open'); },
	previewBg() { this.livePreviewBg(); },
};