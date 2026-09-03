// ── Screens, setup form, lobby shell, rules drawer ───────────────────
import { S } from './state.js';
import { escapeHtml, avatarHtml } from './render.js';
import * as Chat from './chat.js';
import * as Auth from './auth.js';

let onlineSubTab = 'join'; // Join is the no-friction default; Host needs an account
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

// Join (including Quick Join) never needs sign-in — modules/net.js gets a
// guest a silent anonymous session under the hood. Hosting needs a real,
// verified account, so this only gates the Host pane's form. The signed-
// out markup is static in index.html (not rebuilt here) so an in-progress
// email/password entry never gets wiped by an unrelated auth-state tick.
export function renderAuthArea(user) {
	const gate = document.getElementById('hostAuthGate');
	const form = document.getElementById('onlineHostForm');
	const signedOut = document.getElementById('authSignedOut');
	const signedIn = document.getElementById('authSignedIn');
	const formFields = document.getElementById('authFormFields');
	const verifyPanel = document.getElementById('authVerifyPanel');
	if (!signedOut || !signedIn) return;

	const needsVerify = Auth.needsEmailVerification(user);
	const real = !!user && !user.isAnonymous && !needsVerify;

	gate?.classList.toggle('hidden', real);
	form?.classList.toggle('hidden', !real);

	if (real) {
		signedOut.classList.add('hidden');
		signedIn.classList.remove('hidden');
		const av = avatarHtml(user.photoURL, '👤');
		signedIn.innerHTML = `<div class="auth-row"><span class="mini-avatar">${av}</span><span>Signed in as ${escapeHtml(user.displayName || user.email || 'you')}</span><button class="btn-link" onclick="CardsApp.signOut()">Sign out</button></div>`;
		return;
	}

	signedIn.classList.add('hidden');
	signedOut.classList.remove('hidden');
	if (needsVerify) {
		formFields?.classList.add('hidden');
		verifyPanel?.classList.remove('hidden');
		const emailEl = document.getElementById('authVerifyEmail');
		if (emailEl) emailEl.textContent = user.email || 'your email';
	} else {
		formFields?.classList.remove('hidden');
		verifyPanel?.classList.add('hidden');
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
