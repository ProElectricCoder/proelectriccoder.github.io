// Break Reminder add-on for Ampere. Reminders run while an Ampere tab is open; the next break time is remembered between tabs.
const ICON = 'M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8ZM16 9h1.5a2.25 2.25 0 0 1 0 4.5H16M7 3.5v2M10 3.5v2M13 3.5v2M3 21h15';
const PRESETS = { eye: ['Eye rest (every 20 min, 20 sec)', 20, 20], stretch: ['Stretch (every 45 min, 5 min)', 45, 300], study: ['Study (every 50 min, 10 min)', 50, 600], custom: ['Custom', null, null] };
const TIPS = ['Look at something about 6 metres (20 feet) away.', 'Roll your shoulders and stretch your neck.', 'Drink a glass of water.', 'Stand up and walk around for a moment.', 'Rest your wrists and stretch your fingers.', 'Close your eyes and take a few slow breaths.'];

const pad = (n) => String(n).padStart(2, '0');
const clampInt = (v, lo, hi, fb) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb; };
const mmss = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

const CSS = `
.br-overlay { position: fixed; inset: 0; z-index: 900; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.82); color: #fff; text-align: center; padding: 24px; }
.br-box { max-width: 420px; }
.br-box h2 { margin: 0 0 8px; font-weight: 500; font-size: 1.6rem; }
.br-box p { margin: 6px 0; opacity: 0.8; }
.br-count { font-size: 4rem; font-weight: 200; font-variant-numeric: tabular-nums; margin: 14px 0; }
.br-actions { display: flex; gap: 8px; justify-content: center; }
.br-btn { padding: 9px 16px; border: 0; border-radius: 10px; background: rgba(255,255,255,0.16); color: #fff; font: inherit; cursor: pointer; }
.br-btn:hover { background: rgba(255,255,255,0.26); }
.br-btn.primary { background: rgba(80,140,255,0.8); }
.br-stat { font-size: 1.4rem; font-weight: 300; margin: 6px 0 12px; }
.br-row { display: flex; gap: 6px; margin-top: 8px; }
.br-row[hidden] { display: none; }
.br-card-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.br-card-actions .br-btn { background: rgba(255,255,255,0.12); color: inherit; padding: 7px 10px; font-size: 0.8rem; }
html[data-theme="light"] .br-card-actions .br-btn { background: rgba(0,0,0,0.07); }
`;

export default {
	id: 'breaks',
	init(api) {
		const { el, storage } = api;
		api.addStyle(CSS);
		const panel = api.createPanel('breaks', { width: 320 });
		const btn = api.addButton({ title: 'Break reminder', icon: ICON, onClick: () => panel.toggle() });

		// ─── settings ──────────────────────────────────────────────────
		const enabled = () => storage.get('enabled', true) !== false;
		const preset = () => (PRESETS[storage.get('preset', 'eye')] ? storage.get('preset', 'eye') : 'eye');
		const interval = () => (preset() === 'custom' ? clampInt(storage.get('minutes', 30), 1, 240, 30) : PRESETS[preset()][1]) * 60;
		const length = () => (preset() === 'custom' ? clampInt(storage.get('seconds', 60), 5, 1800, 60) : PRESETS[preset()][2]);
		const sound = () => storage.get('sound', true) !== false;
		const nextAt = () => { const n = storage.get('nextAt', 0); return Number.isFinite(n) ? n : 0; };
		const schedule = (secs = interval()) => storage.set('nextAt', Date.now() + secs * 1000);

		let overlay = null, breakEnds = 0, lastTip = -1;

		function beep() {
			if (!sound()) return;
			try {
				const ctx = new (window.AudioContext || window.webkitAudioContext)();
				const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 660; g.gain.value = 0.12; o.connect(g); g.connect(ctx.destination);
				o.start(); o.stop(ctx.currentTime + 0.35); setTimeout(() => ctx.close(), 800);
			} catch { /* no audio */ }
		}

		function endBreak(rescheduleFull = true) {
			if (overlay) { overlay.remove(); overlay = null; }
			if (rescheduleFull) schedule();
			renderCard();
		}

		function startBreak() {
			if (overlay) return;
			beep();
			breakEnds = Date.now() + length() * 1000;
			let tip = Math.floor(Math.random() * TIPS.length); if (tip === lastTip) tip = (tip + 1) % TIPS.length; lastTip = tip;
			overlay = el('div', 'br-overlay');
			const box = el('div', 'br-box');
			const count = el('div', 'br-count', mmss(length()));
			const skip = el('button', 'br-btn primary', 'Skip'); skip.onclick = () => endBreak();
			const snooze = el('button', 'br-btn', 'Snooze 5 min'); snooze.onclick = () => { endBreak(false); schedule(300); renderCard(); };
			const actions = el('div', 'br-actions'); actions.append(snooze, skip);
			box.append(el('h2', null, 'Time for a break'), el('p', null, TIPS[tip]), count, actions);
			overlay.appendChild(box); overlay.onclick = (e) => e.stopPropagation();
			document.body.appendChild(overlay);
			overlay._count = count;
		}

		function tick() {
			if (overlay) {
				const left = Math.max(0, Math.ceil((breakEnds - Date.now()) / 1000));
				overlay._count.textContent = mmss(left);
				if (left <= 0) { beep(); endBreak(); }
				return;
			}
			if (!enabled()) return;
			const n = nextAt();
			if (!n) { schedule(); return; }
			if (Date.now() >= n) {
				// If the browser was closed for a long time, start a fresh countdown instead of nagging
				if (Date.now() - n > 15 * 60 * 1000) schedule(); else startBreak();
			}
			if (!panel.card.hidden) updateStatus();
		}

		// ─── card ──────────────────────────────────────────────────────
		const statusEl = el('div', 'br-stat');
		function updateStatus() {
			if (!enabled()) { statusEl.textContent = 'Reminders are off'; return; }
			const left = Math.max(0, Math.ceil((nextAt() - Date.now()) / 1000));
			statusEl.textContent = 'Next break in ' + (left >= 3600 ? Math.floor(left / 3600) + 'h ' : '') + mmss(left % 3600);
		}
		function renderCard() {
			const card = panel.card;
			card.replaceChildren();
			const close = el('button', 'news-card-close', '×'); close.setAttribute('aria-label', 'Close'); close.onclick = panel.close;
			card.append(close, el('div', 'wc-title', 'Break reminder'), el('p', 'wc-sub', PRESETS[preset()][0]), statusEl);
			updateStatus();
			const now = el('button', 'br-btn', 'Take a break now'); now.onclick = () => { panel.close(); startBreak(); };
			const snooze = el('button', 'br-btn', 'Snooze 5 min'); snooze.onclick = () => { schedule(300); updateStatus(); };
			const restart = el('button', 'br-btn', 'Restart countdown'); restart.onclick = () => { schedule(); updateStatus(); };
			const actions = el('div', 'br-card-actions'); actions.append(now, snooze, restart);
			card.append(actions, el('p', 'wc-sub', 'Reminders run while an Ampere tab is open.'));
		}
		panel.onOpen = renderCard;

		// ─── settings block ────────────────────────────────────────────
		const box = api.settings;
		const toggleRow = el('div', 'setting-row');
		const sw = el('label', 'toggle'), cb = el('input'); cb.type = 'checkbox'; cb.checked = enabled();
		sw.append(cb, el('div', 'toggle-track'), el('div', 'toggle-thumb'));
		toggleRow.append(el('span', 'setting-label', 'Remind me'), sw);
		cb.onchange = () => { storage.set('enabled', cb.checked); if (cb.checked) schedule(); updateStatus(); };
		const presetSel = el('select', 'setting-select'); presetSel.setAttribute('aria-label', 'Break schedule');
		for (const [id, [label]] of Object.entries(PRESETS)) { const o = el('option', null, label); o.value = id; presetSel.appendChild(o); }
		presetSel.value = preset();
		const custom = el('div', 'br-row');
		const mins = el('input', 'modal-input'); mins.type = 'number'; mins.min = '1'; mins.max = '240'; mins.value = String(clampInt(storage.get('minutes', 30), 1, 240, 30)); mins.title = 'Minutes between breaks'; mins.style.cssText = 'margin:0;padding:8px 10px';
		const secs = el('input', 'modal-input'); secs.type = 'number'; secs.min = '5'; secs.max = '1800'; secs.value = String(clampInt(storage.get('seconds', 60), 5, 1800, 60)); secs.title = 'Break length in seconds'; secs.style.cssText = 'margin:0;padding:8px 10px';
		custom.append(mins, secs);
		const customHint = el('span', 'setting-hint', 'Custom: minutes between breaks, then break length in seconds.');
		const showCustom = () => { custom.hidden = customHint.hidden = preset() !== 'custom'; };
		presetSel.onchange = () => { storage.set('preset', presetSel.value); schedule(); showCustom(); updateStatus(); };
		mins.onchange = () => { storage.set('minutes', clampInt(mins.value, 1, 240, 30)); schedule(); };
		secs.onchange = () => { storage.set('seconds', clampInt(secs.value, 5, 1800, 60)); };
		const soundRow = el('div', 'setting-row');
		const sw2 = el('label', 'toggle'), cb2 = el('input'); cb2.type = 'checkbox'; cb2.checked = sound();
		sw2.append(cb2, el('div', 'toggle-track'), el('div', 'toggle-thumb'));
		soundRow.append(el('span', 'setting-label', 'Sound'), sw2);
		cb2.onchange = () => storage.set('sound', cb2.checked);
		showCustom();
		box.append(toggleRow, presetSel, custom, customHint, soundRow, el('span', 'setting-hint', 'The reminder appears over the page while an Ampere tab is open. It cannot notify you when no tab is open.'));

		if (!nextAt()) schedule();
		renderCard();
		const timer = setInterval(tick, 1000);
		tick();
		return { dispose() { clearInterval(timer); if (overlay) overlay.remove(); panel.close(); btn.remove(); panel.card.remove(); } };
	}
};
