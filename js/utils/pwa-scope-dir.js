'use strict';

/**
 * Каталог приложения по pathname скрипта service worker (например /1cohelp/sw.js → /1cohelp/).
 * Должен совпадать с логикой в site/sw.js (precache в worker не может импортировать ES-модули).
 *
 * @param {string} swPathname pathname URL worker-скрипта
 * @returns {string} префикс пути с ведущим и завершающим слэшем
 */
export function scopeDirFromServiceWorkerPathname(swPathname) {
    const p = swPathname && swPathname.length > 0 ? swPathname : '/';
    if (p === '/' || p === '') return '/';
    return p.replace(/\/[^/]+$/, '/');
}
