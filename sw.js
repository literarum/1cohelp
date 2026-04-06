/**
 * Service Worker: офлайн-оболочка + stale-while-revalidate (единый кэш приложения).
 * Версию ASSET_QUERY_VERSION синхронизировать с site/js/constants-pwa.js и ?v= в index.html.
 * skipWaiting только по сообщению SKIP_WAITING.
 */
'use strict';

/** @type {string} */
const ASSET_QUERY_VERSION = '20260403pwa';
const VERSION = `20260403pwa1`;
const CACHE_APP = `copilot-app-${VERSION}`;

/**
 * @param {string} pathWithQuery
 * @returns {string}
 */
function asset(pathWithQuery) {
    return new URL(pathWithQuery, self.location.origin).href;
}

const SHELL_PRECACHE = [
    asset('/'),
    asset('/index.html'),
    asset(`/css/tailwind.generated.css?v=${ASSET_QUERY_VERSION}`),
    asset(`/css/main.css?v=${ASSET_QUERY_VERSION}`),
    asset(`/script.js?v=${ASSET_QUERY_VERSION}`),
    asset(`/js/entry.js?v=${ASSET_QUERY_VERSION}`),
    asset('/js/vendor-config.js'),
    asset('/js/vendor-loader.js'),
    asset('/manifest.webmanifest'),
];

/**
 * Precache по одному URL: addAll() откатывает весь батч при любой ошибке (MDN).
 * @param {Cache} cache
 * @param {string[]} urls
 * @returns {Promise<{ ok: number, failed: number }>}
 */
async function precacheShellBestEffort(cache, urls) {
    let ok = 0;
    let failed = 0;
    for (const url of urls) {
        try {
            await cache.add(url);
            ok += 1;
        } catch (err) {
            failed += 1;
            console.warn('[sw] precache skip', url, err);
        }
    }
    if (ok === 0 && urls.length > 0) {
        console.error('[sw] precache: ни один shell-ресурс не закэширован; офлайн после первого визита восстановится через SWR.');
    }
    return { ok, failed };
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_APP).then((cache) => precacheShellBestEffort(cache, SHELL_PRECACHE)),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.map((key) => {
                    if (key === CACHE_APP) return Promise.resolve();
                    if (key.startsWith('copilot-app-')) {
                        return caches.delete(key);
                    }
                    if (key.startsWith('copilot-shell-') || key.startsWith('copilot-runtime-')) {
                        return caches.delete(key);
                    }
                    return Promise.resolve();
                }),
            );
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('message', (event) => {
    const data = event.data;
    if (data && data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

/**
 * @param {FetchEvent} event
 * @param {Request} request
 * @param {string} cacheName
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(event, request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request)
        .then((response) => {
            if (response && response.ok && response.type === 'basic') {
                return cache.put(request, response.clone()).then(() => response);
            }
            return response;
        })
        .catch(() => undefined);

    if (cached) {
        event.waitUntil(fetchPromise);
        return cached;
    }
    const networkResponse = await fetchPromise;
    if (networkResponse) {
        return networkResponse;
    }
    return new Response('Сеть недоступна и нет копии в кэше.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (request.headers.has('range')) return;
    if (url.pathname === '/sw.js') return;

    event.respondWith(staleWhileRevalidate(event, request, CACHE_APP));
});
