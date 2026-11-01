#!/usr/bin/env node
// Makes the Open Graph / link-preview picture for the Fonts page: ../Preview.png (1200 x 630).
//
//   cd Fonts/og && node make-og.js
//
// Needs Playwright with Chromium installed (npm i playwright). Edit og.html to change the design, then run this again.
// The picture is drawn at 1200 x 630 and saved at 2x (2400 x 1260) so it stays sharp on high-resolution screens.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

(async () => {
	const out = path.join(__dirname, '..', 'Preview.png');
	const browser = await chromium.launch();
	const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })).newPage();
	await page.goto(pathToFileURL(path.join(__dirname, 'og.html')).href);
	await page.evaluate(() => document.fonts.ready);
	if (!(await page.evaluate(() => document.fonts.check('20px Electrolyte')))) throw new Error('The Electrolyte font did not load, so the picture was not saved.');
	await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
	await browser.close();
	console.log('Saved ' + out);
})().catch((e) => { console.error(e.message); process.exit(1); });
