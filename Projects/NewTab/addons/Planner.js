// Planner add-on for Ampere: a daily, weekly and monthly planner. Everything stays in this browser.
const ICON = 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5';
const MAX_ITEMS = 1000, MAX_TEXT = 160;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; };
const validKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Does this item happen on this day? (repeats start on their own date)
function occursOn(item, dayKeyStr) {
	if (dayKeyStr < item.date) return false;
	if (item.repeat === 'daily') return true;
	const a = parseKey(item.date), b = parseKey(dayKeyStr);
	if (item.repeat === 'weekly') return a.getDay() === b.getDay();
	if (item.repeat === 'monthly') return a.getDate() === b.getDate();
	return item.date === dayKeyStr;
}

const CSS = `
.pl-head { display: flex; align-items: center; gap: 6px; padding-right: 22px; margin-bottom: 10px; }
.pl-title { flex: 1; text-align: center; font-weight: 600; font-size: 0.95rem; }
.pl-btn { padding: 6px 10px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.12); color: inherit; font: inherit; font-size: 0.8rem; cursor: pointer; }
.pl-btn:hover { background: rgba(255,255,255,0.2); }
.pl-btn.primary { background: rgba(80,140,255,0.55); }
.pl-views { display: flex; gap: 4px; margin-bottom: 10px; }
.pl-view { flex: 1; padding: 6px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.07); color: inherit; font: inherit; font-size: 0.8rem; cursor: pointer; }
.pl-view.active { background: rgba(80,140,255,0.35); font-weight: 600; }
.pl-form { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.pl-input { box-sizing: border-box; padding: 7px 9px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: inherit; font: inherit; font-size: 0.82rem; }
.pl-input.text { flex: 1 1 160px; min-width: 0; }
.pl-list { display: flex; flex-direction: column; gap: 5px; max-height: 42vh; overflow-y: auto; }
.pl-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.05); font-size: 0.85rem; }
.pl-item input { accent-color: #5b8cff; }
.pl-item .t { font-family: monospace; opacity: 0.7; min-width: 40px; }
.pl-item .tx { flex: 1; word-break: break-word; }
.pl-item.done .tx { text-decoration: line-through; opacity: 0.5; }
.pl-item .rep { font-size: 0.65rem; opacity: 0.6; }
.pl-x { border: 0; background: none; color: inherit; opacity: 0.5; cursor: pointer; font-size: 1rem; }
.pl-x:hover { opacity: 1; }
.pl-empty { font-size: 0.8rem; opacity: 0.6; padding: 10px 2px; }
.pl-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.pl-col { min-width: 0; padding: 5px 4px; border-radius: 8px; background: rgba(255,255,255,0.05); cursor: pointer; min-height: 130px; }
.pl-col.today, .pl-cell.today { outline: 1px solid rgba(91,140,255,0.9); }
.pl-col h4 { margin: 0 0 4px; font-size: 0.72rem; font-weight: 600; text-align: center; }
.pl-chip { display: block; margin-top: 3px; padding: 2px 4px; border-radius: 5px; background: rgba(91,140,255,0.28); font-size: 0.66rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-chip.done { text-decoration: line-through; opacity: 0.5; }
.pl-month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.pl-dow { text-align: center; font-size: 0.68rem; opacity: 0.6; padding-bottom: 2px; }
.pl-cell { min-height: 46px; padding: 3px; border-radius: 7px; background: rgba(255,255,255,0.05); cursor: pointer; font-size: 0.72rem; }
.pl-cell.other { opacity: 0.35; }
.pl-cell .n { display: block; }
.pl-dots { display: flex; gap: 2px; flex-wrap: wrap; margin-top: 3px; }
.pl-dot { width: 6px; height: 6px; border-radius: 50%; background: #5b8cff; }
html[data-theme="light"] .pl-btn, html[data-theme="light"] .pl-view, html[data-theme="light"] .pl-input, html[data-theme="light"] .pl-item, html[data-theme="light"] .pl-col, html[data-theme="light"] .pl-cell { background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.18); }
html[data-theme="light"] .pl-view.active { background: rgba(0,90,255,0.2); }
html[data-theme="light"] .pl-btn.primary { background: rgba(0,90,255,0.75); color: #fff; }
html[data-theme="light"] .pl-chip { background: rgba(0,90,255,0.18); }
`;

export default {
	id: 'planner',
	init(api) {
		const { el, storage } = api;
		api.addStyle(CSS);
		const panel = api.createPanel('planner', { width: 560 });
		const btn = api.addButton({ title: 'Planner', icon: ICON, onClick: () => panel.toggle() });
		let view = ['day', 'week', 'month'].includes(storage.get('view', 'day')) ? storage.get('view', 'day') : 'day';
		let cursor = new Date();   // the day being looked at

		const getItems = () => (storage.get('items', []) || []).filter((i) => i && typeof i.id === 'string' && validKey(i.date) && typeof i.text === 'string').slice(0, MAX_ITEMS);
		const saveItems = (v) => storage.set('items', v);
		const isDone = (i, day) => (Array.isArray(i.doneOn) ? i.doneOn : []).includes(day);
		const itemsOn = (day) => getItems().filter((i) => occursOn(i, day)).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
		const toggleDone = (id, day) => saveItems(getItems().map((i) => {
			if (i.id !== id) return i;
			const on = new Set(Array.isArray(i.doneOn) ? i.doneOn : []);
			if (on.has(day)) on.delete(day); else on.add(day);
			return { ...i, doneOn: [...on].slice(-400) };
		}));

		function go(n) { cursor = view === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth() + n, 1) : addDays(cursor, view === 'week' ? 7 * n : n); render(); }
		const weekStart = (d) => addDays(d, -d.getDay());

		function titleText() {
			if (view === 'day') return `${DAY_NAMES[cursor.getDay()]}, ${cursor.getDate()} ${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
			if (view === 'week') { const s = weekStart(cursor), e = addDays(s, 6); return `${s.getDate()} ${MONTH_NAMES[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MONTH_NAMES[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`; }
			return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
		}

		function render() {
			const card = panel.card;
			card.replaceChildren();
			const close = el('button', 'news-card-close', '×'); close.setAttribute('aria-label', 'Close planner'); close.onclick = panel.close;
			const views = el('div', 'pl-views');
			for (const [id, label] of [['day', 'Day'], ['week', 'Week'], ['month', 'Month']]) {
				const b = el('button', 'pl-view' + (view === id ? ' active' : ''), label);
				b.onclick = () => { view = id; storage.set('view', id); render(); };
				views.appendChild(b);
			}
			const head = el('div', 'pl-head');
			const prev = el('button', 'pl-btn', '‹'); prev.setAttribute('aria-label', 'Previous'); prev.onclick = () => go(-1);
			const next = el('button', 'pl-btn', '›'); next.setAttribute('aria-label', 'Next'); next.onclick = () => go(1);
			const today = el('button', 'pl-btn', 'Today'); today.onclick = () => { cursor = new Date(); render(); };
			head.append(prev, el('div', 'pl-title', titleText()), next, today);
			card.append(close, views, head);
			if (view === 'day') renderDay(); else if (view === 'week') renderWeek(); else renderMonth();
		}

		function openDay(d) { cursor = d; view = 'day'; storage.set('view', 'day'); render(); }

		function renderDay() {
			const day = key(cursor);
			const form = el('div', 'pl-form');
			const time = el('input', 'pl-input'); time.type = 'time'; time.setAttribute('aria-label', 'Time');
			const text = el('input', 'pl-input text'); text.placeholder = 'Add to this day…'; text.maxLength = MAX_TEXT;
			const rep = el('select', 'pl-input'); rep.setAttribute('aria-label', 'Repeat');
			for (const [v, l] of [['none', 'Once'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]) { const o = el('option', null, l); o.value = v; rep.appendChild(o); }
			const add = el('button', 'pl-btn primary', 'Add');
			const submit = () => {
				const t = text.value.trim();
				if (!t || getItems().length >= MAX_ITEMS) return;
				saveItems([...getItems(), { id: uid(), date: day, time: /^\d{2}:\d{2}$/.test(time.value) ? time.value : '', text: t.slice(0, MAX_TEXT), repeat: rep.value }]);
				render(); panel.card.querySelector('.pl-input.text')?.focus();
			};
			add.onclick = submit; text.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
			form.append(time, text, rep, add);
			const list = el('div', 'pl-list');
			const items = itemsOn(day);
			if (!items.length) list.appendChild(el('div', 'pl-empty', 'Nothing planned for this day.'));
			for (const i of items) {
				const row = el('label', 'pl-item' + (isDone(i, day) ? ' done' : ''));
				const cb = el('input'); cb.type = 'checkbox'; cb.checked = isDone(i, day);
				cb.onchange = () => { toggleDone(i.id, day); render(); };
				const x = el('button', 'pl-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Delete');
				x.onclick = (e) => { e.preventDefault(); saveItems(getItems().filter((y) => y.id !== i.id)); render(); };
				row.append(cb, el('span', 't', i.time || ''), el('span', 'tx', i.text));
				if (i.repeat && i.repeat !== 'none') row.appendChild(el('span', 'rep', '↻ ' + i.repeat));
				row.appendChild(x); list.appendChild(row);
			}
			panel.card.append(form, list);
		}

		function renderWeek() {
			const grid = el('div', 'pl-week');
			const start = weekStart(cursor), todayKey = key(new Date());
			for (let n = 0; n < 7; n++) {
				const d = addDays(start, n), k = key(d);
				const col = el('div', 'pl-col' + (k === todayKey ? ' today' : ''));
				col.append(el('h4', null, `${DAY_NAMES[d.getDay()]} ${d.getDate()}`));
				const items = itemsOn(k);
				for (const i of items.slice(0, 6)) col.appendChild(el('span', 'pl-chip' + (isDone(i, k) ? ' done' : ''), (i.time ? i.time + ' ' : '') + i.text));
				if (items.length > 6) col.appendChild(el('span', 'pl-chip', `+${items.length - 6} more`));
				col.onclick = () => openDay(d);
				grid.appendChild(col);
			}
			panel.card.appendChild(grid);
		}

		function renderMonth() {
			const grid = el('div', 'pl-month');
			for (const n of DAY_NAMES) grid.appendChild(el('div', 'pl-dow', n));
			const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
			const start = addDays(first, -first.getDay()), todayKey = key(new Date());
			const all = getItems();
			for (let n = 0; n < 42; n++) {
				const d = addDays(start, n), k = key(d);
				if (n >= 35 && d.getMonth() !== cursor.getMonth()) break;
				const cell = el('div', 'pl-cell' + (d.getMonth() !== cursor.getMonth() ? ' other' : '') + (k === todayKey ? ' today' : ''));
				cell.appendChild(el('span', 'n', String(d.getDate())));
				const count = all.filter((i) => occursOn(i, k)).length;
				if (count) { const dots = el('div', 'pl-dots'); for (let c = 0; c < Math.min(count, 6); c++) dots.appendChild(el('span', 'pl-dot')); cell.appendChild(dots); }
				cell.onclick = () => openDay(d);
				grid.appendChild(cell);
			}
			panel.card.appendChild(grid);
		}

		api.settings.append(el('span', 'setting-hint', 'Plans are kept in this browser and included in Settings → Backup. Repeating items (daily, weekly, monthly) can be ticked off one day at a time.'));
		panel.onOpen = () => { cursor = new Date(); render(); };
		return { dispose() { panel.close(); btn.remove(); panel.card.remove(); } };
	}
};
