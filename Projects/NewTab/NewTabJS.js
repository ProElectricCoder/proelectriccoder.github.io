import { cubicGradient } from './CubicGradient.js';

// ─── Single source of truth for engine SVGs ───────────────────────────────
const engineSvgs = {
	google: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16"><g fill="none" fill-rule="evenodd" clip-rule="evenodd"><path fill="#F44336" d="M7.209 1.061c.725-.081 1.154-.081 1.933 0a6.57 6.57 0 0 1 3.65 1.82a100 100 0 0 0-1.986 1.93q-1.876-1.59-4.188-.734q-1.696.78-2.362 2.528a78 78 0 0 1-2.148-1.658a.26.26 0 0 0-.16-.027q1.683-3.245 5.26-3.86" opacity=".987"/><path fill="#FFC107" d="M1.946 4.92q.085-.013.161.027a78 78 0 0 0 2.148 1.658A7.6 7.6 0 0 0 4.04 7.99q.037.678.215 1.331L2 11.116Q.527 8.038 1.946 4.92" opacity=".997"/><path fill="#448AFF" d="M12.685 13.29a26 26 0 0 0-2.202-1.74q1.15-.812 1.396-2.228H8.122V6.713q3.25-.027 6.497.055q.616 3.345-1.423 6.032a7 7 0 0 1-.51.49" opacity=".999"/><path fill="#43A047" d="M4.255 9.322q1.23 3.057 4.51 2.854a3.94 3.94 0 0 0 1.718-.626q1.148.812 2.202 1.74a6.62 6.62 0 0 1-4.027 1.684a6.4 6.4 0 0 1-1.02 0Q3.82 14.524 2 11.116z" opacity=".993"/></g></svg>`,
	bing: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 388"><defs><radialGradient id="logosBing0" cx="93.717%" cy="77.818%" r="143.121%" fx="93.717%" fy="77.818%"><stop offset="0%" stop-color="#00CACC"/><stop offset="100%" stop-color="#048FCE"/></radialGradient><radialGradient id="logosBing1" cx="13.893%" cy="71.448%" r="150.086%" fx="13.893%" fy="71.448%"><stop offset="0%" stop-color="#00BBEC"/><stop offset="100%" stop-color="#2756A9"/></radialGradient><linearGradient id="logosBing2" x1="50%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#00BBEC"/><stop offset="100%" stop-color="#2756A9"/></linearGradient></defs><path fill="url(#logosBing0)" d="M129.424 122.047c-7.133.829-12.573 6.622-13.079 13.928c-.218 3.147-.15 3.36 6.986 21.722c16.233 41.774 20.166 51.828 20.827 53.243c1.603 3.427 3.856 6.65 6.672 9.544c2.16 2.22 3.585 3.414 5.994 5.024c4.236 2.829 6.337 3.61 22.818 8.49c16.053 4.754 24.824 7.913 32.381 11.664c9.791 4.86 16.623 10.387 20.944 16.946c3.1 4.706 5.846 13.145 7.04 21.64c.468 3.321.47 10.661.006 13.663c-1.008 6.516-3.021 11.976-6.101 16.545c-1.638 2.43-1.068 2.023 1.313-.939c6.74-8.379 13.605-22.7 17.108-35.687c4.24-15.718 4.817-32.596 1.66-48.57c-6.147-31.108-25.786-57.955-53.444-73.06c-1.738-.95-8.357-4.42-17.331-9.085a1633.23 1633.23 0 0 1-4.127-2.154c-.907-.477-2.764-1.447-4.126-2.154c-1.362-.708-5.282-2.75-8.711-4.539l-8.528-4.446a6021.14 6021.14 0 0 1-8.344-4.357c-8.893-4.655-12.657-6.537-13.73-6.863c-1.125-.343-3.984-.782-4.701-.723c-.152.012-.838.088-1.527.168Z"/><path fill="url(#logosBing1)" d="M148.81 277.994c-.493.292-1.184.714-1.537.938c-.354.225-1.137.712-1.743 1.083a8315.383 8315.383 0 0 0-13.204 8.137a2847.83 2847.83 0 0 0-8.07 4.997a388.04 388.04 0 0 1-3.576 2.198c-.454.271-2.393 1.465-4.31 2.654a2651.466 2651.466 0 0 1-7.427 4.586a3958.037 3958.037 0 0 0-8.62 5.316a3011.146 3011.146 0 0 1-7.518 4.637c-1.564.959-3.008 1.885-3.21 2.058c-.3.257-14.205 8.87-21.182 13.121c-5.3 3.228-11.43 5.387-17.705 6.235c-2.921.395-8.45.396-11.363.003c-7.9-1.067-15.176-4.013-21.409-8.666c-2.444-1.826-7.047-6.425-8.806-8.8c-4.147-5.598-6.829-11.602-8.218-18.396c-.32-1.564-.622-2.884-.672-2.935c-.13-.13.105 2.231.528 5.319c.44 3.211 1.377 7.856 2.387 11.829c7.814 30.743 30.05 55.749 60.15 67.646c8.668 3.424 17.415 5.582 26.932 6.64c3.576.4 13.699.56 17.43.276c17.117-1.296 32.02-6.334 47.308-15.996c1.362-.86 3.92-2.474 5.685-3.585a877.227 877.227 0 0 0 4.952-3.14c.958-.615 2.114-1.341 2.567-1.614a91.312 91.312 0 0 0 2.018-1.268c.656-.424 3.461-2.2 6.235-3.944l11.092-7.006l3.809-2.406l.137-.086l.42-.265l.199-.126l2.804-1.771l9.69-6.121c12.348-7.759 16.03-10.483 21.766-16.102c2.392-2.342 5.997-6.34 6.176-6.848c.037-.104.678-1.092 1.424-2.197c3.036-4.492 5.06-9.995 6.064-16.484c.465-3.002.462-10.342-.005-13.663c-.903-6.42-2.955-13.702-5.167-18.339c-3.627-7.603-11.353-14.512-22.453-20.076c-3.065-1.537-6.23-2.943-6.583-2.924c-.168.009-10.497 6.322-22.954 14.03c-12.457 7.71-23.268 14.4-24.025 14.87a289.98 289.98 0 0 1-2.888 1.764l-7.128 4.42Z"/><path fill="url(#logosBing2)" d="m.053 241.013l.054 53.689l.695 3.118c2.172 9.747 5.937 16.775 12.482 23.302c3.078 3.07 5.432 4.922 8.768 6.896c7.06 4.177 14.657 6.238 22.978 6.235c8.716-.005 16.256-2.179 24.025-6.928c1.311-.801 6.449-3.964 11.416-7.029l9.032-5.572v-127.4l-.002-58.273c-.002-37.177-.07-59.256-.188-60.988c-.74-10.885-5.293-20.892-12.948-28.461c-2.349-2.323-4.356-3.875-10.336-7.99a25160.08 25160.08 0 0 1-12.104-8.336A186532.885 186532.885 0 0 0 28.617 5.835C22.838 1.85 22.386 1.574 20.639.949C18.367.136 15.959-.163 13.67.084C6.998.804 1.657 5.622.269 12.171C.053 13.191.013 26.751.01 100.35l-.003 86.975H0l.053 53.688Z"/></svg>`
};

// Inject SVGs into dropdown items (single reference point)
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

// ─── Shortcuts ────────────────────────────────────────────────────────────
function renderShortcuts() {
	const grid = document.getElementById('shortcutsGrid');
	grid.innerHTML = '';
	const shortcuts = safeParseShortcuts();

	shortcuts.forEach((s, i) => {
		const item = document.createElement('div');
		item.className = 'shortcut-item';
		item.draggable = true;
		item.innerHTML = `
			<div class="shortcut-icon-wrapper"><img class="shortcut-icon" src="${s.icon || 'https://icons.duckduckgo.com/ip3/' + s.url.replace(/^https?:\/\//, '').split('/')[0] + '.ico'}" alt=""></div>
			<span class="shortcut-label">${s.name}</span>
			<div class="option-btn">⋮</div>
		`;
		item.onclick = () => window.open(s.url);
		item.addEventListener('dragstart', () => draggedIndex = i);
		item.addEventListener('dragover', (e) => e.preventDefault());
		item.addEventListener('drop', () => {
			const sc = safeParseShortcuts();
			const moved = sc.splice(draggedIndex, 1)[0];
			sc.splice(i, 0, moved);
			localStorage.setItem('shortcuts', JSON.stringify(sc));
			renderShortcuts();
		});
		item.querySelector('.option-btn').addEventListener('click', (e) => {
			e.stopPropagation();
			activeShortcutIndex = i;
			const menu = document.getElementById('shortcutContextMenu');
			menu.style.display = 'flex';
			menu.style.top = e.clientY + 'px';
			menu.style.left = e.clientX + 'px';
		});

		grid.appendChild(item); // ← was missing
	});

	const add = document.createElement('div');
	add.className = 'add-shortcut-btn';
	add.innerHTML = '<div class="shortcut-icon-wrapper">+</div><span class="shortcut-label">Add</span>';
	add.onclick = () => {
		document.getElementById('modalTitle').textContent = 'Add Shortcut';
		document.getElementById('shortcutName').value = '';
		document.getElementById('shortcutUrl').value = '';
		document.getElementById('shortcutIcon').value = '';
		document.getElementById('addShortcutModal').showModal();
	};
	grid.appendChild(add);
}

// ─── Init ─────────────────────────────────────────────────────────────────
updateClock();
setInterval(updateClock, 1000);
loadBackground();
setEngine(localStorage.getItem('preferredEngine') || 'google');
renderShortcuts();

// ─── Event bindings ───────────────────────────────────────────────────────
document.getElementById('settingsBtn').onclick     = () => document.getElementById('settingsSidebar').classList.add('open');
document.getElementById('closeSidebarBtn').onclick = () => document.getElementById('settingsSidebar').classList.remove('open');

document.getElementById('bgTopInput').onchange       = applyGradient;
document.getElementById('bgBottomInput').onchange    = applyGradient;
document.getElementById('bgDirectionInput').onchange = applyGradient;

document.getElementById('bgPowerInput').oninput = (e) => {
	document.getElementById('bgPowerValue').textContent = e.target.value;
	applyGradient();
};
document.getElementById('bgStepsInput').oninput = (e) => {
	document.getElementById('bgStepsValue').textContent = e.target.value;
	applyGradient();
};

document.querySelector('.reset-btn').onclick = resetBackground;

document.querySelector('.engine-switcher').onclick  = () => document.getElementById('engineDropdown').classList.toggle('show');
document.getElementById('engineGoogle').onclick = () => { setEngine('google'); document.getElementById('engineDropdown').classList.remove('show'); };
document.getElementById('engineBing').onclick   = () => { setEngine('bing');   document.getElementById('engineDropdown').classList.remove('show'); };

document.querySelector('.btn-cancel').onclick = () => document.getElementById('addShortcutModal').close();
document.querySelector('.btn-save').onclick = () => {
	const sc = safeParseShortcuts();
	sc.push({
		name: document.getElementById('shortcutName').value,
		url:  document.getElementById('shortcutUrl').value,
		icon: document.getElementById('shortcutIcon').value
	});
	localStorage.setItem('shortcuts', JSON.stringify(sc));
	renderShortcuts();
	document.getElementById('addShortcutModal').close();
};

window.onclick = () => {
	document.getElementById('engineDropdown').classList.remove('show');
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