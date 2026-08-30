import {
	handHasSuit, handGetCard, handGetCardsOfSuit, trickIsEmpty, trickGetLeadSuit,
} from '../Bot.js';

export function getLegalMoves(hand, trick, isFirstTrick) {
	if (isFirstTrick) {
		if (trickIsEmpty(trick)) {
			const ace = handGetCard(hand, 'S', 14);
			return ace ? [ace] : hand.slice();
		}
		// Allow humans to play ANY Spade/Club, not just the highest
		if (handHasSuit(hand, 'S')) return handGetCardsOfSuit(hand, 'S');
		if (handHasSuit(hand, 'C')) return handGetCardsOfSuit(hand, 'C');
		return hand.slice();
	}

	if (trickIsEmpty(trick)) {
		return hand.slice(); // Leading — free choice
	}

	const leadSuit = trickGetLeadSuit(trick);
	if (handHasSuit(hand, leadSuit)) {
		return handGetCardsOfSuit(hand, leadSuit); // Must follow suit — free choice
	}

	// Void / Tulla — human can throw ANY card as a penalty
	return hand.slice();
}

// Determines if the engine should resolve the trick immediately.
// Call this after every single card play.
export function isTrickComplete(trick, activePlayerCount, isFirstTrick) {
	if (!trick || !trick.plays) return false;

	if (trick.plays.length === activePlayerCount) return true;

	// If not the first trick, check if the last played card was a Tulla.
	// If yes, trick ends immediately. Remaining players are skipped.
	if (!isFirstTrick && trick.plays.length > 1) {
		const leadSuit = trickGetLeadSuit(trick);
		const lastPlay = trick.plays[trick.plays.length - 1];
		if (lastPlay.card.suit !== leadSuit) {
			return true;
		}
	}

	return false;
}

// Evaluates trick outcome (Pickup vs Clear)
export function evaluateTrickOutcome(trick, isFirstTrick) {
	const leadSuit = trickGetLeadSuit(trick);
	let highestLeadPlay = null;
	let tullaOccurred = false;

	for (const play of trick.plays) {
		if (play.card.suit === leadSuit) {
			if (!highestLeadPlay || play.card.rank > highestLeadPlay.card.rank) {
				highestLeadPlay = play;
			}
		} else {
			tullaOccurred = true;
		}
	}

	// First trick is always discarded. Winner of the trick leads next.
	if (isFirstTrick) {
		return {
			action: 'CLEAR',
			nextLeaderIdx: highestLeadPlay.playerIdx,
			pileToPickup: []
		};
	}

	// Tulla occurred. Victim picks up all cards and leads next.
	if (tullaOccurred) {
		return {
			action: 'PICKUP',
			victimIdx: highestLeadPlay.playerIdx,
			nextLeaderIdx: highestLeadPlay.playerIdx,
			pileToPickup: trick.plays.map(p => p.card)
		};
	}

	// Clean trick. Cards are discarded.
	return {
		action: 'CLEAR',
		nextLeaderIdx: highestLeadPlay.playerIdx,
		pileToPickup: []
	};
}
