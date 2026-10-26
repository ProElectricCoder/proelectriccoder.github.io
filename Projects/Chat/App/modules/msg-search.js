// ── Search inside the open chat ─────────────────────────────────────────────────────────────────
// Highlights every match in the rendered messages (text, polls, file names), shows "3 / 12" and steps
// through the matches with Enter / Shift+Enter or the arrows.
import { el } from './utils.js';
import { iconSvg } from './icons.js';

let marks = [], cur = -1, timer = null;

function clearMarks() {
	for (const mk of marks) { const p = mk.parentNode; if (!p) continue; p.replaceChild(document.createTextNode(mk.textContent), mk); p.normalize(); }
	marks = []; cur = -1;
}

function highlight(re) {
	const out = [];
	for (const bubble of document.querySelectorAll('#messages .msg[data-msg-id] .msg-bubble')) {
		const w = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement?.closest('script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
		const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
		for (const n of nodes) {
			const t = n.nodeValue; re.lastIndex = 0; let m, last = 0, frag = null;
			while ((m = re.exec(t))) {
				if (!m[0]) { re.lastIndex++; continue; }
				frag = frag || document.createDocumentFragment();
				if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
				const mk = document.createElement('mark'); mk.className = 'srch'; mk.textContent = m[0]; frag.appendChild(mk); out.push(mk);
				last = m.index + m[0].length;
			}
			if (frag) { if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last))); n.parentNode.replaceChild(frag, n); }
		}
	}
	return out;
}

function show(i) {
	if (!marks.length) return;
	marks[cur]?.classList.remove('cur');
	cur = (i + marks.length) % marks.length;
	marks[cur].classList.add('cur'); marks[cur].scrollIntoView({ block: 'center', behavior: 'smooth' });
	setCount();
}
function setCount() { const c = el('searchCount'); if (c) c.textContent = marks.length ? `${cur + 1} / ${marks.length}` : (el('searchInput')?.value.trim() ? 'No results' : ''); }

export function runSearch() {
	clearMarks();
	const q = (el('searchInput')?.value || '').trim();
	if (q) { marks = highlight(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')); if (marks.length) show(marks.length - 1); }   // start at the newest match
	setCount();
}

export function searchStep(d) { if (marks.length) show(cur + d); }
export function openSearch() {
	const b = el('searchBar'); if (!b) return;
	b.style.display = 'flex'; el('searchInput')?.focus(); el('searchInput')?.select();
}
export function closeSearch() {
	clearMarks(); const b = el('searchBar'); if (b) b.style.display = 'none';
	const i = el('searchInput'); if (i) i.value = ''; setCount();
}
export function toggleSearch() { el('searchBar')?.style.display === 'flex' ? closeSearch() : openSearch(); }

export function initSearch() {
	const set = (id, icon, size = 1.05) => { const b = el(id); if (b) b.innerHTML = iconSvg(icon, size); };
	set('searchPrev', 'chevUp'); set('searchNext', 'chevDown'); set('searchClose', 'x', .95); set('btnSearch', 'search', 1.1);
	const inp = el('searchInput'); if (!inp) return;
	inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 120); });
	inp.addEventListener('keydown', e => {
		if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); if (!marks.length) runSearch(); else searchStep(e.shiftKey ? -1 : 1); }
		else if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
	});
}
