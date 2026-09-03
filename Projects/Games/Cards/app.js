/**
 * app.js — Getaway (entry point)
 * Wires the setup/lobby/game screens to modules/*.js. Local play never
 * touches Firebase or the network layer; Online play needs both, loaded
 * lazily (see modules/net.js) so a plain Local game never depends on them.
 */
import { S } from './modules/state.js';
import { FB_CFG } from './modules/constants.js';
import { startLocalGame, humanPlayById } from './modules/game.js';
import * as UI from './modules/ui.js';
import * as Auth from './modules/auth.js';
import * as Net from './modules/net.js';
import * as Lobby from './modules/lobby.js';
import * as Guest from './modules/guest-client.js';
import * as Chat from './modules/chat.js';
import * as RoomDirectory from './modules/room-directory.js';

firebase.initializeApp(FB_CFG);

let onlineRole = null; // 'host' | 'guest' | null — who I am in the current online session

window.CardsApp = {
	// ── In-game ──────────────────────────────────────────────────────
	humanPlay(cardId) {
		if (S.mode === 'guest') Guest.sendGuestMove(cardId);
		else humanPlayById(cardId);
	},
	openRules() { UI.toggleRules(true); },
	closeRules() { UI.toggleRules(false); },
	newGame() {
		if (onlineRole) { Net.disconnectNet(); onlineRole = null; }
		UI.showSetupScreen();
	},
	playAgain() {
		document.getElementById('gameOverModal')?.classList.remove('open');
		if (onlineRole) { Net.disconnectNet(); onlineRole = null; }
		UI.showSetupScreen();
	},

	// ── Setup screen ─────────────────────────────────────────────────
	setupMode(mode) { UI.setupMode(mode); },
	onlineSub(sub) { UI.onlineSub(sub); },

	// ── Auth ─────────────────────────────────────────────────────────
	async signInGoogle() { try { await Auth.signInGoogle(); } catch (e) { alert(Auth.friendlyAuthError(e)); } },
	async signInGitHub() { try { await Auth.signInGitHub(); } catch (e) { alert(Auth.friendlyAuthError(e)); } },
	async signOut() { await Auth.signOutUser(); },

	emailAuthTab(mode) {
		document.getElementById('emailTabSignin')?.classList.toggle('active', mode === 'signin');
		document.getElementById('emailTabSignup')?.classList.toggle('active', mode === 'signup');
		const btn = document.getElementById('emailAuthSubmitBtn');
		if (btn) btn.textContent = mode === 'signup' ? 'Create Account →' : 'Sign In →';
		const msg = document.getElementById('emailAuthMsg');
		if (msg) { msg.textContent = ''; msg.className = 'email-auth-msg'; }
	},
	async emailAuthSubmit() {
		const email = (document.getElementById('emailAuthEmail')?.value || '').trim();
		const password = document.getElementById('emailAuthPassword')?.value || '';
		const msgEl = document.getElementById('emailAuthMsg');
		const isSignup = document.getElementById('emailTabSignup')?.classList.contains('active');
		const setMsg = (text, ok) => { if (msgEl) { msgEl.textContent = text; msgEl.className = 'email-auth-msg' + (ok ? ' success' : ' error'); } };
		if (!email || !password) { setMsg('Enter an email and password.', false); return; }
		const btn = document.getElementById('emailAuthSubmitBtn');
		if (btn) btn.disabled = true;
		try {
			if (isSignup) {
				await Auth.signUpWithEmail(email, password);
				setMsg('Account created — check your inbox for a verification link.', true);
			} else {
				await Auth.signInWithEmail(email, password);
			}
		} catch (e) {
			setMsg(Auth.friendlyAuthError(e), false);
		} finally {
			if (btn) btn.disabled = false;
		}
	},
	async emailAuthResend() {
		try { await Auth.resendVerification(); alert('Verification email sent — check your inbox.'); }
		catch (e) { alert(Auth.friendlyAuthError(e)); }
	},
	async emailAuthRefresh() {
		const user = await Auth.refreshUser();
		UI.renderAuthArea(user);
		if (!user || Auth.needsEmailVerification(user)) alert("Still not verified — check your inbox (and spam folder), then try again.");
	},

	// ── Hosting ──────────────────────────────────────────────────────
	async createRoom() {
		if (!Auth.isRealUser()) { alert('Sign in first to host a room.'); return; }
		const name = document.getElementById('onlineNameInput')?.value || '';
		const seats = UI.getChosenHostSeats();
		const btn = document.getElementById('createRoomBtn');
		if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
		try {
			await Lobby.createHostedRoom(seats, name);
			onlineRole = 'host';
			UI.showLobbyScreen();
		} catch (e) {
			alert('Could not create room: ' + e.message);
		} finally {
			if (btn) { btn.disabled = false; btn.textContent = 'Create Room →'; }
		}
	},
	startHostedGame() { Lobby.startHostedGame(); },

	// ── Joining ──────────────────────────────────────────────────────
	async joinRoomAction() {
		const roomId = (document.getElementById('roomIdInput')?.value || '').trim();
		if (!roomId) { alert('Enter a room code first.'); return; }
		const name = document.getElementById('onlineNameInput')?.value || '';
		const btn = document.getElementById('joinRoomBtn');
		if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
		try {
			await Guest.joinHostedRoom(roomId, name);
			onlineRole = 'guest';
			UI.showLobbyScreen();
		} catch (e) {
			alert('Could not join room: ' + e.message);
		} finally {
			if (btn) { btn.disabled = false; btn.textContent = 'Join Room →'; }
		}
	},
	async quickJoin() {
		const name = document.getElementById('onlineNameInput')?.value || '';
		const btn = document.getElementById('quickJoinBtn');
		if (btn) { btn.disabled = true; btn.textContent = 'Finding a room…'; }
		try {
			await Auth.ensureGuestAuth();
			const roomId = await RoomDirectory.findOpenRoom(firebase.auth().currentUser?.uid);
			if (!roomId) { alert("No open rooms right now — try Host instead, or ask a friend for their room code."); return; }
			await Guest.joinHostedRoom(roomId, name);
			onlineRole = 'guest';
			UI.showLobbyScreen();
		} catch (e) {
			alert('Could not quick join: ' + e.message);
		} finally {
			if (btn) { btn.disabled = false; btn.textContent = '⚡ Quick Join →'; }
		}
	},

	// ── Lobby ────────────────────────────────────────────────────────
	leaveLobby() {
		if (onlineRole === 'host') Lobby.leaveHostedRoom(); else Net.disconnectNet();
		onlineRole = null;
		UI.showSetupScreen();
	},
	copyRoomLink() {
		if (!S.roomId) return;
		const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(S.roomId)}`;
		navigator.clipboard?.writeText(url).then(
			() => {},
			() => prompt('Copy this link:', url),
		);
	},

	// ── Chat ─────────────────────────────────────────────────────────
	toggleChat() { Chat.toggleChat(); },
	sendChat() {
		const input = document.getElementById('chatInput');
		Chat.sendChatMessage(input?.value || '');
	},
};

// ── Boot ────────────────────────────────────────────────────────────
Auth.initAuth(user => UI.renderAuthArea(user));
UI.initSetupScreen((numPlayers, name) => {
	startLocalGame(numPlayers, name);
});
UI.initOnlineHostGrid();

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) UI.prefillRoomId(roomParam);
