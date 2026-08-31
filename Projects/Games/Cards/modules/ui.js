// ── Screens, setup form, lobby shell, rules drawer ───────────────────
import { S } from './state.js';
import { escapeHtml } from './render.js';
import * as Chat from './chat.js';

let onlineSubTab = 'host';
let chosenLocalCount = 6;
let chosenHostSeats = 6;

// ── Screen switching ──────────────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }

export function showSetupScreen() {
	show('setupScreen'); hide('lobbyScreen'); hide('gameScreen');
	document.getElementById('gameOverModal')?.classList.remove('open');
	Chat.setVisible(false);
}
export function showLobbyScreen() {
	hide('setupScreen'); show('lobbyScreen'); hide('gameScreen');
	Chat.setVisible(S.mode !== 'local');
}
export function showGameScreen() {
	hide('setupScreen'); hide('lobbyScreen'); show('gameScreen');
	Chat.setVisible(S.mode !== 'local');
}
export function showRoomFullMessage() {
	alert('That room is already full.');
	showSetupScreen();
}

// ── Setup screen ────────────────────────────────────────────────────
export function setupMode(mode) {
	document.getElementById('modeTabLocal')?.classList.toggle('active', mode === 'local');
	document.getElementById('modeTabOnline')?.classList.toggle('active', mode === 'online');
	document.getElementById('localSetup')?.classList.toggle('hidden', mode !== 'local');
	document.getElementById('onlineSetup')?.classList.toggle('hidden', mode !== 'online');
}

export function onlineSub(sub) {
	onlineSubTab = sub;
	document.getElementById('onlineSubHost')?.classList.toggle('active', sub === 'host');
	document.getElementById('onlineSubJoin')?.classList.toggle('active', sub === 'join');
	document.getElementById('onlineHostPane')?.classList.toggle('hidden', sub !== 'host');
	document.getElementById('onlineJoinPane')?.classList.toggle('hidden', sub !== 'join');
}
export function getOnlineSubTab() { return onlineSubTab; }

function drawCountGrid(gridId, current, onPick) {
	const grid = document.getElementById(gridId); if (!grid) return;
	grid.innerHTML = '';
	for (let n = 3; n <= 10; n++) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'pc-btn' + (n === current ? ' active' : '');
		btn.textContent = n;
		btn.onclick = () => onPick(n);
		grid.appendChild(btn);
	}
}

export function initSetupScreen(onStartLocal) {
	function draw() { drawCountGrid('playerCountGrid', chosenLocalCount, n => { chosenLocalCount = n; draw(); }); }
	draw();
	document.getElementById('startGameBtn').onclick = () => {
		const name = document.getElementById('humanNameInput')?.value || '';
		onStartLocal(chosenLocalCount, name);
	};
}

export function initOnlineHostGrid() {
	function draw() { drawCountGrid('onlinePcGrid', chosenHostSeats, n => { chosenHostSeats = n; draw(); }); }
	draw();
}
export function getChosenHostSeats() { return chosenHostSeats; }

export function renderAuthArea(user) {
	const a = document.getElementById('onlineAuthArea'); if (!a) return;
	const roomArea = document.getElementById('onlineRoomArea');
	if (user) {
		a.innerHTML = `<div class="auth-row"><span>Signed in as ${escapeHtml(user.displayName || user.email || 'you')}</span><button class="btn-link" onclick="CardsApp.signOut()">Sign out</button></div>`;
		roomArea?.classList.remove('hidden');
	} else {
		a.innerHTML = `<button class="sign-in-btn" onclick="CardsApp.signInGoogle()">Sign in with Google</button>
			<button class="sign-in-btn" onclick="CardsApp.signInGitHub()">Sign in with GitHub</button>`;
		roomArea?.classList.add('hidden');
	}
}

export function prefillRoomId(id) {
	const inp = document.getElementById('roomIdInput');
	if (inp && id) { inp.value = id; onlineSub('join'); setupMode('online'); }
}

// ── Rules drawer ────────────────────────────────────────────────────
export function toggleRules(openIt) {
	document.getElementById('rulesDrawer')?.classList.toggle('open', openIt);
	document.getElementById('rulesBackdrop')?.classList.toggle('open', openIt);
}
