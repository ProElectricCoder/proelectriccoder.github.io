import { S, makeSess } from './state.js';
import { DB } from './db.js';
import { toast } from './utils.js';
import { ChatEngine } from '../../engine.js';
import { Inbox } from './inbox.js';
import { subscribeGroupMeta, writeGroupMeta } from './group-meta.js';
import { syncAuthSection } from './panels-ui.js';
import { findSessByRoomId, selectSess } from './sessions.js';
import { bindEngine } from './protocol.js';

export function initFirebase() {
	firebase.auth().onAuthStateChanged(user => {
		S.user = user;
		if (user) {
			if (!localStorage.getItem('pec_name')) { S.displayName = user.displayName || 'Anonymous'; localStorage.setItem('pec_name', S.displayName); }
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
		syncAuthSection('spAuthArea'); syncAuthSection('ncRoomAuth'); syncAuthSection('ncGroupAuth');
	});
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