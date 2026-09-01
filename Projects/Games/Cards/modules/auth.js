// ── Firebase Auth wrapper (needed only for Online mode — CloudflareWSEngine
// requires a Firebase ID token to create/join a room). ──────────────────
// Hosting requires a real (Google/GitHub) sign-in. Joining doesn't — a
// guest gets a silent Anonymous Auth session just to satisfy
// CloudflareWSEngine's hard token requirement; they never see a sign-in
// screen. Requires Anonymous sign-in enabled in the Firebase Console
// (Authentication → Sign-in method → Anonymous).
import { S } from './state.js';

export function initAuth(onChange) {
	firebase.auth().onAuthStateChanged(user => {
		S.user = user;
		if (onChange) onChange(user);
	});
}

export async function signInGoogle() {
	await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
}

export async function signInGitHub() {
	await firebase.auth().signInWithPopup(new firebase.auth.GithubAuthProvider());
}

export async function signOutUser() {
	await firebase.auth().signOut();
}

export async function getIdToken() {
	const user = firebase.auth().currentUser;
	if (!user) return null;
	return user.getIdToken();
}

// A "real" account — Google/GitHub, not an anonymous session — required
// for hosting so other players know who's running the room.
export function isRealUser() {
	const u = firebase.auth().currentUser;
	return !!u && !u.isAnonymous;
}

// Called right before joining/quick-joining. Reuses any existing session
// (anonymous or real) as-is; only creates a new anonymous one if there's
// no session at all yet.
export async function ensureGuestAuth() {
	if (firebase.auth().currentUser) return firebase.auth().currentUser;
	const cred = await firebase.auth().signInAnonymously();
	return cred.user;
}
