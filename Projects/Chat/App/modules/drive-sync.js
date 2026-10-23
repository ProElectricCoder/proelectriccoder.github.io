// ── Google Drive backup ────────────────────────────────────────────────────
// Every chat is saved as one JSON file ("<chat name> (<id>).json") inside a Drive folder called
// "P2P Chat Backups", updated in place whenever the chat changes (debounced). Scope is `drive.file`,
// so the app can only see files it created itself. Sign-in happens in a popup (see functions/api/callback.js),
// and the refresh token is exchanged server-side (functions/api/drive-refresh.js) so saving keeps working
// after the 1-hour access-token lifetime.
import { S, makeSess } from './state.js';
import { DB } from './db.js';

const CLIENT_ID  = '629115974151-be9vfilk42ou68lctco3sa2h44ioolqr.apps.googleusercontent.com';
const API_ORIGIN = 'https://proelectriccoder.pages.dev';
const SCOPE      = 'https://www.googleapis.com/auth/drive.file';
const FOLDER     = 'P2P Chat Backups';
const DEBOUNCE   = 8000, RETRY = 60000;
const K = { auth: 'pec_drive_auth', auto: 'pec_drive_auto', files: 'pec_drive_files', folder: 'pec_drive_folder', last: 'pec_drive_last' };

const ls = {
	get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
	set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
	del(k) { try { localStorage.removeItem(k); } catch {} },
};

const SESSION_FIELDS = ['id', 'name', 'type', 'isGroup', 'theme', 'createdAt', 'lastActivity', 'lastMessage', 'roomId', 'wsUrl',
	'groupName', 'peerName', 'peerAvatar', 'bg', 'myRole', 'groupIcon', 'groupOwner', 'groupManagers', 'membersData'];

let refreshing = null;

async function accessToken(force = false) {
	const a = ls.get(K.auth); if (!a) throw new Error('Google Drive is not connected');
	if (!force && a.accessToken && a.expiresAt - Date.now() > 60000) return a.accessToken;
	if (!a.refreshToken) { DriveSync._lost(); throw new Error('Google Drive needs to be reconnected'); }
	if (!refreshing) refreshing = (async () => {
		const r = await fetch(API_ORIGIN + '/api/drive-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: a.refreshToken }) });
		if (r.status === 400) { DriveSync._lost(); throw new Error('Google Drive needs to be reconnected'); }
		if (!r.ok) throw new Error('Could not refresh the Google Drive session (' + r.status + ')');
		const d = await r.json();
		ls.set(K.auth, { ...a, accessToken: d.accessToken, expiresAt: Date.now() + (d.expiresIn || 3600) * 1000 });
		return d.accessToken;
	})().finally(() => { refreshing = null; });
	return refreshing;
}

async function gfetch(url, opts = {}, retried = false) {
	const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + await accessToken(retried) } });
	if (r.status === 401 && !retried) return gfetch(url, opts, true);
	if (!r.ok) { const e = new Error('Drive ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 160)); e.status = r.status; throw e; }
	return r;
}

const qEsc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const DRIVE = 'https://www.googleapis.com/drive/v3/files';

async function folderId() {
	let id = ls.get(K.folder); if (id) return id;
	const q = `mimeType='application/vnd.google-apps.folder' and name='${FOLDER}' and trashed=false`;
	const found = await (await gfetch(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json();
	id = found.files?.[0]?.id;
	if (!id) id = (await (await gfetch(DRIVE + '?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).json()).id;
	ls.set(K.folder, id); return id;
}

async function fileIdFor(sid) {
	const known = (ls.get(K.files, {}))[sid]; if (known) return known;
	const q = `appProperties has { key='pecSession' and value='${qEsc(sid)}' } and trashed=false`;
	const r = await (await gfetch(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json();
	return r.files?.[0]?.id || null;
}
function rememberFile(sid, id) { const m = ls.get(K.files, {}); m[sid] = id; ls.set(K.files, m); }

const safeName = s => String(s || 'Chat').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Chat';

async function buildPayload(sid) {
	const sess = S.sessions.get(sid); if (!sess) return null;
	const session = {}; for (const f of SESSION_FIELDS) session[f] = sess[f] ?? null;
	const messages = (await DB.getMessages(sid)).map(m => {
		const c = { ...m };
		if (c.file) { c.file = { ...c.file }; delete c.file.dataUrl; delete c.file.blobUrl; } // file contents are not backed up
		if (c.meta) { const { offer, answer, ice, ...keep } = c.meta; c.meta = keep; }       // never store SDP
		return c;
	});
	return { name: `${safeName(sess.peerName && !sess.isGroup ? sess.peerName : sess.name)} (${sid}).json`, body: { v: 1, app: 'pec-chat', exportedAt: Date.now(), session, messages } };
}

async function putFile(sid, p, retriedFresh = false) {
	let id = await fileIdFor(sid);
	const meta = { name: p.name, mimeType: 'application/json', appProperties: { pecApp: 'chat', pecSession: sid } };
	if (!id) meta.parents = [await folderId()];
	const boundary = 'pec' + Math.random().toString(36).slice(2);
	const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(p.body)}\r\n--${boundary}--`;
	const url = id ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart&fields=id` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
	try {
		const r = await gfetch(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
		rememberFile(sid, (await r.json()).id);
	} catch (e) {
		// The file or folder was deleted in Drive: forget the cached ids once and recreate
		if (e.status === 404 && !retriedFresh) { ls.del(K.folder); const m = ls.get(K.files, {}); delete m[sid]; ls.set(K.files, m); return putFile(sid, p, true); }
		throw e;
	}
}

export const DriveSync = {
	onStatus: null,      // (state, text) => void — settings UI
	onRestored: null,    // () => void — re-render the chat list
	state: 'off',        // off | idle | saving | error | reconnect
	error: '',
	_restoring: false, _timers: new Map(), _chain: Promise.resolve(),

	isConnected() { return !!ls.get(K.auth); },
	autoOn() { return this.isConnected() && ls.get(K.auto, true) !== false; },
	lastSync() { return ls.get(K.last, 0); },

	_set(state, error = '') { this.state = state; this.error = error; if (this.onStatus) this.onStatus(state, error); },
	_lost() { ls.del(K.auth); this._set('reconnect', 'Google Drive access expired — reconnect to keep saving'); },

	connect() {
		return new Promise((resolve, reject) => {
			const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
			const params = new URLSearchParams({
				client_id: CLIENT_ID, redirect_uri: API_ORIGIN + '/api/callback', response_type: 'code', scope: SCOPE,
				access_type: 'offline', prompt: 'consent', state: `pec-chat|${encodeURIComponent(location.origin)}|${nonce}`,
			});
			const w = window.open('https://accounts.google.com/o/oauth2/v2/auth?' + params, 'pec-drive', 'width=520,height=680');
			if (!w) { reject(new Error('Popup blocked — allow popups for this site and try again')); return; }
			let settled = false;
			const finish = (fn, v) => { if (settled) return; settled = true; clearInterval(poll); window.removeEventListener('message', onMsg); fn(v); };
			const onMsg = e => {
				const d = e.data;
				if (e.origin !== API_ORIGIN || !d || d.type !== 'pec-drive-tokens' || d.nonce !== nonce) return;
				if (d.error || !d.tokens?.accessToken) { finish(reject, new Error(d.error || 'Sign-in failed')); return; }
				ls.set(K.auth, { accessToken: d.tokens.accessToken, refreshToken: d.tokens.refreshToken, expiresAt: Date.now() + (d.tokens.expiresIn || 3600) * 1000 });
				this._set('idle'); finish(resolve, true);
			};
			// If the window is closed without a message, give a late message a moment to land before giving up
			const poll = setInterval(() => { if (w.closed) setTimeout(() => finish(reject, new Error('Sign-in window was closed')), 600); }, 500);
			window.addEventListener('message', onMsg);
		});
	},

	disconnect() {
		ls.del(K.auth); ls.del(K.folder); ls.del(K.files);
		this._timers.forEach(t => clearTimeout(t)); this._timers.clear();
		this._set('off');
	},

	setAuto(on) { ls.set(K.auto, !!on); if (!on) { this._timers.forEach(t => clearTimeout(t)); this._timers.clear(); } },

	// Called by DB whenever a session or message is saved
	queue(sid, delay = DEBOUNCE) {
		if (!sid || this._restoring || !this.autoOn()) return;
		clearTimeout(this._timers.get(sid));
		this._timers.set(sid, setTimeout(() => { this._timers.delete(sid); this.saveNow(sid).catch(() => {}); }, delay));
	},

	saveNow(sid) {
		const run = this._chain.catch(() => {}).then(async () => {
			this._set('saving');
			try {
				const p = await buildPayload(sid);
				if (p) await putFile(sid, p);
				ls.set(K.last, Date.now()); this._set('idle');
			} catch (e) {
				if (this.state === 'reconnect') throw e;
				this._set('error', e.message);
				this.queue(sid, RETRY); // try again later; never lose the change
				throw e;
			}
		});
		this._chain = run;
		return run;
	},

	async backupAll() {
		let n = 0;
		for (const sid of [...S.sessions.keys()]) { try { await this.saveNow(sid); n++; } catch { if (this.state === 'reconnect') break; } }
		return n;
	},

	// After startup / (re)connect: queue chats that changed since the last successful save or were never saved
	syncStale() {
		if (!this.autoOn()) return;
		const files = ls.get(K.files, {}), last = this.lastSync(); let i = 0;
		S.sessions.forEach((s, sid) => { if (!files[sid] || (s.lastActivity || 0) > last) this.queue(sid, 3000 + 1500 * i++); });
	},

	// Import chats found in the Drive folder; existing chats get any missing messages added
	async restore() {
		this._restoring = true; let chats = 0, messages = 0;
		try {
			const folder = await folderId();
			const q = `'${folder}' in parents and trashed=false and appProperties has { key='pecApp' and value='chat' }`;
			let page = '';
			do {
				const r = await (await gfetch(`${DRIVE}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id)&pageSize=100${page ? '&pageToken=' + page : ''}`)).json();
				for (const f of r.files || []) {
					let d; try { d = await (await gfetch(`${DRIVE}/${f.id}?alt=media`)).json(); } catch { continue; }
					if (d?.app !== 'pec-chat' || !d.session?.id) continue;
					const sid = d.session.id; rememberFile(sid, f.id);
					let sess = S.sessions.get(sid), added = 0;
					if (!sess) { sess = makeSess(d.session); S.sessions.set(sid, sess); await DB.saveSession(sess); chats++; }
					const have = new Set((await DB.getMessages(sid)).map(m => m.id));
					for (const m of d.messages || []) {
						if (!m?.id || have.has(m.id)) continue;
						const msg = { ...m, sessionId: sid }; await DB.saveMessage(msg); added++;
						if (sess.messages.length) sess.messages.push(msg);
					}
					if (sess.messages.length) sess.messages.sort((a, b) => a.timestamp - b.timestamp);
					messages += added;
				}
				page = r.nextPageToken || '';
			} while (page);
		} finally { this._restoring = false; }
		if (this.onRestored) this.onRestored();
		return { chats, messages };
	},
};

if (DriveSync.isConnected()) DriveSync.state = 'idle';
DB.onChange = sid => DriveSync.queue(sid);
