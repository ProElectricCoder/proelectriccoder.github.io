// ── Lightweight "which rooms are open right now" registry, for Quick Join.
// CloudflareWSEngine has no discovery mechanism of its own (it only ever
// signals WebRTC offer/answer/candidate for a room ID you already have),
// so this uses Firestore — already part of the same Firebase project —
// purely as a directory: a doc exists for a room only while it's open to
// new players, and is deleted the moment it isn't (game started, or the
// host leaves the lobby). Every call is wrapped defensively upstream —
// this must never be able to block actually hosting/joining a room, only
// the "discover a room for me" convenience on top of it.
//
// REQUIRES a Firestore collection `openRooms` with rules along the lines
// of (read open to anyone so guests can browse without an account; write
// restricted to signed-in hosts):
//   match /openRooms/{roomId} {
//     allow read: if true;
//     allow write: if request.auth != null;
//   }

const STALE_MS = 20 * 60 * 1000; // treat a lobby open >20min as likely abandoned

function db() { return firebase.firestore(); }

export async function publishRoom(roomId, { hostName, maxSeats, hostUid }) {
	await db().collection('openRooms').doc(roomId).set({
		roomId, hostName, maxSeats, hostUid: hostUid || null,
		filledSeats: 1,
		createdAt: firebase.firestore.FieldValue.serverTimestamp(),
	});
}

export async function updateFilledSeats(roomId, filledSeats) {
	if (!roomId) return;
	await db().collection('openRooms').doc(roomId).update({ filledSeats });
}

export async function closeRoom(roomId) {
	if (!roomId) return;
	await db().collection('openRooms').doc(roomId).delete();
}

// Finds an open room with a free seat, excluding the caller's own (so you
// don't quick-join a room you're already hosting). Deliberately does no
// server-side filtering beyond a document limit — a single unfiltered
// fetch avoids needing any Firestore composite index, which can't be
// configured from here.
export async function findOpenRoom(excludeUid) {
	const snap = await db().collection('openRooms').limit(25).get();
	const now = Date.now();
	const candidates = snap.docs
		.map(d => d.data())
		.filter(r => {
			if (!r.roomId) return false;
			if (excludeUid && r.hostUid === excludeUid) return false;
			if ((r.filledSeats || 0) >= (r.maxSeats || 0)) return false;
			const created = r.createdAt?.toMillis?.() ?? now;
			return (now - created) <= STALE_MS;
		})
		.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
	return candidates[0]?.roomId || null;
}
