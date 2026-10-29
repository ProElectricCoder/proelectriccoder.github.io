// Wallpapers add-on for Ampere: a fresh background picture from NASA APOD, Wikipedia's picture of the day,
// the Art Institute of Chicago (public-domain art), Picsum or Unsplash (needs your own free key).
// Contacts only the source you choose: api.nasa.gov, en.wikipedia.org, api.artic.edu, picsum.photos, api.unsplash.com
// (plus the image hosts those return). Your Unsplash/NASA key, if you add one, stays on this device.
const ICON = 'm2.25 15.75 5.16-5.16a2.25 2.25 0 0 1 3.18 0l5.16 5.16m-1.5-1.5 1.41-1.41a2.25 2.25 0 0 1 3.18 0l2.91 2.91m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z';
const SOURCES = {
	apod: 'NASA – Astronomy Picture of the Day',
	wikimedia: 'Wikipedia – Picture of the day',
	artic: 'Art Institute of Chicago – public-domain art',
	picsum: 'Picsum – random photos',
	unsplash: 'Unsplash – photos (needs your free key)'
};
const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const https = (u) => { try { return new URL(String(u)).protocol === 'https:' ? new URL(String(u)).href : null; } catch { return null; } };
const host = (u, ...allowed) => { try { const h = new URL(u).hostname; return allowed.some((a) => h === a || h.endsWith('.' + a)); } catch { return false; } };
const plain = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const rand = (n) => 1 + Math.floor(Math.random() * n);

const CSS = `
.wp-credit { position: fixed; right: 12px; bottom: 8px; z-index: 40; max-width: 60vw; padding: 3px 8px; border-radius: 6px; background: rgba(0,0,0,0.45); color: rgba(255,255,255,0.85); font-size: 0.68rem; line-height: 1.4; }
.wp-credit a { color: #fff; }
.wp-info { font-size: 0.8rem; line-height: 1.5; opacity: 0.85; max-height: 32vh; overflow-y: auto; margin: 8px 0; }
.wp-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.wp-btn { padding: 7px 11px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.12); color: inherit; font: inherit; font-size: 0.8rem; cursor: pointer; text-decoration: none; }
.wp-btn:hover { background: rgba(255,255,255,0.22); }
.wp-btn.primary { background: rgba(80,140,255,0.55); }
html[data-theme="light"] .wp-btn { background: rgba(0,0,0,0.07); }
html[data-theme="light"] .wp-btn.primary { background: rgba(0,90,255,0.75); color: #fff; }
`;

export default {
	id: 'wallpapers',
	init(api) {
		const { el, storage } = api;
		api.addStyle(CSS);
		const panel = api.createPanel('wallpapers', { width: 340 });
		const btn = api.addButton({ title: 'Wallpaper', icon: ICON, onClick: () => panel.toggle() });
		const credit = el('div', 'wp-credit'); credit.hidden = true; document.body.appendChild(credit);
		let busy = false, message = '';

		const source = () => (SOURCES[storage.get('source', 'apod')] ? storage.get('source', 'apod') : 'apod');
		const every = () => (storage.get('every', 'day') === 'tab' ? 'tab' : 'day');
		const key = (name) => { const k = storage.get(name, ''); return typeof k === 'string' && /^[\w-]{10,100}$/.test(k) ? k : ''; };
		const current = () => { const c = storage.get('current', null); return c && https(c.src) ? c : null; };

		// Every fetcher returns { src, title, credit, creditUrl, page, text }, with https links only
		async function json(url, init) {
			const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', ...init });
			if (res.status === 429) throw new Error('This source is limiting requests right now. Try again later (or add your own key).');
			if (!res.ok) throw new Error('The picture service answered ' + res.status + '.');
			return res.json();
		}

		const fetchers = {
			async apod() {
				const k = key('nasaKey') || 'DEMO_KEY';
				for (let back = 0; back < 4; back++) {   // a few days back if today is a video
					const d = new Date(Date.now() - back * 86400000);
					const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
					const a = await json(`https://api.nasa.gov/planetary/apod?api_key=${k}&date=${date}`);
					const src = https(a.hdurl) || https(a.url);
					if (a.media_type === 'image' && src) return { src, title: plain(a.title, 120), credit: plain(a.copyright, 80) || 'NASA', creditUrl: 'https://apod.nasa.gov/apod/astropix.html', page: 'https://apod.nasa.gov/apod/astropix.html', text: plain(a.explanation, 700) };
				}
				throw new Error('No picture was available from NASA just now.');
			},
			async wikimedia() {
				const d = new Date();
				const f = await json(`https://en.wikipedia.org/api/rest_v1/feed/featured/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`);
				const img = f.image;
				let src = https(img?.thumbnail?.source);
				if (src) src = src.replace(/\/\d+px-/, '/1920px-');
				if (!src || !host(src, 'wikimedia.org')) throw new Error('No picture of the day was available.');
				const page = https(img.file_page);
				return { src, title: plain(img.description?.text || img.title, 160), credit: 'Wikipedia / Wikimedia Commons', creditUrl: page && host(page, 'wikimedia.org') ? page : 'https://commons.wikimedia.org/', page: page && host(page, 'wikimedia.org') ? page : 'https://commons.wikimedia.org/', text: '' };
			},
			async artic() {
				const url = `https://api.artic.edu/api/v1/artworks/search?q=landscape&query[term][is_public_domain]=true&fields=id,title,artist_display,image_id&limit=1&page=${rand(60)}`;
				const r = await json(url);
				const a = r.data?.[0];
				if (!a || !/^[\w-]{10,60}$/.test(String(a.image_id))) throw new Error('No artwork was available. Try again.');
				const page = 'https://www.artic.edu/artworks/' + encodeURIComponent(a.id);
				return { src: `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`, title: plain(a.title, 140), credit: plain(a.artist_display, 120) || 'Art Institute of Chicago', creditUrl: page, page, text: '' };
			},
			async picsum() {
				const r = await json(`https://picsum.photos/v2/list?page=${rand(40)}&limit=1`);
				const p = r[0];
				if (!p || !/^\d+$/.test(String(p.id))) throw new Error('No photo was available. Try again.');
				return { src: `https://picsum.photos/id/${p.id}/1920/1080`, title: 'Photo ' + p.id, credit: plain(p.author, 80), creditUrl: https(p.url) || 'https://picsum.photos/', page: https(p.url) || 'https://picsum.photos/', text: '' };
			},
			async unsplash() {
				const k = key('unsplashKey');
				if (!k) throw new Error('Add your free Unsplash Access Key in Settings → Add-ons → Wallpapers.');
				const q = plain(storage.get('unsplashQuery', 'landscape'), 40) || 'landscape';
				const p = await json(`https://api.unsplash.com/photos/random?orientation=landscape&query=${encodeURIComponent(q)}&client_id=${k}`);
				const raw = https(p.urls?.raw);
				if (!raw || !host(raw, 'unsplash.com')) throw new Error('Unsplash sent no picture. Try again.');
				const dl = https(p.links?.download_location);
				if (dl && host(dl, 'unsplash.com')) fetch(dl + (dl.includes('?') ? '&' : '?') + 'client_id=' + k, { credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => {});   // Unsplash asks apps to report when a photo is used
				const user = p.user || {};
				const profile = https(user.links?.html);
				return { src: raw + (raw.includes('?') ? '&' : '?') + 'w=1920&q=80&fit=max', title: plain(p.description || p.alt_description, 140) || 'Unsplash photo', credit: plain(user.name, 80) + ' on Unsplash', creditUrl: profile && host(profile, 'unsplash.com') ? profile + '?utm_source=ampere&utm_medium=referral' : 'https://unsplash.com/?utm_source=ampere&utm_medium=referral', page: https(p.links?.html) || 'https://unsplash.com/', text: '' };
			}
		};

		function showCredit() {
			const c = current();
			credit.replaceChildren();
			credit.hidden = !c || (storage.get('showCredit', true) === false && source() !== 'unsplash');
			if (credit.hidden || !api.backgroundImageUrl()) { credit.hidden = true; return; }
			const a = el('a', null, c.credit || 'Source'); a.href = https(c.creditUrl) || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer';
			credit.append(document.createTextNode((c.title ? c.title + ' · ' : '') + ''), a);
		}

		async function refresh() {
			if (busy) return;
			busy = true; message = 'Loading…'; render();
			try {
				const pic = await fetchers[source()]();
				if (!https(pic.src)) throw new Error('The picture address was not safe to use.');
				// make sure the picture really loads before replacing the current background
				await new Promise((ok, no) => { const i = new Image(); i.referrerPolicy = 'no-referrer'; i.onload = ok; i.onerror = () => no(new Error('The picture could not be loaded.')); i.src = pic.src; });
				await api.setBackgroundImage(pic.src);
				storage.set('current', { ...pic, source: source(), day: day() });
				message = '';
			} catch (e) { message = e.message || 'Something went wrong.'; }
			busy = false; showCredit(); render();
		}

		function render() {
			const card = panel.card;
			card.replaceChildren();
			const close = el('button', 'news-card-close', '×'); close.setAttribute('aria-label', 'Close'); close.onclick = panel.close;
			card.append(close, el('div', 'wc-title', 'Wallpaper'), el('p', 'wc-sub', SOURCES[source()]));
			const c = current();
			if (c && api.backgroundImageUrl()) {
				card.appendChild(el('div', 'wc-title', c.title || 'Current picture'));
				card.appendChild(el('p', 'wc-sub', c.credit || ''));
				if (c.text) card.appendChild(el('div', 'wp-info', c.text));
			} else card.appendChild(el('p', 'wc-sub', 'No wallpaper from this add-on is set yet.'));
			if (message) card.appendChild(el('p', 'wc-sub', message));
			const actions = el('div', 'wp-actions');
			const next = el('button', 'wp-btn primary', busy ? 'Loading…' : c ? 'New wallpaper' : 'Set a wallpaper'); next.disabled = busy; next.onclick = refresh;
			actions.appendChild(next);
			if (c && https(c.page)) { const a = el('a', 'wp-btn', 'Source page ↗'); a.href = c.page; a.target = '_blank'; a.rel = 'noopener noreferrer'; actions.appendChild(a); }
			card.appendChild(actions);
		}

		// ─── settings ──────────────────────────────────────────────────
		const box = api.settings;
		const srcSel = el('select', 'setting-select'); srcSel.setAttribute('aria-label', 'Wallpaper source');
		for (const [id, label] of Object.entries(SOURCES)) { const o = el('option', null, label); o.value = id; srcSel.appendChild(o); }
		srcSel.value = source();
		const everySel = el('select', 'setting-select'); everySel.setAttribute('aria-label', 'How often');
		for (const [v, l] of [['day', 'Change once a day'], ['tab', 'Change on every new tab']]) { const o = el('option', null, l); o.value = v; everySel.appendChild(o); }
		everySel.value = every();
		const field = (name, placeholder, secret) => {
			const i = el('input', 'modal-input'); i.type = secret ? 'password' : 'text'; i.placeholder = placeholder; i.autocomplete = 'off'; i.value = storage.get(name, '') || ''; i.maxLength = 100; i.style.cssText = 'margin:0;padding:8px 10px';
			i.onchange = () => storage.set(name, i.value.trim()); return i;
		};
		const unsplashKey = field('unsplashKey', 'Unsplash Access Key', true);
		const unsplashQuery = field('unsplashQuery', 'Topic, e.g. nature', false);
		const nasaKey = field('nasaKey', 'NASA API key (optional)', true);
		const keyHint = el('span', 'setting-hint', 'Keys are free from unsplash.com/developers and api.nasa.gov. They are kept on this device and are included in Settings → Backup, so keep backup files private. Without a NASA key the shared demo key is used, which is limited.');
		const creditRow = el('div', 'setting-row');
		const sw = el('label', 'toggle'), cb = el('input'); cb.type = 'checkbox'; cb.checked = storage.get('showCredit', true) !== false;
		sw.append(cb, el('div', 'toggle-track'), el('div', 'toggle-thumb')); creditRow.append(el('span', 'setting-label', 'Show picture credit'), sw);
		cb.onchange = () => { storage.set('showCredit', cb.checked); showCredit(); };
		const now = el('button', 'btn-link', 'Change wallpaper now'); now.onclick = refresh;
		const stop = el('button', 'btn-link', 'Stop and go back to the gradient');
		stop.onclick = async () => { await api.clearBackgroundImage(); storage.set('current', null); message = ''; showCredit(); render(); };
		const showKeys = () => { const u = source() === 'unsplash'; unsplashKey.hidden = unsplashQuery.hidden = u ? false : true; nasaKey.hidden = source() !== 'apod'; keyHint.hidden = !(u || source() === 'apod'); };
		srcSel.onchange = () => { storage.set('source', srcSel.value); showKeys(); render(); };
		everySel.onchange = () => storage.set('every', everySel.value);
		showKeys();
		box.append(el('span', 'setting-hint', 'Sets the page background to a picture from the source you choose. Only that source is contacted. Pictures belong to their creators and the credit is shown.'),
			srcSel, everySel, unsplashKey, unsplashQuery, nasaKey, keyHint, creditRow, now, stop);

		panel.onOpen = render;
		// Auto change: once a day, or on every new tab. The old picture stays until the new one has loaded.
		const c = current();
		if (!c || every() === 'tab' || c.day !== day() || c.source !== source()) { if (c || storage.get('autostart', false)) refresh(); }
		showCredit();
		return { dispose() { credit.remove(); panel.close(); btn.remove(); panel.card.remove(); } };
	}
};
