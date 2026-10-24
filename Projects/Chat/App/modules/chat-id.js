// ── Readable Chat IDs ──────────────────────────────────────────────────────
// Your Chat ID is built from how you signed in:
//   google-you@gmail.com   github-YourName   email-you@example.com
// It is an *alias*: the real address of your DM inbox stays your Firebase UID (unguessable, already used by
// group membership). The alias is registered in Firestore (`chatIds/<id>` → { uid }), first come first served,
// and resolved back to the UID whenever somebody starts a chat with it.
const PREFIX = /^(google|github|email)-/i;
const LS_PROVIDER = 'pec_provider', LS_GH = 'pec_gh_login:';

export const isAlias = s => PREFIX.test(String(s || '').trim());
// Firestore document id for an alias: case-insensitive, and "/" is not allowed in ids
export const aliasKey = s => String(s).trim().toLowerCase().replace(/\//g, '%2F');

export function rememberProvider(p) { try { localStorage.setItem(LS_PROVIDER, p); } catch {} }
// Stores the GitHub login for an account; returns true when it is new or changed (e.g. the user renamed their account)
export function rememberGithubLogin(uid, login) {
	if (!uid || !login) return false;
	try { const prev = localStorage.getItem(LS_GH + uid); localStorage.setItem(LS_GH + uid, login); return prev !== login; } catch { return false; }
}

// Preferred source of the username: ask GitHub who owns the OAuth token returned at sign-in
// (result.credential.accessToken). Firebase's ID token has no username claim. The numeric id GitHub
// returns must match the Firebase provider uid, so a token for a different account is never accepted.
export async function githubLoginFromToken(accessToken, providerUid) {
	if (!accessToken) return null;
	try {
		const r = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/vnd.github+json' } });
		if (!r.ok) return null;
		const u = await r.json();
		return u.login && (!providerUid || String(u.id) === String(providerUid)) ? u.login : null;
	} catch { return null; }
}

// The provider used for this session; falls back to the first linked provider
export function signInProvider(user) {
	const ids = (user?.providerData || []).map(p => p.providerId);
	let stored = null; try { stored = localStorage.getItem(LS_PROVIDER); } catch {}
	return ids.includes(stored) ? stored : ids[0] || null;
}

async function githubLogin(user) {
	const p = user.providerData.find(x => x.providerId === 'github.com'); if (!p) return null;
	try { const v = localStorage.getItem(LS_GH + p.uid); if (v) return v; } catch {}
	try { // public lookup by numeric id — no token needed
		const r = await fetch('https://api.github.com/user/' + encodeURIComponent(p.uid));
		if (r.ok) { const login = (await r.json()).login; if (login) { rememberGithubLogin(p.uid, login); return login; } }
	} catch {}
	return null;
}

// → { id: display form, provider } or null when it can't be determined (e.g. GitHub unreachable)
export async function computeChatId(user) {
	const provider = signInProvider(user);
	if (provider === 'google.com') {
		const e = user.providerData.find(p => p.providerId === 'google.com')?.email || user.email;
		return e ? { id: 'google-' + e.toLowerCase(), provider } : null;
	}
	if (provider === 'github.com') { const l = await githubLogin(user); return l ? { id: 'github-' + l, provider } : null; }
	if (provider === 'password') return user.email ? { id: 'email-' + user.email.toLowerCase(), provider } : null;
	return null;
}

// Register the alias for this account. Returns { ok:true } or { ok:false, reason, message }
export async function claimChatId(db, user, { id, provider }) {
	const ref = db.collection('chatIds').doc(aliasKey(id));
	try {
		await db.runTransaction(async tx => {
			const snap = await tx.get(ref);
			if (!snap.exists) tx.set(ref, { uid: user.uid, provider, claimedAt: firebase.firestore.FieldValue.serverTimestamp() });
			else if (snap.data().uid !== user.uid) { const e = new Error('taken'); e.code = 'chatid/taken'; throw e; }
		});
		return { ok: true };
	} catch (e) {
		if (e.code === 'chatid/taken') return { ok: false, reason: 'taken', message: `The Chat ID ${id} already belongs to another account` };
		if (e.code === 'permission-denied') return { ok: false, reason: 'rules', message: 'Firestore rules do not allow the chatIds collection yet' };
		return { ok: false, reason: 'error', message: e.message };
	}
}

// Chat ID typed by a user → Firebase UID (the DM room). Returns null if nobody registered it.
export async function lookupChatId(db, input) {
	const snap = await db.collection('chatIds').doc(aliasKey(input)).get();
	return snap.exists ? snap.data().uid : null;
}
