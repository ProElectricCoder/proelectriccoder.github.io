// ── Global game state ─────────────────────────────────────────────────
export const S = {
	mode: 'local',           // 'local' | 'host' | 'guest'
	localSeatIdx: 0,          // which seat THIS browser plays as
	roomId: null,
	maxSeats: 0,
	user: null,               // Firebase user once signed in (online mode)

	numPlayers: 0,
	players: [],              // { idx, name, kind:'local'|'bot'|'remote', gid, avatarUrl, hand, handKnown, count }
	trick: { plays: [], isFirstTrick: true },
	leaderIdx: null,
	activeOrder: [],          // player indices in turn order for the current trick
	turnPointer: 0,
	trickNumber: 1,
	discardPile: [],
	discardCount: 0,
	finishOrder: [],          // [{ idx, place }]
	phase: 'setup',           // setup | lobby | playing | resolving | gameOver
	log: [],
};

export function resetState(seatSpecs, mode, localSeatIdx) {
	S.mode = mode;
	S.localSeatIdx = localSeatIdx;
	S.numPlayers = seatSpecs.length;
	S.players = seatSpecs.map((spec, i) => ({
		idx: i,
		name: spec.name,
		kind: spec.kind,             // 'local' | 'bot' | 'remote'
		gid: spec.gid || null,
		avatarUrl: spec.avatarUrl || null,
		hand: [],
		handKnown: mode !== 'guest' || i === localSeatIdx,
		count: 0,
	}));
	S.trick = { plays: [], isFirstTrick: true };
	S.leaderIdx = null;
	S.activeOrder = [];
	S.turnPointer = 0;
	S.trickNumber = 1;
	S.discardPile = [];
	S.discardCount = 0;
	S.finishOrder = [];
	S.phase = 'setup';
	S.log = [];
}

export function pushLog(msg) {
	S.log.push(msg);
	if (S.log.length > 300) S.log.shift();
}
