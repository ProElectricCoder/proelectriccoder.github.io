import { escH } from './utils.js';

export function formatText(raw) {
	let s = escH(raw);
	s = s.replace(/```([\s\S]*?)```/g, '<code class="fmt-block">$1</code>');
	s = s.replace(/`([^`\n]+)`/g, '<code class="fmt-code">$1</code>');
	s = s.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
	s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
	s = s.replace(/~([^~\n]+)~/g, '<s>$1</s>');
	s = s.replace(/\n/g, '<br>');
	return s;
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
