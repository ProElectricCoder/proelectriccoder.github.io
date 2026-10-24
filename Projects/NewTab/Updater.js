// Update engine shared by the background service worker (background.js), the new tab page
// (NewTabJS.js) and the extension's home page (index.html). It only touches the linked extension
// folder through a File System Access directory handle.
//
// Changelog.json is both the release notes and the local update state:
//   files, releases   → come from the server with every release
//   autoUpdate, log, notify, updating → local state, carried over when a release is installed
// (it replaces the separate Updates.json of earlier versions, which is imported once and removed)

export const REMOTE_BASE = 'https://proelectriccoder.github.io/Projects/NewTab/';
export const STATE_FILE = 'Changelog.json';
const LEGACY_STATE_FILE = 'Updates.json';

// Only used if the server's Changelog.json has no usable "files" list
const FALLBACK_FILES = [
	'manifest.json', 'NewTab.html', 'NewTabJS.js', 'CubicGradient.js', 'Changelog.json',
	'Updater.js', 'background.js', 'Version.js', 'Bridge.js',
	'ProElectricCoder-logo-website-1.svg', 'ProElectricCoder-logo-website-2.svg',
	'Icon16.png', 'Icon48.png', 'Icon128.png'
];

// ─── Versions ─────────────────────────────────────────────────────────────
export const isVersionString = (v) => /^\d+(\.\d+)*$/.test(v || '');

export function compareVersions(a, b) {
	const pa = String(a).split('.').map(Number);
	const pb = String(b).split('.').map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
		if ((pa[i] || 0) > (pb[i] || 0)) return 1;
		if ((pa[i] || 0) < (pb[i] || 0)) return -1;
	}
	return 0;
}

// Plain file names only — nothing from the server may write outside the folder or touch local state
const isSafeFileName = (n) => typeof n === 'string' && /^(?!\.+$)[\w.-]+$/.test(n) && n !== LEGACY_STATE_FILE;

// ─── Folder handle (stored in IndexedDB, shared by the page and the service worker) ───
const DB_NAME = 'NewTabExtDB';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'extFolder';

function openDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function saveHandle(handle) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
		tx.oncomplete = resolve;
		tx.onerror = () => reject(tx.error);
	});
}

export async function getHandle() {
	try {
		const db = await openDB();
		return await new Promise((resolve) => {
			const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(HANDLE_KEY);
			req.onsuccess = () => resolve(req.result || null);
			req.onerror = () => resolve(null);
		});
	} catch {
		return null;
	}
}

export async function hasAccess(dir) {
	try { return (await dir.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch { return false; }
}

// ─── Files ────────────────────────────────────────────────────────────────
async function readJson(dir, name) {
	try {
		const fh = await dir.getFileHandle(name);
		return JSON.parse(await (await fh.getFile()).text());
	} catch {
		return null;
	}
}

async function fileExists(dir, name) {
	try { await dir.getFileHandle(name); return true; } catch { return false; }
}

// createWritable() writes to a temporary copy and only swaps it in on close(), so a file is never half-written
async function writeFile(dir, name, data) {
	const fh = await dir.getFileHandle(name, { create: true });
	const w = await fh.createWritable();
	try {
		await w.write(data);
		await w.close();
	} catch (e) {
		try { await w.abort(); } catch { /* already closed */ }
		throw new Error(`Failed to write ${name}: ${e.message}`);
	}
}

export async function localVersion(dir) {
	return (await readJson(dir, 'manifest.json'))?.version ?? null;
}

// ─── State (the local half of Changelog.json) ─────────────────────────────
const withLock = (fn) => (typeof navigator !== 'undefined' && navigator.locks)
	? navigator.locks.request('newtab-state', fn)
	: fn();

function normalise(d) {
	return {
		files:      Array.isArray(d.files) ? d.files.filter(isSafeFileName) : [],
		releases:   Array.isArray(d.releases) ? d.releases : [],
		autoUpdate: !!d.autoUpdate,
		log:        Array.isArray(d.log) ? d.log : [],
		notify:     d.notify ?? null,
		updating:   d.updating && typeof d.updating === 'object' ? d.updating : null
	};
}

async function readStateRaw(dir) {
	const doc = (await readJson(dir, STATE_FILE)) || {};
	// Earlier versions kept autoUpdate / log / notify in Updates.json; it wins until it has been merged in
	const legacy = await readJson(dir, LEGACY_STATE_FILE);
	if (legacy && typeof legacy === 'object') {
		doc.autoUpdate = !!legacy.autoUpdate;
		doc.log = Array.isArray(legacy.log) ? legacy.log : [];
		doc.notify = legacy.notify ?? null;
	}
	return { doc: normalise(doc), hadLegacy: !!legacy };
}

export async function readState(dir) {
	return (await readStateRaw(dir)).doc;
}

// Read-modify-write under a lock, so the service worker and the page can't overwrite each other
export function updateState(dir, mutate) {
	return withLock(async () => {
		const { doc, hadLegacy } = await readStateRaw(dir);
		await mutate(doc);
		await writeFile(dir, STATE_FILE, JSON.stringify(doc, null, '\t') + '\n');
		if (hadLegacy) { try { await dir.removeEntry(LEGACY_STATE_FILE); } catch { /* keep going */ } }
		return doc;
	});
}

export async function migrateLegacy(dir) {
	if (await fileExists(dir, LEGACY_STATE_FILE)) await updateState(dir, () => {});
}

// ─── Server ───────────────────────────────────────────────────────────────
async function fetchFresh(url) {
	const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
	if (!res.ok) throw new Error(`Could not fetch ${url.split('/').pop().split('?')[0]} (${res.status})`);
	return res;
}

export async function fetchRemoteDoc(base = REMOTE_BASE) {
	return (await fetchFresh(base + STATE_FILE)).json();
}

// The release's file list lives in its Changelog.json, so a release can always add files
export function releaseFileList(doc) {
	const list = Array.isArray(doc?.files) ? doc.files.filter(isSafeFileName) : [];
	return [...new Set([...(list.length ? list : FALLBACK_FILES), 'manifest.json', STATE_FILE])];
}

// Downloads every file of the release into memory first, so a failed download changes nothing on disk
export async function fetchReleaseFiles(base = REMOTE_BASE, doc) {
	const names = releaseFileList(doc ?? await fetchRemoteDoc(base));
	const files = {};
	await Promise.all(names.map(async (name) => { files[name] = await (await fetchFresh(base + name)).blob(); }));
	return files;
}

// ─── Install ──────────────────────────────────────────────────────────────
// Order matters for crash safety:
//   1. everything is downloaded into memory (a failure here touches nothing)
//   2. "updating" is recorded in Changelog.json — if anything below is interrupted, the next check resumes
//   3. all files except manifest.json and Changelog.json are written (each write is atomic)
//   4. Changelog.json is merged: new files/releases from the server, local state kept
//   5. manifest.json goes last, so it never points at files that aren't there yet
//   6. "updating" is cleared
// `from` is the version being replaced (null for a fresh install: no "what's new" toast then).
export async function installUpdate(dir, { base = REMOTE_BASE, from = null, note = 'Updated' } = {}) {
	const remoteDoc = await fetchRemoteDoc(base);
	const files = await fetchReleaseFiles(base, remoteDoc);
	const to = JSON.parse(await files['manifest.json'].text()).version;

	await updateState(dir, (d) => { d.updating = { from, to, startedAt: Date.now() }; });

	for (const [name, blob] of Object.entries(files)) {
		if (name !== 'manifest.json' && name !== STATE_FILE) await writeFile(dir, name, blob);
	}

	await updateState(dir, (d) => {
		const fresh = normalise(remoteDoc);
		d.files = fresh.files.length ? fresh.files : releaseFileList(remoteDoc);
		d.releases = fresh.releases;
		d.log.push({ timestamp: new Date().toLocaleString(), from, to, note });
		if (from && from !== to) {
			// If an earlier update is still waiting to be announced, keep its starting version so the notes stack
			const pendingFrom = d.notify && typeof d.notify === 'object' && isVersionString(d.notify.from) ? d.notify.from : null;
			d.notify = { from: pendingFrom || from, to };
		}
	});

	await writeFile(dir, 'manifest.json', files['manifest.json']);
	await updateState(dir, (d) => { d.updating = null; });
	return { to };
}

// Re-downloads any file of the installed release that has gone missing
async function repairMissing(dir, base, state) {
	const missing = [];
	for (const name of state.files) if (!(await fileExists(dir, name))) missing.push(name);
	for (const name of missing) {
		if (name === STATE_FILE) continue;
		await writeFile(dir, name, await (await fetchFresh(base + name)).blob());
	}
	return missing;
}

// One full check: finish an interrupted update, install a newer release, or repair missing files.
// Runs in the background service worker (reload = true applies the new files by reloading the extension).
export async function checkAndUpdate({ base = REMOTE_BASE, manual = false, reload = true } = {}) {
	const dir = await getHandle();
	if (!dir) return { status: 'no-folder' };
	if (!(await hasAccess(dir))) return { status: 'needs-permission' };

	await migrateLegacy(dir);
	const state = await readState(dir);

	// An interrupted update is always finished, even with auto-update off
	if (!state.autoUpdate && !manual && !state.updating) return { status: 'auto-update-off' };

	const local = await localVersion(dir);
	const remote = (await (await fetchFresh(base + 'manifest.json')).json()).version;

	if (!local || compareVersions(remote, local) > 0 || state.updating) {
		const { to } = await installUpdate(dir, {
			base, from: local,
			note: state.updating ? 'Update resumed after an interruption' : manual ? 'Updated on request' : 'Updated in the background'
		});
		if (reload && typeof chrome !== 'undefined' && chrome.runtime?.reload) chrome.runtime.reload();
		return { status: 'updated', from: local, to };
	}

	const repaired = await repairMissing(dir, base, state);
	return { status: repaired.length ? 'repaired' : 'up-to-date', repaired };
}
