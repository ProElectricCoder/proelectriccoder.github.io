import { escH } from './utils.js';

// ── URLs ───────────────────────────────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

// Drop sentence punctuation that is not part of the link; keep a ")" only if the URL has its own "("
function trimUrl(u) {
	let end = u.length;
	while (end > 0 && /[.,;:!?'")\]}]/.test(u[end - 1])) {
		if (u[end - 1] === ')' && (u.slice(0, end).match(/\(/g) || []).length >= (u.slice(0, end).match(/\)/g) || []).length) break;
		end--;
	}
	return u.slice(0, end);
}

function findUrls(raw) {
	const out = [];
	for (const m of String(raw).matchAll(URL_RE)) {
		const url = trimUrl(m[0]);
		try { const p = new URL(url); if ((p.protocol === 'http:' || p.protocol === 'https:') && p.hostname) out.push({ url, start: m.index, end: m.index + url.length }); } catch {}
	}
	return out;
}

export function extractUrls(raw) { return findUrls(raw).map(f => f.url); }

export function formatText(raw) {
	raw = String(raw);
	// Swap links for placeholders first so *bold* / _italic_ markers inside a URL can't break it
	const found = findUrls(raw); let masked = '', last = 0;
	found.forEach((f, i) => { masked += raw.slice(last, f.start) + '\u0000' + i + '\u0000'; last = f.end; });
	masked += raw.slice(last);

	let s = escH(masked);
	s = s.replace(/```([\s\S]*?)```/g, '<code class="fmt-block">$1</code>');
	s = s.replace(/`([^`\n]+)`/g, '<code class="fmt-code">$1</code>');
	s = s.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
	s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
	s = s.replace(/~([^~\n]+)~/g, '<s>$1</s>');
	s = s.replace(/\n/g, '<br>');
	return s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
		const u = found[+i].url;
		return `<a class="fmt-link" href="${escH(u)}" target="_blank" rel="noopener noreferrer nofollow">${escH(u)}</a>`;
	});
}

export function ticksHtml(ticks) {
	if (!ticks) return '';
	const double = ticks >= 2, read = ticks >= 3;
	const color = read ? 'var(--tp)' : 'rgba(232,237,248,.35)';
	return `<span class="msg-ticks" style="color:${color}">${double ? '✓✓' : '✓'}</span>`;
}

export function updateTicksDOM(msgId, ticks) {
	const d = document.querySelector(`[data-msg-id="${msgId}"] .msg-ticks`);
	if (!d) return;
	const read = ticks >= 3, double = ticks >= 2;
	d.style.color = read ? 'var(--tp)' : 'rgba(232,237,248,.35)';
	d.textContent = double ? '✓✓' : '✓';
}
