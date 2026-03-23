'use strict';

/**
 * Центральный буфер необработанных ошибок и отказов промисов (дублирующий контур к инженерному кокпиту).
 * Инициализируется как можно раньше в script.js, до тяжёлой логики приложения.
 */

const MAX_ENTRIES = 80;

let initialized = false;
/** @type {((source: string, errorLike: unknown, extra?: unknown) => void) | null} */
let cockpitMirror = null;
/** @type {{ title: string, message: string, ts: number, source: string, isFault: boolean }[]} */
let buffer = [];

/**
 * Дублирует события в буфер инженерного кокпита без повторного вызова ingest (избегаем циклов).
 * @param {(source: string, errorLike: unknown, extra?: unknown) => void} fn
 */
export function setRuntimeHubCockpitMirror(fn) {
    cockpitMirror = typeof fn === 'function' ? fn : null;
}

function safeExtra(extra) {
    if (extra == null) return '';
    try {
        if (typeof extra === 'string') return extra.length > 800 ? `${extra.slice(0, 800)}…` : extra;
        const s = JSON.stringify(extra);
        return s.length > 800 ? `${s.slice(0, 800)}…` : s;
    } catch {
        return String(extra);
    }
}

function normalizeBody(errorLike) {
    if (errorLike == null) return 'null';
    if (typeof errorLike === 'string') return errorLike.length > 3500 ? `${errorLike.slice(0, 3500)}…` : errorLike;
    if (errorLike instanceof Error) {
        const s = errorLike.stack || errorLike.message || String(errorLike);
        return s.length > 3500 ? `${s.slice(0, 3500)}…` : s;
    }
    try {
        const s = JSON.stringify(errorLike);
        return s.length > 3500 ? `${s.slice(0, 3500)}…` : s;
    } catch {
        return String(errorLike);
    }
}

/**
 * @param {string} source
 * @param {unknown} errorLike
 * @param {unknown} [extra]
 * @param {{ mirror?: boolean, signalOnly?: boolean }} [opts]
 *        mirror=false — уже продублировано в кокпит (console.error).
 *        signalOnly=true — телеметрия (longtask и т.д.), не ошибка: не в счётчики самопроверки, не в HUD «ошибки».
 */
export function ingestRuntimeHubIssue(source, errorLike, extra = null, opts = {}) {
    const isFault = opts.signalOnly !== true;
    const title = `Runtime / ${source}`;
    const body = normalizeBody(errorLike);
    const ex = safeExtra(extra);
    const message = [body, ex].filter(Boolean).join(' | ').slice(0, 4500);
    buffer.push({ title, message, ts: Date.now(), source, isFault });
    if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
    if (isFault && typeof window !== 'undefined') {
        const touch = window.BackgroundStatusHUD?.touchRuntimeIssues;
        if (typeof touch === 'function') {
            queueMicrotask(() => {
                try {
                    touch();
                } catch {
                    /* HUD не обязан быть готов */
                }
            });
        }
    }
    if (isFault && opts.mirror !== false && cockpitMirror) {
        try {
            cockpitMirror(source, errorLike, extra);
        } catch {
            /* зеркало не должно ломать хаб */
        }
    }
}

/** Количество записей, которые считаются сбоями (исключая perf.longtask и др. signalOnly). */
export function getRuntimeHubIssueCount() {
    return buffer.filter((e) => e.isFault).length;
}

/** Сброс буфера (например, из инженерного кокпита после явной очистки пользователем). */
export function clearRuntimeHubBuffer() {
    buffer = [];
}

/**
 * @param {number} [limit]
 * @returns {{ title: string, message: string }[]}
 */
export function getRuntimeHubIssuesForHealth(limit = 40) {
    const n = Math.max(1, limit);
    const faults = buffer.filter((e) => e.isFault);
    return faults.slice(-n).map(({ title, message }) => ({ title, message }));
}

/**
 * Сигналы производительности (без ошибок), для расширенного отчёта при необходимости.
 * @param {number} [limit]
 */
export function getRuntimeHubPerformanceSignalsForHealth(limit = 15) {
    const n = Math.max(1, limit);
    const signals = buffer.filter((e) => !e.isFault);
    return signals.slice(-n).map(({ title, message }) => ({ title, message }));
}

export function getRuntimeHubPerformanceSignalCount() {
    return buffer.filter((e) => !e.isFault).length;
}

/**
 * Записи сбоев для инженерного кокпита (дублирующий контур к state.errors).
 * @param {number} [limit]
 * @returns {{ tsIso: string, source: string, title: string, message: string }[]}
 */
export function getRuntimeHubFaultEntries(limit = 300) {
    const n = Math.max(1, limit);
    const faults = buffer.filter((e) => e.isFault);
    return faults.slice(-n).map((e) => ({
        tsIso: new Date(e.ts).toISOString(),
        source: e.source,
        title: e.title,
        message: e.message,
    }));
}

export function initRuntimeIssueHub() {
    if (initialized) return;
    initialized = true;
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
        const err = event.error;
        const t = event.target;
        let body = err || event.message || 'Error';
        let extra = {
            file: event.filename,
            line: event.lineno,
            col: event.colno,
        };

        if (t instanceof HTMLImageElement) {
            const src = (t.currentSrc || t.src || '').trim();
            const id = t.id ? `#${t.id}` : '';
            body = `Не удалось загрузить изображение${id ? ` ${id}` : ''}`;
            extra = {
                ...extra,
                kind: 'resource',
                tag: 'IMG',
                src: src.length > 1800 ? `${src.slice(0, 1800)}…` : src,
            };
        } else if (t instanceof HTMLScriptElement && t.src) {
            const src = t.src.trim();
            body = 'Ошибка загрузки или выполнения скрипта';
            extra = { ...extra, kind: 'resource', tag: 'SCRIPT', src: src.slice(0, 1800) };
        } else if (t instanceof HTMLLinkElement && t.rel === 'stylesheet' && t.href) {
            body = 'Ошибка загрузки таблицы стилей';
            extra = {
                ...extra,
                kind: 'resource',
                tag: 'LINK',
                href: t.href.slice(0, 1800),
            };
        }

        ingestRuntimeHubIssue('window.error', body, extra);
    });

    window.addEventListener('unhandledrejection', (event) => {
        ingestRuntimeHubIssue('unhandledrejection', event.reason);
    });
}
