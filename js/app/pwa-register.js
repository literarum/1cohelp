'use strict';

import { ASSET_QUERY_VERSION } from '../constants-pwa.js';

/** @type {string|null} предотвращает повторную привязку обработчиков к тому же waiting worker */
let wiredWaitingScriptUrl = null;

/**
 * @returns {HTMLElement}
 */
function ensureUpdateBanner() {
    let el = document.getElementById('pwa-update-banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pwa-update-banner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:0',
        'z-index:200000',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'gap:12px',
        'flex-wrap:wrap',
        'padding:calc(10px + env(safe-area-inset-top,0px)) 14px 10px 14px',
        'font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
        'color:#f9fafb',
        'background:linear-gradient(90deg,#1e1b4b,#312e81)',
        'border-bottom:1px solid rgba(255,255,255,0.12)',
        'box-shadow:0 4px 24px rgba(0,0,0,0.35)',
    ].join(';');
    el.innerHTML = `
<span id="pwa-update-banner-text">Доступна новая версия приложения.</span>
<button type="button" id="pwa-update-apply" style="padding:6px 14px;border-radius:8px;border:none;font:inherit;font-weight:600;cursor:pointer;background:#6366f1;color:#fff">Обновить</button>
<button type="button" id="pwa-update-dismiss" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.35);font:inherit;cursor:pointer;background:transparent;color:#e5e7eb">Позже</button>
`.trim();
    document.body.appendChild(el);
    return el;
}

/**
 * @param {ServiceWorkerRegistration} registration
 */
function wireWaitingWorker(registration) {
    const waiting = registration.waiting;
    if (!waiting) return;

    const wUrl = waiting.scriptURL || '';
    if (wiredWaitingScriptUrl === wUrl) return;
    wiredWaitingScriptUrl = wUrl;

    const banner = ensureUpdateBanner();
    const text = document.getElementById('pwa-update-banner-text');
    const btnApply = document.getElementById('pwa-update-apply');
    const btnDismiss = document.getElementById('pwa-update-dismiss');
    if (!text || !btnApply || !btnDismiss) return;

    banner.hidden = false;

    const dismiss = () => {
        banner.hidden = true;
    };

    btnDismiss.onclick = dismiss;

    btnApply.onclick = () => {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        const onControllerChange = () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
        text.textContent = 'Применяем обновление…';
        btnApply.disabled = true;
        btnDismiss.disabled = true;
    };

    try {
        if (typeof window.showNotification === 'function') {
            window.showNotification('Доступна новая версия. Нажмите «Обновить» в панели сверху.', 'info', 8000);
        }
    } catch {
        /* no-op */
    }
}

/**
 * @param {ServiceWorkerRegistration} registration
 */
function listenForInstallingWorker(registration) {
    registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                wireWaitingWorker(registration);
            }
        });
    });
}

/**
 * Публичное состояние для диагностики (второй контур наблюдения).
 */
export function getPwaRuntimeSnapshot() {
    const sw = navigator.serviceWorker;
    const ctrl = sw && sw.controller;
    return {
        supported: Boolean(sw),
        controller: Boolean(ctrl),
        assetQueryVersion: ASSET_QUERY_VERSION,
        controllerScriptUrl: ctrl ? ctrl.scriptURL : null,
        controllerState: ctrl ? ctrl.state : null,
    };
}

/**
 * Снимок PWA для машинного отделения и diagnostic bundle: синхронные поля + регистрация SW.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getPwaCockpitBlock() {
    const snapshot = getPwaRuntimeSnapshot();
    if (!snapshot.supported) {
        return { ...snapshot, registration: null, note: 'Service Worker API недоступен' };
    }
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            return {
                ...snapshot,
                registration: null,
                note: 'Регистрация SW не найдена',
            };
        }
        const slim = (w) =>
            w && typeof w === 'object' ? { state: w.state, scriptURL: w.scriptURL } : null;
        return {
            ...snapshot,
            registration: {
                scope: reg.scope,
                installing: slim(reg.installing),
                waiting: slim(reg.waiting),
                active: slim(reg.active),
            },
        };
    } catch (err) {
        return {
            ...snapshot,
            registration: null,
            registrationError: err?.message || String(err),
        };
    }
}

/**
 * Регистрация SW и проверка обновлений (фокус / видимость).
 */
export function initPwaShell() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    const swUrl = new URL('sw.js', window.location.href);
    const scope = new URL('./', window.location.href);

    navigator.serviceWorker
        .register(swUrl.href, { scope: scope.href, updateViaCache: 'none' })
        .then((registration) => {
            listenForInstallingWorker(registration);
            if (registration.waiting && navigator.serviceWorker.controller) {
                wireWaitingWorker(registration);
            }

            const check = () => registration.update().catch(() => {});
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') check();
            });
            window.addEventListener('focus', check);
        })
        .catch((err) => {
            console.warn('[pwa] service worker registration failed', err);
        });
}
