import { S } from './state.js';
import { DB } from './db.js';
import { toast } from './utils.js';
import { addSysMsg, renderChatList, renderTopbar } from './chat-render.js';

export function subscribeGroupMeta(sess) {
	if (!sess.roomId || sess.type !== 'firebase') return;
	if (sess._metaUnsub) { sess._metaUnsub(); sess._metaUnsub = null; }
	try {
		const unsub = firebase.firestore().collection('chatRooms').doc(sess.roomId).onSnapshot(snap => {
			const data = snap.data(); if (!data?.meta) return;
			const meta = data.meta;
			if (meta.name && meta.name !== sess.name && sess.isGroup) {
				const old = sess.name; sess.name = meta.name; sess.groupName = meta.name;
				if (old !== meta.name) addSysMsg(sess, `Group renamed to "${meta.name}"`);
			}
			if (meta.icon !== undefined) sess.groupIcon = meta.icon || null;
			sess.groupOwner = meta.owner || null; sess.groupManagers = meta.managers || []; sess.membersData = meta.members || {};
			if (meta.owner === S.user?.uid) sess.myRole = 'owner';
			else if ((meta.managers || []).includes(S.user?.uid)) sess.myRole = 'manager';
			else sess.myRole = 'member';
			DB.saveSession(sess); renderChatList();
			if (S.activeId === sess.id) renderTopbar(sess);
		}, err => console.warn('[GroupMeta]', err));
		sess._metaUnsub = unsub;
	} catch (e) { console.warn('[GroupMeta subscribe]', e); }
}

export async function writeGroupMeta(sess, partial) {
	if (!sess.roomId || !S.user) return;
	try { await firebase.firestore().collection('chatRooms').doc(sess.roomId).set({ meta: partial }, { merge: true }); }
	catch (e) { console.error('[GroupMeta write]', e); toast('Update failed: ' + e.message); }
}