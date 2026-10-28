// Prayer Times add-on for ProElectricCoder New Tab.
// Times come from the Aladhan API (api.aladhan.com); only your city's coordinates are sent.
const PRAYERS = [['Fajr', 'Fajr'], ['Sunrise', 'Sunrise'], ['Dhuhr', 'Dhuhr'], ['Asr', 'Asr'], ['Maghrib', 'Maghrib'], ['Isha', 'Isha']];
const METHODS = [
	[4, 'Umm Al-Qura, Makkah'], [3, 'Muslim World League'], [2, 'ISNA (North America)'], [5, 'Egyptian General Authority'],
	[1, 'University of Islamic Sciences, Karachi'], [8, 'Gulf Region'], [9, 'Kuwait'], [10, 'Qatar'], [11, 'Singapore'],
	[12, 'France (UOIF)'], [13, 'Turkey (Diyanet)'], [14, 'Russia'], [15, 'Moonsighting Committee'], [7, 'Tehran'], [0, 'Shia Ithna-Ashari']
];
const MOSQUE_ICON = 'M12 3v1.5M12 4.5c-2.6 1.7-4 3.6-4 5.5h8c0-1.9-1.4-3.8-4-5.5ZM5 10h14v10H5V10Zm4.5 10v-4a2.5 2.5 0 0 1 5 0v4M3 20h18M5 10V6m14 4V6';

function pad(n) { return String(n).padStart(2, '0'); }
function parseTime(s) {
	const m = /(\d{1,2}):(\d{2})/.exec(String(s));
	if (!m) return null;
	const h = +m[1], min = +m[2];
	return h < 24 && min < 60 ? h * 60 + min : null;
}
// "now" in the city's own time zone: { date: 'DD-MM-YYYY', minutes, secs }
function zonedNow(tz, offsetDays = 0) {
	const d = new Date(Date.now() + offsetDays * 86400000);
	let parts;
	try {
		parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
			.formatToParts(d).map((p) => [p.type, p.value]));
	} catch { return zonedNow(undefined, offsetDays); }
	return { date: `${parts.day}-${parts.month}-${parts.year}`, minutes: +parts.hour * 60 + +parts.minute, secs: +parts.second };
}
function formatClock(minutes, use24) {
	const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
	if (use24) return `${pad(h)}:${pad(m)}`;
	return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
function formatLeft(mins) {
	const h = Math.floor(mins / 60), m = mins % 60;
	return h ? `${h}h ${pad(m)}m` : `${m}m`;
}

export default {
	id: 'prayer',
	init(api) {
		const { el, storage } = api;
		const getCity = () => {
			const c = storage.get('city', null) || api.weatherCity();
			return c && Number.isFinite(c.lat) && Number.isFinite(c.lon) ? c : null;
		};
		const method = () => (METHODS.some(([id]) => id === storage.get('method', 4)) ? storage.get('method', 4) : 4);
		const school = () => (storage.get('school', 0) === 1 ? 1 : 0);
		const use24 = () => storage.get('use24', false) === true;

		const panel = api.createPanel('prayer', 'Prayer times');
		const button = api.addButton({ key: 'prayerBtn', label: 'Prayer times button', title: 'Prayer times', icon: MOSQUE_ICON, onClick: () => { panel.toggle(); } });
		let timer = null;
		let state = null;   // { today, tomorrow, tz, hijri, city }
		let failed = false;

		// ─── data ──────────────────────────────────────────────────────
		async function fetchDay(city, dateStr) {
			const key = `${city.lat.toFixed(3)},${city.lon.toFixed(3)},${method()},${school()},${dateStr}`;
			const cache = storage.get('cache', {});
			if (cache[key]) return cache[key];
			const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${city.lat}&longitude=${city.lon}&method=${method()}&school=${school()}`;
			const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
			if (!res.ok) throw new Error('prayer ' + res.status);
			const json = await res.json();
			const t = json?.data?.timings;
			const times = {};
			for (const [k] of PRAYERS) {
				const mins = parseTime(t?.[k]);
				if (mins === null) throw new Error('bad prayer data');
				times[k] = mins;
			}
			const h = json.data.date?.hijri;
			const day = { times, tz: json.data.meta?.timezone || null, hijri: h && h.day && h.month?.en && h.year ? `${h.day} ${h.month.en} ${h.year} AH` : '' };
			const next = {};   // keep only a few days of cache
			for (const [k, v] of Object.entries({ ...cache, [key]: day }).slice(-6)) next[k] = v;
			storage.set('cache', next);
			return day;
		}

		async function load() {
			const city = getCity();
			if (!city) { state = null; failed = false; render(); return; }
			try {
				const tz = storage.get('city', null)?.tz || state?.tz || null;
				const t0 = zonedNow(tz, 0);
				const today = await fetchDay(city, t0.date);
				const zone = today.tz || tz;
				const now = zonedNow(zone, 0);
				const dayInfo = now.date === t0.date ? today : await fetchDay(city, now.date);
				state = { today: dayInfo, tomorrow: null, tz: zone, city };
				failed = false;
			} catch { if (!state) failed = true; }
			render();
		}

		async function ensureTomorrow() {
			if (!state || state.tomorrow || state.loadingTomorrow) return;
			state.loadingTomorrow = true;
			try { state.tomorrow = await fetchDay(state.city, zonedNow(state.tz, 1).date); } catch { /* next tick retries */ }
			if (state) state.loadingTomorrow = false;
		}

		// ─── card ──────────────────────────────────────────────────────
		function nextPrayer() {
			const now = zonedNow(state.tz, 0);
			const nowMin = now.minutes + now.secs / 60;
			for (const [k] of PRAYERS) if (state.today.times[k] > nowMin) return { key: k, mins: state.today.times[k], left: Math.ceil(state.today.times[k] - nowMin), tomorrow: false };
			if (!state.tomorrow) { ensureTomorrow(); return null; }
			return { key: 'Fajr', mins: state.tomorrow.times.Fajr, left: Math.ceil(24 * 60 - nowMin + state.tomorrow.times.Fajr), tomorrow: true };
		}

		function render() {
			const card = panel.card;
			card.replaceChildren();
			const close = el('button', 'news-card-close', '×'); close.setAttribute('aria-label', 'Close prayer times'); close.onclick = panel.close;
			card.appendChild(close);
			const city = getCity();
			if (!city) {
				card.append(el('div', 'wc-title', 'Prayer times'), el('p', 'wc-sub', 'Pick a city in Settings → Add-ons → Prayer Times (or set one under Weather).'));
				return;
			}
			if (!state) {
				card.append(el('div', 'wc-title', 'Prayer times'), el('p', 'wc-sub', failed ? 'Could not load prayer times. Check your connection.' : 'Loading…'));
				return;
			}
			const next = nextPrayer();
			const head = el('div', 'wc-head');
			const sub = el('div', 'wc-sub');
			sub.append(el('div', 'wc-title', city.label || city.name), el('div', null, state.today.hijri || ''));
			const big = el('div', 'wc-big');
			big.append(el('div', 'wc-temp pt-next', next ? formatClock(next.mins, use24()) : '…'));
			head.append(big, sub);
			const until = el('div', 'wc-sub pt-until', next ? `${next.key} in ${formatLeft(next.left)}${next.tomorrow ? ' (tomorrow)' : ''}` : '');
			card.append(head, until);
			const list = el('div', 'pt-list');
			for (const [k, name] of PRAYERS) {
				const row = el('div', 'wc-day pt-row' + (next && !next.tomorrow && next.key === k ? ' pt-current' : ''));
				row.append(el('span', 'wc-day-n', name), el('span', 'wc-day-t', formatClock(state.today.times[k], use24())));
				list.appendChild(row);
			}
			card.appendChild(list);
		}

		function tick() {
			if (!state) return;
			if (panel.card.hidden) return;
			render();
		}

		panel.onOpen = () => { render(); load(); };
		timer = setInterval(tick, 30000);

		// ─── settings (inside Settings → Add-ons) ──────────────────────
		const box = api.settings;
		const status = el('span', 'setting-hint', '');
		const cityInput = el('input', 'modal-input'); cityInput.type = 'text'; cityInput.placeholder = 'City, e.g. Makkah'; cityInput.autocomplete = 'off'; cityInput.style.cssText = 'margin:0;padding:8px 10px';
		const findBtn = el('button', 'btn-link', 'Find city');
		const methodSel = el('select', 'setting-select'); methodSel.setAttribute('aria-label', 'Calculation method');
		for (const [id, name] of METHODS) { const o = el('option', null, name); o.value = String(id); methodSel.appendChild(o); }
		methodSel.value = String(method());
		const schoolSel = el('select', 'setting-select'); schoolSel.setAttribute('aria-label', 'Asr calculation');
		for (const [v, name] of [['0', 'Asr: Standard'], ['1', 'Asr: Hanafi']]) { const o = el('option', null, name); o.value = v; schoolSel.appendChild(o); }
		schoolSel.value = String(school());
		const clockRow = el('div', 'setting-row');
		const sw = el('label', 'toggle'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = use24();
		sw.append(cb, el('div', 'toggle-track'), el('div', 'toggle-thumb'));
		clockRow.append(el('span', 'setting-label', '24-hour times'), sw);
		const showStatus = () => { const c = getCity(); status.textContent = c ? 'Using ' + (c.label || c.name) + (storage.get('city', null) ? '' : ' (from Weather)') : 'No city set'; };
		showStatus();

		findBtn.onclick = async () => {
			const q = cityInput.value.trim();
			if (q.length < 2) { status.textContent = 'Type a city name'; return; }
			status.textContent = 'Searching…';
			try {
				const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(q), { credentials: 'omit', referrerPolicy: 'no-referrer' });
				const hit = (await res.json())?.results?.[0];
				if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) { status.textContent = 'City not found'; return; }
				const label = [hit.name, hit.admin1 && hit.admin1 !== hit.name ? hit.admin1 : '', hit.country_code].filter(Boolean).join(', ').slice(0, 60);
				storage.set('city', { name: String(hit.name).slice(0, 40), label, lat: hit.latitude, lon: hit.longitude, tz: typeof hit.timezone === 'string' ? hit.timezone : null });
				state = null; showStatus(); load();
			} catch { status.textContent = 'Could not reach the city search'; }
		};
		cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') findBtn.click(); });
		methodSel.onchange = () => { storage.set('method', +methodSel.value); state = null; load(); };
		schoolSel.onchange = () => { storage.set('school', +schoolSel.value); state = null; load(); };
		cb.onchange = () => { storage.set('use24', cb.checked); render(); };
		box.append(
			el('span', 'setting-hint', 'Prayer times by the Aladhan service. Uses your Weather city unless you pick one here.'),
			cityInput, findBtn, status, methodSel, schoolSel, clockRow);

		load();
		return { dispose() { clearInterval(timer); panel.close(); button.remove(); panel.card.remove(); } };
	}
};
