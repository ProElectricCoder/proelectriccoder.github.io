import { escH, fmtSz } from './utils.js';
import { getFileIcon } from './icons.js';

export function previewType(mime, name) {
	mime = mime || '';
	const ext = ((name || '').split('.').pop() || '').toLowerCase();
	if (mime.startsWith('image/') || /^(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)$/.test(ext)) return 'image';
	if (mime.startsWith('video/') || /^(mp4|webm|ogg|mov|avi|mkv|m4v)$/.test(ext))         return 'video';
	if (mime.startsWith('audio/') || /^(mp3|wav|ogg|aac|flac|m4a|opus)$/.test(ext))        return 'audio';
	if (mime === 'application/pdf' || ext === 'pdf')                                       return 'pdf';
	if (mime === 'text/html' || /^(html|htm)$/.test(ext))                                  return 'html';
	const CODE = /^(js|ts|jsx|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|json|xml|yaml|yml|sh|bash|css|scss|less|vue|svelte|sql|md|graphql|toml|ini|dockerfile)$/;
	if (CODE.test(ext)) return 'code';
	if (mime.startsWith('text/') || /^(txt|log|csv)$/.test(ext)) return 'text';
	return 'generic';
}

export function extToLang(ext) {
	return ({
		js: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx', py: 'python', java: 'java',
		c: 'c', cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
		json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', sh: 'bash', bash: 'bash',
		css: 'css', scss: 'scss', less: 'less', html: 'markup', htm: 'markup', md: 'markdown',
		sql: 'sql', graphql: 'graphql', vue: 'markup', svelte: 'markup', toml: 'toml', ini: 'ini',
		dockerfile: 'docker',
	})[ext] || 'plain';
}

export function buildFileCard(meta, url, sending = false, progress = 0, batchFiles = []) {
	const pt = previewType(meta.mime, meta.name), fi = getFileIcon(meta.mime);
	const batchAttr = escH(JSON.stringify(batchFiles));
	let preview = '';
	if (url && pt !== 'generic') {
		switch (pt) {
			case 'image': preview = `<div class="fp-preview"><img src="${url}" alt="${escH(meta.name)}" loading="lazy" onclick="App.openLightbox('${url}')"></div>`; break;
			case 'video': preview = `<div class="fp-preview"><video src="${url}" controls preload="metadata"></video></div>`; break;
			case 'audio': preview = `<div class="fp-preview fp-audio"><audio src="${url}" controls></audio></div>`; break;
			case 'pdf':   preview = `<div class="fp-preview fp-doc"><iframe src="${url}" sandbox="allow-scripts allow-same-origin" title="${escH(meta.name)}"></iframe></div>`; break;
			case 'html':  preview = `<div class="fp-preview fp-doc fp-html-lazy" data-src="${url}" data-batch="${batchAttr}"><div class="fp-spinner">Loading preview…</div></div>`; break;
			case 'code': case 'text': {
				const ext = (meta.name.split('.').pop() || '').toLowerCase();
				preview = `<div class="fp-preview fp-code-wrap fp-text-lazy" data-src="${url}" data-ext="${ext}" data-ptype="${pt}"><div class="fp-spinner">Loading…</div></div>`;
				break;
			}
		}
	}
	const info = `<div class="fp-info"><div class="fp-icon" style="background:${fi.bg}"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="${fi.color}">${fi.svg}</svg></div><div class="fp-meta"><div class="fp-fname">${escH(meta.name)}</div><div class="fp-fsize">${sending ? `<span class="fp-pct">0%</span>` : fmtSz(meta.size)}</div></div>${url && !sending ? `<a href="${url}" download="${escH(meta.name)}" class="fp-dl" title="Download"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg></a>` : ''}</div>`;
	const bar = sending ? `<div class="fp-bar"><div class="fp-bar-fill" style="width:${progress * 100}%"></div></div>` : '';
	return `<div class="fp-card${sending ? ' fp-sending' : ''}">${preview}${info}${bar}</div>`;
}

export function loadLazy(root) {
	if (!root || !root.querySelectorAll) return;
	root.querySelectorAll('.fp-html-lazy[data-src]').forEach(async el => {
		const src = el.dataset.src;
		let batch = [];
		try { batch = JSON.parse(el.dataset.batch || '[]'); } catch {}
		el.removeAttribute('data-src'); el.removeAttribute('data-batch'); el.classList.remove('fp-html-lazy');
		try {
			let html = await fetch(src).then(r => r.text());
			for (const f of batch) {
				const safe = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				html = html.replace(new RegExp(safe, 'g'), f.url);
			}
			const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
			el.innerHTML = `<iframe src="${blobUrl}" sandbox="allow-scripts allow-same-origin"></iframe>`;
		} catch { el.innerHTML = `<div class="fp-err">Preview unavailable</div>`; }
	});
	root.querySelectorAll('.fp-text-lazy[data-src]').forEach(async el => {
		const src = el.dataset.src, ext = el.dataset.ext, ptype = el.dataset.ptype;
		el.removeAttribute('data-src'); el.classList.remove('fp-text-lazy');
		try {
			const text = await fetch(src).then(r => r.text());
			const lang = ptype === 'code' ? extToLang(ext) : 'plain';
			el.innerHTML = `<pre class="fp-pre"><code class="language-${lang}">${escH(text)}</code></pre>`;
			if (window.Prism) Prism.highlightElement(el.querySelector('code'));
		} catch { el.innerHTML = `<div class="fp-err">Preview unavailable</div>`; }
	});
}

export function getBatchSiblings(sess, batchId, excludeId) {
	if (!batchId || !sess) return [];
	return sess.messages
		.filter(m => m.type === 'file' && m.file?.batchId === batchId && m.id !== excludeId && m.file?.blobUrl)
		.map(m => ({ name: m.file.name, url: m.file.blobUrl }));
}
