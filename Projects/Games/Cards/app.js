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
	async signInGoogle() { try { await Auth.signInGoogle(); } catch (e) { alert(e.message); } },
	async signInGitHub() { try { await Auth.signInGitHub(); } catch (e) { alert(e.message); } },
	async signOut() { await Auth.signOutUser(); },

	// ── Hosting ──────────────────────────────────────────────────────
	async createRoom() {
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
};

// ── Boot ────────────────────────────────────────────────────────────
Auth.initAuth(user => UI.renderAuthArea(user));
UI.initSetupScreen((numPlayers, name) => {
	UI.showGameScreen();
	startLocalGame(numPlayers, name);
});
UI.initOnlineHostGrid();

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) UI.prefillRoomId(roomParam);