import { uid } from './state.js';
import { el, escH } from './utils.js';
import { getFileIcon } from './icons.js';
import { previewType } from './file-preview.js';

export const FQ = {
	items: [],
	add(files) {
		for (const f of files) this.items.push({ id: uid(), file: f, url: URL.createObjectURL(f) });
		renderFQ();
	},
	remove(id) {
		const i = this.items.find(x => x.id === id);
		if (i) URL.revokeObjectURL(i.url);
		this.items = this.items.filter(x => x.id !== id);
		renderFQ();
	},
	clear() {
		this.items.forEach(i => URL.revokeObjectURL(i.url));
		this.items = [];
		renderFQ();
	},
};

export function renderFQ() {
	const wrap = el('fqWrap'); if (!wrap) return;
	wrap.classList.toggle('has-files', FQ.items.length > 0);
	wrap.innerHTML = FQ.items.map(item => {
		const pt = previewType(item.file.type, item.file.name), fi = getFileIcon(item.file.type);
		const thumb = pt === 'image'
			? `<img src="${item.url}" alt="">`
			: `<svg class="fq-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="${fi.color}">${fi.svg}</svg>`;
		const short = item.file.name.length > 9 ? item.file.name.slice(0, 8) + '…' : item.file.name;
		return `<div class="fq-item"><div class="fq-thumb" style="${pt !== 'image' ? 'background:' + fi.bg : ''}">${thumb}</div><div class="fq-lbl">${escH(short)}</div><button class="fq-rm" onclick="App.removeQueuedFile('${item.id}')" title="Remove">×</button></div>`;
	}).join('');
}
