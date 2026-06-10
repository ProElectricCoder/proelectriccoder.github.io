/**
 * share.js — Project sharing with native gzip compression (Task 5).
 * Replaces JSZip with CompressionStream / DecompressionStream.
 */

import { S } from './state.js';
import { syncDocsToContent } from './editor.js';
import { resolveVirtualPath, loadBabel } from './preview.js';
import { customAlert, customPrompt } from './dialogs.js';

// ─── Gzip helpers (native CompressionStream) ──────────────────────────────────
async function gzipCompress(str) {
  const bytes  = new TextEncoder().encode(str);
  const cs     = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}

function uint8ToBase64(u8) {
  let str = '';
  const BLOCK = 8192;
  for (let i = 0; i < u8.length; i += BLOCK) {
    str += String.fromCharCode(...u8.subarray(i, i + BLOCK));
  }
  return btoa(str);
}

// ─── HTML minifier ────────────────────────────────────────────────────────────
function minifyHTML(html) {
  return html
    // Remove HTML comments (preserve IE conditionals)
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    // Collapse lines to single spaces
    .replace(/\r?\n\s*/g, ' ')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    // Remove spaces around tag angle-brackets
    .replace(/\s*(<[^>]+>)\s*/g, '$1')
    .trim();
}

// ─── Self-extracting HTML wrapper (uses native DecompressionStream) ───────────
function buildSelfExtractingHTML(gzipB64) {
  // Keep the wrapper itself minimal — no external library required
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DeepBlue Project</title></head><body style="background:#0f172a;color:#38bdf8;font-family:sans-serif;display:flex;height:100vh;margin:0;align-items:center;justify-content:center"><div id="s">Loading project\u2026</div><script>(async()=>{try{const b="${gzipB64}";const bin=atob(b);const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);const ds=new DecompressionStream("gzip");const w=ds.writable.getWriter();w.write(u8);w.close();const buf=await new Response(ds.readable).arrayBuffer();const html=new TextDecoder().decode(buf);document.open();document.write(html);document.close();}catch(e){document.getElementById("s").textContent="Error: "+e.message;}})()\u003C/script></body></html>`;
}

// ─── Build fully-inlined project HTML ────────────────────────────────────────
async function buildInlinedHTML(targetFile) {
  let htmlContent = S.fileSystem[targetFile].content;
  if (htmlContent === null && S.fileSystem[targetFile].ghUrl) {
    htmlContent = await S._callbacks.fetchWithProgress?.(S.fileSystem[targetFile].ghUrl) ?? '';
  }

  const needsBabel = Object.keys(S.fileSystem).some(f => f.endsWith('.jsx')) || targetFile.endsWith('.jsx');
  if (needsBabel) await loadBabel();

  // Inline <link rel="stylesheet">
  htmlContent = htmlContent.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/g, (match, href) => {
    if (href.startsWith('http') || href.startsWith('//')) return match;
    const resolved = resolveVirtualPath(targetFile, href);
    const file     = S.fileSystem[resolved];
    if (file?.type === 'css' && file.content !== null) return `<style>${file.content}</style>`;
    if (file?.ghUrl) return match.replace(href, file.ghUrl);
    return match;
  });

  // Inline <script src="...">
  htmlContent = htmlContent.replace(/<script([^>]+)src=["']([^"']+)["']([^>]*)><\/script>/g, (match, pre, src, post) => {
    if (src.startsWith('http') || src.startsWith('//')) return match;
    const resolved = resolveVirtualPath(targetFile, src);
    const file     = S.fileSystem[resolved];
    if (!file) return match;
    let fc = S.editorDocs[resolved] ? S.editorDocs[resolved].getValue() : file.content;
    if (!fc && file.ghUrl) return match.replace(src, file.ghUrl);
    if ((resolved.endsWith('.jsx') || pre.includes('babel')) && window.Babel && fc) {
      try { fc = window.Babel.transform(fc, { presets: ['react'] }).code; } catch {}
    }
    const type = resolved.endsWith('.jsx') ? '' : (pre + post).replace(/type=["'][^"']*["']/g, '');
    return `<script${type}>${fc}<\/script>`;
  });

  // Inline src/href asset references
  htmlContent = htmlContent.replace(/(src|href)=["']([^"']+)["']/g, (match, attr, path) => {
    if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('#')) return match;
    const resolved = resolveVirtualPath(targetFile, path);
    const asset    = S.fileSystem[resolved];
    if (!asset) return match;
    if (asset.type === 'asset') {
      if (asset.subtype === 'svg' && asset.content === null && asset.ghUrl) return `${attr}="${asset.ghUrl}"`;
      if (asset.subtype === 'svg') return `${attr}="data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.content)}"`;
      if (asset.src) return `${attr}="${asset.src}"`;
    }
    return match;
  });

  htmlContent = htmlContent.replace(/type=["']text\/babel["']/g, 'type="application/javascript"');
  return htmlContent;
}

// ─── Main share entry point ───────────────────────────────────────────────────
export async function shareProject() {
  await syncDocsToContent();

  let targetFile = S.activeFile;
  let isVirtualJSX = false;

  const needsBabel = Object.keys(S.fileSystem).some(f => f.endsWith('.jsx')) || (targetFile && targetFile.endsWith('.jsx'));
  if (needsBabel) await loadBabel();

  // JSX virtual shell
  if (targetFile?.endsWith('.jsx')) {
    isVirtualJSX = true;
  } else if (!S.fileSystem[targetFile] || S.fileSystem[targetFile].type !== 'html') {
    if (S.fileSystem['index.html']) targetFile = 'index.html';
    else { await customAlert('Open an HTML file to share.', 'Notice'); return; }
  }

  let htmlContent;
  if (isVirtualJSX) {
    htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#0a0e14;color:#fff;font-family:system-ui}</style><script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script><script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script></head><body><div id="react-root"></div><script src="${targetFile}"><\/script></body></html>`;
    targetFile = S.activeFile;
  } else {
    htmlContent = await buildInlinedHTML(targetFile);
  }

  // Minify before compression (Task 5 requirement)
  const minified = minifyHTML(htmlContent);

  try {
    let finalDataUrl;

    if (typeof CompressionStream !== 'undefined') {
      // ── Gzip path (modern browsers) ──────────────────────────────────────
      const compressed  = await gzipCompress(minified);
      const gzipB64     = uint8ToBase64(compressed);
      const wrapper     = buildSelfExtractingHTML(gzipB64);
      finalDataUrl = 'data:text/html;base64,' + btoa(unescape(encodeURIComponent(wrapper)));
    } else {
      // ── Fallback: plain base64 (no compression) ───────────────────────
      finalDataUrl = 'data:text/html;base64,' + btoa(unescape(encodeURIComponent(minified)));
    }

    try {
      await navigator.clipboard.writeText(finalDataUrl);
      await customAlert('Compressed project copied to clipboard! (Data URL)', 'Success');
    } catch {
      await customPrompt('Copy this Data URL manually:', finalDataUrl, 'Data URL Generated');
    }
  } catch (e) {
    await customAlert('Share failed: ' + e.message, 'Error');
  }
}
