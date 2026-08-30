// ── Legal-move & trick-outcome rules shared by the human-facing UI ──────
// Bots never call these — they use Bot.js's fully deterministic
// getBotMove() instead. These functions describe what's *legal*; within
// that legal set, a person is free to choose (see the fidelity note in
// Bot.js re: the one deliberate Club-fallback divergence on trick one).
import {
	handHasSuit, handGetCard, handGetCardsOfSuit, handGetHighestCard,
	handGetHighestCardOverall, trickIsEmpty, trickGetLeadSuit,
} from '../Bot.js';

export function getLegalMoves(hand, trick, isFirstTrick) {
	if (isFirstTrick) {
		if (trickIsEmpty(trick)) {
			const ace = handGetCard(hand, 'S', 14);
			return ace ? [ace] : hand.slice();
		}
		if (handHasSuit(hand, 'S')) return [handGetHighestCard(hand, 'S')];
		if (handHasSuit(hand, 'C')) return [handGetHighestCard(hand, 'C')];
		return [handGetHighestCardOverall(hand)];
	}
	if (trickIsEmpty(trick)) {
		return hand.slice(); // leading — free choice of any card
	}
	const leadSuit = trickGetLeadSuit(trick);
	if (handHasSuit(hand, leadSuit)) {
		return handGetCardsOfSuit(hand, leadSuit); // must follow suit — free choice among them
	}
	return [handGetHighestCardOverall(hand)]; // void — forced penalty cut
}

// Who must pick up the trick pile: whoever played the highest card of the
// led suit. Always resolves — the leader's own card is guaranteed to be
// of the led suit.
export function getTrickPickup(trick) {
	const leadSuit = trickGetLeadSuit(trick);
	let winner = null;
	for (const play of trick.plays) {
		if (play.card.suit === leadSuit && (!winner || play.card.rank > winner.card.rank)) {
			winner = play;
		}
	}
	return winner;
}