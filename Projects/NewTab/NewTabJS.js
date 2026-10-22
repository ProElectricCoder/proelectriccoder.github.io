import { cubicGradient } from './CubicGradient.js';

// ─── Single source of truth for engine SVGs ───────────────────────────────
const engineSvgs = {
	google: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16"><g fill="none" fill-rule="evenodd" clip-rule="evenodd"><path fill="#F44336" d="M7.209 1.061c.725-.081 1.154-.081 1.933 0a6.57 6.57 0 0 1 3.65 1.82a100 100 0 0 0-1.986 1.93q-1.876-1.59-4.188-.734q-1.696.78-2.362 2.528a78 78 0 0 1-2.148-1.658a.26.26 0 0 0-.16-.027q1.683-3.245 5.26-3.86" opacity=".987"/><path fill="#FFC107" d="M1.946 4.92q.085-.013.161.027a78 78 0 0 0 2.148 1.658A7.6 7.6 0 0 0 4.04 7.99q.037.678.215 1.331L2 11.116Q.527 8.038 1.946 4.92" opacity=".997"/><path fill="#448AFF" d="M12.685 13.29a26 26 0 0 0-2.202-1.74q1.15-.812 1.396-2.228H8.122V6.713q3.25-.027 6.497.055q.616 3.345-1.423 6.032a7 7 0 0 1-.51.49" opacity=".999"/><path fill="#43A047" d="M4.255 9.322q1.23 3.057 4.51 2.854a3.94 3.94 0 0 0 1.718-.626q1.148.812 2.202 1.74a6.62 6.62 0 0 1-4.027 1.684a6.4 6.4 0 0 1-1.02 0Q3.82 14.524 2 11.116z" opacity=".993"/></g></svg>`,
	bing: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 388"><defs><radialGradient id="logosBing0" cx="93.717%" cy="77.818%" r="143.121%" fx="93.717%" fy="77.818%"><stop offset="0%" stop-color="#00CACC"/><stop offset="100%" stop-color="#048FCE"/></radialGradient><radialGradient id="logosBing1" cx="13.893%" cy="71.448%" r="150.086%" fx="13.893%" fy="71.448%"><stop offset="0%" stop-color="#00BBEC"/><stop offset="100%" stop-color="#2756A9"/></radialGradient><linearGradient id="logosBing2" x1="50%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#00BBEC"/><stop offset="100%" stop-color="#2756A9"/></linearGradient></defs><path fill="url(#logosBing0)" d="M129.424 122.047c-7.133.829-12.573 6.622-13.079 13.928c-.218 3.147-.15 3.36 6.986 21.722c16.233 41.774 20.166 51.828 20.827 53.243c1.603 3.427 3.856 6.65 6.672 9.544c2.16 2.22 3.585 3.414 5.994 5.024c4.236 2.829 6.337 3.61 22.818 8.49c16.053 4.754 24.824 7.913 32.381 11.664c9.791 4.86 16.623 10.387 20.944 16.946c3.1 4.706 5.846 13.145 7.04 21.64c.468 3.321.47 10.661.006 13.663c-1.008 6.516-3.021 11.976-6.101 16.545c-1.638 2.43-1.068 2.023 1.313-.939c6.74-8.379 13.605-22.7 17.108-35.687c4.24-15.718 4.817-32.596 1.66-48.57c-6.147-31.108-25.786-57.955-53.444-73.06c-1.738-.95-8.357-4.42-17.331-9.085a1633.23 1633.23 0 0 1-4.127-2.154c-.907-.477-2.764-1.447-4.126-2.154c-1.362-.708-5.282-2.75-8.711-4.539l-8.528-4.446a6021.14 6021.14 0 0 1-8.344-4.357c-8.893-4.655-12.657-6.537-13.73-6.863c-1.125-.343-3.984-.782-4.701-.723c-.152.012-.838.088-1.527.168Z"/><path fill="url(#logosBing1)" d="M148.81 277.994c-.493.292-1.184.714-1.537.938c-.354.225-1.137.712-1.743 1.083a8315.383 8315.383 0 0 0-13.204 8.137a2847.83 2847.83 0 0 0-8.07 4.997a388.04 388.04 0 0 1-3.576 2.198c-.454.271-2.393 1.465-4.31 2.654a2651.466 2651.466 0 0 1-7.427 4.586a3958.037 3958.037 0 0 0-8.62 5.316a3011.146 3011.146 0 0 1-7.518 4.637c-1.564.959-3.008 1.885-3.21 2.058c-.3.257-14.205 8.87-21.182 13.121c-5.3 3.228-11.43 5.387-17.705 6.235c-2.921.395-8.45.396-11.363.003c-7.9-1.067-15.176-4.013-21.409-8.666c-2.444-1.826-7.047-6.425-8.806-8.8c-4.147-5.598-6.829-11.602-8.218-18.396c-.32-1.564-.622-2.884-.672-2.935c-.13-.13.105 2.231.528 5.319c.44 3.211 1.377 7.856 2.387 11.829c7.814 30.743 30.05 55.749 60.15 67.646c8.668 3.424 17.415 5.582 26.932 6.64c3.576.4 13.699.56 17.43.276c17.117-1.296 32.02-6.334 47.308-15.996c1.362-.86 3.92-2.474 5.685-3.585a877.227 877.227 0 0 0 4.952-3.14c.958-.615 2.114-1.341 2.567-1.614a91.312 91.312 0 0 0 2.018-1.268c.656-.424 3.461-2.2 6.235-3.944l11.092-7.006l3.809-2.406l.137-.086l.42-.265l.199-.126l2.804-1.771l9.69-6.121c12.348-7.759 16.03-10.483 21.766-16.102c2.392-2.342 5.997-6.34 6.176-6.848c.037-.104.678-1.092 1.424-2.197c3.036-4.492 5.06-9.995 6.064-16.484c.465-3.002.462-10.342-.005-13.663c-.903-6.42-2.955-13.702-5.167-18.339c-3.627-7.603-11.353-14.512-22.453-20.076c-3.065-1.537-6.23-2.943-6.583-2.924c-.168.009-10.497 6.322-22.954 14.03c-12.457 7.71-23.268 14.4-24.025 14.87a289.98 289.98 0 0 1-2.888 1.764l-7.128 4.42Z"/><path fill="url(#logosBing2)" d="m.053 241.013l.054 53.689l.695 3.118c2.172 9.747 5.937 16.775 12.482 23.302c3.078 3.07 5.432 4.922 8.768 6.896c7.06 4.177 14.657 6.238 22.978 6.235c8.716-.005 16.256-2.179 24.025-6.928c1.311-.801 6.449-3.964 11.416-7.029l9.032-5.572v-127.4l-.002-58.273c-.002-37.177-.07-59.256-.188-60.988c-.74-10.885-5.293-20.892-12.948-28.461c-2.349-2.323-4.356-3.875-10.336-7.99a25160.08 25160.08 0 0 1-12.104-8.336A186532.885 186532.885 0 0 0 28.617 5.835C22.838 1.85 22.386 1.574 20.639.949C18.367.136 15.959-.163 13.67.084C6.998.804 1.657 5.622.269 12.171C.053 13.191.013 26.751.01 100.35l-.003 86.975H0l.053 53.688Z"/></svg>`
};

document.getElementById('engineGoogleIcon').innerHTML = engineSvgs.google;
document.getElementById('engineBingIcon').innerHTML = engineSvgs.bing;

// ─── Engine config ────────────────────────────────────────────────────────
const engines = {
	google: { action: 'https://www.google.com/search', placeholder: 'Search Google...', svg: engineSvgs.google },
	bing:   { action: 'https://www.bing.com/search',   placeholder: 'Search Bing...',   svg: engineSvgs.bing  }
};

let activeShortcutIndex = -1;
let draggedIndex = null;

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
	const engine = engines[engineKey];
	document.getElementById('searchForm').action = engine.action;
	document.getElementById('userQuery').placeholder = engine.placeholder;
	document.getElementById('currentEngineIconWrapper').innerHTML = engine.svg;
	localStorage.setItem('preferredEngine', engineKey);
}

// ─── Background / cubicGradient ───────────────────────────────────────────
function applyGradient() {
	const start     = document.getElementById('bgTopInput').value;
	const end       = document.getElementById('bgBottomInput').value;
	const direction = document.getElementById('bgDirectionInput').value;
	const power     = parseFloat(document.getElementById('bgPowerInput').value);
	const steps     = parseInt(document.getElementById('bgStepsInput').value, 10);
	document.body.style.background = cubicGradient({ direction, start, end, steps, power });
	localStorage.setItem('bgTop',       start);
	localStorage.setItem('bgBottom',    end);
	localStorage.setItem('bgDirection', direction);
	localStorage.setItem('bgPower',     power);
	localStorage.setItem('bgSteps',     steps);
	// Logo follows the background palette when "match background" is on
	if (logoMatchToggle.checked) refreshLogo();
}

function loadBackground() {
	const start     = localStorage.getItem('bgTop')       || '#000000';
	const end       = localStorage.getItem('bgBottom')    || '#000066';
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
	applyGradient();
}

function resetBackground() {
	document.getElementById('bgTopInput').value          = '#000000';
	document.getElementById('bgBottomInput').value       = '#000066';
	document.getElementById('bgDirectionInput').value    = 'to bottom right';
	document.getElementById('bgPowerInput').value        = '3';
	document.getElementById('bgStepsInput').value        = '20';
	document.getElementById('bgPowerValue').textContent  = '3';
	document.getElementById('bgStepsValue').textContent  = '20';
	applyGradient();
}

// ─── Logo colours ─────────────────────────────────────────────────────────
// The logo SVG is fetched, recoloured as text, and inlined so its two colours
// (outline + fill) can be changed from settings. Colours are detected from the
// SVG itself: the first distinct paint colour in the file is treated as the
// fill, the second as the outline. LOGO_SWAP_ROLES flips that for this logo,
// where the file lists fill (#0ff) before stroke (#03A).
const LOGO_SRC = 'ProElectricCoder-logo-website-2.svg';
// Flip if the outline and fill controls come out the wrong way round.
const LOGO_SWAP_ROLES = true;

const logoSlot         = document.getElementById('logoSlot');
const logoMatchToggle  = document.getElementById('logoMatchToggle');
const logoOutlineInput = document.getElementById('logoOutlineInput');
const logoFillInput    = document.getElementById('logoFillInput');

// Matches fill / stroke / stop-color in attributes, inline styles and <style> blocks
const LOGO_PAINT_RE = /\b(fill|stroke|stop-color)(\s*[:=]\s*["']?)(rgba?\([^)]*\)|[^"';}\s]+)/gi;
const LOGO_NON_COLOURS = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'context-fill', 'context-stroke']);

let logoSvgText = null;
let logoKeys = [];                                  // [outlineKey, fillKey] (normalised paint values)
let logoOriginal = { outline: '#ffffff', fill: '#ffffff' };

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

function recolorLogo(outline, fill) {
	const [outlineKey, fillKey] = logoKeys;
	return logoSvgText.replace(LOGO_PAINT_RE, (m, prop, sep, val) => {
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

function refreshLogo() {
	if (!logoSvgText) return;
	const { outline, fill } = currentLogoColours();
	const doc = new DOMParser().parseFromString(recolorLogo(outline, fill), 'image/svg+xml');
	const svg = doc.documentElement;
	if (svg.nodeName === 'parsererror' || svg.querySelector('parsererror')) return;

	// Make sure it scales like the old <img class="logo"> did
	if (!svg.hasAttribute('viewBox')) {
		const w = parseFloat(svg.getAttribute('width'));
		const h = parseFloat(svg.getAttribute('height'));
		if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
	}
	svg.removeAttribute('width');
	svg.removeAttribute('height');
	svg.setAttribute('class', 'logo');
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', 'Logo');
	logoSlot.replaceChildren(document.importNode(svg, true));
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
		const res = await fetch(LOGO_SRC);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		logoSvgText = await res.text();

		const { keys, firstRaw } = detectLogoPaints(logoSvgText);
		if (!keys.length) throw new Error('no fill/stroke colours found in SVG');
		logoKeys = LOGO_SWAP_ROLES ? keys.slice(0, 2).reverse() : keys.slice(0, 2);

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

// Updates.json is NOT in this list — it's managed separately to preserve local logs
const UPDATABLE_FILES = [
	'manifest.json', 'NewTab.html', 'NewTabJS.js', 'CubicGradient.js', 'Changelog.json',
	'ProElectricCoder-logo-website-1.svg', 'ProElectricCoder-logo-website-2.svg',
	'Icon16.png', 'Icon48.png', 'Icon128.png'
];

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

function openChangelog(releases, headline) {
	const modal = document.getElementById('changelogModal');
	document.getElementById('changelogTitle').textContent = headline;
	const body = document.getElementById('changelogBody');
	body.replaceChildren();

	releases.forEach((r) => {
		const block = document.createElement('div');
		block.className = 'cl-release';

		const head = document.createElement('div');
		head.className = 'cl-version';
		head.textContent = `v${r.version}`;
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
		.sort((a, b) => compareVersions(b.version, a.version));
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

	const latest = releases[0];
	const summary = latest.summary || (Array.isArray(latest.details) && latest.details[0]) || '';
	let line = summary ? `${headline} · ${summary}` : headline;
	if (releases.length > 1) line += ` (+${releases.length - 1} more)`;
	showUpdateToast(line, () => openChangelog(releases, headline));
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
	// Fetch all updatable files from remote
	const files = {};
	await Promise.all(UPDATABLE_FILES.map(async (name) => {
		const res = await fetch(REMOTE_BASE + name);
		if (!res.ok) throw new Error(`Fetch failed: ${name} (${res.status})`);
		files[name] = await res.blob();
	}));

	// Write each file to the linked folder
	for (const [name, blob] of Object.entries(files)) {
		const fh = await extDirHandle.getFileHandle(name, { create: true });
		const wr = await fh.createWritable();
		await wr.write(blob);
		await wr.close();
	}

	// Update Updates.json: append log entry, set notify for next load, preserve autoUpdate.
	// notify carries only the version range — the toast looks up what changed in Changelog.json.
	updatesData.log.push({
		timestamp: new Date().toLocaleString(),
		from: fromVersion,
		to: toVersion,
		note: 'Auto-updated by NewTab'
	});
	updatesData.notify = { from: fromVersion, to: toVersion };
	// autoUpdate stays as-is
	await writeUpdatesJson(updatesData);

	// Reload the extension — new files are now on disk, chrome.runtime.reload applies them
	if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) {
		chrome.runtime.reload();
	}
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

// ─── Init ─────────────────────────────────────────────────────────────────
updateClock();
setInterval(updateClock, 1000);
loadBackground();
loadLogo();
setEngine(localStorage.getItem('preferredEngine') || 'google');
renderShortcuts();

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
};
document.getElementById('closeSidebarBtn').onclick = () => document.getElementById('settingsSidebar').classList.remove('open');

// "input" fires while dragging in the colour picker, so the preview is live
document.getElementById('bgTopInput').addEventListener('input', applyGradient);
document.getElementById('bgBottomInput').addEventListener('input', applyGradient);
document.getElementById('bgDirectionInput').addEventListener('change', applyGradient);

document.getElementById('bgPowerInput').oninput = (e) => {
	document.getElementById('bgPowerValue').textContent = e.target.value;
	applyGradient();
};
document.getElementById('bgStepsInput').oninput = (e) => {
	document.getElementById('bgStepsValue').textContent = e.target.value;
	applyGradient();
};

document.getElementById('bgResetBtn').onclick = resetBackground;

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
	document.getElementById('engineDropdown').classList.toggle('show');
};
document.getElementById('engineGoogle').onclick = () => { setEngine('google'); document.getElementById('engineDropdown').classList.remove('show'); };
document.getElementById('engineBing').onclick   = () => { setEngine('bing');   document.getElementById('engineDropdown').classList.remove('show'); };

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

// Changelog dialog
document.getElementById('changelogCloseBtn').onclick = () => document.getElementById('changelogModal').close();
document.getElementById('changelogModal').addEventListener('click', (e) => {
	const modal = e.currentTarget;
	const r = modal.getBoundingClientRect();
	const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
	if (!inside) modal.close();   // click on the backdrop
});

window.onclick = () => {
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
	const q = document.getElementById('userQuery').value;
	if (q.includes('.') && !q.includes(' ')) {
		e.preventDefault();
		window.location.href = q.startsWith('http') ? q : 'https://' + q;
	}
};
