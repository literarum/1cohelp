'use strict';

/**
 * Четвёртый контур наблюдаемости: неуспешные ответы и сетевые сбои fetch → runtime-issue-hub
 * (дублирует сигнал к кокпиту через mirror, как reporting / console).
 *
 * Не логируем тело ответа и заголовки. Opaque/no-cors ответы со status 0 пропускаются (типичный шум).
 */

import { ingestRuntimeHubIssue } from './runtime-issue-hub.js';

let installed = false;
/** @type {typeof fetch | null} */
let nativeFetch = null;

/**
 * @param {RequestInfo | URL} input
 * @returns {string}
 */
function summarizeFetchTarget(input) {
    try {
        if (typeof input === 'string') {
            const u = new URL(input, 'https://placeholder.invalid');
            return `${u.origin}${u.pathname}${u.search}`.slice(0, 500);
        }
        if (typeof URL !== 'undefined' && input instanceof URL) {
            return `${input.origin}${input.pathname}${input.search}`.slice(0, 500);
        }
        if (typeof Request !== 'undefined' && input instanceof Request) {
            const u = new URL(input.url);
            const m = input.method || 'GET';
            return `${m} ${u.origin}${u.pathname}${u.search}`.slice(0, 500);
        }
    } catch {
        /* fall through */
    }
    return String(input).slice(0, 500);
}

/**
 * @param {Response} res
 * @returns {boolean}
 */
function shouldRecordFailedHttpResponse(res) {
    if (res.ok) return false;
    if (res.type === 'opaque' && res.status === 0) return false;
    if (res.type === 'opaqueredirect') return false;
    return true;
}

/**
 * Сбой запроса к внешнему origin (Google Apps Script и т.п.) или потеря сети — деградация связи,
 * а не дефект приложения: пишем как сигнал (signalOnly), чтобы самотестирование и HUD не краснели
 * из-за недоступного/заблокированного внешнего сервиса при исправных локальных данных.
 * Сбои собственного origin (404 на ресурсы приложения и т.п.) остаются сбоями.
 * @param {RequestInfo | URL} input
 * @returns {boolean}
 */
export function isExternalOrOfflineFetchFailure(input) {
    try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        const raw =
            typeof input === 'string'
                ? input
                : typeof URL !== 'undefined' && input instanceof URL
                  ? input.href
                  : typeof Request !== 'undefined' && input instanceof Request
                    ? input.url
                    : String(input);
        const base =
            typeof location !== 'undefined' && location.href ? location.href : 'https://placeholder.invalid';
        const target = new URL(raw, base);
        const own = typeof location !== 'undefined' && location.origin ? location.origin : '';
        return Boolean(own) && target.origin !== own;
    } catch {
        return false;
    }
}

/**
 * Идемпотентная установка обёртки globalThis.fetch (сразу после initRuntimeIssueHub).
 */
export function initRuntimeFetchFailureReporting() {
    if (installed) return;
    installed = true;
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (!g || typeof g.fetch !== 'function') return;

    nativeFetch = g.fetch.bind(g);
    g.fetch = async (...args) => {
        try {
            const res = await nativeFetch(...args);
            if (shouldRecordFailedHttpResponse(res)) {
                const url = summarizeFetchTarget(args[0]);
                ingestRuntimeHubIssue(
                    'fetch.http_error',
                    `HTTP ${res.status} ${res.statusText || ''}`.trim(),
                    {
                        kind: 'network',
                        tag: 'FETCH',
                        url,
                        status: res.status,
                        responseType: res.type,
                    },
                    { mirror: true, signalOnly: isExternalOrOfflineFetchFailure(args[0]) },
                );
            }
            return res;
        } catch (err) {
            // Намеренная отмена (AbortController) — не сбой сети
            if (err && err.name === 'AbortError') throw err;
            const url = summarizeFetchTarget(args[0]);
            ingestRuntimeHubIssue(
                'fetch.network_error',
                err,
                {
                    kind: 'network',
                    tag: 'FETCH',
                    url,
                },
                { mirror: true, signalOnly: isExternalOrOfflineFetchFailure(args[0]) },
            );
            throw err;
        }
    };
}

/**
 * Для диагностического пакета и перекрёстной проверки.
 */
export function getRuntimeFetchInterceptMeta() {
    return {
        installed,
        nativeFetchPatched: Boolean(nativeFetch),
    };
}

/** Сброс для Vitest (повторная установка перехвата на подменённый fetch). */
export function resetRuntimeFetchInterceptForTests() {
    const g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (installed && nativeFetch && g) {
        try {
            g.fetch = nativeFetch;
        } catch {
            /* ignore */
        }
    }
    installed = false;
    nativeFetch = null;
}
