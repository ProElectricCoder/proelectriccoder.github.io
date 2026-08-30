// ── Card model & deck utilities ──────────────────────────────────────────
export const SUITS = ['S', 'H', 'D', 'C'];

export const SUIT_META = {
	S: { symbol: '♠', name: 'Spades',   color: '#1c1f26' },
	C: { symbol: '♣', name: 'Clubs',    color: '#1c1f26' },
	H: { symbol: '♥', name: 'Hearts',   color: '#d1293d' },
	D: { symbol: '♦', name: 'Diamonds', color: '#d1293d' },
};

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const RANK_LABEL = {
	2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
	11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export function createDeck() {
	const deck = [];
	for (const suit of SUITS) {
		for (const rank of RANKS) {
			deck.push({ id: `${suit}${rank}`, suit, rank });
		}
	}
	return deck;
}

export function shuffle(deck) {
	const d = deck.slice();
	for (let i = d.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[d[i], d[j]] = [d[j], d[i]];
	}
	return d;
}

// Round-robin deal across n players — as even as a 52-card deck allows.
export function deal(deck, n) {
	const hands = Array.from({ length: n }, () => []);
	deck.forEach((card, i) => hands[i % n].push(card));
	return hands;
}

export function cardLabel(card) {
	return `${RANK_LABEL[card.rank]}${SUIT_META[card.suit].symbol}`;
}

export function sortHand(hand) {
	return [...hand].sort((a, b) => a.suit.localeCompare(b.suit) || a.rank - b.rank);
}
