// The gradient engine is the shared ElectronCSS/CubicGradient.js. An extension can only run code stored inside its own folder
// (Chrome blocks code loaded from a website), so the updater copies the shared file in as CubicGradient.js.
// Until that copy exists the background uses a plain two-colour gradient.
let cubicGradient;
let gradientEngineMissing = false;
try { ({ cubicGradient } = await import('./CubicGradient.js')); }
catch {
	gradientEngineMissing = true;
	cubicGradient = ({ direction = 'to bottom right', start = '#000000', end = '#000066' } = {}) => `linear-gradient(${direction}, ${start}, ${end})`;
}

// ─── Single source of truth for engine SVGs ───────────────────────────────
const engineSvgs = {
	google: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16"><g fill="none" fill-rule="evenodd" clip-rule="evenodd"><path fill="#F44336" d="M7.209 1.061c.725-.081 1.154-.081 1.933 0a6.57 6.57 0 0 1 3.65 1.82a100 100 0 0 0-1.986 1.93q-1.876-1.59-4.188-.734q-1.696.78-2.362 2.528a78 78 0 0 1-2.148-1.658a.26.26 0 0 0-.16-.027q1.683-3.245 5.26-3.86" opacity=".987"/><path fill="#FFC107" d="M1.946 4.92q.085-.013.161.027a78 78 0 0 0 2.148 1.658A7.6 7.6 0 0 0 4.04 7.99q.037.678.215 1.331L2 11.116Q.527 8.038 1.946 4.92" opacity=".997"/><path fill="#448AFF" d="M12.685 13.29a26 26 0 0 0-2.202-1.74q1.15-.812 1.396-2.228H8.122V6.713q3.25-.027 6.497.055q.616 3.345-1.423 6.032a7 7 0 0 1-.51.49" opacity=".999"/><path fill="#43A047" d="M4.255 9.322q1.23 3.057 4.51 2.854a3.94 3.94 0 0 0 1.718-.626q1.148.812 2.202 1.74a6.62 6.62 0 0 1-4.027 1.684a6.4 6.4 0 0 1-1.02 0Q3.82 14.524 2 11.116z" opacity=".993"/></g></svg>`,
	bing: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 388"><defs><radialGradient id="logosBing0" cx="93.717%" cy="77.818%" r="143.121%" fx="93.717%" fy="77.818%"><stop offset="0%" stop-color="#00CACC"/><stop offset="100%" stop-color="#048FCE"/></radialGradient><radialGradient id="logosBing1" cx="13.893%" cy="71.448%" r="150.086%" fx="13.893%" fy="71.448%"><stop offset="0%" stop-color="#00BBEC"/><stop offset="100%" stop-color="#2756A9"/></radialGradient><linearGradient id="logosBing2" x1="50%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#00BBEC"/><stop offset="100%" stop-color="#2756A9"/></linearGradient></defs><path fill="url(#logosBing0)" d="M129.424 122.047c-7.133.829-12.573 6.622-13.079 13.928c-.218 3.147-.15 3.36 6.986 21.722c16.233 41.774 20.166 51.828 20.827 53.243c1.603 3.427 3.856 6.65 6.672 9.544c2.16 2.22 3.585 3.414 5.994 5.024c4.236 2.829 6.337 3.61 22.818 8.49c16.053 4.754 24.824 7.913 32.381 11.664c9.791 4.86 16.623 10.387 20.944 16.946c3.1 4.706 5.846 13.145 7.04 21.64c.468 3.321.47 10.661.006 13.663c-1.008 6.516-3.021 11.976-6.101 16.545c-1.638 2.43-1.068 2.023 1.313-.939c6.74-8.379 13.605-22.7 17.108-35.687c4.24-15.718 4.817-32.596 1.66-48.57c-6.147-31.108-25.786-57.955-53.444-73.06c-1.738-.95-8.357-4.42-17.331-9.085a1633.23 1633.23 0 0 1-4.127-2.154c-.907-.477-2.764-1.447-4.126-2.154c-1.362-.708-5.282-2.75-8.711-4.539l-8.528-4.446a6021.14 6021.14 0 0 1-8.344-4.357c-8.893-4.655-12.657-6.537-13.73-6.863c-1.125-.343-3.984-.782-4.701-.723c-.152.012-.838.088-1.527.168Z"/><path fill="url(#logosBing1)" d="M148.81 277.994c-.493.292-1.184.714-1.537.938c-.354.225-1.137.712-1.743 1.083a8315.383 8315.383 0 0 0-13.204 8.137a2847.83 2847.83 0 0 0-8.07 4.997a388.04 388.04 0 0 1-3.576 2.198c-.454.271-2.393 1.465-4.31 2.654a2651.466 2651.466 0 0 1-7.427 4.586a3958.037 3958.037 0 0 0-8.62 5.316a3011.146 3011.146 0 0 1-7.518 4.637c-1.564.959-3.008 1.885-3.21 2.058c-.3.257-14.205 8.87-21.182 13.121c-5.3 3.228-11.43 5.387-17.705 6.235c-2.921.395-8.45.396-11.363.003c-7.9-1.067-15.176-4.013-21.409-8.666c-2.444-1.826-7.047-6.425-8.806-8.8c-4.147-5.598-6.829-11.602-8.218-18.396c-.32-1.564-.622-2.884-.672-2.935c-.13-.13.105 2.231.528 5.319c.44 3.211 1.377 7.856 2.387 11.829c7.814 30.743 30.05 55.749 60.15 67.646c8.668 3.424 17.415 5.582 26.932 6.64c3.576.4 13.699.56 17.43.276c17.117-1.296 32.02-6.334 47.308-15.996c1.362-.86 3.92-2.474 5.685-3.585a877.227 877.227 0 0 0 4.952-3.14c.958-.615 2.114-1.341 2.567-1.614a91.312 91.312 0 0 0 2.018-1.268c.656-.424 3.461-2.2 6.235-3.944l11.092-7.006l3.809-2.406l.137-.086l.42-.265l.199-.126l2.804-1.771l9.69-6.121c12.348-7.759 16.03-10.483 21.766-16.102c2.392-2.342 5.997-6.34 6.176-6.848c.037-.104.678-1.092 1.424-2.197c3.036-4.492 5.06-9.995 6.064-16.484c.465-3.002.462-10.342-.005-13.663c-.903-6.42-2.955-13.702-5.167-18.339c-3.627-7.603-11.353-14.512-22.453-20.076c-3.065-1.537-6.23-2.943-6.583-2.924c-.168.009-10.497 6.322-22.954 14.03c-12.457 7.71-23.268 14.4-24.025 14.87a289.98 289.98 0 0 1-2.888 1.764l-7.128 4.42Z"/><path fill="url(#logosBing2)" d="m.053 241.013l.054 53.689l.695 3.118c2.172 9.747 5.937 16.775 12.482 23.302c3.078 3.07 5.432 4.922 8.768 6.896c7.06 4.177 14.657 6.238 22.978 6.235c8.716-.005 16.256-2.179 24.025-6.928c1.311-.801 6.449-3.964 11.416-7.029l9.032-5.572v-127.4l-.002-58.273c-.002-37.177-.07-59.256-.188-60.988c-.74-10.885-5.293-20.892-12.948-28.461c-2.349-2.323-4.356-3.875-10.336-7.99a25160.08 25160.08 0 0 1-12.104-8.336A186532.885 186532.885 0 0 0 28.617 5.835C22.838 1.85 22.386 1.574 20.639.949C18.367.136 15.959-.163 13.67.084C6.998.804 1.657 5.622.269 12.171C.053 13.191.013 26.751.01 100.35l-.003 86.975H0l.053 53.688Z"/></svg>`
};

// ─── Engine config ────────────────────────────────────────────────────────
// Built-in engines. "%s" marks where the search words go; "prefix" lets you type e.g. "yt cats" to use YouTube once.
// Engines without a logo get a small coloured badge, the same look as engines you add yourself.
const BUILTIN_ENGINES = [
	{ id: 'google',        name: 'Google',         url: 'https://www.google.com/search?q=%s',              prefix: 'g',   svg: engineSvgs.google },
	{ id: 'bing',          name: 'Bing',           url: 'https://www.bing.com/search?q=%s',                prefix: 'b',   svg: engineSvgs.bing },
	{ id: 'duckduckgo',    name: 'DuckDuckGo',     url: 'https://duckduckgo.com/?q=%s',                    prefix: 'ddg', badge: ['DDG', '#de5833'] },
	{ id: 'youtube',       name: 'YouTube',        url: 'https://www.youtube.com/results?search_query=%s', prefix: 'yt',  badge: ['YT',  '#e52d27'] },
	{ id: 'github',        name: 'GitHub',         url: 'https://github.com/search?q=%s',                  prefix: 'gh',  badge: ['GH',  '#2b3137'] },
	{ id: 'wikipedia',     name: 'Wikipedia',      url: 'https://en.wikipedia.org/w/index.php?search=%s',  prefix: 'w',   badge: ['W',   '#636466'] },
	{ id: 'brave',         name: 'Brave Search',   url: 'https://search.brave.com/search?q=%s',            prefix: 'br',  badge: ['BR',  '#fb542b'] },
	{ id: 'reddit',        name: 'Reddit',         url: 'https://www.reddit.com/search/?q=%s',             prefix: 'r',   badge: ['R',   '#ff4500'] },
	{ id: 'stackoverflow', name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q=%s',           prefix: 'so',  badge: ['SO',  '#f48024'] },
	{ id: 'maps',          name: 'Google Maps',    url: 'https://www.google.com/maps/search/%s',           prefix: 'm',   domain: 'maps.google.com', badge: ['MAP', '#34a853'] },
	{ id: 'amazon',        name: 'Amazon',         url: 'https://www.amazon.com/s?k=%s',                   prefix: 'a',   badge: ['A',   '#ff9900'] }
];
const SITE_ICON = 'https://www.google.com/s2/favicons?sz=64&domain=';   // Google's favicon service, loaded directly
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const escSvg = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function badgeSvg(text, color) {
	const t = escSvg(text);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${color}"/><text x="12" y="${t.length > 2 ? 15 : 16}" font-family="Arial, sans-serif" font-size="${t.length > 2 ? 8 : 11}" font-weight="700" text-anchor="middle" fill="#fff">${t}</text></svg>`;
}
function customEngines() {
	const list = lsGet('customEngines', []);
	return (Array.isArray(list) ? list : []).filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.url === 'string' && safeHttpsUrl(e.url) && e.url.includes('%s'))
		.map((e) => {
			const initials = e.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
			let hue = 0; for (const ch of e.name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
			return { id: e.id, name: e.name.slice(0, 30), url: e.url, prefix: String(e.prefix || '').toLowerCase(), custom: true, domain: hostOf(e.url), svg: badgeSvg(initials, `hsl(${hue} 55% 40%)`) };
		});
}
const allEngines = () => [...BUILTIN_ENGINES.map((e) => ({ ...e, svg: e.svg || badgeSvg(e.badge[0], e.badge[1]), domain: e.svg ? null : (e.domain || hostOf(e.url)) })), ...customEngines()];

// Puts an engine's icon into a container: its own logo, or the site's icon with the letter badge as backup
function setEngineIcon(container, engine) {
	const badge = () => { const t = document.createElement('template'); t.innerHTML = engine.svg; return t.content.cloneNode(true); };
	container.replaceChildren();
	if (!engine.domain) { container.appendChild(badge()); return; }
	const img = el('img', 'engine-icon-img');
	img.alt = ''; img.width = 24; img.height = 24; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
	img.onerror = () => { if (img.isConnected) img.replaceWith(badge()); };
	img.src = SITE_ICON + encodeURIComponent(engine.domain);
	container.appendChild(img);
}
const engineById = (id) => allEngines().find((e) => e.id === id) || allEngines()[0];


let activeShortcutIndex = -1;
let draggedIndex = null;

// Shortcuts a fresh install starts with. "builtin" keeps them out of the suggestion cards: GitHub only counts
// as a coding-site shortcut when the person adds it themselves.
const DEFAULT_SHORTCUTS = [
	{ name: 'GitHub', url: 'https://github.com', icon: 'https://www.google.com/s2/favicons?sz=64&domain=github.com', builtin: true },
	{ name: 'ProElectricCoder', url: 'https://proelectriccoder.pages.dev', icon: 'https://proelectriccoder.pages.dev/Favicon.svg', builtin: true }
];
if (localStorage.getItem('shortcuts') === null) localStorage.setItem('shortcuts', JSON.stringify(DEFAULT_SHORTCUTS));

// ─── Safe JSON parse for shortcuts ───────────────────────────────────────
function safeParseShortcuts() {
	try {
		return JSON.parse(localStorage.getItem('shortcuts') || '[]');
	} catch {
		localStorage.removeItem('shortcuts');
		return [];
	}
}

// ─── Clock ────────────────────────────────────────────────────────────────
function updateClock() {
	const now = new Date();
	let hours = now.getHours();
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	const ampm = hours >= 12 ? 'PM' : 'AM';
	hours = hours % 12 || 12;
	document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
	document.getElementById('date').textContent = now.toLocaleDateString('default', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Engine ───────────────────────────────────────────────────────────────
function setEngine(engineKey) {
	const engine = engineById(engineKey);
	document.getElementById('userQuery').placeholder = `Search ${engine.name}...`;
	previewedEngine = engine.id;
	setEngineIcon(document.getElementById('currentEngineIconWrapper'), engine);
	localStorage.setItem('preferredEngine', engine.id);
	buildEngineMenu();
}

// Dropdown on the search bar, rebuilt whenever the engine list changes
function buildEngineMenu() {
	const menu = document.getElementById('engineDropdown');
	const current = engineById(localStorage.getItem('preferredEngine') || 'google').id;
	menu.replaceChildren(...allEngines().map((e) => {
		const item = el('div', 'dropdown-item');
		const icon = el('span', 'engine-menu-icon'); setEngineIcon(icon, e);
		item.append(icon, document.createTextNode(e.name));
		if (e.id === current) item.style.fontWeight = '700';
		item.onclick = () => { setEngine(e.id); menu.classList.remove('show'); document.getElementById('userQuery').focus(); };
		return item;
	}));
}

// "yt cats" searches YouTube for "cats" without changing the saved engine
function resolveSearch(raw) {
	const m = /^(\S+)\s+(.+)$/.exec(raw.trim());
	if (m) {
		const hit = allEngines().find((e) => e.prefix && e.prefix === m[1].toLowerCase());
		if (hit) return { engine: hit, query: m[2], viaPrefix: true };
	}
	return { engine: engineById(localStorage.getItem('preferredEngine') || 'google'), query: raw.trim(), viaPrefix: false };
}
let previewedEngine = null;
function previewEngineIcon() {
	const r = resolveSearch(document.getElementById('userQuery').value);
	if (previewedEngine === r.engine.id) return;
	previewedEngine = r.engine.id;
	setEngineIcon(document.getElementById('currentEngineIconWrapper'), r.engine);
}

// ─── Settings → Search engines ───
function renderEngineSettings() {
	const box = document.getElementById('engineList');
	box.replaceChildren(...allEngines().map((e) => {
		const row = el('div', 'engine-row');
		const icon = el('span', 'engine-row-icon'); setEngineIcon(icon, e);
		const name = el('span', 'engine-row-name', e.name);
		const pre = el('span', 'engine-row-prefix', e.prefix ? e.prefix + ' ␣' : '');
		row.append(icon, name, pre);
		if (e.custom) {
			const del = el('button', 'engine-row-del', '×');
			del.title = 'Remove ' + e.name;
			del.onclick = () => {
				lsSet('customEngines', customEngines().filter((x) => x.id !== e.id).map(({ id, name, url, prefix }) => ({ id, name, url, prefix })));
				if (localStorage.getItem('preferredEngine') === e.id) setEngine('google');
				renderEngineSettings(); buildEngineMenu();
			};
			row.appendChild(del);
		}
		return row;
	}));
}
function addCustomEngine() {
	const status = document.getElementById('engineAddStatus');
	const name = document.getElementById('engineNameInput').value.trim().slice(0, 30);
	const url = document.getElementById('engineUrlInput').value.trim();
	const prefix = document.getElementById('enginePrefixInput').value.trim().toLowerCase();
	if (!name) { status.textContent = 'Give the engine a name'; return; }
	if (!safeHttpsUrl(url) || url.split('%s').length !== 2) { status.textContent = 'Use an https:// address with %s exactly once, where the search words go'; return; }
	if (prefix && !/^[a-z0-9]{1,8}$/.test(prefix)) { status.textContent = 'Shortcut: 1–8 letters or numbers'; return; }
	if (prefix && allEngines().some((e) => e.prefix === prefix)) { status.textContent = `The shortcut "${prefix}" is already used`; return; }
	const list = customEngines();
	if (list.length >= 20) { status.textContent = 'Up to 20 custom engines'; return; }
	const id = 'c' + Date.now().toString(36);
	lsSet('customEngines', [...list, { id, name, url, prefix }].map(({ id, name, url, prefix }) => ({ id, name, url, prefix })));
	['engineNameInput', 'engineUrlInput', 'enginePrefixInput'].forEach((i) => { document.getElementById(i).value = ''; });
	status.textContent = `Added ${name}`;
	renderEngineSettings(); buildEngineMenu();
}

// ─── Background / cubicGradient ───────────────────────────────────────────
// Built-in picture backgrounds drawn with CSS only (no image files). Each is a stack of gradient layers.
const BG_PRESETS = [
	{ id: 'aurora', name: 'Aurora', css: 'radial-gradient(circle at 0% 100%, #4ff0d8 0, transparent 55%), radial-gradient(circle at 100% 0%, #ff5ee0 0, transparent 50%), radial-gradient(circle at 55% 45%, #b25be8 0, transparent 60%), linear-gradient(135deg, #4f5bd5, #8e54d8)' },
	{ id: 'neon', name: 'Neon night', css: 'radial-gradient(circle at 12% 18%, rgba(0,255,255,0.65) 0, transparent 38%), radial-gradient(circle at 88% 22%, rgba(150,60,255,0.7) 0, transparent 44%), radial-gradient(circle at 55% 95%, rgba(10,70,255,0.75) 0, transparent 52%), radial-gradient(circle at 30% 70%, rgba(0,120,255,0.35) 0, transparent 40%), #000' },
	{ id: 'sunset', name: 'Sunset', css: 'radial-gradient(circle at 20% 100%, #ffb347 0, transparent 55%), radial-gradient(circle at 85% 80%, #ff5f7e 0, transparent 50%), radial-gradient(circle at 70% 0%, #7b4dff 0, transparent 55%), linear-gradient(180deg, #3b1d78, #c2437a)' },
	{ id: 'ocean', name: 'Ocean', css: 'radial-gradient(circle at 85% 10%, #3be6d3 0, transparent 45%), radial-gradient(circle at 10% 90%, #1a6dff 0, transparent 55%), radial-gradient(circle at 60% 70%, #0a3d91 0, transparent 60%), linear-gradient(160deg, #031a3a, #06306b)' },
	{ id: 'forest', name: 'Forest', css: 'radial-gradient(circle at 15% 15%, #7be08a 0, transparent 40%), radial-gradient(circle at 90% 85%, #12a37f 0, transparent 50%), radial-gradient(circle at 50% 55%, #0b5c4a 0, transparent 60%), linear-gradient(150deg, #04261f, #0a4a3a)' },
	{ id: 'graphite', name: 'Graphite', css: 'radial-gradient(circle at 20% 15%, rgba(255,255,255,0.18) 0, transparent 40%), radial-gradient(circle at 85% 90%, rgba(120,140,170,0.35) 0, transparent 50%), linear-gradient(145deg, #1b1f27, #3a4150)' }
];
const bgPreset = () => BG_PRESETS.find((p) => p.id === localStorage.getItem('bgPreset')) || null;

let currentGradient = '#000000';
let bgImageSrc = null;        // object URL (picked file) or https URL
let bgObjectUrl = null;

const currentTheme = () => {
	const t = localStorage.getItem('theme') || 'dark';
	return t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
};
// Default gradient follows the theme until the person picks their own colours
const bgDefaults = () => currentTheme() === 'light' ? { top: '#ffffff', bottom: '#bcd2ff' } : { top: '#000000', bottom: '#000066' };
const bgIsCustom = () => localStorage.getItem('bgCustom') === '1' ||
	((localStorage.getItem('bgTop') ?? '#000000') !== '#000000' || (localStorage.getItem('bgBottom') ?? '#000066') !== '#000066');
const bgMode = () => localStorage.getItem('bgMode') === 'picture' ? 'picture' : 'gradient';

// Paints either the gradient or the picture (with a dimming layer so text stays readable)
function paintBackground() {
	if (bgMode() === 'picture' && (bgImageSrc || bgPreset())) {
		const dim = (parseInt(localStorage.getItem('bgDim') ?? '35', 10) || 0) / 100;
		const tint = currentTheme() === 'light' ? '255,255,255' : '0,0,0';
		const veil = `linear-gradient(rgba(${tint},${dim}), rgba(${tint},${dim}))`;
		if (bgImageSrc) {
			const src = bgImageSrc.replace(/["\\\n]/g, encodeURIComponent);
			document.body.style.background = `${veil}, url("${src}") center / cover no-repeat fixed`;
		} else {
			document.body.style.background = `${veil}, ${bgPreset().css}`;
		}
	} else {
		document.body.style.background = currentGradient;
	}
}

// Picture storage: a chosen file lives in IndexedDB (too big for localStorage); a web address is kept as text
function bgDb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('NewTabBgDB', 1);
		req.onupgradeneeded = () => req.result.createObjectStore('bg');
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
async function bgDbGet() {
	try {
		const db = await bgDb();
		return await new Promise((res) => { const r = db.transaction('bg').objectStore('bg').get('image'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
	} catch { return null; }
}
async function bgDbSet(blob) {
	const db = await bgDb();
	await new Promise((res, rej) => {
		const tx = db.transaction('bg', 'readwrite');
		blob ? tx.objectStore('bg').put(blob, 'image') : tx.objectStore('bg').delete('image');
		tx.oncomplete = res; tx.onerror = () => rej(tx.error);
	});
}

async function loadPictureSource() {
	if (bgObjectUrl) { URL.revokeObjectURL(bgObjectUrl); bgObjectUrl = null; }
	const preset = bgPreset();
	const url = preset ? null : safeHttpsUrl(localStorage.getItem('bgImageUrl'));
	if (preset) bgImageSrc = null;
	else if (url) bgImageSrc = url;
	else {
		const blob = await bgDbGet();
		bgImageSrc = blob ? (bgObjectUrl = URL.createObjectURL(blob)) : null;
	}
	document.getElementById('bgPictureStatus').textContent = preset ? `Using the ${preset.name} preset` : bgImageSrc ? (url ? 'Using a web address' : 'Using your chosen picture') : 'No picture chosen';
	document.querySelectorAll('#bgPresetGrid button').forEach((b) => b.classList.toggle('selected', b.dataset.id === preset?.id));
	document.getElementById('bgImageUrlInput').value = url || '';
	paintBackground();
}

function syncBackgroundMode() {
	const mode = bgMode();
	document.getElementById('bgModeInput').value = mode;
	document.getElementById('bgGradientBox').hidden = mode !== 'gradient';
	document.getElementById('bgPictureBox').hidden = mode !== 'picture';
	const dim = localStorage.getItem('bgDim') ?? '35';
	document.getElementById('bgDimInput').value = dim;
	document.getElementById('bgDimValue').textContent = dim + '%';
}

function applyTheme() {
	document.documentElement.dataset.theme = currentTheme();
	document.getElementById('themeInput').value = localStorage.getItem('theme') || 'dark';
	loadBackground();   // an untouched default gradient switches with the theme; custom colours are kept
}

function applyGradient(fromUser = true) {
	const start     = document.getElementById('bgTopInput').value;
	const end       = document.getElementById('bgBottomInput').value;
	const direction = document.getElementById('bgDirectionInput').value;
	const power     = parseFloat(document.getElementById('bgPowerInput').value);
	const steps     = parseInt(document.getElementById('bgStepsInput').value, 10);
	currentGradient = cubicGradient({ direction, start, end, steps, power });
	paintBackground();
	if (fromUser === true) {   // only a real edit counts as "custom"; loading must not overwrite theme defaults
		localStorage.setItem('bgCustom',    '1');
		localStorage.setItem('bgTop',       start);
		localStorage.setItem('bgBottom',    end);
		localStorage.setItem('bgDirection', direction);
		localStorage.setItem('bgPower',     power);
		localStorage.setItem('bgSteps',     steps);
	}
	// Logo follows the background palette when "match background" is on
	if (logoMatchToggle.checked) refreshLogo();
}

function loadBackground() {
	const custom    = bgIsCustom();
	const start     = (custom && localStorage.getItem('bgTop'))    || bgDefaults().top;
	const end       = (custom && localStorage.getItem('bgBottom')) || bgDefaults().bottom;
	const direction = localStorage.getItem('bgDirection') || 'to bottom right';
	const power     = localStorage.getItem('bgPower')     || '3';
	const steps     = localStorage.getItem('bgSteps')     || '20';
	document.getElementById('bgTopInput').value          = start;
	document.getElementById('bgBottomInput').value       = end;
	document.getElementById('bgDirectionInput').value    = direction;
	document.getElementById('bgPowerInput').value        = power;
	document.getElementById('bgStepsInput').value        = steps;
	document.getElementById('bgPowerValue').textContent  = power;
	document.getElementById('bgStepsValue').textContent  = steps;
	applyGradient(false);
}

function resetBackground() {
	['bgCustom', 'bgTop', 'bgBottom', 'bgDirection', 'bgPower', 'bgSteps'].forEach((k) => localStorage.removeItem(k));
	document.getElementById('bgTopInput').value          = bgDefaults().top;
	document.getElementById('bgBottomInput').value       = bgDefaults().bottom;
	document.getElementById('bgDirectionInput').value    = 'to bottom right';
	document.getElementById('bgPowerInput').value        = '3';
	document.getElementById('bgStepsInput').value        = '20';
	document.getElementById('bgPowerValue').textContent  = '3';
	document.getElementById('bgStepsValue').textContent  = '20';
	applyGradient(false);
}

// ─── Logo colours ─────────────────────────────────────────────────────────
// The logo SVG is fetched, recoloured as text, and inlined so its two colours
// (outline + fill) can be changed from settings. Colours are detected from the
// SVG itself: the first distinct paint colour in the file is treated as the
// fill, the second as the outline. LOGO_SWAP_ROLES flips that for this logo,
// where the file lists fill (#0ff) before stroke (#03A).
const LOGO_SRC = 'ProElectricCoder-logo-website-2.svg';
// Same artwork, used for the browser tab icon so it always matches the logo colours
const FAVICON_SRC = 'ProElectricCoder-logo-website-1.svg';
// Flip if the outline and fill controls come out the wrong way round.
const LOGO_SWAP_ROLES = true;

const logoSlot         = document.getElementById('logoSlot');
const logoMatchToggle  = document.getElementById('logoMatchToggle');
const logoOutlineInput = document.getElementById('logoOutlineInput');
const logoFillInput    = document.getElementById('logoFillInput');
const tabIcon          = document.getElementById('tabIcon');

// Matches fill / stroke / stop-color in attributes, inline styles and <style> blocks
const LOGO_PAINT_RE = /\b(fill|stroke|stop-color)(\s*[:=]\s*["']?)(rgba?\([^)]*\)|[^"';}\s]+)/gi;
const LOGO_NON_COLOURS = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'context-fill', 'context-stroke']);

let logoSvgText = null;
let logoKeys = [];                                  // [outlineKey, fillKey] (normalised paint values)
let logoOriginal = { outline: '#ffffff', fill: '#ffffff' };
let faviconSvgText = null;
let faviconKeys = [];

const pickRoleKeys = (keys) => LOGO_SWAP_ROLES ? keys.slice(0, 2).reverse() : keys.slice(0, 2);

function isLogoColour(v) {
	v = v.trim().toLowerCase();
	return v !== '' && !v.startsWith('url(') && !LOGO_NON_COLOURS.has(v);
}

function normalisePaint(v) {
	v = v.trim().toLowerCase();
	const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
	return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : v;
}

// Any CSS colour → #rrggbb (needed because <input type="color"> only accepts hex)
function toHex(css) {
	const el = document.createElement('span');
	el.style.color = css;
	document.body.appendChild(el);
	const rgb = getComputedStyle(el).color;
	el.remove();
	const nums = rgb.match(/\d+(\.\d+)?/g);
	if (!nums) return '#ffffff';
	return '#' + nums.slice(0, 3).map(n => Math.round(+n).toString(16).padStart(2, '0')).join('');
}

function detectLogoPaints(text) {
	const keys = [];
	const firstRaw = {};
	text.replace(LOGO_PAINT_RE, (m, prop, sep, val) => {
		if (!isLogoColour(val)) return m;
		const key = normalisePaint(val);
		if (!keys.includes(key)) { keys.push(key); firstRaw[key] = val.trim(); }
		return m;
	});
	return { keys, firstRaw };
}

function recolorSvg(text, [outlineKey, fillKey], outline, fill) {
	return text.replace(LOGO_PAINT_RE, (m, prop, sep, val) => {
		if (!isLogoColour(val)) return m;
		const key = normalisePaint(val);
		if (key === outlineKey) return prop + sep + outline;
		if (key === fillKey)    return prop + sep + fill;
		return m;
	});
}

function currentLogoColours() {
	if (logoMatchToggle.checked) {
		// Match mode: outline = background start colour, fill = background end colour
		return {
			outline: document.getElementById('bgTopInput').value,
			fill:    document.getElementById('bgBottomInput').value
		};
	}
	return { outline: logoOutlineInput.value, fill: logoFillInput.value };
}

// Parses SVG text into a root <svg> that has a viewBox (so it can scale), or null if it isn't valid SVG
function parseSvg(text) {
	const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
	if (svg.nodeName === 'parsererror' || svg.querySelector('parsererror')) return null;
	if (!svg.hasAttribute('viewBox')) {
		const w = parseFloat(svg.getAttribute('width'));
		const h = parseFloat(svg.getAttribute('height'));
		if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
	}
	return svg;
}

function refreshLogo() {
	if (!logoSvgText) return;
	const { outline, fill } = currentLogoColours();
	const svg = parseSvg(recolorSvg(logoSvgText, logoKeys, outline, fill));
	if (svg) {
		// Scale like the old <img class="logo"> did
		svg.removeAttribute('width');
		svg.removeAttribute('height');
		svg.setAttribute('class', 'logo');
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-label', 'Logo');
		logoSlot.replaceChildren(document.importNode(svg, true));
	}
	refreshFavicon();
}

// The tab icon is the same artwork, so it follows the same colours
function refreshFavicon() {
	if (!faviconSvgText || !tabIcon) return;
	const { outline, fill } = currentLogoColours();
	const svg = parseSvg(recolorSvg(faviconSvgText, faviconKeys, outline, fill));
	if (!svg) return;
	tabIcon.type = 'image/svg+xml';
	tabIcon.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

function syncLogoControls() {
	const match = logoMatchToggle.checked;
	logoOutlineInput.disabled = match;
	logoFillInput.disabled    = match;
}

function setLogoControlsEnabled(enabled) {
	logoMatchToggle.disabled  = !enabled;
	document.getElementById('logoResetBtn').disabled = !enabled;
	if (enabled) syncLogoControls();
	else { logoOutlineInput.disabled = true; logoFillInput.disabled = true; }
}

async function loadLogo() {
	setLogoControlsEnabled(false);
	try {
		const [res, favRes] = await Promise.all([fetch(LOGO_SRC), fetch(FAVICON_SRC).catch(() => null)]);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		logoSvgText = await res.text();
		if (favRes && favRes.ok) {
			faviconSvgText = await favRes.text();
			faviconKeys = pickRoleKeys(detectLogoPaints(faviconSvgText).keys);
		}

		const { keys, firstRaw } = detectLogoPaints(logoSvgText);
		if (!keys.length) throw new Error('no fill/stroke colours found in SVG');
		logoKeys = pickRoleKeys(keys);

		const [outlineKey, fillKey] = logoKeys;
		logoOriginal = {
			outline: toHex(firstRaw[outlineKey]),
			fill:    toHex(firstRaw[fillKey] || firstRaw[outlineKey])
		};

		logoOutlineInput.value = localStorage.getItem('logoOutline') || logoOriginal.outline;
		logoFillInput.value    = localStorage.getItem('logoFill')    || logoOriginal.fill;
		logoMatchToggle.checked = localStorage.getItem('logoMatchBg') === '1';
		setLogoControlsEnabled(true);
		refreshLogo();
	} catch (e) {
		// Leave the plain <img> in place and keep the controls disabled
		logoSvgText = null;
		console.warn('[NewTab] Logo recolouring unavailable:', e.message);
	}
	logoSlot.classList.add('ready');
}

function resetLogoColours() {
	localStorage.removeItem('logoOutline');
	localStorage.removeItem('logoFill');
	localStorage.removeItem('logoMatchBg');
	logoOutlineInput.value  = logoOriginal.outline;
	logoFillInput.value     = logoOriginal.fill;
	logoMatchToggle.checked = false;
	syncLogoControls();
	refreshLogo();
}

// ─── Shortcuts ────────────────────────────────────────────────────────────
// Adds https:// when the user typed a bare domain such as "youtube.com"
function normalizeUrl(raw) {
	raw = (raw || '').trim();
	if (!raw) return '';
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
}

// Chrome's built-in favicon cache: chrome-extension://<id>/_favicon/?pageUrl=<encoded>&size=<size>
// (needs the "favicon" permission in manifest.json)
function getFaviconUrl(pageUrl, size = 64) {
	if (!pageUrl || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return '';
	const base = chrome.runtime.getURL('/_favicon/');
	return `${base}?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
}

function setAdvancedOpen(open) {
	document.getElementById('advancedSection').hidden = !open;
	const btn = document.getElementById('advancedToggle');
	btn.setAttribute('aria-expanded', String(open));
	btn.textContent = open ? 'Advanced ▾' : 'Advanced ▸';
}

function openShortcutModal(index) {
	const sc = safeParseShortcuts();
	const shortcut = index !== undefined ? sc[index] : null;
	document.getElementById('modalTitle').textContent = shortcut ? 'Edit Shortcut' : 'Add Shortcut';
	document.getElementById('editShortcutIndex').value = shortcut ? index : '';
	document.getElementById('shortcutName').value = shortcut ? shortcut.name : '';
	document.getElementById('shortcutUrl').value  = shortcut ? shortcut.url  : '';
	document.getElementById('shortcutIcon').value = shortcut ? (shortcut.icon || '') : '';
	setAdvancedOpen(!!(shortcut && shortcut.icon));   // reveal the icon field only if one is already set
	document.getElementById('addShortcutModal').showModal();
}

function renderShortcuts() {
	const grid = document.getElementById('shortcutsGrid');
	grid.innerHTML = '';
	const shortcuts = safeParseShortcuts();

	shortcuts.forEach((s, i) => {
		const url = normalizeUrl(s.url);
		const faviconSrc = getFaviconUrl(url);

		const item = document.createElement('div');
		item.className = 'shortcut-item';
		item.draggable = true;

		const iconWrap = document.createElement('div');
		iconWrap.className = 'shortcut-icon-wrapper';
		const img = document.createElement('img');
		img.className = 'shortcut-icon';
		img.alt = '';
		img.draggable = false;
		const initialSrc = s.icon || faviconSrc;
		if (initialSrc) img.src = initialSrc;
		// A broken custom icon falls back to the favicon cache
		if (s.icon && faviconSrc) img.addEventListener('error', () => { img.src = faviconSrc; }, { once: true });
		iconWrap.appendChild(img);

		const label = document.createElement('span');
		label.className = 'shortcut-label';
		label.textContent = s.name;

		const optionBtn = document.createElement('div');
		optionBtn.className = 'option-btn';
		optionBtn.textContent = '⋮';

		item.append(iconWrap, label, optionBtn);

		item.onclick = () => { if (url) window.open(url); };

		item.addEventListener('dragstart', (e) => {
			draggedIndex = i;
			item.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(i));
		});
		item.addEventListener('dragend', () => {
			draggedIndex = null;
			grid.querySelectorAll('.dragging, .drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
		});
		item.addEventListener('dragover', (e) => e.preventDefault());
		item.addEventListener('dragenter', () => {
			if (draggedIndex !== null && draggedIndex !== i) item.classList.add('drag-over');
		});
		item.addEventListener('dragleave', (e) => {
			if (!item.contains(e.relatedTarget)) item.classList.remove('drag-over');
		});
		item.addEventListener('drop', (e) => {
			e.preventDefault();
			if (draggedIndex === null || draggedIndex === i) return;
			const sc = safeParseShortcuts();
			const moved = sc.splice(draggedIndex, 1)[0];
			sc.splice(i, 0, moved);
			localStorage.setItem('shortcuts', JSON.stringify(sc));
			draggedIndex = null;
			renderShortcuts();
		});

		optionBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			activeShortcutIndex = i;
			const menu = document.getElementById('shortcutContextMenu');
			menu.style.display = 'flex';
			menu.style.top = e.clientY + 'px';
			menu.style.left = e.clientX + 'px';
		});
		grid.appendChild(item);
	});

	const add = document.createElement('div');
	add.className = 'add-shortcut-btn';
	add.innerHTML = '<div class="shortcut-icon-wrapper"><svg class="add-plus" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><span class="shortcut-label">Add</span>';
	add.onclick = () => openShortcutModal();
	grid.appendChild(add);
	refreshNewsCard();   // adding or removing a shortcut can make a suggestion appear or go away
}

// ─── Version comparison ────────────────────────────────────────────────────
function compareVersions(a, b) {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i]||0) > (pb[i]||0)) return 1;
		if ((pa[i]||0) < (pb[i]||0)) return -1;
	}
	return 0;
}

// ─── Remote update config ─────────────────────────────────────────────────
const REMOTE_BASE = 'https://proelectriccoder.github.io/Projects/NewTab/';

// ─── Staged updates ───────────────────────────────────────────────────────
// An update never touches the installed files until the whole new version is safely on disk and checked:
//   1. every file of the release is downloaded and saved together in ONE file, new-version.json
//   2. that file is read back from the folder and validated (sizes, SHA-256 hashes, manifest, imports …)
//   3. only then are the installed files replaced from it, with manifest.json last
// If anything goes wrong before step 3, the installed extension is exactly as it was.
const STAGE_FILE = 'new-version.json';
const SOURCE_ORIGIN = 'https://proelectriccoder.github.io/';   // shared files (like CubicGradient.js) may only come from here
const REQUIRED_FILES = ['manifest.json', 'NewTab.html', 'NewTabJS.js', 'Changelog.json'];
const APPLY_LAST = ['NewTab.html', 'NewTabJS.js', 'manifest.json'];   // replaced in this order, after every other file
const FALLBACK_FILES = ['manifest.json', 'NewTab.html', 'NewTabJS.js', 'Changelog.json',
	'ProElectricCoder-logo-website-1.svg', 'ProElectricCoder-logo-website-2.svg', 'Icon16.png', 'Icon48.png', 'Icon128.png'];
const FALLBACK_SOURCES = { 'CubicGradient.js': SOURCE_ORIGIN + 'ElectronCSS/CubicGradient.js' };

const isSafeFileName = (n) => typeof n === 'string' && /^(?!\.+$)[\w.-]+$/.test(n) && n !== 'Updates.json' && n !== STAGE_FILE;

async function sha256Hex(bytes) {
	const d = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
function bytesToBase64(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}
function base64ToBytes(b64) {
	const s = atob(b64), out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}
const isTextFile = (n) => /\.(json|js|html|svg|css|txt|md)$/i.test(n);

// The release's Changelog.json lists its files ("files") and any shared files it takes from elsewhere on the site ("sources")
async function resolveReleaseFiles(baseUrl) {
	try {
		const res = await fetch(baseUrl + 'Changelog.json?_=' + Date.now(), { cache: 'no-cache' });
		if (res.ok) {
			const json = await res.json();
			const names = Array.isArray(json.files) ? json.files.filter(isSafeFileName) : [];
			const sources = {};
			for (const [n, u] of Object.entries(json.sources && typeof json.sources === 'object' ? json.sources : {})) {
				if (isSafeFileName(n) && typeof u === 'string' && u.startsWith(SOURCE_ORIGIN)) sources[n] = u;
			}
			if (names.length) return { names: [...new Set([...names, 'manifest.json', 'Changelog.json'])].filter((n) => !sources[n]), sources };
		}
	} catch { /* fall back to the built-in lists */ }
	return { names: FALLBACK_FILES, sources: FALLBACK_SOURCES };
}

// Downloads the whole release into memory: { name: Uint8Array }
async function downloadRelease(baseUrl) {
	const { names, sources } = await resolveReleaseFiles(baseUrl);
	const jobs = [...names.map((n) => [n, baseUrl + n]), ...Object.entries(sources)];
	const files = {};
	await Promise.all(jobs.map(async ([name, url]) => {
		const res = await fetch(url, { cache: 'no-cache' });
		if (!res.ok) throw new Error(`Fetch failed: ${name} (${res.status})`);
		files[name] = new Uint8Array(await res.arrayBuffer());
	}));
	return files;
}

async function packRelease(files, version) {
	const pack = { format: 1, version, created: new Date().toISOString(), files: {} };
	for (const [name, bytes] of Object.entries(files)) {
		const entry = { size: bytes.length, sha256: await sha256Hex(bytes) };
		if (isTextFile(name)) {   // readable text where it round-trips exactly, base64 otherwise
			try {
				const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
				if (new TextEncoder().encode(text).length === bytes.length) entry.text = text;
			} catch { /* binary or not UTF-8 */ }
		}
		if (entry.text === undefined) entry.base64 = bytesToBase64(bytes);
		pack.files[name] = entry;
	}
	return pack;
}

async function unpackRelease(pack) {
	const files = {}, problems = [];
	for (const [name, entry] of Object.entries(pack.files || {})) {
		if (!isSafeFileName(name) || !entry || typeof entry !== 'object') { problems.push(`unexpected entry "${name}"`); continue; }
		let bytes;
		try { bytes = typeof entry.text === 'string' ? new TextEncoder().encode(entry.text) : base64ToBytes(String(entry.base64)); }
		catch { problems.push(`${name} cannot be decoded`); continue; }
		if (bytes.length !== entry.size) problems.push(`${name} has the wrong size`);
		else if (await sha256Hex(bytes) !== entry.sha256) problems.push(`${name} does not match its checksum`);
		files[name] = bytes;
	}
	return { files, problems };
}

// Looks at the new version as a whole: is everything there, and does it hang together?
async function validateRelease(files, expectedVersion, localHas) {
	const problems = [];
	const text = (n) => new TextDecoder().decode(files[n]);
	for (const n of REQUIRED_FILES) if (!files[n] || !files[n].length) problems.push(`${n} is missing or empty`);
	if (problems.length) return problems;
	const has = async (n) => !!files[n] || await localHas(n);

	for (const [n, b] of Object.entries(files)) {
		if (!b.length) problems.push(`${n} is empty`);
		else if (/\.json$/i.test(n)) { try { JSON.parse(text(n)); } catch { problems.push(`${n} is not valid JSON`); } }
		else if (/\.png$/i.test(n) && !(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) problems.push(`${n} is not a PNG image`);
		else if (/\.svg$/i.test(n) && !/<svg[\s>]/i.test(text(n))) problems.push(`${n} is not an SVG image`);
	}
	if (problems.length) return problems;

	const manifest = JSON.parse(text('manifest.json'));
	if (manifest.manifest_version !== 3) problems.push('manifest.json is not a Manifest V3 file');
	if (expectedVersion && manifest.version !== expectedVersion) problems.push(`manifest.json says v${manifest.version}, expected v${expectedVersion}`);
	const page = manifest.chrome_url_overrides?.newtab;
	if (!page || !(await has(page))) problems.push('the new tab page named in manifest.json is missing');
	const icons = [...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {})];
	for (const icon of icons) if (!(await has(icon))) problems.push(`manifest.json names ${icon}, which is missing`);

	const log = JSON.parse(text('Changelog.json'));
	if (expectedVersion && !(Array.isArray(log.releases) && log.releases.some((r) => r && r.version === expectedVersion))) problems.push(`Changelog.json has no entry for v${expectedVersion}`);
	for (const n of Array.isArray(log.files) ? log.files.filter(isSafeFileName) : []) if (!(await has(n))) problems.push(`Changelog.json lists ${n}, which is missing`);

	const html = text('NewTab.html');
	if (!/<\/html>\s*$/i.test(html)) problems.push('NewTab.html looks cut off');
	for (const m of html.matchAll(/\bsrc="([^"#?:]+\.js)"/gi)) if (!(await has(m[1]))) problems.push(`NewTab.html loads ${m[1]}, which is missing`);

	const js = text('NewTabJS.js');
	if (js.length < 1000 || !/[;}]\s*$/.test(js)) problems.push('NewTabJS.js looks cut off');
	for (const m of js.matchAll(/(?:from|import\()\s*['"]\.\/([\w.-]+\.js)['"]/g)) if (!(await has(m[1]))) problems.push(`NewTabJS.js imports ${m[1]}, which is missing`);
	return problems;
}

async function writeFileTo(dir, name, data) {
	const fh = await dir.getFileHandle(name, { create: true });
	const wr = await fh.createWritable();   // changes only land when close() succeeds
	await wr.write(data);
	await wr.close();
}
async function readBytesFrom(dir, name) { return new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer()); }
const folderHas = (dir) => async (n) => { try { await dir.getFileHandle(n); return true; } catch { return false; } };
async function discardStage(dir) { try { await dir.removeEntry(STAGE_FILE); } catch { /* nothing staged */ } }

// Reads new-version.json back from the folder and validates what is on disk, not what is in memory
async function checkStaged(dir, expectedVersion) {
	let pack;
	try { pack = JSON.parse(new TextDecoder().decode(await readBytesFrom(dir, STAGE_FILE))); }
	catch { return { problems: [`${STAGE_FILE} cannot be read`], files: {} }; }
	if (!pack || pack.format !== 1 || typeof pack.files !== 'object' || pack.files === null) return { problems: [`${STAGE_FILE} is not a valid update file`], files: {} };
	const { files, problems } = await unpackRelease(pack);
	if (expectedVersion && pack.version !== expectedVersion) problems.push(`the saved update is v${pack.version}, expected v${expectedVersion}`);
	if (!problems.length) problems.push(...await validateRelease(files, pack.version, folderHas(dir)));
	return { problems, files, version: pack.version };
}

// Replaces the installed files; each is read back and compared before moving on
async function applyRelease(dir, files, onStage = () => {}) {
	const rank = (n) => APPLY_LAST.indexOf(n) + 1;
	const names = Object.keys(files).sort((a, b) => rank(a) - rank(b));
	for (const [i, name] of names.entries()) {
		onStage(`Installing ${name} (${i + 1}/${names.length})…`);
		await writeFileTo(dir, name, files[name]);
		if (await sha256Hex(await readBytesFrom(dir, name)) !== await sha256Hex(files[name])) throw new Error(`${name} was not written correctly`);
	}
}

// Stage → check → apply. setState(stage) lets the caller record progress: 'writing', 'applying', then null when done.
async function installRelease(dir, files, version, { onStage = () => {}, setState = async () => {} } = {}) {
	onStage('Saving the new version…');
	await setState('writing');
	try { await writeFileTo(dir, STAGE_FILE, JSON.stringify(await packRelease(files, version))); }
	catch (e) { await discardStage(dir); await setState(null); throw new Error(`Could not save ${STAGE_FILE}: ${e.message}`); }
	onStage('Checking the new version…');
	const check = await checkStaged(dir, version);
	if (check.problems.length) {
		await discardStage(dir);
		await setState(null);
		throw new Error('The downloaded update did not pass its checks, so nothing was changed: ' + check.problems.join('; '));
	}
	await setState('applying');
	await applyRelease(dir, check.files, onStage);
	await discardStage(dir);
	await setState(null);
}

// ─── Update toast + changelog ──────────────────────────────────────────────
// Toast = one line + "Details" button. Details opens a dialog listing every
// release between the old and new version, taken from Changelog.json.
function showUpdateToast(message, onDetails) {
	const existing = document.querySelector('.update-toast');
	if (existing) existing.remove();

	const toast = document.createElement('div');
	toast.className = 'update-toast';

	const text = document.createElement('span');
	text.className = 'update-toast-text';
	text.textContent = '✓ ' + message;
	text.title = message;
	toast.appendChild(text);

	let timer;
	const dismiss = () => {
		clearTimeout(timer);
		toast.classList.remove('show');
		toast.addEventListener('transitionend', () => toast.remove(), { once: true });
		setTimeout(() => toast.remove(), 600);
	};

	if (onDetails) {
		const detailsBtn = document.createElement('button');
		detailsBtn.className = 'update-toast-btn';
		detailsBtn.textContent = 'Details';
		detailsBtn.onclick = () => { dismiss(); onDetails(); };
		toast.appendChild(detailsBtn);
	}

	const closeBtn = document.createElement('button');
	closeBtn.className = 'update-toast-close';
	closeBtn.setAttribute('aria-label', 'Dismiss');
	closeBtn.textContent = '×';
	closeBtn.onclick = dismiss;
	toast.appendChild(closeBtn);

	// Stay put while hovered so there's time to click Details
	toast.addEventListener('mouseenter', () => clearTimeout(timer));
	toast.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 4000); });

	document.body.appendChild(toast);
	requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
	timer = setTimeout(dismiss, 10000);
}

function openChangelog(releases, headline, from, showSteps = true) {
	const modal = document.getElementById('changelogModal');
	document.getElementById('changelogTitle').textContent = headline;
	const body = document.getElementById('changelogBody');
	body.replaceChildren();

	// Oldest first, each release showing its own step: v1.4.3 → v1.5.0, then v1.5.0 → v1.5.1
	let prev = showSteps && isVersionString(from) ? from : null;
	releases.forEach((r) => {
		const block = document.createElement('div');
		block.className = 'cl-release';

		const head = document.createElement('div');
		head.className = 'cl-version';
		head.textContent = prev ? `v${prev} → v${r.version}` : `v${r.version}`;
		prev = showSteps ? r.version : null;
		if (r.date) {
			const date = document.createElement('span');
			date.className = 'cl-date';
			date.textContent = r.date;
			head.appendChild(date);
		}
		block.appendChild(head);

		if (r.summary) {
			const summary = document.createElement('div');
			summary.className = 'cl-summary';
			summary.textContent = r.summary;
			block.appendChild(summary);
		}

		if (Array.isArray(r.details) && r.details.length) {
			const list = document.createElement('ul');
			list.className = 'cl-list';
			r.details.forEach((d) => {
				const li = document.createElement('li');
				li.textContent = d;
				list.appendChild(li);
			});
			block.appendChild(list);
		}
		body.appendChild(block);
	});

	modal.showModal();
}

const isVersionString = (v) => /^\d+(\.\d+)*$/.test(v || '');

function selectReleases(list, from, to) {
	const fromOk = isVersionString(from);
	return list
		.filter(r => r && isVersionString(r.version) && (
			fromOk ? compareVersions(r.version, from) > 0 && compareVersions(r.version, to) <= 0
			       : r.version === to))
		.sort((a, b) => compareVersions(a.version, b.version));   // oldest first
}

async function readChangelog(local) {
	try {
		let json;
		if (local) {
			if (!extDirHandle) return [];
			const fh = await extDirHandle.getFileHandle('Changelog.json');
			json = JSON.parse(await (await fh.getFile()).text());
		} else {
			const res = await fetch(REMOTE_BASE + 'Changelog.json?_=' + Date.now());
			if (!res.ok) return [];
			json = await res.json();
		}
		return Array.isArray(json) ? json : (json.releases || []);
	} catch {
		return [];
	}
}

// notify is { from, to } (new) or a legacy string like "Updated from v1.4.3 to v1.4.4"
function parseNotify(notify) {
	if (!notify) return null;
	if (typeof notify === 'object') return { from: String(notify.from ?? ''), to: String(notify.to ?? '') };
	const text = String(notify);
	const m = /v?(\d+(?:\.\d+)*)\s+to\s+v?(\d+(?:\.\d+)*)/i.exec(text);
	return m ? { from: m[1], to: m[2] } : { text };
}

async function showUpdateNotification(notify) {
	const n = parseNotify(notify);
	if (!n) return;
	if (!n.to) { showUpdateToast(n.text); return; }

	const headline = isVersionString(n.from) ? `Updated v${n.from} → v${n.to}` : `Updated to v${n.to}`;

	// Prefer the Changelog.json that was just written to the folder; fall back to the server
	let releases = selectReleases(await readChangelog(true), n.from, n.to);
	if (!releases.some(r => r.version === n.to)) {
		const remote = selectReleases(await readChangelog(false), n.from, n.to);
		if (remote.length) releases = remote;
	}
	if (!releases.length) { showUpdateToast(headline); return; }

	const latest = releases[releases.length - 1];
	const summary = latest.summary || (Array.isArray(latest.details) && latest.details[0]) || '';
	let line = summary ? `${headline} · ${summary}` : headline;
	if (releases.length > 1) line += ` (+${releases.length - 1} more)`;
	showUpdateToast(line, () => openChangelog(releases, headline, n.from));
}

// ─── IndexedDB for folder handle ──────────────────────────────────────────
const DB_NAME = 'NewTabExtDB';
const STORE_NAME = 'handles';
let extDirHandle = null;

function initDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function saveHandle(handle) {
	const db = await initDB();
	return new Promise((resolve) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).put(handle, 'extFolder');
		tx.oncomplete = resolve;
	});
}

async function getHandle() {
	const db = await initDB();
	return new Promise((resolve) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const req = tx.objectStore(STORE_NAME).get('extFolder');
		req.onsuccess = () => resolve(req.result || null);
		req.onerror = () => resolve(null);
	});
}

// ─── Updates.json helpers ─────────────────────────────────────────────────
async function readUpdatesJson() {
	try {
		const fh = await extDirHandle.getFileHandle('Updates.json');
		return JSON.parse(await (await fh.getFile()).text());
	} catch {
		// File missing — return a clean default (will be created on first write)
		return { autoUpdate: false, log: [], notify: null };
	}
}

async function writeUpdatesJson(data) {
	const fh = await extDirHandle.getFileHandle('Updates.json', { create: true });
	const wr = await fh.createWritable();
	await wr.write(JSON.stringify(data, null, '\t'));
	await wr.close();
}

// ─── Silent auto-update on load ───────────────────────────────────────────
// Called once on page load if folder is already linked with permission.
// 1. Checks for a pending notify (written by a previous update) → shows toast + clears it.
// 2. If autoUpdate is on, fetches remote manifest, compares, downloads files, and reloads.
async function silentUpdateCheck() {
	if (!extDirHandle) return;

	try {
		const data = await readUpdatesJson();

		// Step 1: Show any pending notification from a previous update cycle.
		// Cleared first so it can only ever be shown once.
		if (data.notify) {
			const pending = data.notify;
			data.notify = null;
			await writeUpdatesJson(data);
			showUpdateNotification(pending).catch((e) => console.warn('[NewTab] Update toast failed:', e.message));
		}

		// An interrupted update from last time? Finish it (or clean it up) before anything else.
		if (await resumeStagedUpdate(data)) return;

		// The shared gradient engine is missing from this folder: fetch it once
		if (gradientEngineMissing) await installGradientEngine();

		// Step 2: Auto-update check
		if (!data.autoUpdate) return;

		const remoteRes = await fetch(REMOTE_BASE + 'manifest.json?_=' + Date.now());
		if (!remoteRes.ok) return;
		const remoteMf = await remoteRes.json();

		// Read local version from the installed manifest.json
		const localMfh = await extDirHandle.getFileHandle('manifest.json');
		const localMf = JSON.parse(await (await localMfh.getFile()).text());

		if (compareVersions(remoteMf.version, localMf.version) <= 0) return; // Already up to date

		// Newer version found — download and install silently
		await performSilentUpdate(localMf.version, remoteMf.version, data);

	} catch (e) {
		// Silent — don't bother the user if the check fails (offline, server down, etc.)
		console.warn('[NewTab] Auto-update check failed:', e.message);
	}
}

async function performSilentUpdate(fromVersion, toVersion, updatesData) {
	const files = await downloadRelease(REMOTE_BASE);
	await installRelease(extDirHandle, files, toVersion, {
		// Progress is recorded in Updates.json so an interrupted update can be finished the next time the page opens
		setState: async (stage) => { updatesData.pending = stage ? { from: fromVersion, to: toVersion, stage } : null; await writeUpdatesJson(updatesData); }
	});
	await finishUpdate(updatesData, fromVersion, toVersion, 'Auto-updated by NewTab');
}

// Bookkeeping once the new files are in place: log it, queue the "what's new" toast, reload the extension
async function finishUpdate(data, from, to, note) {
	data.log.push({ timestamp: new Date().toLocaleString(), from, to, note });
	// If an earlier update is still waiting to be announced, keep its starting version so the notes stack
	const pendingFrom = data.notify && typeof data.notify === 'object' ? data.notify.from : '';
	data.notify = { from: pendingFrom || from, to };
	data.pending = null;
	await writeUpdatesJson(data);
	if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) chrome.runtime.reload();
}

// A leftover new-version.json means an update was interrupted. If it stopped half-way through replacing files
// and the saved copy still checks out, finish the job; otherwise throw it away (the installed files were never touched).
async function resumeStagedUpdate(data) {
	if (!(await folderHas(extDirHandle)(STAGE_FILE))) {
		if (data.pending) { data.pending = null; await writeUpdatesJson(data); }
		return false;
	}
	const p = data.pending;
	const check = await checkStaged(extDirHandle, p?.to);
	if (!p || p.stage !== 'applying' || check.problems.length) {
		console.warn('[NewTab] Discarding an unfinished update:', check.problems.join('; ') || 'it had not started installing');
		await discardStage(extDirHandle);
		if (data.pending) { data.pending = null; await writeUpdatesJson(data); }
		return false;
	}
	await applyRelease(extDirHandle, check.files);
	await discardStage(extDirHandle);
	await finishUpdate(data, p.from, p.to, 'Finished an interrupted update');
	return true;
}

// Fresh copy of the shared gradient engine, for installs that were set up without it
async function installGradientEngine() {
	try {
		const res = await fetch(FALLBACK_SOURCES['CubicGradient.js'], { cache: 'no-cache' });
		const src = res.ok ? await res.text() : '';
		if (!/export\s+function\s+cubicGradient\b/.test(src)) return;
		await writeFileTo(extDirHandle, 'CubicGradient.js', src);
		if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) chrome.runtime.reload();
	} catch (e) { console.warn('[NewTab] Could not install the gradient engine:', e.message); }
}

// ─── Settings sidebar: folder UI ─────────────────────────────────────────
async function checkFolderAccess() {
	if (!extDirHandle) extDirHandle = await getHandle();
	if (!extDirHandle) {
		setFolderBtnState('link');
		return;
	}
	const perm = await extDirHandle.queryPermission({ mode: 'readwrite' });
	if (perm === 'granted') {
		setFolderBtnState('hidden');
		await readFolderDataForSettings();
	} else {
		setFolderBtnState('reconnect');
	}
}

function setFolderBtnState(state) {
	const linkRow   = document.getElementById('linkFolderRow');
	const updateRow = document.getElementById('autoUpdateRow');
	const btn       = document.getElementById('btnLinkFolder');

	if (state === 'hidden') {
		// Folder is fully linked — hide the link row, show the settings row
		linkRow.style.display   = 'none';
		updateRow.style.display = 'block';
	} else if (state === 'link') {
		// No folder linked at all
		linkRow.style.display   = 'flex';
		updateRow.style.display = 'none';
		btn.textContent = 'Link Folder';
	} else if (state === 'reconnect') {
		// Folder was linked but permission expired
		linkRow.style.display   = 'flex';
		updateRow.style.display = 'none';
		btn.textContent = 'Reconnect Folder';
	}
}

async function readFolderDataForSettings() {
	const infoEl = document.getElementById('autoUpdateFolderInfo');
	try {
		// Show installed version
		const mfh = await extDirHandle.getFileHandle('manifest.json');
		const mf = JSON.parse(await (await mfh.getFile()).text());
		infoEl.textContent = `v${mf.version} · linked`;

		// Read Updates.json for toggle state
		const data = await readUpdatesJson();
		document.getElementById('extUpdateToggle').checked = data.autoUpdate;
	} catch (e) {
		infoEl.textContent = 'linked · could not read version';
		document.getElementById('extUpdateToggle').checked = false;
	}
}

async function linkExtensionFolder() {
	const btn = document.getElementById('btnLinkFolder');
	try {
		if (extDirHandle && btn.textContent === 'Reconnect Folder') {
			// User gesture available — safe to requestPermission on existing handle
			const perm = await extDirHandle.requestPermission({ mode: 'readwrite' });
			if (perm === 'granted') {
				setFolderBtnState('hidden');
				await readFolderDataForSettings();
				return;
			}
		}
		// Pick a new folder
		extDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
		await saveHandle(extDirHandle);
		setFolderBtnState('hidden');
		await readFolderDataForSettings();
	} catch (e) {
		if (e.name !== 'AbortError') console.error('Folder link failed:', e);
	}
}

async function toggleAutoUpdate() {
	if (!extDirHandle) return;
	const isOn = document.getElementById('extUpdateToggle').checked;
	try {
		const data = await readUpdatesJson();
		data.autoUpdate = isOn;
		await writeUpdatesJson(data);
	} catch (e) {
		console.error('Failed to write Updates.json:', e);
	}
}

// ─── News: latest updates from my other projects + suggestion cards ───────
// Everything shown comes from News.json on the site, so it can change without an extension update.
// It is fetched while the page runs and never written to disk (it is not in the updater's file list).
const NEWS_URL = REMOTE_BASE + 'News.json';
const NEWS_MAX_AGE_MS = 60 * 60 * 1000;   // look for fresh news at most once an hour
let newsData = { posts: [], cards: [] };

const newsEls = {
	btn:    document.getElementById('newsBtn'),
	dot:    document.getElementById('newsDot'),
	panel:  document.getElementById('newsPanel'),
	list:   document.getElementById('newsList'),
	card:   document.getElementById('newsCard'),
	toggle: document.getElementById('newsToggle')
};

const newsEnabled = () => localStorage.getItem('newsEnabled') !== '0';
function lsGet(key, fallback) {
	try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function lsSet(key, value) {
	try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

// Only https links, only plain text: nothing from the news file is ever inserted as HTML
function safeHttpsUrl(u) {
	try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.href : null; } catch { return null; }
}
const clip = (v, n) => String(v ?? '').slice(0, n);

// A contributor's GitHub username (a plain name, or { github: "name" }); shown as a tag with their profile picture
const GITHUB_USER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
function cleanAuthor(a) {
	const name = typeof a === 'string' ? a : a && typeof a === 'object' ? a.github : '';
	return typeof name === 'string' && GITHUB_USER.test(name) ? name : '';
}
function devTag(user) {
	if (!user) return null;
	const a = el('a', 'news-dev');
	a.href = 'https://github.com/' + encodeURIComponent(user); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'GitHub profile of ' + user;
	const img = el('img', 'news-dev-pic'); img.alt = ''; img.width = 16; img.height = 16; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
	img.onerror = () => img.remove();
	img.src = 'https://github.com/' + encodeURIComponent(user) + '.png?size=32';
	a.append(img, document.createTextNode('@' + user));
	return a;
}
function cleanNews(raw) {
	const posts = (Array.isArray(raw?.posts) ? raw.posts : []).slice(0, 30).map((p) => ({
		id: clip(p?.id, 80), date: clip(p?.date, 10), project: clip(p?.project, 40),
		title: clip(p?.title, 120), summary: clip(p?.summary, 300), url: safeHttpsUrl(p?.url), image: safeHttpsUrl(p?.image), author: cleanAuthor(p?.author)
	})).filter((p) => p.id && p.title)
		.sort((a, b) => b.date.localeCompare(a.date));   // newest first
	const cards = (Array.isArray(raw?.cards) ? raw.cards : []).slice(0, 10).map((c) => ({
		id: clip(c?.id, 80), project: clip(c?.project, 40), title: clip(c?.title, 80), text: clip(c?.text, 240),
		cta: clip(c?.cta, 40) || 'Open', url: safeHttpsUrl(c?.url), image: safeHttpsUrl(c?.image), author: cleanAuthor(c?.author),
		hosts: (Array.isArray(c?.hosts) ? c.hosts : []).slice(0, 60).map((h) => clip(h, 100).toLowerCase()).filter(Boolean),
		keywords: (Array.isArray(c?.keywords) ? c.keywords : []).slice(0, 60).map((k) => clip(k, 40).toLowerCase()).filter(Boolean)
	})).filter((c) => c.id && c.title && c.url && (c.hosts.length || c.keywords.length));
	return { posts, cards };
}

// A card is suggested when one of the user's shortcuts is on a site it lists (compared on this device only)
const hostMatches = (host, rule) => host === rule || host.endsWith('.' + rule);
function pickCards(cards) {
	const shortcuts = safeParseShortcuts().filter((s) => !s.builtin);   // only shortcuts the person added themselves
	const urls = shortcuts.map((s) => normalizeUrl(s.url));
	const labels = shortcuts.map((s) => `${s.name || ''} ${s.url || ''}`.toLowerCase());   // names and URLs, for keyword matches
	const hosts = urls.map((u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }).filter(Boolean);
	const dismissed = lsGet('newsDismissed', []);
	return cards.filter((c) =>
		!dismissed.includes(c.id) &&
		!urls.some((u) => u.startsWith(c.url.replace(/\/$/, ''))) &&   // already has a shortcut to it
		(c.hosts.some((rule) => hosts.some((h) => hostMatches(h, rule))) ||
		 c.keywords.some((k) => labels.some((l) => l.includes(k)))));
}

function el(tag, className, text) {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text != null) e.textContent = text;
	return e;
}

// Optional picture: skipped when missing, and removed again if it fails to load
function newsImage(url, className) {
	if (!url) return null;
	const img = el('img', className);
	img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
	img.onerror = () => img.remove();
	img.src = url;
	return img;
}

function renderNewsPanel() {
	newsEls.list.replaceChildren();
	if (!newsEnabled()) { newsEls.list.appendChild(el('p', 'news-empty', 'Dev news is turned off in Settings → News.')); return; }
	if (!newsData.posts.length) { newsEls.list.appendChild(el('p', 'news-empty', 'Nothing new right now.')); return; }
	for (const p of newsData.posts) {
		const item = el('article', 'news-item');
		const pic = newsImage(p.image, 'news-img');
		if (pic) item.appendChild(pic);
		const meta = el('div', 'news-meta');
		if (p.project) meta.appendChild(el('span', 'news-tag', p.project));
		if (p.date) meta.appendChild(el('span', '', p.date));
		const dev = devTag(p.author); if (dev) meta.appendChild(dev);
		item.append(meta, el('h3', 'news-title', p.title));
		if (p.summary) item.appendChild(el('p', 'news-summary', p.summary));
		if (p.url) {
			const a = el('a', 'news-link', 'Read more →');
			a.href = p.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
			item.appendChild(a);
		}
		newsEls.list.appendChild(item);
	}
}

function updateNewsDot() {
	const seen = lsGet('newsSeen', []);
	newsEls.dot.hidden = !newsData.posts.some((p) => !seen.includes(p.id));
}

function openNews() {
	renderNewsPanel();
	renderWorld();
	newsEls.panel.classList.add('open');
	lsSet('newsSeen', newsData.posts.map((p) => p.id).slice(0, 200));   // opening the panel marks everything as read
	updateNewsDot();
}
function closeNews() { newsEls.panel.classList.remove('open'); }

function refreshNewsCard() {
	const card = newsEnabled() ? pickCards(newsData.cards)[0] : null;
	newsEls.card.hidden = !card;
	if (!card) return;
	const close = el('button', 'news-card-close', '×');
	close.setAttribute('aria-label', 'Dismiss');
	close.onclick = () => { lsSet('newsDismissed', [...lsGet('newsDismissed', []), card.id]); refreshNewsCard(); };
	const cta = el('a', 'news-card-cta', card.cta);
	cta.href = card.url; cta.target = '_blank'; cta.rel = 'noopener noreferrer';
	newsEls.card.replaceChildren(...[newsImage(card.image, 'news-card-img')].filter(Boolean), close, el('div', 'news-card-label', card.project ? `Suggested · ${card.project}` : 'Suggested'),
		...[devTag(card.author)].filter(Boolean),
		el('h3', null, card.title), el('p', null, card.text), cta);
}

function applyNews(clean) {
	newsData = clean;
	updateNewsBtn();
	updateNewsDot();
	refreshNewsCard();
	if (newsEls.panel.classList.contains('open')) renderNewsPanel();
}

function hideNewsUi() {
	newsData = { posts: [], cards: [] };
	newsEls.card.hidden = true;
	updateNewsBtn();
	if (newsEls.panel.classList.contains('open')) renderNewsPanel();
}

// The button stays available while either dev news or world news is switched on
function updateNewsBtn() {
	newsEls.btn.hidden = !newsEnabled() && !worldEnabled();
	if (newsEls.btn.hidden) closeNews();
}

async function loadNews() {
	updateNewsBtn();   // button state must not depend on the news file loading (offline, blocked, or only world news on)
	if (!newsEnabled()) { hideNewsUi(); return; }
	const cache = lsGet('newsCache', null);
	if (cache?.data) applyNews(cleanNews(cache.data));                    // show what we have right away
	if (cache && Date.now() - cache.fetchedAt < NEWS_MAX_AGE_MS) return;  // still fresh
	try {
		const res = await fetch(NEWS_URL, { cache: 'no-cache' });
		if (!res.ok) return;
		const data = await res.json();
		lsSet('newsCache', { fetchedAt: Date.now(), data });
		if (newsEnabled()) applyNews(cleanNews(data));
	} catch { /* offline: keep showing the cached news */ }
}

// ─── World news: headlines straight from the publishers' own RSS feeds ──────
// Off until the person turns it on. Feeds come through our own relay, which fetches them from the publishers.
// Titles, links and pictures are read from the feed as plain text and https-only; nothing is stored beyond a short cache.
const WORLD_PROXY = 'https://proelectriccoder.pages.dev/api/news-feed?source=';   // Cloudflare function that adds the CORS headers the news sites lack
const WORLD_SOURCES = [
	{ id: 'bbc',       name: 'BBC News' },
	{ id: 'cnn',       name: 'CNN' },
	{ id: 'aljazeera', name: 'Al Jazeera' },
	{ id: 'arabnews',  name: 'Arab News' },
	{ id: 'guardian',  name: 'The Guardian' },
	{ id: 'nyt',       name: 'The New York Times' },
	{ id: 'npr',       name: 'NPR' },
	{ id: 'sky',       name: 'Sky News' },
	{ id: 'cbs',       name: 'CBS News' },
	{ id: 'dw',        name: 'DW' },
	{ id: 'france24',  name: 'France 24' }
];
const WORLD_DEFAULT = ['bbc', 'cnn', 'aljazeera'];   // sources that start switched on
const WORLD_DOMAINS = { bbc: 'bbc.com', cnn: 'cnn.com', aljazeera: 'aljazeera.com', arabnews: 'arabnews.com', guardian: 'theguardian.com', nyt: 'nytimes.com',
	npr: 'npr.org', sky: 'news.sky.com', cbs: 'cbsnews.com', dw: 'dw.com', france24: 'france24.com' };
function srcLogo(id) {
	const img = el('img', 'src-logo');
	img.alt = ''; img.width = 16; img.height = 16; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
	img.onerror = () => img.remove();   // no icon available: just show the name
	img.src = 'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(WORLD_DOMAINS[id] || '');
	return img;
}
const WORLD_MAX_AGE_MS = 15 * 60 * 1000;
const WORLD_PER_SOURCE = 8;
let worldItems = {};          // source id -> [{title, link, date, image}]
let worldFilter = 'all';
let worldTopic = 'all';        // topic filter, built from the categories the feeds themselves provide
let worldActiveTab = 'dev';

const worldEnabled = () => localStorage.getItem('worldEnabled') === '1';
const worldSources = () => {
	const ids = lsGet('worldSources', WORLD_DEFAULT);
	return WORLD_SOURCES.filter((s) => ids.includes(s.id));
};

// Feeds sometimes list http links for sites that also serve https: upgrade, then keep https only
const upgradeHttps = (u) => safeHttpsUrl(String(u || '').trim().replace(/^http:\/\//i, 'https://'));

function parseFeed(xmlText) {
	const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
	if (doc.querySelector('parsererror')) return [];
	const ns = (item, local) => Array.from(item.getElementsByTagName('*')).find((n) => n.localName === local);
	return Array.from(doc.querySelectorAll('item')).slice(0, WORLD_PER_SOURCE).map((item) => {
		const text = (tag) => item.querySelector(tag)?.textContent?.trim() || '';
		const thumb = ns(item, 'thumbnail') || ns(item, 'content');
		const enc = item.querySelector('enclosure[type^="image"]');
		// Topics exactly as the publisher labels them (RSS <category> or dc:subject); nothing is guessed
		const cats = [];
		for (const c of [...item.querySelectorAll('category')].concat(Array.from(item.getElementsByTagName('*')).filter((n) => n.localName === 'subject'))) {
			const t = clip(c.textContent.replace(/\s+/g, ' ').trim(), 30);
			if (t.length >= 2 && !/^https?:/i.test(t) && !cats.some((x) => x.toLowerCase() === t.toLowerCase())) cats.push(t);
			if (cats.length >= 5) break;
		}
		const date = new Date(text('pubDate') || (ns(item, 'date')?.textContent ?? ''));   // RSS pubDate, or dc:date in RDF feeds
		return {
			title: clip(text('title'), 200),
			link: upgradeHttps(text('link')),
			categories: cats,
			date: isNaN(date) ? 0 : date.getTime(),
			image: upgradeHttps(thumb?.getAttribute('url') || enc?.getAttribute('url') || item.querySelector('image')?.textContent)
		};
	}).filter((i) => i.title && i.link);
}

async function loadWorldSource(src) {
	const key = 'worldCache_' + src.id;
	const cache = lsGet(key, null);
	if (cache?.items) worldItems[src.id] = cache.items;
	if (cache && Date.now() - cache.fetchedAt < WORLD_MAX_AGE_MS) return;
	try {
		const res = await fetch(WORLD_PROXY + src.id, { cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
		if (!res.ok) return;
		const items = parseFeed(await res.text());
		if (items.length) { worldItems[src.id] = items; lsSet(key, { fetchedAt: Date.now(), items }); }
	} catch { /* blocked or offline: keep what we have */ }
}

async function loadWorld() {
	if (!worldEnabled()) { worldItems = {}; renderWorld(); return; }
	await Promise.all(worldSources().map(loadWorldSource));
	renderWorld();
}

const timeAgo = (ms) => {
	if (!ms) return '';
	const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
	if (m < 60) return m + 'm ago';
	const h = Math.round(m / 60);
	return h < 48 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
};

function renderWorld() {
	const chips = document.getElementById('worldChips'), list = document.getElementById('worldList');
	chips.replaceChildren(); list.replaceChildren(); document.getElementById('worldTopics').replaceChildren();
	if (!worldEnabled()) {
		list.appendChild(el('p', 'news-empty', 'World news shows headlines from the news sites you pick in Settings → News (BBC News, CNN and Al Jazeera to start). Headlines are relayed by proelectriccoder.pages.dev.'));
		const on = el('button', 'news-enable', 'Turn on world news');
		on.onclick = () => { localStorage.setItem('worldEnabled', '1'); document.getElementById('worldToggle').checked = true; syncWorldSettings(); updateNewsBtn(); loadWorld(); };
		list.appendChild(on);
		return;
	}
	const active = worldSources();
	if (worldFilter !== 'all' && !active.some((s) => s.id === worldFilter)) worldFilter = 'all';
	for (const [id, name] of [['all', 'All'], ...active.map((s) => [s.id, s.name])]) {
		const c = el('button', 'news-chip' + (worldFilter === id ? ' active' : ''));
		if (id !== 'all') c.appendChild(srcLogo(id));
		c.appendChild(document.createTextNode(name));
		c.onclick = () => { worldFilter = id; worldTopic = 'all'; renderWorld(); };
		chips.appendChild(c);
	}
	let rows = active.filter((s) => worldFilter === 'all' || s.id === worldFilter)
		.flatMap((s) => (worldItems[s.id] || []).map((i) => ({ ...i, source: s.name, sourceId: s.id })));

	// Topic chips: only categories that the loaded headlines really carry, most common first
	const counts = new Map();
	for (const r of rows) for (const c of r.categories || []) {
		const k = c.toLowerCase();
		counts.set(k, { label: counts.get(k)?.label || c, n: (counts.get(k)?.n || 0) + 1 });
	}
	const topics = [...counts.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
	if (worldTopic !== 'all' && !counts.has(worldTopic)) worldTopic = 'all';
	const topicBox = document.getElementById('worldTopics');
	topicBox.replaceChildren();
	if (topics.length) {
		for (const [key, v] of [['all', { label: 'All topics' }], ...topics]) {
			const c = el('button', 'news-chip topic' + (worldTopic === key ? ' active' : ''), v.label);
			c.onclick = () => { worldTopic = key; renderWorld(); };
			topicBox.appendChild(c);
		}
	}
	if (worldTopic !== 'all') rows = rows.filter((r) => (r.categories || []).some((c) => c.toLowerCase() === worldTopic));
	if (worldFilter === 'all') rows.sort((a, b) => b.date - a.date);
	if (!rows.length) { list.appendChild(el('p', 'news-empty', 'Loading headlines… If nothing appears, the feeds may be unreachable.')); return; }
	for (const r of rows) {
		const item = el('article', 'news-item');
		const pic = newsImage(r.image, 'news-img');
		if (pic) item.appendChild(pic);
		const meta = el('div', 'news-meta');
		const tag = el('span', 'news-tag');
		tag.append(srcLogo(r.sourceId), document.createTextNode(r.source));
		meta.append(tag, el('span', '', timeAgo(r.date)));
		const a = el('a', 'news-headline', r.title);
		a.href = r.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
		item.append(meta, a);
		list.appendChild(item);
	}
}

function setNewsTab(tab) {
	worldActiveTab = tab;
	document.getElementById('tabDev').classList.toggle('active', tab === 'dev');
	document.getElementById('tabWorld').classList.toggle('active', tab === 'world');
	document.getElementById('devPane').hidden = tab !== 'dev';
	document.getElementById('worldPane').hidden = tab !== 'world';
}

function syncWorldSettings() {
	const on = worldEnabled();
	document.getElementById('worldToggle').checked = on;
	document.getElementById('worldSourceBox').hidden = !on;
	const ids = lsGet('worldSources', WORLD_DEFAULT);
	document.querySelectorAll('#worldSourceBox input').forEach((cb) => { cb.checked = ids.includes(cb.value); });
}

// ─── Show on page (visibility switches) ───────────────────────────────────
const VIS_ITEMS = [['logo', 'Logo'], ['clock', 'Clock'], ['date', 'Date'], ['search', 'Search bar'], ['shortcuts', 'Shortcuts'], ['newsBtn', 'News button']];
const visState = () => { const v = lsGet('visibility', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };

function applyVisibility() {
	const v = visState();
	for (const [key] of VIS_ITEMS) document.documentElement.classList.toggle('hide-' + key, v[key] === false);
}

function buildVisibilityBox() {
	const box = document.getElementById('visibilityBox');
	box.replaceChildren(...VIS_ITEMS.map(([key, label]) => {
		const row = el('div', 'setting-row');
		const sw = el('label', 'toggle');
		const cb = el('input'); cb.type = 'checkbox'; cb.id = 'vis_' + key;
		cb.checked = visState()[key] !== false;
		cb.onchange = () => {
			lsSet('visibility', { ...visState(), [key]: cb.checked });
			applyVisibility();
		};
		sw.append(cb, el('div', 'toggle-track'), el('div', 'toggle-thumb'));
		row.append(el('span', 'setting-label', label), sw);
		return row;
	}));
}

// ─── Weather (Open-Meteo: free, no account) ───────────────────────────────
const WEATHER_TTL_MS = 30 * 60 * 1000;
const weatherEnabled = () => localStorage.getItem('weatherEnabled') === '1';
const weatherUnit = () => localStorage.getItem('weatherUnit') === 'f' ? 'f' : 'c';
const weatherCity = () => {
	const c = lsGet('weatherCity', null);
	return c && Number.isFinite(c.lat) && Number.isFinite(c.lon) && typeof c.name === 'string' ? c : null;
};

// WMO weather codes -> [emoji by day, emoji by night, words]
function weatherLook(code, isDay) {
	const day = isDay !== 0;
	if (code === 0) return [day ? '☀️' : '🌙', 'Clear sky'];
	if (code === 1) return [day ? '🌤️' : '🌙', 'Mostly clear'];
	if (code === 2) return ['⛅', 'Partly cloudy'];
	if (code === 3) return ['☁️', 'Overcast'];
	if (code === 45 || code === 48) return ['🌫️', 'Fog'];
	if (code >= 51 && code <= 57) return ['🌦️', 'Drizzle'];
	if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['🌧️', 'Rain'];
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['❄️', 'Snow'];
	if (code >= 95) return ['⛈️', 'Thunderstorm'];
	return ['🌡️', 'Weather'];
}

function setWeatherEnabled(on) {
	localStorage.setItem('weatherEnabled', on ? '1' : '0');
	document.getElementById('weatherToggle').checked = on;
	if (!on) closeWeatherCard();
	loadWeather(false);
}

let weatherLast = null;   // { data, city } for the card
let weatherFailed = false;

const hour12 = (iso) => { const h = parseInt(iso.slice(11, 13), 10); return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); };

function openWeatherCard() {
	closeAddonPanels();
	renderWeatherCard();
	document.getElementById('weatherCard').hidden = false;
	loadWeather(false);   // refresh in the background if the cached data is old
}
function closeWeatherCard() { document.getElementById('weatherCard').hidden = true; if (typeof closeAddonPanels === 'function') closeAddonPanels(); }

function renderWeatherCard() {
	const card = document.getElementById('weatherCard');
	card.replaceChildren();
	const close = el('button', 'news-card-close', '×'); close.setAttribute('aria-label', 'Close weather'); close.onclick = closeWeatherCard;
	card.appendChild(close);
	if (!weatherLast) {
		card.appendChild(el('div', 'wc-title', 'Weather'));
		card.appendChild(el('p', 'news-empty', weatherFailed ? 'The forecast is unavailable right now.' : weatherCity() ? 'Loading the forecast…' : 'Set your city in Settings → Weather to see the forecast.'));
		return;
	}
	const { data, city } = weatherLast, c = data.current, d = data.daily, u = weatherUnit() === 'f' ? '°F' : '°C';
	const deg = (n) => Math.round(n) + '°';
	const [icon, words] = weatherLook(c.weather_code, c.is_day);
	const head = el('div', 'wc-head');
	const big = el('div', 'wc-big'); big.append(el('span', 'weather-icon', icon), el('span', 'wc-temp', deg(c.temperature_2m) + u.slice(1)));
	const sub = el('div', 'wc-sub');
	sub.append(el('div', 'wc-title', city.label || city.name), el('div', null, words + (Number.isFinite(c.apparent_temperature) ? ` · feels like ${deg(c.apparent_temperature)}` : '')));
	head.append(big, sub);
	card.appendChild(head);

	const stats = el('div', 'wc-stats');
	const stat = (label, value) => { const s = el('div', 'wc-stat'); s.append(el('span', 'wc-stat-v', value), el('span', 'wc-stat-l', label)); return s; };
	if (Number.isFinite(c.relative_humidity_2m)) stats.appendChild(stat('Humidity', Math.round(c.relative_humidity_2m) + '%'));
	if (Number.isFinite(c.wind_speed_10m)) stats.appendChild(stat('Wind', Math.round(c.wind_speed_10m) + (weatherUnit() === 'f' ? ' mph' : ' km/h')));
	if (Array.isArray(d.sunrise) && typeof d.sunrise[0] === 'string') stats.appendChild(stat('Sunrise', d.sunrise[0].slice(11, 16)));
	if (Array.isArray(d.sunset) && typeof d.sunset[0] === 'string') stats.appendChild(stat('Sunset', d.sunset[0].slice(11, 16)));
	if (stats.childElementCount) card.appendChild(stats);

	const hr = data.hourly;
	if (hr && Array.isArray(hr.time) && Array.isArray(hr.temperature_2m) && Array.isArray(hr.weather_code) && typeof c.time === 'string') {
		const from = hr.time.findIndex((t) => t >= c.time.slice(0, 13) + ':00');
		if (from >= 0) {
			const strip = el('div', 'wc-hours');
			for (let i = from; i < Math.min(from + 8, hr.time.length); i++) {
				const h = el('div', 'wc-hour');
				h.append(el('span', 'wc-hour-t', i === from ? 'Now' : hour12(hr.time[i])), el('span', 'weather-icon', weatherLook(hr.weather_code[i], 1)[0]), el('span', null, deg(hr.temperature_2m[i])));
				strip.appendChild(h);
			}
			card.appendChild(strip);
		}
	}

	const days = el('div', 'wc-days');
	for (let i = 0; i < d.time.length; i++) {
		const row = el('div', 'wc-day');
		const name = i === 0 ? 'Today' : new Date(d.time[i] + 'T12:00:00').toLocaleDateString('default', { weekday: 'long' });
		row.append(el('span', 'wc-day-n', name), el('span', 'weather-icon', weatherLook(d.weather_code[i], 1)[0]), el('span', 'wc-day-t', `${deg(d.temperature_2m_max[i])} / ${deg(d.temperature_2m_min[i])}`));
		days.appendChild(row);
	}
	card.appendChild(days);
}

function renderWeather(data, city) {
	weatherLast = { data, city };
	weatherFailed = false;
	if (!document.getElementById('weatherCard').hidden) renderWeatherCard();
}

function validWeather(d) {
	const nums = (a) => Array.isArray(a) && a.length >= 2 && a.every((x) => Number.isFinite(x));
	return d && d.current && Number.isFinite(d.current.temperature_2m) && Number.isFinite(d.current.weather_code) &&
		d.daily && Array.isArray(d.daily.time) && nums(d.daily.temperature_2m_max) && nums(d.daily.temperature_2m_min) && nums(d.daily.weather_code);
}

async function loadWeather(force) {
	document.getElementById('weatherBtn').hidden = !weatherEnabled();
	if (!weatherEnabled()) { weatherLast = null; return; }
	const city = weatherCity();
	if (!city) { weatherLast = null; if (!document.getElementById('weatherCard').hidden) renderWeatherCard(); return; }
	const unit = weatherUnit();
	const key = `v2,${city.lat},${city.lon},${unit}`;
	const cache = lsGet('weatherCache', null);
	const cached = cache?.key === key && validWeather(cache.data);
	if (cached) renderWeather(cache.data, city);
	if (!force && cached && Date.now() - cache.fetchedAt < WEATHER_TTL_MS) return;
	try {
		const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.lat + '&longitude=' + city.lon +
			'&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
			'&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=7' +
			(unit === 'f' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '');
		const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
		if (!res.ok) throw new Error('weather ' + res.status);
		const data = await res.json();
		if (!validWeather(data)) throw new Error('bad weather data');
		lsSet('weatherCache', { key, fetchedAt: Date.now(), data });
		renderWeather(data, city);
	} catch {
		if (!cached) { weatherFailed = true; if (!document.getElementById('weatherCard').hidden) renderWeatherCard(); }
	}
}

async function findWeatherCity() {
	const status = document.getElementById('weatherStatus');
	const q = document.getElementById('weatherCityInput').value.trim();
	if (q.length < 2) { status.textContent = 'Type a city name'; return; }
	status.textContent = 'Searching…';
	try {
		const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(q), { credentials: 'omit', referrerPolicy: 'no-referrer' });
		const hit = (await res.json())?.results?.[0];
		if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) { status.textContent = 'City not found'; return; }
		const name = [hit.name, hit.admin1 && hit.admin1 !== hit.name ? hit.admin1 : '', hit.country_code].filter(Boolean).join(', ').slice(0, 60);
		lsSet('weatherCity', { name: hit.name.slice(0, 40), label: name, lat: hit.latitude, lon: hit.longitude });
		status.textContent = 'Using ' + name;
		if (!weatherEnabled()) setWeatherEnabled(true); else loadWeather(true);
	} catch { status.textContent = 'Could not reach the weather service'; }
}

function syncWeatherSettings() {
	document.getElementById('weatherToggle').checked = weatherEnabled();
	document.getElementById('weatherUnitInput').value = weatherUnit();
	const c = weatherCity();
	document.getElementById('weatherStatus').textContent = c ? 'Using ' + (c.label || c.name) : 'No city set';
	if (c) document.getElementById('weatherCityInput').value = c.name;
}

// ─── Backup: export / import ──────────────────────────────────────────────
const BACKUP_KEYS = ['shortcuts', 'preferredEngine', 'customEngines', 'theme', 'visibility',
	'bgTop', 'bgBottom', 'bgDirection', 'bgPower', 'bgSteps', 'bgCustom', 'bgMode', 'bgDim', 'bgPreset', 'bgImageUrl',
	'logoOutline', 'logoFill', 'logoMatchBg', 'newsEnabled', 'worldEnabled', 'worldSources', 'newsDismissed',
	'weatherEnabled', 'weatherCity', 'weatherUnit'];
const BACKUP_APP = 'ProElectricCoder NewTab';
const BACKUP_MAX_VALUE = 500000;
const ADDON_KEY = /^addon\.[a-z][a-z0-9-]{0,30}\.[\w.-]{1,40}$/;   // data saved by add-ons (notes, to-dos, settings …)
const addonDataKeys = () => Object.keys(localStorage).filter((k) => ADDON_KEY.test(k));

function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
}

async function exportSettings() {
	const status = document.getElementById('backupStatus');
	const settings = {};
	for (const k of [...BACKUP_KEYS, ...addonDataKeys()]) { const v = localStorage.getItem(k); if (v !== null && v.length <= BACKUP_MAX_VALUE) settings[k] = v; }
	let backgroundImage = null;
	try { const blob = await bgDbGet(); if (blob) backgroundImage = await blobToDataUrl(blob); } catch { /* no picture */ }
	const version = typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : null;
	const file = { app: BACKUP_APP, format: 1, exported: new Date().toISOString(), version, settings, backgroundImage };
	const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
	const a = el('a'); a.href = url; a.download = `newtab-backup-${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a); a.click(); a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
	status.textContent = `Exported ${Object.keys(settings).length} settings${backgroundImage ? ' and your picture' : ''}`;
}

// Returns an error message, or null when the value is acceptable
function checkBackupValue(key, value) {
	if (typeof value !== 'string' || value.length > BACKUP_MAX_VALUE) return `${key} is not valid`;
	const asJson = () => { try { return JSON.parse(value); } catch { return undefined; } };
	if (key === 'shortcuts') {
		const list = asJson();
		if (!Array.isArray(list) || list.length > 500 || !list.every((s) => s && typeof s.name === 'string' && typeof s.url === 'string' && (s.icon === undefined || typeof s.icon === 'string'))) return 'shortcuts are not valid';
	}
	if (key === 'customEngines') {
		const list = asJson();
		if (!Array.isArray(list) || list.length > 20 || !list.every((e) => e && typeof e.id === 'string' && typeof e.name === 'string' && safeHttpsUrl(e.url) && String(e.url).includes('%s'))) return 'search engines are not valid';
	}
	if (key === 'theme' && !['dark', 'light', 'system'].includes(value)) return 'theme is not valid';
	if (key === 'bgImageUrl' && value && !safeHttpsUrl(value)) return 'picture address is not valid';
	if (['visibility', 'weatherCity', 'worldSources', 'newsDismissed'].includes(key) && asJson() === undefined) return `${key} is not valid`;
	if (ADDON_KEY.test(key) && asJson() === undefined) return `${key} is not valid`;
	return null;
}

async function importSettings(file) {
	const status = document.getElementById('backupStatus');
	try {
		if (file.size > 40 * 1024 * 1024) throw new Error('That file is too large');
		let data;
		try { data = JSON.parse(await file.text()); } catch { throw new Error('That is not a backup file'); }
		if (!data || data.app !== BACKUP_APP || data.format !== 1 || typeof data.settings !== 'object' || data.settings === null) throw new Error('That is not a NewTab backup');
		const incoming = {};
		for (const k of [...BACKUP_KEYS, ...Object.keys(data.settings).filter((k) => ADDON_KEY.test(k))]) {
			if (!Object.hasOwn(data.settings, k)) continue;
			const problem = checkBackupValue(k, data.settings[k]);
			if (problem) throw new Error('Backup rejected: ' + problem);
			incoming[k] = data.settings[k];
		}
		let image = null;
		if (data.backgroundImage) {
			if (typeof data.backgroundImage !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(data.backgroundImage) || data.backgroundImage.length > 34 * 1024 * 1024) throw new Error('Backup rejected: picture is not valid');
			image = await (await fetch(data.backgroundImage)).blob();
		}
		if (!confirm(`Replace your current shortcuts and settings with this backup (${Object.keys(incoming).length} settings${image ? ', with picture' : ''})?`)) { status.textContent = 'Import cancelled'; return; }
		for (const k of [...BACKUP_KEYS, ...addonDataKeys()]) localStorage.removeItem(k);
		for (const [k, v] of Object.entries(incoming)) localStorage.setItem(k, v);
		await bgDbSet(image);
		status.textContent = 'Imported. Reloading…';
		setTimeout(() => location.reload(), 400);
	} catch (err) {
		status.textContent = err.message || 'Import failed';
	}
}

// ─── Init ─────────────────────────────────────────────────────────────────
updateClock();
setInterval(updateClock, 1000);
applyTheme();   // sets the theme, then loads the matching background
syncBackgroundMode();
loadPictureSource();
// ─── Add-ons (optional extras, downloaded into the addons/ folder only when the person installs them) ──
const ADDONS_URL = REMOTE_BASE + 'addons/';
const ADDON_STAGE = 'new-addon.json';
const addonPanels = new Set();
const addonSettingsEls = new Map();  // id -> element the add-on fills with its own settings
const addonErrors = new Map();
const addonLive = new Map();
let addonCatalog = null;
let addonBusy = false;

const isAddonId = (n) => typeof n === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(n);
const isAddonFile = (n) => typeof n === 'string' && /^[A-Za-z][\w-]{0,40}\.js$/.test(n);
const addonsInstalled = () => { const v = lsGet('addonsInstalled', {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const addonsStatus = (text) => { document.getElementById('addonsStatus').replaceChildren(document.createTextNode(text || '')); };

function closeAddonPanels(except) { for (const p of addonPanels) if (p !== except) p.close(); }

// What an add-on is allowed to use: small helpers, never the page's internals
function makeAddonApi(id, settingsEl) {
	const ns = 'addon.' + id + '.';
	return {
		el, weatherCity,
		storage: { get: (k, f) => lsGet(ns + k, f), set: (k, v) => lsSet(ns + k, v) },
		settings: settingsEl,
		addStyle(css) {
			const st = document.createElement('style'); st.dataset.addon = id; st.textContent = String(css);
			document.head.appendChild(st);
			return st;
		},
		// Sets the page theme and gradient the way the Appearance settings would. Pass null to go back to the defaults.
		applyAppearance(a) {
			if (!a) { localStorage.setItem('theme', 'dark'); resetBackground(); localStorage.setItem('bgMode', 'gradient'); applyTheme(); syncBackgroundMode(); return; }
			const hex = (v) => /^#[0-9a-f]{6}$/i.test(v) ? v : null;
			if (a.theme === 'dark' || a.theme === 'light') localStorage.setItem('theme', a.theme);
			localStorage.setItem('bgMode', 'gradient');
			const t = hex(a.top), b = hex(a.bottom);
			if (t && b) {
				localStorage.setItem('bgCustom', '1'); localStorage.setItem('bgTop', t); localStorage.setItem('bgBottom', b);
				localStorage.setItem('bgDirection', String(a.direction || 'to bottom right'));
				localStorage.setItem('bgPower', String(a.power ?? 3)); localStorage.setItem('bgSteps', String(a.steps ?? 20));
			}
			applyTheme(); syncBackgroundMode();
		},
		createPanel(panelId, opts = {}) {
			const card = document.createElement('div');
			if (Number.isFinite(opts.width)) card.style.width = Math.min(Math.max(opts.width, 280), 720) + 'px';
			card.className = 'weather-card'; card.id = 'addonPanel_' + String(panelId).replace(/\W/g, ''); card.hidden = true;
			card.onclick = (e) => e.stopPropagation();
			document.body.appendChild(card);
			const p = {
				card, onOpen: null,
				open() { closeWeatherCard(); closeAddonPanels(p); card.hidden = false; if (p.onOpen) p.onOpen(); },
				close() { card.hidden = true; },
				toggle() { if (card.hidden) p.open(); else p.close(); }
			};
			addonPanels.add(p);
			return p;
		},
		addButton({ key, label, title, icon, onClick }) {
			const b = el('div', 'news-btn');
			b.title = title; b.setAttribute('role', 'button'); b.setAttribute('aria-label', title);
			const NS = 'http://www.w3.org/2000/svg';
			const svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
			svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5');
			path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('d', icon);
			svg.appendChild(path); b.appendChild(svg);
			b.onclick = (e) => { e.stopPropagation(); onClick(); };
			document.querySelector('.top-left-btns').appendChild(b);
			return b;
		}
	};
}

function validateAddon(text, id) {
	if (text.length < 200) return 'the file is too short';
	if (!/export\s+default\b/.test(text)) return 'it is not an add-on module';
	if (!new RegExp(`\\bid:\\s*['"]${id}['"]`).test(text)) return 'it does not belong to this add-on';
	if (!/[;}]\s*$/.test(text)) return 'the file looks cut off';
	return '';
}

// Same idea as the main updater: download → save as one file → read back and check → only then save the add-on file
async function installAddon(entry) {
	if (addonBusy) return;
	if (!extDirHandle) { addonsStatus('Link your extension folder first (see Auto-Updates below).'); return; }
	addonBusy = true; renderAddons();
	let dir = null;
	try {
		if (await extDirHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('The folder needs to be reconnected (see Auto-Updates below).');
		addonsStatus(`Downloading ${entry.name}…`);
		const res = await fetch(ADDONS_URL + entry.file + '?_=' + Date.now(), { cache: 'no-cache' });
		if (!res.ok) throw new Error(`download failed (${res.status})`);
		const bytes = new Uint8Array(await res.arrayBuffer());
		dir = await extDirHandle.getDirectoryHandle('addons', { create: true });
		addonsStatus('Saving…');
		await writeFileTo(dir, ADDON_STAGE, JSON.stringify(await packRelease({ [entry.file]: bytes }, entry.version)));
		addonsStatus('Checking…');
		const { files, problems } = await unpackRelease(JSON.parse(new TextDecoder().decode(await readBytesFrom(dir, ADDON_STAGE))));
		if (!files[entry.file]) problems.push('the file is missing');
		if (!problems.length) { const why = validateAddon(new TextDecoder().decode(files[entry.file]), entry.id); if (why) problems.push(why); }
		if (problems.length) throw new Error('it did not pass its checks (' + problems.join('; ') + '), so nothing was installed');
		await writeFileTo(dir, entry.file, files[entry.file]);
		if (await sha256Hex(await readBytesFrom(dir, entry.file)) !== await sha256Hex(files[entry.file])) throw new Error('the file was not saved correctly');
		try { await dir.removeEntry(ADDON_STAGE); } catch { /* already gone */ }
		lsSet('addonsInstalled', { ...addonsInstalled(), [entry.id]: { name: entry.name, version: entry.version, file: entry.file } });
		addonsStatus(`${entry.name} installed. Reloading…`);
		setTimeout(() => { if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) chrome.runtime.reload(); else location.reload(); }, 600);
	} catch (e) {
		if (dir) { try { await dir.removeEntry(ADDON_STAGE); } catch { /* nothing staged */ } }
		const box = document.getElementById('addonsStatus');
		box.replaceChildren(document.createTextNode(`Could not install ${entry.name}: ${e.message}`));
		if (e && (e.name === 'SecurityError' || /security|abort/i.test(String(e.message)))) {
			const a = el('a', 'contact-link', 'Download the file');
			a.href = ADDONS_URL + entry.file; a.target = '_blank'; a.rel = 'noopener noreferrer';
			box.append(document.createTextNode(' Chrome blocked saving it. '), a, document.createTextNode(' and put it in the addons folder inside the extension folder yourself.'));
		}
		addonBusy = false; renderAddons();
	}
}

async function removeAddon(id) {
	const meta = addonsInstalled()[id];
	if (!meta || addonBusy) return;
	try {
		if (extDirHandle && await extDirHandle.queryPermission({ mode: 'readwrite' }) === 'granted') {
			const dir = await extDirHandle.getDirectoryHandle('addons');
			try { await dir.removeEntry(meta.file); } catch { /* file already gone */ }
		}
	} catch { /* no addons folder */ }
	const next = addonsInstalled(); delete next[id]; lsSet('addonsInstalled', next);
	addonsStatus('Removed. Reloading…');
	setTimeout(() => { if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) chrome.runtime.reload(); else location.reload(); }, 400);
}

function renderAddons() {
	const box = document.getElementById('addonsBox');
	const installed = addonsInstalled();
	const entries = new Map();
	for (const [id, m] of Object.entries(installed)) if (isAddonId(id) && isAddonFile(m?.file)) entries.set(id, { id, name: String(m.name || id), version: String(m.version || ''), file: m.file, description: '' });
	for (const c of addonCatalog || []) entries.set(c.id, { ...c });
	if (!entries.size) { box.replaceChildren(el('span', 'setting-hint', addonCatalog ? 'No add-ons available yet.' : 'Open this panel with an internet connection to see the available add-ons.')); return; }
	box.replaceChildren(...[...entries.values()].map((entry) => {
		const have = installed[entry.id];
		const item = el('div', 'addon-item');
		item.append(el('div', 'addon-name', entry.name + (have?.version ? ' · v' + have.version : entry.version ? ' · v' + entry.version : '')));
		if (entry.description) item.append(el('div', 'addon-desc', entry.description));
		if (addonErrors.has(entry.id)) item.append(el('div', 'addon-desc', 'Could not start: ' + addonErrors.get(entry.id)));
		const actions = el('div', 'addon-actions');
		if (!have) {
			const b = el('button', 'btn-link', 'Install'); b.disabled = addonBusy; b.onclick = () => installAddon(entry); actions.append(b);
		} else {
			if (addonCatalog && entry.version && compareVersions(entry.version, have.version || '0') > 0) {
				const u = el('button', 'btn-link', 'Update to v' + entry.version); u.disabled = addonBusy; u.onclick = () => installAddon(entry); actions.append(u);
			}
			const r = el('button', 'btn-link', 'Remove'); r.disabled = addonBusy; r.onclick = () => removeAddon(entry.id); actions.append(r);
		}
		item.append(actions);
		if (have && addonSettingsEls.has(entry.id)) item.append(addonSettingsEls.get(entry.id));
		return item;
	}));
}

async function loadAddonCatalog() {
	try {
		const res = await fetch(ADDONS_URL + 'addons.json?_=' + Date.now(), { cache: 'no-cache' });
		if (!res.ok) throw new Error('catalog ' + res.status);
		const json = await res.json();
		addonCatalog = (Array.isArray(json.addons) ? json.addons : []).filter((a) => a && isAddonId(a.id) && isAddonFile(a.file) && typeof a.name === 'string' && typeof a.version === 'string')
			.map((a) => ({ id: a.id, name: a.name.slice(0, 40), version: a.version, file: a.file, description: typeof a.description === 'string' ? a.description.slice(0, 300) : '' }));
		addonsStatus('');
	} catch { addonCatalog = null; addonsStatus('Could not load the list of add-ons.'); }
	renderAddons();
}

// Starts the add-ons that are installed. A broken add-on never stops the page.
async function initAddons() {
	for (const [id, meta] of Object.entries(addonsInstalled())) {
		if (!isAddonId(id) || !isAddonFile(meta?.file)) continue;
		const box = el('div', 'addon-settings');
		addonSettingsEls.set(id, box);
		try {
			const mod = await import('./addons/' + meta.file);
			if (!mod.default || mod.default.id !== id || typeof mod.default.init !== 'function') throw new Error('not a valid add-on');
			addonLive.set(id, mod.default.init(makeAddonApi(id, box)) || {});
		} catch (e) {
			addonErrors.set(id, /Failed to fetch|Cannot find|Unable to resolve|error loading/i.test(String(e.message)) ? 'its file is missing from the addons folder' : String(e.message).slice(0, 120));
			console.warn('[NewTab] add-on failed:', id, e);
		}
	}
	renderAddons();
}

loadLogo();
setEngine(localStorage.getItem('preferredEngine') || 'google');
renderEngineSettings();
applyVisibility();
buildVisibilityBox();
syncWeatherSettings();
loadWeather(false);
setInterval(() => loadWeather(false), WEATHER_TTL_MS);
renderShortcuts();
loadNews();
loadWorld();
renderAddons();
initAddons();

// On load: silently connect to stored folder, check for notifications and auto-updates.
// Uses only queryPermission — no user gesture needed for extension pages in Chrome.
getHandle().then(async (handle) => {
	if (!handle) return;
	const perm = await handle.queryPermission({ mode: 'readwrite' });
	if (perm !== 'granted') return;
	extDirHandle = handle;
	await silentUpdateCheck();
}).catch(() => {});

// ─── Event bindings ───────────────────────────────────────────────────────
document.getElementById('settingsBtn').onclick = () => {
	document.getElementById('settingsSidebar').classList.add('open');
	checkFolderAccess();
	if (!addonCatalog) loadAddonCatalog();
};
document.getElementById('closeSidebarBtn').onclick = () => document.getElementById('settingsSidebar').classList.remove('open');

// "input" fires while dragging in the colour picker, so the preview is live
document.getElementById('bgTopInput').addEventListener('input', () => applyGradient(true));
document.getElementById('bgBottomInput').addEventListener('input', () => applyGradient(true));
document.getElementById('bgDirectionInput').addEventListener('change', () => applyGradient(true));

document.getElementById('bgPowerInput').oninput = (e) => {
	document.getElementById('bgPowerValue').textContent = e.target.value;
	applyGradient(true);
};
document.getElementById('bgStepsInput').oninput = (e) => {
	document.getElementById('bgStepsValue').textContent = e.target.value;
	applyGradient(true);
};

document.getElementById('bgResetBtn').onclick = resetBackground;

// Picture background and theme
document.getElementById('bgModeInput').onchange = (e) => {
	localStorage.setItem('bgMode', e.target.value);
	syncBackgroundMode(); paintBackground();
};
document.getElementById('bgFileInput').onchange = async (e) => {
	const file = e.target.files[0];
	e.target.value = '';
	const status = document.getElementById('bgPictureStatus');
	if (!file) return;
	if (!file.type.startsWith('image/')) { status.textContent = 'That file is not a picture'; return; }
	if (file.size > 25 * 1024 * 1024) { status.textContent = 'Picture is over 25 MB'; return; }
	try {
		await bgDbSet(file);
		localStorage.removeItem('bgImageUrl');
		localStorage.removeItem('bgPreset');
		localStorage.setItem('bgMode', 'picture');
		syncBackgroundMode(); await loadPictureSource();
	} catch { status.textContent = 'Could not save the picture'; }
};
document.getElementById('bgImageUrlApply').onclick = async () => {
	const url = safeHttpsUrl(document.getElementById('bgImageUrlInput').value.trim());
	const status = document.getElementById('bgPictureStatus');
	if (!url) { status.textContent = 'Enter a full https:// address'; return; }
	localStorage.setItem('bgImageUrl', url);
	localStorage.removeItem('bgPreset');
	localStorage.setItem('bgMode', 'picture');
	try { await bgDbSet(null); } catch { /* nothing stored */ }
	syncBackgroundMode(); await loadPictureSource();
};
document.getElementById('bgPictureRemove').onclick = async () => {
	localStorage.removeItem('bgImageUrl');
	localStorage.removeItem('bgPreset');
	try { await bgDbSet(null); } catch { /* nothing stored */ }
	await loadPictureSource();
};
document.getElementById('bgPresetGrid').replaceChildren(...BG_PRESETS.map((p) => {
	const b = el('button', 'preset-swatch');
	b.dataset.id = p.id; b.title = p.name; b.setAttribute('aria-label', p.name + ' background');
	b.style.background = p.css;
	b.append(el('span', null, p.name));
	b.onclick = async () => {
		localStorage.setItem('bgPreset', p.id);
		localStorage.removeItem('bgImageUrl');
		localStorage.setItem('bgMode', 'picture');
		try { await bgDbSet(null); } catch { /* nothing stored */ }
		syncBackgroundMode(); await loadPictureSource();
	};
	return b;
}));
document.getElementById('bgDimInput').oninput = (e) => {
	localStorage.setItem('bgDim', e.target.value);
	document.getElementById('bgDimValue').textContent = e.target.value + '%';
	paintBackground();
};
document.getElementById('themeInput').onchange = (e) => {
	localStorage.setItem('theme', e.target.value);
	applyTheme();
};
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (localStorage.getItem('theme') === 'system') applyTheme(); });

// Logo colour controls
logoOutlineInput.addEventListener('input', () => {
	localStorage.setItem('logoOutline', logoOutlineInput.value);
	refreshLogo();
});
logoFillInput.addEventListener('input', () => {
	localStorage.setItem('logoFill', logoFillInput.value);
	refreshLogo();
});
logoMatchToggle.addEventListener('change', () => {
	localStorage.setItem('logoMatchBg', logoMatchToggle.checked ? '1' : '0');
	syncLogoControls();
	refreshLogo();
});
document.getElementById('logoResetBtn').onclick = resetLogoColours;

document.getElementById('btnLinkFolder').onclick = linkExtensionFolder;
document.getElementById('extUpdateToggle').onchange = toggleAutoUpdate;

// stopPropagation: otherwise the click bubbles to window.onclick below, which
// closes the dropdown again in the same click (it could never be seen open).
document.querySelector('.engine-switcher').onclick = (e) => {
	e.stopPropagation();
	document.getElementById('shortcutContextMenu').style.display = 'none';
	const menu = document.getElementById('engineDropdown');
	menu.classList.toggle('show');
	if (menu.classList.contains('show')) {   // never taller than the room left on screen; the rest scrolls
		menu.style.maxHeight = Math.max(140, window.innerHeight - menu.getBoundingClientRect().top - 16) + 'px';
		menu.scrollTop = 0;
	}
};
document.getElementById('userQuery').addEventListener('input', previewEngineIcon);
document.getElementById('engineAddBtn').onclick = addCustomEngine;

// Weather and backup controls
document.getElementById('weatherToggle').onchange = (e) => setWeatherEnabled(e.target.checked);
document.getElementById('weatherBtn').onclick = (e) => {
	e.stopPropagation();
	if (document.getElementById('weatherCard').hidden) openWeatherCard(); else closeWeatherCard();
};
document.getElementById('weatherCard').onclick = (e) => e.stopPropagation();   // clicks inside the card must not close it
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWeatherCard(); });
document.getElementById('weatherCityBtn').onclick = findWeatherCity;
document.getElementById('weatherCityInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') findWeatherCity(); });
document.getElementById('weatherUnitInput').onchange = (e) => { localStorage.setItem('weatherUnit', e.target.value); loadWeather(true); };
document.getElementById('exportBtn').onclick = exportSettings;
document.getElementById('importFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importSettings(f); };

// While dragging a shortcut near the top or bottom edge of a scrolling grid, scroll it
document.getElementById('shortcutsGrid').addEventListener('dragover', (e) => {
	const grid = e.currentTarget, r = grid.getBoundingClientRect();
	if (grid.scrollHeight <= grid.clientHeight) return;
	if (e.clientY < r.top + 36) grid.scrollTop -= 14;
	else if (e.clientY > r.bottom - 36) grid.scrollTop += 14;
});

// Shortcut dialog
document.getElementById('advancedToggle').onclick = () => {
	setAdvancedOpen(document.getElementById('advancedSection').hidden);
};
document.querySelector('.btn-cancel').onclick = () => document.getElementById('addShortcutModal').close();
document.querySelector('.btn-save').onclick = () => {
	const url = normalizeUrl(document.getElementById('shortcutUrl').value);
	if (!url) { document.getElementById('shortcutUrl').focus(); return; }

	let name = document.getElementById('shortcutName').value.trim();
	if (!name) {
		try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { name = url; }
	}

	const sc = safeParseShortcuts();
	const editIndex = document.getElementById('editShortcutIndex').value;
	const newShortcut = {
		name,
		url,
		icon: document.getElementById('shortcutIcon').value.trim()
	};

	if (editIndex !== '') {
		sc[Number(editIndex)] = newShortcut;
	} else {
		sc.push(newShortcut);
	}

	localStorage.setItem('shortcuts', JSON.stringify(sc));
	renderShortcuts();
	document.getElementById('addShortcutModal').close();
};

// Changelog dialog (also reachable any time from Settings → About)
document.getElementById('viewChangelogBtn').onclick = async () => {
	let releases = [];
	try {   // this page's own copy first (works offline), then the server's
		const res = await fetch('Changelog.json');
		if (res.ok) releases = (await res.json()).releases || [];
	} catch { /* fall through */ }
	if (!releases.length) releases = await readChangelog(false);
	const sorted = releases.filter((r) => r && isVersionString(r.version)).sort((a, b) => compareVersions(b.version, a.version));   // newest first
	openChangelog(sorted, 'Changelog', null, false);
};
document.getElementById('changelogCloseBtn').onclick = () => document.getElementById('changelogModal').close();
document.getElementById('changelogModal').addEventListener('click', (e) => {
	const modal = e.currentTarget;
	const r = modal.getBoundingClientRect();
	const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
	if (!inside) modal.close();   // click on the backdrop
});

// News panel, settings toggle and keyboard
newsEls.btn.onclick = () => (newsEls.panel.classList.contains('open') ? closeNews() : openNews());
document.getElementById('closeNewsBtn').onclick = closeNews;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNews(); });
document.getElementById('tabDev').onclick = () => setNewsTab('dev');
document.getElementById('tabWorld').onclick = () => { setNewsTab('world'); renderWorld(); };
const srcBox = document.getElementById('worldSourceBox');
srcBox.replaceChildren(...WORLD_SOURCES.map((s) => {
	const label = el('div', 'setting-row');
	const cb = el('input'); cb.type = 'checkbox'; cb.value = s.id;
	cb.onchange = () => {
		const ids = Array.from(srcBox.querySelectorAll('input:checked')).map((i) => i.value);
		lsSet('worldSources', ids); loadWorld();
	};
	const sw = el('label', 'toggle');   // same switch look as the other settings
	sw.append(cb, el('div', 'toggle-track'), el('div', 'toggle-thumb'));
	const name = el('span', 'setting-label src-name');
	name.append(srcLogo(s.id), document.createTextNode(s.name));
	label.append(name, sw);
	return label;
}));
document.getElementById('worldToggle').onchange = (e) => {
	localStorage.setItem('worldEnabled', e.target.checked ? '1' : '0');
	syncWorldSettings(); updateNewsBtn(); loadWorld();
};
syncWorldSettings();
newsEls.toggle.checked = newsEnabled();
newsEls.toggle.onchange = () => {
	localStorage.setItem('newsEnabled', newsEls.toggle.checked ? '1' : '0');
	if (newsEls.toggle.checked) loadNews(); else hideNewsUi();
	updateNewsBtn();
};

window.onclick = () => {
	closeWeatherCard();
	document.getElementById('engineDropdown').classList.remove('show');
	document.getElementById('shortcutContextMenu').style.display = 'none';
};

document.getElementById('menuEditBtn').onclick = () => {
	if (safeParseShortcuts()[activeShortcutIndex]) openShortcutModal(activeShortcutIndex);
	document.getElementById('shortcutContextMenu').style.display = 'none';
};

document.getElementById('menuDeleteBtn').onclick = () => {
	const sc = safeParseShortcuts();
	sc.splice(activeShortcutIndex, 1);
	localStorage.setItem('shortcuts', JSON.stringify(sc));
	renderShortcuts();
};

document.getElementById('searchForm').onsubmit = (e) => {
	e.preventDefault();
	const raw = document.getElementById('userQuery').value.trim();
	if (!raw) return;
	if (raw.includes('.') && !raw.includes(' ')) {   // looks like a web address: go straight there
		window.location.href = raw.startsWith('http') ? raw : 'https://' + raw;
		return;
	}
	const { engine, query } = resolveSearch(raw);
	window.location.href = engine.url.split('%s').join(encodeURIComponent(query));
};
