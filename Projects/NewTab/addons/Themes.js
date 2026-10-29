// Extra Themes add-on for Ampere: one-click colour presets for the page theme and gradient.
const PRESETS = [
	// id, name, theme, top, bottom, direction
	['midnight', 'Midnight', 'dark', '#000000', '#000066', 'to bottom right'],
	['sunset', 'Sunset', 'dark', '#2b0a3d', '#ff6a3d', 'to bottom'],
	['aurora', 'Aurora', 'dark', '#021b2b', '#1de9b6', 'to bottom right'],
	['ocean', 'Ocean', 'dark', '#001f3f', '#0074d9', 'to bottom'],
	['forest', 'Forest', 'dark', '#03140a', '#1b5e20', 'to bottom right'],
	['rose', 'Rose', 'dark', '#1a0510', '#c2185b', 'to bottom right'],
	['lavender', 'Lavender', 'dark', '#120a24', '#7e57c2', 'to bottom'],
	['ember', 'Ember', 'dark', '#140500', '#d84315', 'to top right'],
	['cyber', 'Cyberpunk', 'dark', '#0a0014', '#00e5ff', 'to bottom right'],
	['slate', 'Slate', 'dark', '#10141a', '#3a4658', 'to bottom'],
	['mono', 'Mono', 'dark', '#000000', '#2b2b2b', 'to bottom'],
	['desert', 'Desert', 'dark', '#2a1a08', '#c58b3c', 'to bottom'],
	['sky', 'Sky', 'light', '#ffffff', '#9ecbff', 'to bottom'],
	['mint', 'Mint', 'light', '#f4fffb', '#8fe3c3', 'to bottom right'],
	['peach', 'Peach', 'light', '#fff7f0', '#ffb59a', 'to bottom right'],
	['sakura', 'Sakura', 'light', '#fff5f8', '#f6a9c4', 'to bottom'],
	['paper', 'Paper', 'light', '#fbf8f1', '#e3d9c4', 'to bottom'],
	['lilac', 'Lilac', 'light', '#fbf8ff', '#c9b6f2', 'to bottom right']
];

const CSS = `
.th-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.th-item { display: flex; flex-direction: column; gap: 4px; align-items: stretch; padding: 0; border: 0; background: none; color: inherit; font: inherit; font-size: 0.7rem; text-align: center; cursor: pointer; }
.th-sw { height: 44px; border-radius: 8px; border: 2px solid rgba(255,255,255,0.18); }
.th-item.selected .th-sw { border-color: #5b8cff; box-shadow: 0 0 0 2px rgba(91,140,255,0.5); }
.th-item:hover .th-sw { border-color: rgba(255,255,255,0.6); }
html[data-theme="light"] .th-sw { border-color: rgba(0,0,0,0.2); }
`;

export default {
	id: 'themes',
	init(api) {
		const { el, storage } = api;
		api.addStyle(CSS);
		const box = api.settings;
		const grid = el('div', 'th-grid');
		const status = el('span', 'setting-hint', '');
		const items = new Map();
		const mark = () => { const cur = storage.get('current', null); for (const [id, b] of items) b.classList.toggle('selected', id === cur); };

		function apply(p) {
			const [id, name, theme, top, bottom, direction] = p;
			api.applyAppearance({ theme, top, bottom, direction, power: 3, steps: 20 });
			storage.set('current', id);
			status.textContent = name + ' applied';
			mark();
		}
		for (const p of PRESETS) {
			const b = el('button', 'th-item'); b.type = 'button'; b.title = p[1]; b.setAttribute('aria-label', 'Apply ' + p[1] + ' theme');
			const sw = el('div', 'th-sw'); sw.style.background = `linear-gradient(${p[5]}, ${p[3]}, ${p[4]})`;
			b.append(sw, el('span', null, p[1]));
			b.onclick = () => apply(p);
			items.set(p[0], b); grid.appendChild(b);
		}
		const random = el('button', 'btn-link', 'Surprise me');
		random.onclick = () => apply(PRESETS[Math.floor(Math.random() * PRESETS.length)]);
		const reset = el('button', 'btn-link', 'Back to default');
		reset.onclick = () => { api.applyAppearance(null); storage.set('current', null); status.textContent = 'Default theme restored'; mark(); };
		box.append(el('span', 'setting-hint', 'Pick a preset to set the theme and background gradient. You can still fine-tune everything under Appearance and Background.'), grid, random, reset, status);
		mark();
		return { dispose() {} };
	}
};
