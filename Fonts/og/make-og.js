#!/usr/bin/env node
// Makes the Open Graph / link-preview picture for the Fonts page: ../Preview.jpg (1200 x 630).
//
//   cd Fonts/og && node make-og.js
//
// Needs Playwright with Chromium installed (npm i playwright). Edit og.html to change the design, then run this again.
// WhatsApp only shows a link preview picture when the file is small (about 300 KB or less), so the picture is saved at its
// real size (1200 x 630) as a JPEG, and the script lowers the quality step by step until the file is under the limit.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const LIMIT = 300 * 1024;   // bytes

(async () => {
	const out = path.join(__dirname, '..', 'Preview.jpg');
	const browser = await chromium.launch();
	const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
	await page.goto(pathToFileURL(path.join(__dirname, 'og.html')).href);
	await page.evaluate(() => document.fonts.ready);
	if (!(await page.evaluate(() => document.fonts.check('20px Electrolyte')))) throw new Error('The Electrolyte font did not load, so the picture was not saved.');
	let buffer = null, quality = 92;
	for (; quality >= 50; quality -= 4) {
		buffer = await page.screenshot({ type: 'jpeg', quality, clip: { x: 0, y: 0, width: 1200, height: 630 } });
		if (buffer.length <= LIMIT) break;
	}
	await browser.close();
	if (buffer.length > LIMIT) throw new Error(`Even at quality ${quality} the picture is ${Math.round(buffer.length / 1024)} KB, over the ${LIMIT / 1024} KB limit. Simplify the design.`);
	fs.writeFileSync(out, buffer);
	console.log(`Saved ${out} (${Math.round(buffer.length / 1024)} KB, JPEG quality ${quality})`);
})().catch((e) => { console.error(e.message); process.exit(1); });
