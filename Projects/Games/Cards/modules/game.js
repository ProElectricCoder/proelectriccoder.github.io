// ── Core game orchestrator ───────────────────────────────────────────
// Runs the one true copy of the game: for a pure Local game and for a
// Host's game these are the same engine — a Host's own seat is just
// 'local' like any solo game, and any joined guests are 'remote' seats
// instead of 'bot' ones. A Guest's browser never runs this module at all
// (see modules/guest-client.js), it just mirrors what the host broadcasts.
import { S, resetState, pushLog } from './state.js';
import { createDeck, shuffle, deal, cardLabel, SUIT_META } from './deck.js';
import { getBotMove, trickGetLeadSuit } from '../Bot.js';
import { getLegalMoves, isTrickComplete, evaluateTrickOutcome } from './rules.js';
import * as Render from './render.js';
import * as Net from './net.js';

const BOT_DELAY_MS = 700, FAST_BOT_DELAY_MS = 90;          // spec: 600-800ms normally
const TRICK_PAUSE_MS = 550, FAST_TRICK_PAUSE_MS = 120;
const RESOLVE_ANIM_MS = 420;                                 // matches the CSS fly animation
const NEXT_TRICK_PAUSE_MS = 350, FAST_NEXT_TRICK_PAUSE_MS = 60;
const HARD_TRICK_CAP = 3000;                                  // absolute safety valve, see below

// Getaway's rules are fully deterministic once a hand is fixed (no dice,
// no hidden tie-breaks) — which means once every human/remote seat at the
// table has escaped, the remaining bots can end up in an exact repeating
// cycle, replaying the same tricks forever (confirmed by simulation: a
// bare 2-bot endgame can cycle with period as low as 8 tricks). This
// tracks state seen so far and, on an exact repeat, has that one trick's
// bots pick a random *legal* card instead of their normal deterministic
// move — enough entropy to break the loop without touching Bot.js itself.
let seenStates = new Set();
function stateHash() {
	return S.leaderIdx + '|' + S.trick.isFirstTrick + '|' +
		S.players.map(p => p.hand.map(c => c.id).sort().join(',')).join('#');
}
function markStateAndCheckCycle() {
	const h = stateHash();
	const repeat = seenStates.has(h);
	seenStates.add(h);
	return repeat;
}

function allBotsRemaining() {
	return !S.players.some(p => p.kind !== 'bot' && p.hand.length > 0);
}

export function startLocalGame(numPlayers, humanName) {
	const specs = [{ name: (humanName || '').trim() || 'You', kind: 'local' }];
	for (let i = 1; i < numPlayers; i++) specs.push({ name: `Bot ${i}`, kind: 'bot' });
	beginGame(specs, 'local', 0);
}

export function startHostGame(seatSpecs) {
	beginGame(seatSpecs, 'host', 0);
}

function beginGame(seatSpecs, mode, localSeatIdx) {
	resetState(seatSpecs, mode, localSeatIdx);
	seenStates = new Set();

	const hands = deal(shuffle(createDeck()), S.numPlayers);
	hands.forEach((h, i) => { S.players[i].hand = h; S.players[i].count = h.length; });

	const aceHolder = S.players.find(p => p.hand.some(c => c.suit === 'S' && c.rank === 14));
	S.leaderIdx = aceHolder ? aceHolder.idx : 0;
	S.trick = { plays: [], isFirstTrick: true };
	S.activeOrder = computeActiveOrder(S.leaderIdx);
	S.turnPointer = 0;
	S.trickNumber = 1;
	S.phase = 'playing';
	S.trickCycleBreak = markStateAndCheckCycle(); // always false on a fresh shuffle

	Render.renderTable();
	pushLog(`New game — ${S.numPlayers} players. ${S.players[S.leaderIdx].name} holds the A♠ and opens.`);
	Render.renderLog();

	if (S.mode === 'host') {
		S.players.forEach(p => { if (p.kind === 'remote') Net.sendTo(p.gid, { type: 'hand', hand: p.hand }); });
		Net.broadcast(publicEventMsg('deal'));
	}

	advanceTurn();
}

function computeActiveOrder(leaderIdx) {
	const n = S.numPlayers;
	const order = [];
	for (let i = 0; i < n; i++) {
		const idx = (leaderIdx + i) % n;
		if (S.players[idx].hand.length > 0) order.push(idx);
	}
	return order;
}

function currentPlayerIdx() { return S.activeOrder[S.turnPointer]; }
function isLastToAct() { return S.turnPointer === S.activeOrder.length - 1; }

function snapshot() {
	return {
		trick: S.trick,
		leaderIdx: S.leaderIdx,
		activeOrder: S.activeOrder,
		turnPointer: S.turnPointer,
		trickNumber: S.trickNumber,
		discardCount: S.discardPile.length,
		finishOrder: S.finishOrder,
		phase: S.phase,
		players: S.players.map(p => ({ idx: p.idx, name: p.name, kind: p.kind, count: p.hand.length })),
		log: S.log.slice(-12),
	};
}
function publicEventMsg(event, extra = {}) {
	return { type: 'state', event, ...extra, snapshot: snapshot() };
}

function advanceTurn() {
	if (S.phase !== 'playing') return;
	const playerIdx = currentPlayerIdx();
	const player = S.players[playerIdx];

	Render.setActiveSeat(playerIdx);
	const trickLabel = S.trick.isFirstTrick ? 'Opening trick' : `Trick ${S.trickNumber}`;
	Render.setHeaderStatus(`${trickLabel} · ${playerIdx === S.localSeatIdx ? 'Your' : player.name + "'s"} turn`);

	if (playerIdx === S.localSeatIdx) {
		const legal = getLegalMoves(player.hand, S.trick, S.trick.isFirstTrick);
		Render.renderHumanHand(legal);
		Render.setPrompt(describePrompt(legal));
	} else if (player.kind === 'bot') {
		Render.renderHumanHand([]);
		Render.setPrompt(`Waiting for ${player.name}…`);
		const delay = allBotsRemaining() ? FAST_BOT_DELAY_MS : BOT_DELAY_MS;
		setTimeout(() => {
			if (S.phase !== 'playing') return;
			let move;
			if (S.trickCycleBreak) {
				const legal = getLegalMoves(player.hand, S.trick, S.trick.isFirstTrick);
				move = legal[Math.floor(Math.random() * legal.length)];
			} else {
				move = getBotMove(player.hand, S.trick, S.trick.isFirstTrick, isLastToAct());
			}
			if (!move) move = player.hand[0];
			playCard(playerIdx, move);
		}, delay);
	} else {
		// remote — waiting for that peer's own move to arrive over the network
		Render.renderHumanHand([]);
		Render.setPrompt(`Waiting for ${player.name}…`);
	}
}

function describePrompt(legal) {
	const trick = S.trick;
	if (trick.isFirstTrick && trick.plays.length === 0) {
		return 'You hold the Ace of Spades — lead it to open the game.';
	}
	if (trick.isFirstTrick) {
		const suit = legal[0]?.suit;
		if (suit === 'S') return 'Opening trick — play any Spade.';
		if (suit === 'C') return 'Opening trick — no Spades: play any Club.';
		return 'Opening trick — no Spades or Clubs: play any card.';
	}
	if (trick.plays.length === 0) return 'Your lead — choose any card from your hand.';
	const leadSuit = trickGetLeadSuit(trick);
	const following = legal.some(c => c.suit === leadSuit);
	if (!following) return `Out of ${SUIT_META[leadSuit].name} — throw any card as your penalty cut (ends the trick right away).`;
	const singular = SUIT_META[leadSuit].name.slice(0, -1);
	return `Follow suit (${SUIT_META[leadSuit].symbol}) — choose any ${singular}.`;
}

function playCard(playerIdx, card) {
	const player = S.players[playerIdx];
	const i = player.hand.findIndex(c => c.id === card.id);
	if (i === -1) return;
	player.hand.splice(i, 1);
	player.count = player.hand.length;
	S.trick.plays.push({ playerIdx, card });

	const isTulla = S.trick.plays.length > 1 && !S.trick.isFirstTrick && card.suit !== trickGetLeadSuit(S.trick);
	pushLog(`${player.name} plays ${cardLabel(card)}${S.trick.plays.length === 1 ? ' (leads)' : isTulla ? ' — penalty cut, trick over!' : ''}.`);
	Render.animatePlay(playerIdx, card);
	Render.renderLog();
	Render.setPrompt('—');

	const trickComplete = isTrickComplete(S.trick, S.activeOrder.length, S.trick.isFirstTrick);
	if (!trickComplete) S.turnPointer++;

	if (S.mode === 'host') Net.broadcast(publicEventMsg('play', { playerIdx, card }));

	if (trickComplete) {
		S.phase = 'resolving';
		Render.setActiveSeat(-1);
		const pause = allBotsRemaining() ? FAST_TRICK_PAUSE_MS : TRICK_PAUSE_MS;
		setTimeout(resolveTrick, pause);
	} else {
		advanceTurn();
	}
}

function resolveTrick() {
	const trick = S.trick;
	const outcome = evaluateTrickOutcome(trick, trick.isFirstTrick);
	const cards = trick.plays.map(p => p.card);

	if (outcome.action === 'PICKUP') {
		const victim = S.players[outcome.victimIdx];
		victim.hand.push(...outcome.pileToPickup);
		victim.count = victim.hand.length;
		pushLog(`${victim.name} couldn't follow suit and must pick up ${outcome.pileToPickup.length} cards.`);
		Render.animatePickup(outcome.victimIdx);
		if (S.mode === 'host') {
			Net.broadcast(publicEventMsg('resolve-pickup', { pickupPlayerIdx: outcome.victimIdx }));
			if (victim.kind === 'remote') Net.sendTo(victim.gid, { type: 'hand', hand: victim.hand });
		}
	} else {
		S.discardPile.push(...cards);
		pushLog(trick.isFirstTrick
			? `Opening trick discarded — ${cards.length} card${cards.length === 1 ? '' : 's'} removed from play for good.`
			: `Clean trick — everyone followed suit, ${cards.length} card${cards.length === 1 ? '' : 's'} cleared from play.`);
		Render.animateDiscard();
		if (S.mode === 'host') Net.broadcast(publicEventMsg('resolve-discard'));
	}

	for (const p of S.players) {
		if (p.hand.length === 0 && !S.finishOrder.some(f => f.idx === p.idx)) {
			S.finishOrder.push({ idx: p.idx, place: S.finishOrder.length + 1 });
			pushLog(`${p.name} sheds their last card — finished #${S.finishOrder.length}!`);
		}
	}
	Render.renderLog();

	setTimeout(() => {
		const remaining = S.players.filter(p => p.hand.length > 0);
		if (remaining.length <= 1 || S.trickNumber >= HARD_TRICK_CAP) {
			S.phase = 'gameOver';
			Render.refreshBoard();
			Render.setHeaderStatus('Game over');
			Render.setPrompt('—');
			const loser = remaining.length <= 1 ? (remaining[0] || null) : [...remaining].sort((a, b) => b.hand.length - a.hand.length)[0];
			Render.showGameOver(loser);
			if (S.mode === 'host') Net.broadcast({ type: 'game-over', finishOrder: S.finishOrder, loserIdx: loser?.idx ?? null, snapshot: snapshot() });
			return;
		}
		let nextLeader = outcome.nextLeaderIdx;
		for (let i = 0; i < S.numPlayers; i++) {
			const idx = (nextLeader + i) % S.numPlayers;
			if (S.players[idx].hand.length > 0) { nextLeader = idx; break; }
		}
		S.leaderIdx = nextLeader;
		S.trickNumber += 1;
		S.trick = { plays: [], isFirstTrick: false };
		S.activeOrder = computeActiveOrder(nextLeader);
		S.turnPointer = 0;
		S.phase = 'playing';
		S.trickCycleBreak = markStateAndCheckCycle();
		Render.refreshBoard();
		if (S.mode === 'host') Net.broadcast(publicEventMsg('next-trick'));
		const pause = allBotsRemaining() ? FAST_NEXT_TRICK_PAUSE_MS : NEXT_TRICK_PAUSE_MS;
		setTimeout(advanceTurn, pause);
	}, RESOLVE_ANIM_MS + 40);
}

// Called when this browser's own interactive seat (Local mode, or a
// Host's own seat) taps a card.
export function humanPlayById(cardId) {
	if (S.phase !== 'playing') return;
	const playerIdx = currentPlayerIdx();
	if (playerIdx !== S.localSeatIdx) return;
	const player = S.players[playerIdx];
	const card = player.hand.find(c => c.id === cardId);
	if (!card) return;
	const legal = getLegalMoves(player.hand, S.trick, S.trick.isFirstTrick);
	if (!legal.some(c => c.id === card.id)) return;
	playCard(playerIdx, card);
}

// Called by modules/lobby.js when a 'move' message arrives from a
// connected guest — routes it through the exact same playCard() path as
// any local or bot move.
export function handleRemoteMove(gid, cardId) {
	if (S.phase !== 'playing') return;
	const playerIdx = currentPlayerIdx();
	const player = S.players[playerIdx];
	if (!player || player.kind !== 'remote' || player.gid !== gid) return;
	const card = player.hand.find(c => c.id === cardId);
	if (!card) return;
	const legal = getLegalMoves(player.hand, S.trick, S.trick.isFirstTrick);
	if (!legal.some(c => c.id === card.id)) return;
	playCard(playerIdx, card);
}

// Called by modules/lobby.js if a remote player disconnects mid-game — a
// bot takes over their hand for the rest of the game rather than stalling.
export function convertSeatToBot(gid) {
	const p = S.players.find(pl => pl.kind === 'remote' && pl.gid === gid);
	if (!p) return;
	p.kind = 'bot';
	p.gid = null;
	pushLog(`${p.name} disconnected — a bot is taking over their hand.`);
	Render.renderLog();
	if (S.mode === 'host') Net.broadcast(publicEventMsg('next-trick'));
}
