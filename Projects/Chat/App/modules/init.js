import { S, makeSess } from './state.js';
import { DB } from './db.js';
import { applyTheme } from './theme.js';
import { requestWakeLock } from './utils.js';
import { injectPanels } from './panels-inject.js';
import { initFirebase } from './firebase-auth.js';
import { renderChatList } from './chat-render.js';

export async function init() {
	// Check URL invite param before anything else
	const inviteParam = new URLSearchParams(location.search).get('invite');
	if (inviteParam) {
		let rid = inviteParam;
		try { rid = atob(inviteParam); } catch {}
		S._pendingInvite = rid.trim();
		history.replaceState({}, '', location.pathname);
	}

	injectPanels();
	try {
		const mod = await import('https://proelectriccoder.github.io/ElectronCSS/CubicGradient.js');
		S.cubicGradFn = mod.cubicGradient;
	} catch {}
	applyTheme('void', null, false);
	initFirebase();
	if (S.wakeLockEnabled) requestWakeLock();
	try {
		const saved = await DB.getSessions();
		// Dedup on load — keep one session per roomId
		const seenRoomIds = new Set();
		for (const sd of saved) {
			if (sd.roomId && !sd.isGroup) {
				if (seenRoomIds.has(sd.roomId)) continue; // skip duplicate
				seenRoomIds.add(sd.roomId);
			}
			const sess = makeSess(sd);
			S.sessions.set(sess.id, sess);
		}
		renderChatList();
	} catch (e) { console.warn('[DB] load failed:', e); }
}