#!/usr/bin/env node
// Checks Ampere contributions (add-ons and news) so the reviewer starts from a clean, readable report.
// Usage:  node .github/scripts/check-ampere.js            (checks everything)
//         PR_BODY="..." node .github/scripts/check-ampere.js   (also checks the pull request checklist)
// This is a safety net, not a replacement for reading the code: the owner still reviews every change by hand.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', 'Projects', 'NewTab');
const ADDONS = path.join(ROOT, 'addons');
const MAX_ADDON_BYTES = 60000;
const errors = [], warnings = [], notes = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m), note = (m) => notes.push(m);

// Things an add-on must never do. Each rule explains itself in the report.
const FORBIDDEN = [
	[/\beval\s*\(/, 'uses eval()'],
	[/\bnew\s+Function\s*\(/, 'uses new Function()'],
	[/\bFunction\s*\(\s*['"`]/, 'builds code from a string'],
	[/\bimport\s*\(\s*['"`]https?:/, 'imports code from the internet'],
	[/^\s*import\s[^;]*from\s*['"]https?:/m, 'imports code from the internet'],
	[/<script\b/i, 'writes a <script> tag'],
	[/\.(innerHTML|outerHTML)\s*[+]?=/, 'sets innerHTML/outerHTML (use textContent or el())'],
	[/\binsertAdjacentHTML\b/, 'uses insertAdjacentHTML'],
	[/\bdocument\.write\b/, 'uses document.write'],
	[/\bdocument\.cookie\b/, 'reads or writes cookies'],
	[/\bchrome\s*\./, 'uses chrome.* extension APIs'],
	[/\bindexedDB\b/, 'uses IndexedDB directly (use api.storage)'],
	[/\blocalStorage\b|\bsessionStorage\b/, 'uses localStorage directly (use api.storage so backups include it)'],
	[/\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bEventSource\b/, 'uses a network API other than fetch'],
	[/\bnavigator\.(geolocation|clipboard|mediaDevices|credentials)\b/, 'asks for location, clipboard, camera/microphone or credentials'],
	[/\bwindow\.open\b|\blocation\s*(\.href)?\s*=/, 'navigates away from the page'],
	[/\batob\s*\([^)]*\)\s*\)?\s*;?\s*(eval|Function)/, 'decodes and runs hidden code'],
	[/\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}/i, 'contains hex-escaped text (looks obfuscated)'],
	[/\b(analytics|gtag|fbq|mixpanel|sentry)\b/i, 'mentions analytics or tracking']
];

function readJson(file, label) {
	try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { err(`${label} is not valid JSON: ${e.message}`); return null; }
}

function checkAddons() {
	const catalog = readJson(path.join(ADDONS, 'addons.json'), 'addons/addons.json');
	if (!catalog || !Array.isArray(catalog.addons)) { err('addons/addons.json needs an "addons" list'); return; }
	const ids = new Set(), files = new Set();
	for (const a of catalog.addons) {
		const where = `addons.json entry "${a && a.id}"`;
		if (!a || !/^[a-z][a-z0-9-]{0,30}$/.test(a.id || '')) { err(`${where}: "id" must be lowercase letters, digits and dashes`); continue; }
		if (ids.has(a.id)) err(`${where}: duplicate id`); ids.add(a.id);
		if (!/^[A-Za-z][\w-]{0,40}\.js$/.test(a.file || '')) { err(`${where}: "file" must look like Name.js`); continue; }
		if (files.has(a.file)) err(`${where}: duplicate file`); files.add(a.file);
		if (typeof a.name !== 'string' || !a.name || a.name.length > 40) err(`${where}: "name" is required, 40 characters at most`);
		if (typeof a.description !== 'string' || !a.description || a.description.length > 300) err(`${where}: "description" is required, 300 characters at most`);
		if (!/^\d+\.\d+\.\d+$/.test(a.version || '')) err(`${where}: "version" must look like 1.0.0`);
		const file = path.join(ADDONS, a.file);
		if (!fs.existsSync(file)) { err(`${where}: addons/${a.file} does not exist`); continue; }
		checkAddonFile(a, file);
	}
	for (const f of fs.readdirSync(ADDONS)) {
		if (/\.js$/.test(f) && !files.has(f)) warn(`addons/${f} is not listed in addons.json, so nobody can install it`);
		else if (!/\.(js|json)$/.test(f)) err(`addons/${f}: only .js and addons.json belong in this folder`);
	}
}

function checkAddonFile(a, file) {
	const rel = `addons/${a.file}`;
	const src = fs.readFileSync(file, 'utf8');
	if (Buffer.byteLength(src) > MAX_ADDON_BYTES) err(`${rel}: larger than ${MAX_ADDON_BYTES / 1000} KB`);
	if (!/^\s*(\/\/|\/\*)/.test(src)) warn(`${rel}: please start with a comment saying what the add-on does`);
	if (!/export\s+default\b/.test(src)) err(`${rel}: needs "export default { id, init(api) { … } }"`);
	if (!new RegExp(`\\bid:\\s*['"]${a.id}['"]`).test(src)) err(`${rel}: the id inside the file must be "${a.id}"`);
	if (!/\binit\s*\(\s*api\s*\)/.test(src)) err(`${rel}: needs an init(api) function`);
	if (!/\bdispose\b/.test(src)) warn(`${rel}: no dispose() returned, so removing the add-on may leave things behind`);
	try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); } catch (e) { err(`${rel}: syntax error: ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')}`); }
	for (const [re, why] of FORBIDDEN) {
		const m = re.exec(src);
		if (m) err(`${rel}: ${why} (line ${src.slice(0, m.index).split('\n').length})`);
	}
	if (/^\s*import\s/m.test(src)) warn(`${rel}: uses import. Add-ons should be a single self-contained file`);
	// every web address the add-on contains, for the reviewer
	const domains = new Set();
	for (const m of src.matchAll(/https?:\/\/[^\s'"`)\\]+/g)) {
		try { const u = new URL(m[0].replace(/\$\{.*$/, '')); domains.add(u.protocol === 'http:' ? 'INSECURE http://' + u.hostname : u.hostname); } catch { /* template part */ }
	}
	for (const d of domains) if (d.startsWith('INSECURE')) err(`${rel}: uses a non-https address (${d})`);
	note(`${rel} contacts: ${domains.size ? [...domains].join(', ') : 'nothing (works offline)'}`);
	if (/\bfetch\s*\(/.test(src) && !domains.size) warn(`${rel}: calls fetch() with an address the checker could not see. Explain it in the pull request`);
}

function checkNews() {
	const news = readJson(path.join(ROOT, 'News.json'), 'News.json');
	if (!news) return;
	const https = (u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };
	const user = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
	const seen = new Set();
	const text = (v, max, label, where, required) => {
		if (v === undefined || v === '') { if (required) err(`${where}: "${label}" is required`); return; }
		if (typeof v !== 'string') return err(`${where}: "${label}" must be text`);
		if (v.length > max) err(`${where}: "${label}" is longer than ${max} characters`);
		if (/[<>]/.test(v)) err(`${where}: "${label}" contains < or >. News is plain text only`);
	};
	for (const p of news.posts || []) {
		const where = `News post "${p && p.id}"`;
		if (!p || !p.id) { err('a news post has no id'); continue; }
		if (seen.has(p.id)) err(`${where}: duplicate id`); seen.add(p.id);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) err(`${where}: "date" must look like 2026-10-28`);
		text(p.title, 120, 'title', where, true); text(p.summary, 300, 'summary', where, false); text(p.project, 40, 'project', where, false);
		if (p.url !== undefined && !https(p.url)) err(`${where}: "url" must be an https address`);
		if (p.image !== undefined && !https(p.image)) err(`${where}: "image" must be an https address`);
		const author = typeof p.author === 'string' ? p.author : p.author && p.author.github;
		if (!author) warn(`${where}: add "author": "<your GitHub username>" so you get a tag`);
		else if (!user.test(author)) err(`${where}: "author" is not a valid GitHub username`);
	}
	for (const c of news.cards || []) {
		const where = `News card "${c && c.id}"`;
		if (!c || !c.id) { err('a news card has no id'); continue; }
		text(c.title, 80, 'title', where, true); text(c.text, 240, 'text', where, false);
		if (!https(c.url)) err(`${where}: "url" must be an https address`);
		if (c.author !== undefined && !user.test(typeof c.author === 'string' ? c.author : (c.author || {}).github || '')) err(`${where}: "author" is not a valid GitHub username`);
	}
}

// The pull request description must have every box in "Safety, privacy and security" ticked
function checkPullRequest(body) {
	const start = body.search(/##\s*Safety, privacy and security/i);
	if (start < 0) return err('The pull request description is missing the "Safety, privacy and security" section. Please use the template.');
	const section = body.slice(start).replace(/^##[^\n]*\n/, '').split(/\n##\s/)[0];
	const boxes = section.match(/^\s*-\s*\[[ xX]\]/gm) || [];
	const open = section.match(/^\s*-\s*\[ \]/gm) || [];
	if (!boxes.length) err('No checklist found in the safety section. Please use the template.');
	else if (open.length) err(`${open.length} of ${boxes.length} safety boxes are not ticked. Read each one, then tick it.`);
}

// In a pull request, only check what the pull request touches (Ampere add-ons and news)
let relevant = true;
if (process.env.BASE_SHA && process.env.HEAD_SHA) {
	try {
		const changed = execFileSync('git', ['diff', '--name-only', process.env.BASE_SHA + '...' + process.env.HEAD_SHA], { encoding: 'utf8' }).split('\n');
		relevant = changed.some((f) => /^Projects\/NewTab\/(addons\/|News\.json$)|^\.github\/scripts\/check-ampere\.js$/.test(f));
	} catch { relevant = true; }
}
if (relevant) {
	checkAddons();
	checkNews();
	if (process.env.PR_BODY !== undefined) checkPullRequest(process.env.PR_BODY);
} else note('This pull request does not touch Ampere add-ons or news, so there is nothing to check.');

const out = [];
out.push(errors.length ? `## ❌ ${errors.length} problem${errors.length > 1 ? 's' : ''} to fix` : '## ✅ Automatic checks passed');
for (const m of errors) out.push(`- ❌ ${m}`);
for (const m of warnings) out.push(`- ⚠️ ${m}`);
if (notes.length) { out.push('', '### For the reviewer'); for (const m of notes) out.push(`- ${m}`); }
out.push('', '_These checks catch common mistakes. They do not prove an add-on is safe: the code is still read by a person before it is accepted._');
const report = out.join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
process.exit(errors.length ? 1 : 0);
