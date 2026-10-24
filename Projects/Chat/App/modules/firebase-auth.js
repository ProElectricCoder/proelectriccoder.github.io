import { S, makeSess } from './state.js';
import { DB } from './db.js';
import { toast } from './utils.js';
import { ChatEngine } from '../../engine.js';
import { Inbox } from './inbox.js';
import { subscribeGroupMeta, writeGroupMeta } from './group-meta.js';
import { syncAuthSection } from './panels-ui.js';
import { findSessByRoomId, selectSess } from './sessions.js';
import { bindEngine } from './protocol.js';
import { computeChatId, claimChatId } from './chat-id.js';

export function initFirebase() {
	firebase.auth().onAuthStateChanged(user => handleUser(user));
}

function _refreshAuthUI() {
	syncAuthSection('spAuthArea'); syncAuthSection('ncRoomAuth'); syncAuthSection('ncGroupAuth'); syncAuthSection('ncWsAuth');
	const idEl = document.getElementById('spUserId'); if (idEl) idEl.textContent = S.user ? (S.chatId || S.user.uid) : 'Sign in to get your Chat ID';
}

// Email/password accounts can't be used until the address is verified
function _needsVerification(user) {
	return user.providerData.length > 0 && user.providerData.every(p => p.providerId === 'password') && !user.emailVerified;
}

// Also called after the user clicks "I've verified" (onAuthStateChanged doesn't fire on reload())
export async function handleUser(user) {
	S.pendingVerify = null; S.chatId = null;
	if (user && _needsVerification(user)) { S.pendingVerify = user; user = null; }
	S.user = user;
	if (user) {
		if (!localStorage.getItem('pec_name')) { S.displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Anonymous'); localStorage.setItem('pec_name', S.displayName); }
		S.avatarUrl = user.photoURL || ''; localStorage.setItem('pec_avatar', S.avatarUrl);
		// Start inbox
		Inbox.start();
		// Handle pending invite
		if (S._pendingInvite) {
			const rid = S._pendingInvite; S._pendingInvite = null;
			setTimeout(() => _autoJoinRoom(rid), 600);
		}
		// Re-subscribe firebase sessions to group meta
		S.sessions.forEach(sess => {
			if (sess.type === 'firebase' && sess.roomId) subscribeGroupMeta(sess);
		});
	} else {
		Inbox.stop();
	}
	_refreshAuthUI();
	if (user) _registerChatId(user);
}

// Work out the readable Chat ID and register it so other people can reach you with it
async function _registerChatId(user) {
	try {
		const c = await computeChatId(user); if (S.user !== user) return;
		if (!c) { toast('Could not determine your Chat ID — your account ID is used instead'); return; }
		const r = await claimChatId(firebase.firestore(), user, c); if (S.user !== user) return;
		if (r.ok) { S.chatId = c.id; _refreshAuthUI(); return; }
		console.warn('[ChatID]', r.message);
		toast(r.reason === 'rules' ? 'Readable Chat ID is not enabled yet (Firestore rules) — your account ID is used instead' : r.message + ' — your account ID is used instead');
	} catch (e) { console.warn('[ChatID]', e); }
}

async function _autoJoinRoom(rid) {
	if (!S.user) { toast('Sign in to join via invite link'); return; }
	const existing = findSessByRoomId(rid, false);
	if (existing) { await selectSess(existing.id); toast('Opened existing room'); return; }
	const sess = makeSess({ name: rid, type: 'firebase', roomId: rid });
	const eng = new ChatEngine(); eng.init(firebase.firestore());
	S.sessions.set(sess.id, sess); bindEngine(sess, eng);
	try {
		await eng.joinRoom(rid);
		await writeGroupMeta(sess, { members: { [S.user.uid]: { name: S.displayName, avatar: S.avatarUrl, role: 'member', joinedAt: Date.now() } } });
		subscribeGroupMeta(sess);
		await DB.saveSession(sess); await selectSess(sess.id); toast('Joined via invite link ✓');
	} catch (e) { toast('Could not join: ' + e.message); S.sessions.delete(sess.id); }
}
