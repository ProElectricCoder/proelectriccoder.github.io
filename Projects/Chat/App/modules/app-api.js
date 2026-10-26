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
import { sendComposed, clearCompose } from './msg-features.js';
import { openPollDialog } from './msg-ui.js';
import { subscribeGroupMeta, writeGroupMeta } from './group-meta.js';
import {
	openNewChat, ncSwitchTab, ncDirectSub, NC,
	openSettings, syncAuthSection, openThemePicker, openChatInfo, refreshDriveUI,
} from './panels-ui.js';
import {
	initiateCall, acceptCall, rejectCall, endCallInternal,
	toggleCallMute, toggleCallCam, callToggleSource,
	startAudioVisualizer, stopAudioVisualizer,
} from './call-1to1.js';
import { acceptGroupCall, declineGroupCall, _gcCleanup } from './call-group.js';
import { Inbox } from './inbox.js';
import { DriveSync } from './drive-sync.js';
import { isAlias, lookupChatId, rememberProvider, rememberGithubLogin, githubLoginFromToken } from './chat-id.js';
import { handleUser } from './firebase-auth.js';
import { ChatEngine, DirectEngine, CloudflareWSEngine, CF_WS_URL } from '../../engine.js';

function authErr(e) {
	const m = {
		'auth/email-already-in-use': 'That email already has an account — sign in instead',
		'auth/invalid-email': 'That email address is not valid',
		'auth/weak-password': 'Password is too weak — use at least 8 characters',
		'auth/wrong-password': 'Wrong email or password', 'auth/invalid-credential': 'Wrong email or password', 'auth/user-not-found': 'Wrong email or password',
		'auth/too-many-requests': 'Too many attempts — wait a few minutes and try again',
		'auth/popup-closed-by-user': 'Sign-in window was closed', 'auth/cancelled-popup-request': 'Sign-in window was closed',
		'auth/account-exists-with-different-credential': 'This email already has an account with another sign-in method — use that one',
		'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase',
		'auth/network-request-failed': 'Network error — check your connection',
	};
	return m[e?.code] || e?.message || 'Sign-in failed';
}

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
		let rid = el('ncRoomId')?.value.trim(); if (!rid) { toast('Enter a room ID or Chat ID'); return; }
		const label = rid;
		if (isAlias(rid)) { // readable Chat ID (google-… / github-… / email-…) → that user's inbox room
			try { const u = await lookupChatId(firebase.firestore(), rid); if (!u) { toast('No user found with that Chat ID'); return; } rid = u; }
			catch (e) { toast('Could not look up that Chat ID: ' + e.message); return; }
		}
		const existing = findSessByRoomId(rid, false);
		if (existing) {
			if (!existing.connected) {
				const eng = new ChatEngine(); eng.init(firebase.firestore()); bindEngine(existing, eng);
				eng.joinRoom(rid).catch(e => toast(e.message)); subscribeGroupMeta(existing);
			}
			await selectSess(existing.id); this.closeNewChat(); return;
		}
		const sess = makeSess({ name: label, type: 'firebase', roomId: rid });
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

	async cfCreateRoom() {
		if (!S.user) { toast('Sign in first'); return; }
		const rid = el('ncWsRoomId')?.value.trim() || 'room-' + Math.random().toString(36).slice(2, 8);
		const existing = findSessByRoomId(rid, false, 'cfws');
		if (existing) {
			if (!existing.connected) {
				try {
					const token = () => S.user.getIdToken();
					const eng = new CloudflareWSEngine();
					bindEngine(existing, eng); setStatus('connecting', 'Reconnecting…');
					await (existing.isHost ? eng.createRoom(rid, token) : eng.joinRoom(rid, token));
				} catch (e) { toast('Error: ' + e.message); }
			}
			await selectSess(existing.id); this.closeNewChat(); return;
		}
		const sess = makeSess({ name: rid, type: 'cfws', roomId: rid, wsUrl: CF_WS_URL });
		sess.isHost = true;
		const eng = new CloudflareWSEngine();
		S.sessions.set(sess.id, sess); bindEngine(sess, eng); setStatus('connecting', 'Waiting for peers…');
		try {
			const token = () => S.user.getIdToken();
			await eng.createRoom(rid, token);
			await DB.saveSession(sess); await selectSess(sess.id); this.closeNewChat();
			addSysMsg(sess, `Relay room "${rid}" created — share the room ID`); toast('Room created');
		} catch (e) { toast('Error: ' + e.message); S.sessions.delete(sess.id); }
	},
	async cfJoinRoom() {
		if (!S.user) { toast('Sign in first'); return; }
		const rid = el('ncWsRoomId')?.value.trim(); if (!rid) { toast('Enter a room ID'); return; }
		const existing = findSessByRoomId(rid, false, 'cfws');
		if (existing) {
			if (!existing.connected) {
				try {
					const token = () => S.user.getIdToken();
					const eng = new CloudflareWSEngine();
					bindEngine(existing, eng); setStatus('connecting', 'Reconnecting…');
					await eng.joinRoom(rid, token);
				} catch (e) { toast('Error: ' + e.message); }
			}
			await selectSess(existing.id); this.closeNewChat(); return;
		}
		const sess = makeSess({ name: rid, type: 'cfws', roomId: rid, wsUrl: CF_WS_URL });
		const eng = new CloudflareWSEngine();
		S.sessions.set(sess.id, sess); bindEngine(sess, eng); setStatus('connecting', 'Joining room…');
		try {
			const token = () => S.user.getIdToken();
			await eng.joinRoom(rid, token);
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
			let sent = false;
			try { sent = await sendComposed(sess, text); } catch (e) { toast('Send error: ' + e.message); return; }
			if (!sent) return;
			if (inp) { inp.value = ''; inp.style.height = 'auto'; }
		}
		if (FQ.items.length > 0) {
			const batchId = FQ.items.length > 1 ? 'batch_' + Date.now() : null;
			const toSend = [...FQ.items]; FQ.clear();
			for (const { file } of toSend) await sendFile(file, sess, batchId);
		}
	},
	openPoll() { openPollDialog(); },
	cancelCompose() { clearCompose(); },
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
		if (sess.type === 'cfws') {
			const text = `Room ID: ${sess.roomId}`;
			navigator.clipboard.writeText(text).then(() => toast('Room ID copied!')).catch(() => prompt('Share this with your peer:', text));
			return;
		}
		const b64 = btoa(sess.roomId);
		const url = `${location.origin}${location.pathname}?invite=${encodeURIComponent(b64)}`;
		navigator.clipboard.writeText(url).then(() => toast('Invite link copied!')).catch(() => prompt('Copy this link:', url));
	},
	// Copy user ID
	copyUserId() {
		const uid_val = S.chatId || S.user?.uid;
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
	handleLinkToggle() { S.linkPreviews = !!el('spLinkToggle')?.checked; localStorage.setItem('pec_link_previews', S.linkPreviews); toast(S.linkPreviews ? 'Link previews on (new messages)' : 'Link previews off'); },
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
	async signInGoogle() { try { rememberProvider('google.com'); await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()); } catch (e) { toast(authErr(e)); } },
	async signInGitHub() {
		try {
			rememberProvider('github.com');
			const res = await firebase.auth().signInWithPopup(new firebase.auth.GithubAuthProvider());
			const gh = res.user.providerData.find(p => p.providerId === 'github.com');
			// 1) ask GitHub with the OAuth token  2) fall back to the username Firebase reports at sign-in
			const login = await githubLoginFromToken(res.credential?.accessToken, gh?.uid) || res.additionalUserInfo?.username;
			// A new or renamed GitHub login changes the Chat ID: register it right away
			if (rememberGithubLogin(gh?.uid, login)) await handleUser(res.user);
		} catch (e) { toast(authErr(e)); }
	},
	// ── Email + password (the account must verify its address before it can be used) ──
	toggleEmailForm(btn) { const box = btn.parentElement.querySelector('.email-box'); if (box) box.style.display = box.style.display === 'none' ? 'flex' : 'none'; },
	_emailFields(btn) {
		const box = btn.closest('.email-box'), f = k => box?.querySelector(`[data-f="${k}"]`)?.value || '';
		return { name: f('name').trim(), email: f('email').trim(), pw: f('pw') };
	},
	async emailSignIn(btn) {
		const { email, pw } = this._emailFields(btn); if (!email || !pw) { toast('Enter your email and password'); return; }
		try { rememberProvider('password'); await firebase.auth().signInWithEmailAndPassword(email, pw); } catch (e) { toast(authErr(e)); }
	},
	async emailSignUp(btn) {
		const { name, email, pw } = this._emailFields(btn);
		if (!email || !pw) { toast('Enter an email and a password'); return; }
		if (pw.length < 8) { toast('Use a password with at least 8 characters'); return; }
		try {
			rememberProvider('password');
			const cred = await firebase.auth().createUserWithEmailAndPassword(email, pw);
			if (name) await cred.user.updateProfile({ displayName: name });
			await cred.user.sendEmailVerification();
			await handleUser(firebase.auth().currentUser);
			toast('Verification email sent to ' + email);
		} catch (e) { toast(authErr(e)); }
	},
	async emailResend() {
		const u = firebase.auth().currentUser; if (!u) return;
		try { await u.sendEmailVerification(); toast('Verification email sent again'); } catch (e) { toast(authErr(e)); }
	},
	async emailCheckVerified() {
		const u = firebase.auth().currentUser; if (!u) return;
		try {
			await u.reload();
			if (!u.emailVerified) { toast('Not verified yet — open the link in the email first'); return; }
			await u.getIdToken(true); // refresh so the token carries email_verified
			await handleUser(u); toast('Email verified — you are signed in');
		} catch (e) { toast(authErr(e)); }
	},
	async emailReset(btn) {
		const { email } = this._emailFields(btn); if (!email) { toast('Enter your email first'); return; }
		try { await firebase.auth().sendPasswordResetEmail(email); toast('If that address has an account, a reset link is on its way'); } catch (e) { toast(authErr(e)); }
	},
	async signOut() {
		Inbox.stop();
		await firebase.auth().signOut();
		const sess = getActiveSess(); if (sess) { sess.engine?.disconnect(); sess.connected = false; }
		syncAuthSection('spAuthArea'); toast('Signed out');
	},
	// ── Google Drive backup ──
	async driveConnect() {
		try {
			await DriveSync.connect(); refreshDriveUI(); toast('Google Drive connected — backing up your chats…');
			const n = await DriveSync.backupAll(); refreshDriveUI(); toast(`Saved ${n} chat${n !== 1 ? 's' : ''} to Google Drive`);
		} catch (e) { toast(e.message); refreshDriveUI(); }
	},
	driveDisconnect() { DriveSync.disconnect(); refreshDriveUI(); toast('Disconnected — existing backups stay in your Drive'); },
	driveToggle() { DriveSync.setAuto(el('spDriveToggle')?.checked); if (DriveSync.autoOn()) DriveSync.syncStale(); refreshDriveUI(); },
	async driveBackupNow() {
		toast('Backing up…'); const n = await DriveSync.backupAll(); refreshDriveUI();
		toast(DriveSync.state === 'idle' ? `Saved ${n} chat${n !== 1 ? 's' : ''} to Google Drive` : 'Backup did not finish — see status in Settings');
	},
	async driveRestore() {
		toast('Restoring from Google Drive…');
		try { const r = await DriveSync.restore(); toast(r.chats || r.messages ? `Restored ${r.chats} chat${r.chats !== 1 ? 's' : ''}, ${r.messages} message${r.messages !== 1 ? 's' : ''}` : 'Nothing new to restore'); }
		catch (e) { toast('Restore failed: ' + e.message); }
		refreshDriveUI();
	},
	openThemePicker() { openThemePicker(); },
	openChatInfo() { openChatInfo(); },
	closeChatInfo() { el('chatInfoOverlay')?.classList.remove('open'); },
	async ciDisconnect() {
		const sess = getActiveSess(); if (!sess) return;
		if (sess.connected) {
			sess._metaUnsub?.(); sess._metaUnsub = null;
			sess.engine?.disconnect(); sess.connected = false;
			setStatus('disconnected', 'Disconnected'); enableCallBtns(false);
		} else {
			if (sess.type === 'direct') { toast('Create a new offer to reconnect direct chats'); return; }
			if (!S.user) { toast('Sign in to reconnect to rooms'); return; }
			if (sess.type === 'cfws') {
				setStatus('connecting', 'Reconnecting...');
				try {
					const token = () => S.user.getIdToken();
					const eng = new CloudflareWSEngine();
					bindEngine(sess, eng);
					await (sess.isHost ? eng.createRoom(sess.roomId, token) : eng.joinRoom(sess.roomId, token));
				} catch (e) { toast('Error: ' + e.message); }
			} else {
				const eng = new ChatEngine({ relay: sess.isGroup }); eng.init(firebase.firestore());
				bindEngine(sess, eng); setStatus('connecting', 'Reconnecting...');
				if (sess.isHost) eng.createRoom(sess.roomId).catch(e => toast(e.message));
				else eng.joinRoom(sess.roomId).catch(e => toast(e.message));
				subscribeGroupMeta(sess);
			}
		}
		this.closeChatInfo(); renderChatList();
	},
	ciDelete() { const sess = getActiveSess(); if (sess) { this.closeChatInfo(); deleteSess(sess.id); } },
	openLightbox(src) { el('lbImg').src = src; el('lightbox').classList.add('open'); },
	closeLightbox() { el('lightbox').classList.remove('open'); },
	previewBg() { this.livePreviewBg(); },
};
