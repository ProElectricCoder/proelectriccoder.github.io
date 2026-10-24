// Background service worker. Updates are installed here rather than in the new tab page, so closing
// the tab while an update is being written can't leave the extension half-updated. If the worker is
// ever interrupted, Changelog.json still says "updating" and the next check finishes the job.
import { checkAndUpdate } from './Updater.js';

const CHECK_ALARM = 'newtab-update-check';
let running = null;

function runCheck(options = {}) {
	if (!running) {
		// A service worker is stopped after ~30s without events; keep it alive until the update is done
		const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError), 20000);
		running = checkAndUpdate(options)
			.catch((e) => {
				console.warn('[NewTab] Update check failed:', e.message);
				return { status: 'error', error: String(e.message || e) };
			})
			.finally(() => {
				clearInterval(keepAlive);
				running = null;
			});
	}
	return running;
}

function ensureAlarm() {
	chrome.alarms.get(CHECK_ALARM, (alarm) => {
		if (!alarm) chrome.alarms.create(CHECK_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
	});
}

chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); runCheck(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); runCheck(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === CHECK_ALARM) runCheck(); });
ensureAlarm();

// The new tab page asks for a check whenever it opens (and when auto-update is switched on)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const fromOwnPage = sender.id === chrome.runtime.id && sender.url && sender.url.startsWith(chrome.runtime.getURL(''));
	if (!fromOwnPage || !message || message.type !== 'check-update') return;
	runCheck({ manual: !!message.manual }).then(sendResponse);
	return true;   // keep the channel open for the async response
});
