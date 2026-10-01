/**
 * Service Worker: офлайн-оболочка + stale-while-revalidate (единый кэш приложения).
 * Версию ASSET_QUERY_VERSION синхронизировать с site/js/constants-pwa.js и ?v= в index.html.
 * Precache URL строятся от каталога SW (см. site/js/utils/pwa-scope-dir.js — та же формула pathname).
 * skipWaiting только по сообщению SKIP_WAITING.
 */
'use strict';

/** @type {string} */
const ASSET_QUERY_VERSION = '20261001pwa-sync';
/** Совпадает с query у main.css в index.html (иначе precache не совпадает с документом). */
const MAIN_CSS_QUERY_VERSION = '20261001pwa-sync';
const VERSION = `20261001-sync-v3`;
const CACHE_APP = `copilot-app-${VERSION}`;

/**
 * Каталог приложения: /sw.js → / ; /1cohelp/sw.js → /1cohelp/
 * (см. site/js/utils/pwa-scope-dir.js — держать логику идентичной)
 * @returns {string}
 */
function serviceWorkerScopeDirPathname() {
    const p = self.location.pathname || '/';
    if (p === '/' || p === '') return '/';
    return p.replace(/\/[^/]+$/, '/');
}

/**
 * Ресурс относительно каталога приложения (корректно при деплое под /1cohelp/ и т.п.).
 * @param {string} rel например "index.html", "css/main.css?v=1"
 * @returns {string}
 */
function scopedAsset(rel) {
    const dir = serviceWorkerScopeDirPathname();
    const base = new URL(dir, self.location.origin);
    const trimmed = rel.replace(/^\//, '');
    return new URL(trimmed, base).href;
}

const SHELL_PRECACHE = [
    scopedAsset(''),
    scopedAsset('index.html'),
    scopedAsset(`css/tailwind.generated.css?v=${ASSET_QUERY_VERSION}`),
    scopedAsset(`css/main.css?v=${MAIN_CSS_QUERY_VERSION}`),
    scopedAsset(`script.js?v=${ASSET_QUERY_VERSION}`),
    scopedAsset(`js/entry.js?v=${ASSET_QUERY_VERSION}`),
    scopedAsset('js/vendor-config.js'),
    scopedAsset('js/vendor-loader.js'),
    scopedAsset('manifest.webmanifest'),
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
        console.error(
            '[sw] precache: ни один shell-ресурс не закэширован; офлайн после первого визита восстановится через SWR.',
        );
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
const CACHE_MAX_ENTRIES = 400;
let cachePutsSinceTrim = 0;
/** Ограничивает рост кэша (старые ?v= варианты, пользовательские файлы): удаляем самые ранние записи. */
async function trimCacheIfNeeded(cache) {
    cachePutsSinceTrim += 1;
    if (cachePutsSinceTrim < 25) return;
    cachePutsSinceTrim = 0;
    const keys = await cache.keys();
    let extra = keys.length - CACHE_MAX_ENTRIES;
    const shell = new Set(SHELL_PRECACHE.map((u) => new URL(u, self.location.href).pathname));
    for (let i = 0; i < keys.length && extra > 0; i++) {
        if (shell.has(new URL(keys[i].url).pathname)) continue; // оболочка приложения не вытесняется
        await cache.delete(keys[i]);
        extra -= 1;
    }
}

async function staleWhileRevalidate(event, request, cacheName) {
    const cache = await caches.open(cacheName);
    // Точное совпадение — сразу; ignoreSearch (иная ?v=) — только если сети нет, чтобы не смешивать версии файлов.
    const cached = await cache.match(request);
    const fetchPromise = fetch(request)
        .then((response) => {
            if (response && response.ok && response.type === 'basic') {
                // Ошибка записи в кэш (квота) не должна терять успешный сетевой ответ.
                return cache
                    .put(request, response.clone())
                    .then(() => trimCacheIfNeeded(cache))
                    .catch((err) => console.warn('[sw] cache.put failed', request.url, err))
                    .then(() => response);
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
    const loose = await cache.match(request, { ignoreSearch: true });
    if (loose) return loose;
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
    const swPathname = new URL(self.location.href).pathname;
    if (url.pathname === swPathname) return;

    event.respondWith(staleWhileRevalidate(event, request, CACHE_APP));
});
