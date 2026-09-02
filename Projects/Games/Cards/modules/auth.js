// ── Firebase Auth wrapper (needed only for Online mode — CloudflareWSEngine
// requires a Firebase ID token to create/join a room). ──────────────────
// Hosting requires a real, verified account (Google, GitHub, or a
// verified email/password account). Joining doesn't — a guest gets a
// silent Anonymous Auth session just to satisfy CloudflareWSEngine's hard
// token requirement; they never see a sign-in screen. Requires Anonymous
// sign-in enabled in the Firebase Console (Authentication → Sign-in
// method → Anonymous, alongside Email/Password, Google, and GitHub).
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

// Creates the account, signs the user into it (standard Firebase
// behaviour), and immediately fires off the verification email. The new
// account is NOT a "real user" for hosting purposes (see isRealUser)
// until that link is clicked.
export async function signUpWithEmail(email, password) {
	const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
	await cred.user.sendEmailVerification();
	return cred.user;
}

export async function signInWithEmail(email, password) {
	const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
	return cred.user;
}

export async function resendVerification() {
	const u = firebase.auth().currentUser;
	if (!u) throw new Error('Not signed in');
	await u.sendEmailVerification();
}

// user.reload() updates the cached currentUser's fields (like
// emailVerified) in place but does NOT re-fire onAuthStateChanged, so
// callers need to explicitly re-render after awaiting this.
export async function refreshUser() {
	const u = firebase.auth().currentUser;
	if (!u) return null;
	await u.reload();
	return firebase.auth().currentUser;
}

export async function signOutUser() {
	await firebase.auth().signOut();
}

export async function getIdToken() {
	const user = firebase.auth().currentUser;
	if (!user) return null;
	return user.getIdToken();
}

function isPasswordAccount(u) {
	return !!u && u.providerData.some(p => p.providerId === 'password');
}

// A password account still needs its email verified; Google/GitHub are
// already provider-verified so no extra check is needed for those.
export function needsEmailVerification(u = firebase.auth().currentUser) {
	return isPasswordAccount(u) && !u.emailVerified;
}

// A "real" account — not an anonymous session, and not an unverified
// password account — required for hosting so other players know (and
// can trust) who's running the room.
export function isRealUser() {
	const u = firebase.auth().currentUser;
	if (!u || u.isAnonymous) return false;
	return !needsEmailVerification(u);
}

// Called right before joining/quick-joining. Reuses any existing session
// (anonymous or real) as-is; only creates a new anonymous one if there's
// no session at all yet.
export async function ensureGuestAuth() {
	if (firebase.auth().currentUser) return firebase.auth().currentUser;
	const cred = await firebase.auth().signInAnonymously();
	return cred.user;
}

export function friendlyAuthError(e) {
	const map = {
		'auth/email-already-in-use': 'That email already has an account — try Sign In instead.',
		'auth/invalid-email': "That email address doesn't look right.",
		'auth/weak-password': 'Password should be at least 6 characters.',
		'auth/wrong-password': 'Incorrect password.',
		'auth/user-not-found': 'No account found with that email.',
		'auth/too-many-requests': 'Too many attempts — wait a bit and try again.',
		'auth/invalid-credential': 'Incorrect email or password.',
		'auth/operation-not-allowed': 'Email/password sign-in isn\u2019t enabled for this project yet.',
	};
	return map[e?.code] || e?.message || 'Something went wrong.';
}
