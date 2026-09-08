/*
 * Service worker: present only so the page meets the installability criteria and can be
 * added to the Quest app library as a launchable icon.
 *
 * It deliberately caches NOTHING. A control panel that serves a stale app.js from cache
 * after the operator updated the safety logic is a worse failure than a panel that does
 * not open at all, and the relay is on localhost or the LAN — there is no slow network to
 * cache around.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// A fetch handler must exist for the app to be installable. Not calling respondWith()
// lets every request fall through to the network untouched.
self.addEventListener('fetch', () => {});
