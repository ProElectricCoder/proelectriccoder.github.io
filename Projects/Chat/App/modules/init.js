import { S, makeSess } from './state.js';
import { DB } from './db.js';
import { applyTheme } from './theme.js';
import { requestWakeLock } from './utils.js';
import { injectPanels } from './panels-inject.js';
import { initFirebase } from './firebase-auth.js';
import { renderChatList } from './chat-render.js';
import { DriveSync } from './drive-sync.js';
import { refreshDriveUI } from './panels-ui.js';
import { initMsgUI } from './msg-ui.js';
import { initSearch } from './msg-search.js';
import { initNotify } from './notify.js';
import { initVoice } from './voice.js';
import { initTtl } from './ttl.js';

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
	initMsgUI(); initSearch(); initNotify(); initVoice(); initTtl();
	try {
		const mod = await import('https://proelectriccoder.github.io/ElectronCSS/CubicGradient.js');
		S.cubicGradFn = mod.cubicGradient;
	} catch {}
	applyTheme('void', null, false);
	initFirebase();
	if (S.wakeLockEnabled) requestWakeLock();
	try {
		const saved = await DB.getSessions();
		// Dedup on load — keep one session per roomId, namespaced by engine type
		// (a Firebase room and a Cloudflare relay room can legitimately share an ID)
		const seenRoomIds = new Set();
		for (const sd of saved) {
			if (sd.roomId && !sd.isGroup) {
				const dedupKey = sd.type + ':' + sd.roomId;
				if (seenRoomIds.has(dedupKey)) continue; // skip duplicate
				seenRoomIds.add(dedupKey);
			}
			const sess = makeSess(sd);
			S.sessions.set(sess.id, sess);
		}
		renderChatList();
		DriveSync.onRestored = renderChatList; DriveSync.onStatus = refreshDriveUI;
		DriveSync.syncStale();
	} catch (e) { console.warn('[DB] load failed:', e); }
}
