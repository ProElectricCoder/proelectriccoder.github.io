// ── Firebase Auth wrapper (needed only for Online mode — CloudflareWSEngine
// requires a Firebase ID token to create/join a room). ──────────────────
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