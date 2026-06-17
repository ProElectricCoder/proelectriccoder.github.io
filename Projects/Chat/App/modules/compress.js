export async function gzip(ab) {
	const cs = new CompressionStream('gzip');
	const w = cs.writable.getWriter();
	w.write(new Uint8Array(ab));
	w.close();
	const chunks = [], r = cs.readable.getReader();
	for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
	const len = chunks.reduce((s, c) => s + c.length, 0);
	const out = new Uint8Array(len);
	let off = 0;
	for (const c of chunks) { out.set(c, off); off += c.length; }
	return out.buffer;
}

export async function gunzip(ab) {
	const ds = new DecompressionStream('gzip');
	const w = ds.writable.getWriter();
	w.write(new Uint8Array(ab));
	w.close();
	const chunks = [], r = ds.readable.getReader();
	for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
	const len = chunks.reduce((s, c) => s + c.length, 0);
	const out = new Uint8Array(len);
	let off = 0;
	for (const c of chunks) { out.set(c, off); off += c.length; }
	return out.buffer;
}
