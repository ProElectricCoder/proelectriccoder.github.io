// Content script — injected only on https://proelectriccoder.pages.dev/Projects/NewTab/* (see manifest.json).
// Tells the extension's home page which version of the extension is installed. Version.js runs first
// and defines globalThis.EXTENSION_VERSION (both share this content-script world).
(() => {
	'use strict';
	const version = globalThis.EXTENSION_VERSION;
	if (!version) return;

	const announce = () => window.postMessage(
		{ source: 'proelectriccoder-newtab', type: 'extension-version', version },
		window.location.origin
	);

	// Pushed on load, and also answered on request, so it works whichever side finishes loading first
	document.documentElement.dataset.newtabExtensionVersion = version;
	window.addEventListener('message', (e) => {
		if (e.source !== window || e.origin !== window.location.origin) return;
		if (e.data && e.data.source === 'proelectriccoder-home' && e.data.type === 'get-extension-version') announce();
	});
	announce();
})();
