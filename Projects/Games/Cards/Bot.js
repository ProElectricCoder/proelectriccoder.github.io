/**
 * Bot.js — Getaway AI decision logic
 * -----------------------------------------------------------------------
 * A faithful JavaScript port of the reference Python `get_bot_move`.
 * Used by modules/game.js to drive every bot seat's turn.
 *
 * Card shape:   { id, suit: 'S'|'H'|'D'|'C', rank: 2-14 }   (14 = Ace)
 * Trick shape:  { plays: [{ playerIdx, card }], isFirstTrick }
 *
 * FIDELITY NOTE: the written game rules describe the opening trick's
 * follow-up as "highest Spade, else highest Club, else highest overall,"
 * but the reference Python only checks Spades before falling straight
 * through to highest-overall (no explicit Club branch). This port keeps
 * that behaviour exactly as given rather than silently adding a step that
 * wasn't in the source. modules/rules.js (which drives the *human*
 * player's legal moves) *does* implement the Club fallback from the
 * written rules, so bots and humans diverge on that one specific edge
 * case — add an explicit Club check below if you'd rather they match.
 */

// ── Hand helpers (mirror hand.* from the Python) ─────────────────────────
export function handHasSuit(hand, suit) {
	return hand.some(c => c.suit === suit);
}

export function handGetCard(hand, suit, rank) {
	return hand.find(c => c.suit === suit && c.rank === rank) || null;
}

export function handGetCardsOfSuit(hand, suit) {
	return hand.filter(c => c.suit === suit);
}

export function handGetHighestCard(hand, suit) {
	const cards = handGetCardsOfSuit(hand, suit);
	if (!cards.length) return null;
	return cards.reduce((max, c) => (c.rank > max.rank ? c : max));
}

export function handGetHighestCardOverall(hand) {
	if (!hand.length) return null;
	return hand.reduce((max, c) => (c.rank > max.rank ? c : max));
}

// ── Trick helpers (mirror current_trick.* from the Python) ──────────────
export function trickIsEmpty(trick) {
	return !trick || !trick.plays || trick.plays.length === 0;
}

export function trickGetLeadSuit(trick) {
	return trickIsEmpty(trick) ? null : trick.plays[0].card.suit;
}

export function trickGetHighestCardOfSuit(trick, suit) {
	const cards = trick.plays.map(p => p.card).filter(c => c.suit === suit);
	if (!cards.length) return null;
	return cards.reduce((max, c) => (c.rank > max.rank ? c : max));
}

// ── get_consecutive_top ──────────────────────────────────────────────────
// Top card of an unbroken ascending-RANK run. Suit-agnostic, exactly like
// the source: a 2♣ followed by a 3♦ still extends the chain.
export function getConsecutiveTop(cards) {
	if (!cards || cards.length === 0) return null;
	const sorted = [...cards].sort((a, b) => a.rank - b.rank);
	let chainTop = sorted[0];
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].rank === chainTop.rank + 1) {
			chainTop = sorted[i];
		} else {
			break;
		}
	}
	return chainTop;
}

const LOWEST_RANK = 2;

// ── get_bot_move ──────────────────────────────────────────────────────
export function getBotMove(hand, currentTrick, isFirstTrick, isLastPlayer) {
	// 1. Opening Trick (Ace of Spades force-lead)
	if (isFirstTrick) {
		if (trickIsEmpty(currentTrick)) {
			return handGetCard(hand, 'S', 14);
		}
		if (handHasSuit(hand, 'S')) {
			return handGetHighestCard(hand, 'S');
		}
		if (handHasSuit(hand, 'C')) {
			return handGetHighestCard(hand, 'C');
		}
		return handGetHighestCardOverall(hand);
	}

	// 2. Leading a Round
	if (trickIsEmpty(currentTrick)) {
		const sorted = [...hand].sort((a, b) => a.rank - b.rank);
		const lowestCard = sorted[0];
		if (lowestCard.rank === LOWEST_RANK) {
			return getConsecutiveTop(sorted);
		}
		return lowestCard;
	}

	const leadSuit = trickGetLeadSuit(currentTrick);

	// 3. Off-Suit Penalty Cut
	if (!handHasSuit(hand, leadSuit)) {
		return handGetHighestCardOverall(hand);
	}

	// 4. Last Player
	if (isLastPlayer) {
		return handGetHighestCard(hand, leadSuit);
	}

	// 5. Middle Player
	const tableHighest = trickGetHighestCardOfSuit(currentTrick, leadSuit);
	const handSuitCards = handGetCardsOfSuit(hand, leadSuit).sort((a, b) => a.rank - b.rank);
	const lowerCards = handSuitCards.filter(c => c.rank < tableHighest.rank);
	const higherCards = handSuitCards.filter(c => c.rank > tableHighest.rank);

	if (lowerCards.length) {
		return lowerCards[lowerCards.length - 1];
	}
	return getConsecutiveTop(higherCards);
}