// Service worker for message notifications. Mobile browsers only allow notifications through a
// service worker, and clicking one should bring the chat tab back and open that chat.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
	e.notification.close();
	const sessId = e.notification.data?.sessId;
	e.waitUntil((async () => {
		const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		const c = all[0];
		if (c) { await c.focus().catch(() => {}); c.postMessage({ type: 'open-chat', sessId }); }
		else await self.clients.openWindow(self.registration.scope);
	})());
});
