// GitHub Activity add-on for Ampere: a public GitHub profile's recent activity and repositories.
// Contacts api.github.com (public, no sign-in, no token). Only the username you type is sent.
const ICON = 'M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5';
const USER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO_RE = /^[\w.-]{1,100}\/[\w.-]{1,100}$/;
const TTL = 10 * 60 * 1000;   // GitHub allows 60 requests an hour without signing in, so results are kept for 10 minutes

const CSS = `
.gh-head { display: flex; align-items: center; gap: 10px; padding-right: 22px; }
.gh-avatar { width: 46px; height: 46px; border-radius: 50%; background: rgba(255,255,255,0.1); }
.gh-name { font-weight: 600; }
.gh-stats { font-size: 0.75rem; opacity: 0.7; }
.gh-tabs { display: flex; gap: 4px; margin: 12px 0 8px; }
.gh-tab { flex: 1; padding: 6px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.07); color: inherit; font: inherit; font-size: 0.8rem; cursor: pointer; }
.gh-tab.active { background: rgba(80,140,255,0.35); font-weight: 600; }
.gh-list { display: flex; flex-direction: column; gap: 6px; max-height: 46vh; overflow-y: auto; }
.gh-item { display: block; padding: 7px 9px; border-radius: 8px; background: rgba(255,255,255,0.05); color: inherit; text-decoration: none; font-size: 0.8rem; line-height: 1.4; }
.gh-item:hover { background: rgba(255,255,255,0.1); }
.gh-item small { display: block; opacity: 0.6; font-size: 0.68rem; }
.gh-item b { font-weight: 600; }
.gh-msg { font-size: 0.82rem; opacity: 0.75; margin: 10px 0; }
html[data-theme="light"] .gh-tab, html[data-theme="light"] .gh-item { background: rgba(0,0,0,0.05); }
html[data-theme="light"] .gh-item:hover { background: rgba(0,0,0,0.1); }
html[data-theme="light"] .gh-tab.active { background: rgba(0,90,255,0.2); }
`;

function ago(iso) {
	const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
	if (!Number.isFinite(s)) return '';
	if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
	if (s < 86400) return Math.round(s / 3600) + ' h ago';
	return Math.round(s / 86400) + ' d ago';
}
const plain = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max);

// Turns one public event into a short sentence, or null for kinds that aren't interesting
function describe(ev) {
	const p = ev.payload || {};
	const n = (x) => (Number.isFinite(x) ? x : 0);
	switch (ev.type) {
		case 'PushEvent': { const c = n(p.size) || (p.commits || []).length; return `Pushed ${c} commit${c === 1 ? '' : 's'} to`; }
		case 'PullRequestEvent': return `${p.action === 'closed' && p.pull_request?.merged ? 'Merged' : plain(p.action, 12).replace(/^./, (c) => c.toUpperCase())} pull request #${n(p.number)} in`;
		case 'IssuesEvent': return `${plain(p.action, 12).replace(/^./, (c) => c.toUpperCase())} issue #${n(p.issue?.number)} in`;
		case 'IssueCommentEvent': return `Commented on #${n(p.issue?.number)} in`;
		case 'PullRequestReviewEvent': return 'Reviewed a pull request in';
		case 'WatchEvent': return 'Starred';
		case 'ForkEvent': return 'Forked';
		case 'CreateEvent': return p.ref_type === 'repository' ? 'Created repository' : `Created ${plain(p.ref_type, 10)} in`;
		case 'DeleteEvent': return `Deleted a ${plain(p.ref_type, 10)} in`;
		case 'ReleaseEvent': return 'Published a release in';
		case 'PublicEvent': return 'Made public';
		default: return null;
	}
}

export default {
	id: 'github-activity',
	init(api) {
		const { el, storage } = api;
		api.addStyle(CSS);
		const panel = api.createPanel('github-activity', { width: 380 });
		const btn = api.addButton({ title: 'GitHub activity', icon: ICON, onClick: () => panel.toggle() });
		let tab = 'activity';
		let state = null, failed = '';

		const user = () => { const u = storage.get('user', ''); return typeof u === 'string' && USER_RE.test(u) ? u : ''; };

		async function get(url) {
			const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/vnd.github+json' } });
			if (res.status === 404) throw new Error('That GitHub user was not found.');
			if (res.status === 403 || res.status === 429) throw new Error('GitHub says too many requests were made. Try again in a few minutes.');
			if (!res.ok) throw new Error('GitHub could not be reached (' + res.status + ').');
			return res.json();
		}

		async function load(force) {
			const name = user();
			if (!name) { state = null; failed = ''; render(); return; }
			const cache = storage.get('cache', null);
			if (!force && cache && cache.user === name && Date.now() - cache.at < TTL) { state = cache; render(); return; }
			try {
				const base = 'https://api.github.com/users/' + encodeURIComponent(name);
				const [profile, events, repos] = await Promise.all([get(base), get(base + '/events/public?per_page=40'), get(base + '/repos?sort=pushed&per_page=8&type=owner')]);
				const keep = {
					user: name, at: Date.now(),
					profile: { login: plain(profile.login, 40), name: plain(profile.name, 60), avatar: typeof profile.avatar_url === 'string' && profile.avatar_url.startsWith('https://avatars.githubusercontent.com/') ? profile.avatar_url : '', followers: +profile.followers || 0, repos: +profile.public_repos || 0 },
					events: (Array.isArray(events) ? events : []).filter((e) => e && e.repo && REPO_RE.test(String(e.repo.name))).slice(0, 40).map((e) => ({ type: plain(e.type, 40), repo: e.repo.name, at: plain(e.created_at, 30), payload: { size: e.payload?.size, commits: Array.isArray(e.payload?.commits) ? e.payload.commits.slice(0, 1) : [], action: e.payload?.action, number: e.payload?.number, pull_request: { merged: !!e.payload?.pull_request?.merged }, issue: { number: e.payload?.issue?.number }, ref_type: e.payload?.ref_type } })),
					repos: (Array.isArray(repos) ? repos : []).filter((r) => r && REPO_RE.test(String(r.full_name))).slice(0, 8).map((r) => ({ full: r.full_name, desc: plain(r.description, 140), stars: +r.stargazers_count || 0, lang: plain(r.language, 30), at: plain(r.pushed_at, 30) }))
				};
				storage.set('cache', keep); state = keep; failed = '';
			} catch (e) { failed = e.message; if (!state || state.user !== name) state = null; }
			render();
		}

		function repoLink(full, text, small) {
			const a = el('a', 'gh-item');
			a.href = 'https://github.com/' + full; a.target = '_blank'; a.rel = 'noopener noreferrer';
			a.append(text, ...(small ? [el('small', null, small)] : []));
			return a;
		}

		function render() {
			const card = panel.card;
			card.replaceChildren();
			const close = el('button', 'news-card-close', '×'); close.setAttribute('aria-label', 'Close'); close.onclick = panel.close;
			card.appendChild(close);
			if (!user()) { card.append(el('div', 'wc-title', 'GitHub activity'), el('p', 'gh-msg', 'Add your GitHub username in Settings → Add-ons → GitHub Activity.')); return; }
			if (!state) { card.append(el('div', 'wc-title', 'GitHub activity'), el('p', 'gh-msg', failed || 'Loading…')); return; }
			const head = el('div', 'gh-head');
			if (state.profile.avatar) { const img = el('img', 'gh-avatar'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = state.profile.avatar; head.appendChild(img); }
			const who = el('div');
			who.append(el('div', 'gh-name', state.profile.name || state.profile.login), el('div', 'gh-stats', `@${state.profile.login} · ${state.profile.repos} repos · ${state.profile.followers} followers`));
			head.appendChild(who);
			const tabs = el('div', 'gh-tabs');
			for (const [id, label] of [['activity', 'Activity'], ['repos', 'Repositories']]) { const b = el('button', 'gh-tab' + (tab === id ? ' active' : ''), label); b.onclick = () => { tab = id; render(); }; tabs.appendChild(b); }
			const list = el('div', 'gh-list');
			if (tab === 'activity') {
				const rows = state.events.map((e) => [describe(e), e]).filter(([d]) => d);
				if (!rows.length) list.appendChild(el('p', 'gh-msg', 'No recent public activity.'));
				for (const [d, e] of rows.slice(0, 15)) { const t = document.createDocumentFragment(); t.append(d + ' ', el('b', null, e.repo)); list.appendChild(repoLink(e.repo, t, ago(e.at))); }
			} else {
				if (!state.repos.length) list.appendChild(el('p', 'gh-msg', 'No public repositories.'));
				for (const r of state.repos) { const t = document.createDocumentFragment(); t.append(el('b', null, r.full)); if (r.desc) t.append(' – ' + r.desc); list.appendChild(repoLink(r.full, t, `★ ${r.stars}${r.lang ? ' · ' + r.lang : ''} · pushed ${ago(r.at)}`)); }
			}
			card.append(head, tabs, list);
			if (failed) card.appendChild(el('p', 'gh-msg', failed + ' Showing saved data.'));
		}

		// ─── settings ──────────────────────────────────────────────────
		const input = el('input', 'modal-input'); input.type = 'text'; input.placeholder = 'GitHub username'; input.autocomplete = 'off'; input.maxLength = 39; input.value = user(); input.style.cssText = 'margin:0;padding:8px 10px';
		const save = el('button', 'btn-link', 'Save username');
		const status = el('span', 'setting-hint', user() ? 'Showing @' + user() : 'No username set');
		save.onclick = () => {
			const v = input.value.trim().replace(/^@/, '');
			if (!USER_RE.test(v)) { status.textContent = 'That is not a valid GitHub username'; return; }
			storage.set('user', v); storage.set('cache', null); state = null; status.textContent = 'Showing @' + v; load(true);
		};
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); });
		api.settings.append(el('span', 'setting-hint', 'Shows a public GitHub profile. Only the username is sent to api.github.com. No sign-in or token is used, so private activity is never shown.'), input, save, status);

		panel.onOpen = () => { render(); load(false); };
		return { dispose() { panel.close(); btn.remove(); panel.card.remove(); } };
	}
};
