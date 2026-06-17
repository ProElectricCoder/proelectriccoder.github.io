import { S }      from './state.js';
import { THEMES } from './constants.js';

// ── CSS variable helpers ───────────────────────────────────────────────────
export function rgba(hex, a) {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r},${g},${b},${a})`;
}

// ── Gradient computation ───────────────────────────────────────────────────
export function computeGrad(endColor, power = 2.5, steps = 20, direction = 'to bottom right', startColor = '#000000') {
	if (!S.cubicGradFn)
		return `linear-gradient(${direction},${startColor},${endColor})`;
	return S.cubicGradFn({ direction, start: startColor, end: endColor, steps, power }).css;
}

// ── Theme application ──────────────────────────────────────────────────────
export function applyTheme(themeId, sess = null, animate = true) {
	const th  = THEMES[themeId] || THEMES.void;
	const root = document.documentElement;
	root.style.setProperty('--tp',  th.primary);
	root.style.setProperty('--ts',  th.secondary);
	root.style.setProperty('--ta',  th.accent);
	root.style.setProperty('--tb',  rgba(th.primary, .12));
	root.style.setProperty('--tbh', rgba(th.primary, .28));
	root.style.setProperty('--tbg', rgba(th.primary, .11));
	root.style.setProperty('--tbb', rgba(th.primary, .18));
	root.style.setProperty('--tg',  rgba(th.primary, .25));

	const bgE   = sess?.bg?.endColor   || th.gradEnd;
	const bgSt  = sess?.bg?.startColor || '#000000';
	const bgP   = sess?.bg?.power      ?? 2.5;
	const bgS   = sess?.bg?.steps      ?? 20;
	const bgDir = sess?.bg?.direction  || 'to bottom right';
	const grad  = computeGrad(bgE, bgP, bgS, bgDir, bgSt);

	const bg1 = document.getElementById('gradBg1');
	const bg2 = document.getElementById('gradBg2');
	if (!bg1 || !bg2 || !animate) { if (bg1) bg1.style.background = grad; return; }

	if (S.gradActive === 1) {
		bg2.style.background = grad;
		requestAnimationFrame(() => { bg2.style.opacity = '1'; });
		setTimeout(() => {
			bg1.style.transition = 'none'; bg1.style.opacity = '0';
			setTimeout(() => { bg1.style.transition = ''; }, 50);
			S.gradActive = 2;
		}, 460);
	} else {
		bg1.style.background = grad;
		requestAnimationFrame(() => { bg1.style.opacity = '1'; });
		setTimeout(() => {
			bg2.style.transition = 'none'; bg2.style.opacity = '0';
			setTimeout(() => { bg2.style.transition = ''; }, 50);
			S.gradActive = 1;
		}, 460);
	}
}

// ── Direction picker grid ──────────────────────────────────────────────────
export const DIR_GRID = [
	['to top left',     '↖'], ['to top',    '↑'], ['to top right',     '↗'],
	['to left',         '←'],  null,               ['to right',         '→'],
	['to bottom left',  '↙'], ['to bottom', '↓'], ['to bottom right',  '↘'],
];

export function makeDirGrid(cur) {
	return DIR_GRID.map(d =>
		d === null
			? '<div style="width:36px;height:36px"></div>'
			: `<button class="bg-dir-btn${d[0] === cur ? ' active' : ''}" onclick="App.setBgDir('${d[0]}')" title="${d[0]}">${d[1]}</button>`,
	).join('');
}
