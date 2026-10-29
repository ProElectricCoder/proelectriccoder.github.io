// Notes, To-do & Focus add-on for Ampere. Everything is stored in this browser only; nothing is sent anywhere.
const NOTE_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e9d5ff'];
const MAX_NOTES = 30, MAX_NOTE_CHARS = 5000, MAX_TODOS = 200, MAX_TODO_CHARS = 200;
const MODES = { focus: ['Focus', 25], short: ['Short break', 5], long: ['Long break', 15] };
const ICON = 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z';

const pad = (n) => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const clock = (secs) => `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
const clampInt = (v, lo, hi, fb) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb; };

const CSS = `
.pd-tabs { display: flex; gap: 4px; margin: 0 0 12px; padding-right: 22px; }
.pd-tab { flex: 1; padding: 7px 4px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.07); color: inherit; font: inherit; font-size: 0.8rem; cursor: pointer; }
.pd-tab.active { background: rgba(80,140,255,0.35); font-weight: 600; }
.pd-row { display: flex; gap: 6px; align-items: center; }
.pd-input { flex: 1; min-width: 0; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: inherit; font: inherit; font-size: 0.85rem; }
.pd-btn { padding: 7px 10px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.12); color: inherit; font: inherit; font-size: 0.8rem; cursor: pointer; }
.pd-btn:hover { background: rgba(255,255,255,0.2); }
.pd-btn.primary { background: rgba(80,140,255,0.55); }
.pd-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; max-height: 46vh; overflow-y: auto; padding-right: 2px; }
.pd-empty { margin: 12px 0 4px; font-size: 0.8rem; opacity: 0.6; }
.pd-note { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 10px; color: #1c1c1c; }
.pd-note textarea { width: 100%; box-sizing: border-box; min-height: 64px; resize: vertical; border: 0; outline: 0; background: transparent; color: #1c1c1c; font: inherit; font-size: 0.85rem; }
.pd-note-bar { display: flex; gap: 4px; justify-content: flex-end; }
.pd-note-bar button { border: 0; background: rgba(0,0,0,0.12); color: #1c1c1c; border-radius: 6px; padding: 2px 7px; font-size: 0.72rem; cursor: pointer; }
.pd-todo { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.05); font-size: 0.85rem; }
.pd-todo input { accent-color: #5b8cff; }
.pd-todo span { flex: 1; word-break: break-word; }
.pd-todo.done span { text-decoration: line-through; opacity: 0.5; }
.pd-x { border: 0; background: none; color: inherit; opacity: 0.5; cursor: pointer; font-size: 1rem; }
.pd-x:hover { opacity: 1; }
.pd-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 0.75rem; opacity: 0.7; }
.pd-time { font-size: 3rem; font-weight: 300; text-align: center; font-variant-numeric: tabular-nums; margin: 8px 0; }
.pd-modes { display: flex; gap: 4px; }
.pd-center { display: flex; gap: 6px; justify-content: center; margin: 6px 0; }
.pd-sub { text-align: center; font-size: 0.78rem; opacity: 0.7; }
.pd-badge { position: absolute; bottom: -2px; right: -4px; padding: 0 4px; border-radius: 8px; background: #5b8cff; color: #fff; font-size: 0.6rem; line-height: 14px; pointer-events: none; }
.pd-sticky { position: fixed; z-index: 150; width: 200px; border-radius: 6px; box-shadow: 0 6px 18px rgba(0,0,0,0.4); color: #1c1c1c; display: flex; flex-direction: column; }
.pd-sticky-head { display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; cursor: move; background: rgba(0,0,0,0.12); border-radius: 6px 6px 0 0; font-size: 0.7rem; user-select: none; }
.pd-sticky-head button { border: 0; background: none; cursor: pointer; font-size: 0.9rem; color: #1c1c1c; }
.pd-sticky textarea { box-sizing: border-box; width: 100%; height: 130px; resize: both; border: 0; outline: 0; padding: 8px; background: transparent; color: #1c1c1c; font: inherit; font-size: 0.82rem; }
html[data-theme="light"] .pd-tab, html[data-theme="light"] .pd-btn, html[data-theme="light"] .pd-todo, html[data-theme="light"] .pd-input { background: rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.18); }
html[data-theme="light"] .pd-btn:hover { background: rgba(0,0,0,0.12); }
html[data-theme="light"] .pd-tab.active { background: rgba(0,90,255,0.2); }
html[data-theme="light"] .pd-btn.primary { background: rgba(0,90,255,0.75); color: #fff; }
`;

export default {
	id: 'productivity',
	init(api) {
		const { el, storage } = api;
		api.addStyle(CSS);
		const panel = api.createPanel('productivity', { width: 340 });
		const btn = api.addButton({ title: 'Notes, to-do & focus', icon: ICON, onClick: () => panel.toggle() });
		const badge = el('span', 'pd-badge'); badge.hidden = true; btn.appendChild(badge);
		const baseTitle = document.title;
		let tab = storage.get('tab', 'todo');
		let beepTimer = null;

		// ─── data ──────────────────────────────────────────────────────
		const clean = (v, max) => String(v ?? '').slice(0, max);
		const getNotes = () => (storage.get('notes', []) || []).filter((n) => n && typeof n.id === 'string').slice(0, MAX_NOTES);
		const getTodos = () => (storage.get('todos', []) || []).filter((t) => t && typeof t.id === 'string').slice(0, MAX_TODOS);
		const saveNotes = (v) => storage.set('notes', v);
		const saveTodos = (v) => storage.set('todos', v);

		// ─── sticky notes pinned on the page ───────────────────────────
		const stickies = new Map();
		function drawStickies() {
			const notes = getNotes();
			for (const [id, node] of stickies) if (!notes.some((n) => n.id === id && n.pinned)) { node.remove(); stickies.delete(id); }
			for (const n of notes.filter((x) => x.pinned)) {
				let node = stickies.get(n.id);
				if (!node) {
					node = el('div', 'pd-sticky');
					const head = el('div', 'pd-sticky-head'); head.append(el('span', null, 'Note'));
					const unpin = el('button', null, '×'); unpin.title = 'Unpin'; unpin.setAttribute('aria-label', 'Unpin note');
					unpin.onclick = () => { saveNotes(getNotes().map((x) => x.id === n.id ? { ...x, pinned: false } : x)); drawStickies(); if (tab === 'notes') render(); };
					head.appendChild(unpin);
					const ta = el('textarea'); ta.maxLength = MAX_NOTE_CHARS;
					let t = null;
					ta.oninput = () => { clearTimeout(t); t = setTimeout(() => { saveNotes(getNotes().map((x) => x.id === n.id ? { ...x, text: ta.value } : x)); }, 400); };
					node.append(head, ta);
					head.onpointerdown = (e) => {
						if (e.target === unpin) return;
						const r = node.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
						head.setPointerCapture(e.pointerId);
						head.onpointermove = (m) => { node.style.left = Math.min(Math.max(0, m.clientX - dx), innerWidth - 60) + 'px'; node.style.top = Math.min(Math.max(0, m.clientY - dy), innerHeight - 40) + 'px'; };
						head.onpointerup = () => { head.onpointermove = null; head.onpointerup = null; saveNotes(getNotes().map((x) => x.id === n.id ? { ...x, x: parseInt(node.style.left, 10), y: parseInt(node.style.top, 10) } : x)); };
					};
					node.onclick = (e) => e.stopPropagation();
					document.body.appendChild(node); stickies.set(n.id, node);
				}
				node.style.background = n.color || NOTE_COLORS[0];
				node.style.left = Math.min(Math.max(0, Number.isFinite(n.x) ? n.x : innerWidth - 240), innerWidth - 60) + 'px';
				node.style.top = Math.min(Math.max(0, Number.isFinite(n.y) ? n.y : 90), innerHeight - 40) + 'px';
				const ta = node.querySelector('textarea');
				if (document.activeElement !== ta) ta.value = n.text || '';
			}
		}

		// ─── tabs ──────────────────────────────────────────────────────
		const body = el('div');
		function render() {
			panel.card.replaceChildren();
			const close = el('button', 'news-card-close', '×'); close.setAttribute('aria-label', 'Close'); close.onclick = panel.close;
			const tabs = el('div', 'pd-tabs');
			for (const [id, label] of [['notes', 'Notes'], ['todo', 'To-do'], ['focus', 'Focus']]) {
				const b = el('button', 'pd-tab' + (tab === id ? ' active' : ''), label);
				b.onclick = () => { tab = id; storage.set('tab', id); render(); };
				tabs.appendChild(b);
			}
			body.replaceChildren();
			panel.card.append(close, tabs, body);
			if (tab === 'notes') renderNotes(); else if (tab === 'todo') renderTodos(); else renderFocus();
		}

		function renderNotes() {
			const add = el('button', 'pd-btn primary', '+ New note');
			add.onclick = () => {
				const notes = getNotes();
				if (notes.length >= MAX_NOTES) return;
				saveNotes([{ id: uid(), text: '', color: NOTE_COLORS[notes.length % NOTE_COLORS.length] }, ...notes]);
				renderNotes();
			};
			const list = el('div', 'pd-list');
			const notes = getNotes();
			if (!notes.length) list.appendChild(el('div', 'pd-empty', 'No notes yet. Pin a note to keep it on the page.'));
			for (const n of notes) {
				const box = el('div', 'pd-note'); box.style.background = n.color || NOTE_COLORS[0];
				const ta = el('textarea'); ta.value = n.text || ''; ta.maxLength = MAX_NOTE_CHARS; ta.placeholder = 'Write something…';
				let t = null;
				ta.oninput = () => { clearTimeout(t); t = setTimeout(() => { saveNotes(getNotes().map((x) => x.id === n.id ? { ...x, text: ta.value } : x)); drawStickies(); }, 400); };
				const bar = el('div', 'pd-note-bar');
				const color = el('button', null, 'Colour'); color.onclick = () => { const next = NOTE_COLORS[(NOTE_COLORS.indexOf(n.color) + 1) % NOTE_COLORS.length]; saveNotes(getNotes().map((x) => x.id === n.id ? { ...x, color: next } : x)); drawStickies(); renderNotes(); };
				const pin = el('button', null, n.pinned ? 'Unpin' : 'Pin to page'); pin.onclick = () => { saveNotes(getNotes().map((x) => x.id === n.id ? { ...x, pinned: !x.pinned } : x)); drawStickies(); renderNotes(); };
				const del = el('button', null, 'Delete'); del.onclick = () => { saveNotes(getNotes().filter((x) => x.id !== n.id)); drawStickies(); renderNotes(); };
				bar.append(color, pin, del); box.append(ta, bar); list.appendChild(box);
			}
			body.replaceChildren(add, list);
		}

		function renderTodos() {
			const input = el('input', 'pd-input'); input.placeholder = 'Add a task…'; input.maxLength = MAX_TODO_CHARS;
			const add = el('button', 'pd-btn primary', 'Add');
			const submit = () => {
				const text = input.value.trim();
				if (!text || getTodos().length >= MAX_TODOS) return;
				saveTodos([...getTodos(), { id: uid(), text: clean(text, MAX_TODO_CHARS), done: false }]);
				renderTodos(); body.querySelector('.pd-input')?.focus();
			};
			add.onclick = submit; input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
			const row = el('div', 'pd-row'); row.append(input, add);
			const list = el('div', 'pd-list');
			const todos = getTodos();
			if (!todos.length) list.appendChild(el('div', 'pd-empty', 'Nothing to do. Enjoy!'));
			for (const t of todos) {
				const item = el('label', 'pd-todo' + (t.done ? ' done' : ''));
				const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!t.done;
				cb.onchange = () => { saveTodos(getTodos().map((x) => x.id === t.id ? { ...x, done: cb.checked } : x)); renderTodos(); };
				const x = el('button', 'pd-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Delete task');
				x.onclick = (e) => { e.preventDefault(); saveTodos(getTodos().filter((y) => y.id !== t.id)); renderTodos(); };
				item.append(cb, el('span', null, t.text), x); list.appendChild(item);
			}
			const left = todos.filter((t) => !t.done).length;
			const clear = el('button', 'pd-btn', 'Clear done'); clear.onclick = () => { saveTodos(getTodos().filter((t) => !t.done)); renderTodos(); };
			const foot = el('div', 'pd-foot'); foot.append(el('span', null, `${left} left`), clear);
			body.replaceChildren(row, list, foot);
		}

		// ─── focus timer ───────────────────────────────────────────────
		// State lives in storage as an end time, so a timer survives opening a new tab.
		const durations = () => ({ focus: clampInt(storage.get('minFocus', 25), 1, 180, 25), short: clampInt(storage.get('minShort', 5), 1, 60, 5), long: clampInt(storage.get('minLong', 15), 1, 120, 15) });
		const getFocus = () => { const f = storage.get('focus', null); return f && MODES[f.mode] ? f : { mode: 'focus', endsAt: null, left: durations().focus * 60 }; };
		const sessionsToday = () => { const s = storage.get('sessions', null); return s && s.day === dayKey() ? s.count : 0; };
		const remaining = (f) => f.endsAt ? Math.max(0, Math.ceil((f.endsAt - Date.now()) / 1000)) : f.left;

		function beep() {
			try {
				const ctx = new (window.AudioContext || window.webkitAudioContext)();
				[0, 0.35, 0.7].forEach((t) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2); });
				setTimeout(() => ctx.close(), 1500);
			} catch { /* no audio */ }
		}

		function setFocus(f) { storage.set('focus', f); }
		function finish(f) {
			if (f.mode === 'focus') storage.set('sessions', { day: dayKey(), count: sessionsToday() + 1 });
			const next = f.mode === 'focus' ? (sessionsToday() % 4 === 0 ? 'long' : 'short') : 'focus';
			setFocus({ mode: next, endsAt: null, left: durations()[next] * 60 });
			beep();
			if (!panel.card.hidden) panel.open();
		}
		function tickFocus() {
			const f = getFocus();
			if (f.endsAt && remaining(f) <= 0) finish(f);
			const g = getFocus(), r = remaining(g);
			if (g.endsAt) { badge.hidden = false; badge.textContent = Math.ceil(r / 60) + 'm'; document.title = `${clock(r)} · ${MODES[g.mode][0]}`; }
			else { badge.hidden = true; document.title = baseTitle; }
			const big = panel.card.querySelector('.pd-time');
			if (big) big.textContent = clock(r);
		}

		function renderFocus() {
			const f = getFocus();
			const modes = el('div', 'pd-modes');
			for (const [id, [label]] of Object.entries(MODES)) {
				const b = el('button', 'pd-tab' + (f.mode === id ? ' active' : ''), label);
				b.onclick = () => { setFocus({ mode: id, endsAt: null, left: durations()[id] * 60 }); renderFocus(); tickFocus(); };
				modes.appendChild(b);
			}
			const time = el('div', 'pd-time', clock(remaining(f)));
			const start = el('button', 'pd-btn primary', f.endsAt ? 'Pause' : 'Start');
			start.onclick = () => {
				const g = getFocus();
				if (g.endsAt) setFocus({ ...g, endsAt: null, left: remaining(g) });
				else setFocus({ ...g, endsAt: Date.now() + g.left * 1000 });
				renderFocus(); tickFocus();
			};
			const reset = el('button', 'pd-btn', 'Reset'); reset.onclick = () => { const g = getFocus(); setFocus({ mode: g.mode, endsAt: null, left: durations()[g.mode] * 60 }); renderFocus(); tickFocus(); };
			const center = el('div', 'pd-center'); center.append(start, reset);
			const row = el('div', 'pd-row'); row.style.marginTop = '12px';
			for (const [key, label] of [['minFocus', 'Focus'], ['minShort', 'Short'], ['minLong', 'Long']]) {
				const wrap = el('label', 'pd-sub'); wrap.style.flex = '1';
				const inp = el('input', 'pd-input'); inp.type = 'number'; inp.min = '1'; inp.max = '180'; inp.value = String(durations()[key.slice(3).toLowerCase()]);
				inp.onchange = () => { storage.set(key, clampInt(inp.value, 1, 180, 25)); const g = getFocus(); if (!g.endsAt) { setFocus({ mode: g.mode, endsAt: null, left: durations()[g.mode] * 60 }); } renderFocus(); tickFocus(); };
				wrap.append(document.createTextNode(label + ' (min)'), inp); row.appendChild(wrap);
			}
			body.replaceChildren(modes, time, center, el('div', 'pd-sub', `Focus sessions today: ${sessionsToday()}`), row);
		}

		// ─── settings area ─────────────────────────────────────────────
		api.settings.append(el('span', 'setting-hint', 'Notes, tasks and timer settings are kept in this browser and included in Settings → Backup. Pinned notes can be dragged around the page.'));

		panel.onOpen = render;
		const timer = setInterval(tickFocus, 1000);
		drawStickies(); tickFocus();
		return { dispose() { clearInterval(timer); clearTimeout(beepTimer); for (const n of stickies.values()) n.remove(); document.title = baseTitle; panel.close(); btn.remove(); panel.card.remove(); } };
	}
};
