// ── Guest-side thin client ────────────────────────────────────────────
// Never runs the authoritative simulation — just mirrors whatever the
// host broadcasts into S and re-renders with the same modules/render.js
// used by Local/Host mode, and forwards this browser's own moves to the
// host instead of applying them locally.
import { S, pushLog } from './state.js';
import * as Net from './net.js';
import * as Render from './render.js';
import * as UI from './ui.js';
import * as Chat from './chat.js';
import { getLegalMoves } from './rules.js';

export async function joinHostedRoom(roomId, name) {
	S.roomId = roomId;
	S.mode = 'guest';
	Chat.clearMessages();
	Net.onNet('connected', () => {
		Net.sendToHost({ type: 'hello', name: (name || '').trim() || 'You' });
	});
	Net.onNet('disconnected', () => {
		pushLog('Disconnected from the host.');
		Render.renderLog();
		Chat.addMessage('System', 'Disconnected from the host.', true);
		Render.setHeaderStatus('Disconnected');
		Render.setPrompt('Lost connection to the host — they may have closed the room.');
	});
	Net.onNet('host-message', ({ data }) => handleHostMessage(data));
	await Net.joinRoom(roomId);
}

function applySnapshot(snap) {
	S.trick = snap.trick;
	S.leaderIdx = snap.leaderIdx;
	S.activeOrder = snap.activeOrder;
	S.turnPointer = snap.turnPointer;
	S.trickNumber = snap.trickNumber;
	S.discardCount = snap.discardCount;
	S.finishOrder = snap.finishOrder;
	S.phase = snap.phase;
	S.log = snap.log;
	snap.players.forEach(sp => {
		const p = S.players[sp.idx];
		if (p) { p.name = sp.name; p.kind = sp.kind; p.count = sp.count; }
	});
}

function ensureRoster(snapPlayers) {
	if (S.players.length === snapPlayers.length) return;
	S.numPlayers = snapPlayers.length;
	S.players = snapPlayers.map(sp => ({
		idx: sp.idx, name: sp.name, kind: sp.kind, gid: null,
		hand: sp.idx === S.localSeatIdx ? (S.players[S.localSeatIdx]?.hand || []) : [],
		handKnown: sp.idx === S.localSeatIdx,
		count: sp.count,
	}));
}

function handleHostMessage(data) {
	if (!data || typeof data !== 'object') return;
	switch (data.type) {
		case 'full':
			UI.showRoomFullMessage();
			break;
		case 'lobby':
			S.maxSeats = data.maxSeats;
			Render.renderLobby({ roomId: data.roomId, maxSeats: data.maxSeats, seats: data.seats, isHost: false, started: false });
			UI.showLobbyScreen();
			break;
		case 'seat':
			S.localSeatIdx = data.seatIdx;
			break;
		case 'hand':
			if (S.players[S.localSeatIdx]) {
				S.players[S.localSeatIdx].hand = data.hand;
				S.players[S.localSeatIdx].count = data.hand.length;
				S.players[S.localSeatIdx].handKnown = true;
			}
			break;
		case 'state':
			if (data.event === 'deal') {
				ensureRoster(data.snapshot.players);
				applySnapshot(data.snapshot);
				UI.showGameScreen();
				Render.renderTable();
			} else {
				applySnapshot(data.snapshot);
			}
			switch (data.event) {
				case 'play': Render.animatePlay(data.playerIdx, data.card); break;
				case 'resolve-pickup': Render.animatePickup(data.pickupPlayerIdx); break;
				case 'resolve-discard': Render.animateDiscard(); break;
				case 'next-trick': Render.refreshBoard(); break;
			}
			refreshPrompt();
			break;
		case 'game-over':
			applySnapshot(data.snapshot);
			Render.refreshBoard();
			Render.setHeaderStatus('Game over');
			Render.setPrompt('—');
			Render.showGameOver(data.loserIdx != null ? S.players[data.loserIdx] : null);
			break;
		case 'CHAT_BROADCAST':
			Chat.addMessage(data.sender, data.text, !!data.system);
			break;
	}
}

function refreshPrompt() {
	if (S.phase !== 'playing') { Render.setActiveSeat(-1); Render.renderHumanHand([]); return; }
	const onTurnIdx = S.activeOrder[S.turnPointer];
	Render.setActiveSeat(onTurnIdx);
	const onTurn = onTurnIdx === S.localSeatIdx;
	const trickLabel = S.trick.isFirstTrick ? 'Opening trick' : `Trick ${S.trickNumber}`;
	const otherName = S.players[onTurnIdx]?.name || '';
	Render.setHeaderStatus(`${trickLabel} · ${onTurn ? 'Your' : otherName + "'s"} turn`);
	const me = S.players[S.localSeatIdx];
	if (onTurn && me) {
		const legal = getLegalMoves(me.hand, S.trick, S.trick.isFirstTrick);
		Render.renderHumanHand(legal);
		Render.setPrompt('Your turn — choose a card.');
	} else {
		Render.renderHumanHand([]);
		Render.setPrompt(onTurn ? '—' : `Waiting for ${otherName}…`);
	}
}

// Called when this guest taps a card in their own hand.
export function sendGuestMove(cardId) {
	const me = S.players[S.localSeatIdx];
	if (!me) return;
	const card = me.hand.find(c => c.id === cardId);
	if (!card) return;
	const legal = getLegalMoves(me.hand, S.trick, S.trick.isFirstTrick);
	if (!legal.some(c => c.id === card.id)) return;
	Net.sendToHost({ type: 'move', cardId });
	Render.renderHumanHand([]); // dim until the host echoes the authoritative update
	Render.setPrompt('Move sent — waiting for the table…');
}
