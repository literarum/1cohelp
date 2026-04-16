'use strict';

/**
 * Центральный буфер необработанных ошибок и отказов промисов (дублирующий контур к инженерному кокпиту).
 * Инициализируется как можно раньше в script.js, до тяжёлой логики приложения.
 *
 * Интеллект наблюдения (2026): устойчивые отпечатки, классификация, серьёзность, цепочка Error.cause,
 * учёт повторов в сессии и метрики «давления дублей» для перекрёстной диагностики (подход с резервированием сигналов).
 */

/** Достаточная глубина буфера для сессии; дублирующий контур — буфер кокпита (см. engineering-cockpit). */
const MAX_ENTRIES = 500;

let initialized = false;
/** @type {((source: string, errorLike: unknown, extra?: unknown) => void) | null} */
let cockpitMirror = null;

/**
 * @typedef {'resource_script' | 'resource_stylesheet' | 'resource_image' | 'resource_other' | 'network_fetch' | 'promise' | 'console' | 'runtime_js' | 'telemetry' | 'unknown'} RuntimeFaultCategory
 */

/**
 * @typedef {'critical' | 'high' | 'medium' | 'low'} RuntimeFaultSeverity
 */

/**
 * @typedef {{ title: string, message: string, ts: number, source: string, isFault: boolean, fingerprint: string, category: RuntimeFaultCategory, severity: RuntimeFaultSeverity, sessionOccurrence: number }} RuntimeHubEntry
 */

/** @type {RuntimeHubEntry[]} */
let buffer = [];

/** @type {Map<string, { count: number, firstTs: number, lastTs: number }>} */
const fingerprintStats = new Map();

/**
 * Дублирует события в буфер инженерного кокпита без повторного вызова ingest (избегаем циклов).
 * @param {(source: string, errorLike: unknown, extra?: unknown) => void} fn
 */
export function setRuntimeHubCockpitMirror(fn) {
    cockpitMirror = typeof fn === 'function' ? fn : null;
}

function fnv1a32Hex(input) {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

function stableExtraForFingerprint(extra) {
    if (extra == null || typeof extra !== 'object') return '';
    const ex = /** @type {Record<string, unknown>} */ (extra);
    const o = {};
    const pick = ['kind', 'tag', 'file', 'line', 'col', 'status', 'responseType'];
    for (const k of pick) {
        if (k in ex && ex[k] != null) o[k] = ex[k];
    }
    for (const urlKey of ['src', 'href', 'url']) {
        if (typeof ex[urlKey] === 'string' && ex[urlKey]) {
            const raw = /** @type {string} */ (ex[urlKey]);
            try {
                const u = new URL(raw, 'https://placeholder.invalid');
                o[urlKey] = `${u.pathname}${u.search}`.slice(0, 400);
            } catch {
                o[urlKey] = raw.slice(0, 400);
            }
        }
    }
    try {
        return JSON.stringify(o);
    } catch {
        return '';
    }
}

/**
 * @param {string} source
 * @param {unknown} extra
 * @returns {RuntimeFaultCategory}
 */
function classifyRuntimeFaultCategory(source, extra) {
    const ex = extra && typeof extra === 'object' ? /** @type {Record<string, unknown>} */ (extra) : null;
    if (ex?.kind === 'resource') {
        const tag = String(ex.tag || '').toUpperCase();
        if (tag === 'SCRIPT') return 'resource_script';
        if (tag === 'LINK') return 'resource_stylesheet';
        if (tag === 'IMG') return 'resource_image';
        return 'resource_other';
    }
    if (ex?.kind === 'network' && String(ex.tag || '').toUpperCase() === 'FETCH') return 'network_fetch';
    if (source === 'unhandledrejection') return 'promise';
    if (source === 'console.error' || source.startsWith('console.')) return 'console';
    if (source === 'window.error') return 'runtime_js';
    if (/perf|longtask|telemetry/i.test(source)) return 'telemetry';
    return 'unknown';
}

/**
 * @param {RuntimeFaultCategory} category
 * @param {string} source
 * @param {unknown} [extra]
 * @returns {RuntimeFaultSeverity}
 */
function classifyRuntimeFaultSeverity(category, source, extra) {
    if (category === 'resource_script') return 'critical';
    if (category === 'resource_stylesheet') return 'high';
    if (category === 'resource_image' || category === 'resource_other') return 'medium';
    if (category === 'network_fetch') {
        const ex = extra && typeof extra === 'object' ? /** @type {Record<string, unknown>} */ (extra) : null;
        const st = typeof ex?.status === 'number' ? ex.status : null;
        if (st == null || st === 0) return 'high';
        if (st >= 500) return 'high';
        if (st === 404) return 'low';
        if (st >= 400) return 'medium';
        return 'medium';
    }
    if (category === 'promise') return 'high';
    if (category === 'console') return 'medium';
    if (category === 'runtime_js') return 'high';
    if (category === 'telemetry') return 'low';
    if (source && /bootstrap|boot/i.test(source)) return 'high';
    return 'low';
}

/**
 * @param {string} source
 * @param {string} body
 * @param {unknown} extra
 * @param {RuntimeFaultCategory} category
 */
function computeRuntimeFaultFingerprint(source, body, extra, category) {
    const slice = body.length > 2400 ? body.slice(0, 2400) : body;
    const basis = [source, category, slice, stableExtraForFingerprint(extra)].join('\u241e');
    return fnv1a32Hex(basis);
}

function formatErrorWithCauseChain(err, maxLen) {
    const parts = [];
    let cur = /** @type {unknown} */ (err);
    let depth = 0;
    const maxDepth = 8;
    while (cur != null && depth < maxDepth) {
        if (cur instanceof Error) {
            const head =
                (cur.name && cur.message ? `${cur.name}: ${cur.message}` : cur.message || cur.name || '').trim();
            const stack = (cur.stack || '').trim();
            const block =
                stack && head && stack.split('\n')[0]?.includes(head.slice(0, 40))
                    ? stack
                    : [head, stack].filter(Boolean).join('\n').trim() || String(cur);
            parts.push(block);
            cur = cur.cause;
            depth += 1;
            continue;
        }
        parts.push(`non-Error cause: ${normalizeBodyLeaf(cur)}`);
        break;
    }
    const joined = parts.join('\n--- caused by ---\n');
    return joined.length > maxLen ? `${joined.slice(0, maxLen)}…` : joined;
}

function normalizeBodyLeaf(errorLike) {
    if (errorLike == null) return 'null';
    if (typeof errorLike === 'string')
        return errorLike.length > 1200 ? `${errorLike.slice(0, 1200)}…` : errorLike;
    try {
        const s = JSON.stringify(errorLike);
        return s.length > 1200 ? `${s.slice(0, 1200)}…` : s;
    } catch {
        return String(errorLike);
    }
}

function normalizeBody(errorLike) {
    if (errorLike == null) return 'null';
    if (typeof errorLike === 'string')
        return errorLike.length > 3500 ? `${errorLike.slice(0, 3500)}…` : errorLike;
    if (errorLike instanceof Error) return formatErrorWithCauseChain(errorLike, 3500);
    try {
        const s = JSON.stringify(errorLike);
        return s.length > 3500 ? `${s.slice(0, 3500)}…` : s;
    } catch {
        return String(errorLike);
    }
}

function safeExtra(extra) {
    if (extra == null) return '';
    try {
        if (typeof extra === 'string')
            return extra.length > 800 ? `${extra.slice(0, 800)}…` : extra;
        const s = JSON.stringify(extra);
        return s.length > 800 ? `${s.slice(0, 800)}…` : s;
    } catch {
        return String(extra);
    }
}

function duplicatePressureFromCounts(faultCount, uniqueFingerprints) {
    if (faultCount < 3) return 'none';
    const ratio = uniqueFingerprints > 0 ? uniqueFingerprints / faultCount : 0;
    if (faultCount >= 8 && ratio <= 0.25) return 'high';
    if (faultCount >= 5 && ratio <= 0.35) return 'high';
    if (ratio < 0.5) return 'elevated';
    return 'none';
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
    let body = 'null';
    let ex = '';
    let category = /** @type {RuntimeFaultCategory} */ ('unknown');
    let severity = /** @type {RuntimeFaultSeverity} */ ('low');
    let fingerprint = '00000000';
    let sessionOccurrence = 1;

    try {
        body = normalizeBody(errorLike);
        ex = safeExtra(extra);
        category = classifyRuntimeFaultCategory(source, extra);
        severity = classifyRuntimeFaultSeverity(category, source, extra);
        fingerprint = computeRuntimeFaultFingerprint(source, body, extra, category);
    } catch {
        body = '(runtime-hub: сбой нормализации сигнала — деградированная запись)';
        ex = safeExtra({ degraded: true, source });
        category = 'unknown';
        severity = 'medium';
        fingerprint = fnv1a32Hex(`${source}\u241edegraded-normalizer`);
    }

    const ts = Date.now();
    if (isFault) {
        const prev = fingerprintStats.get(fingerprint) || {
            count: 0,
            firstTs: ts,
            lastTs: ts,
        };
        const next = {
            count: prev.count + 1,
            firstTs: prev.firstTs || ts,
            lastTs: ts,
        };
        fingerprintStats.set(fingerprint, next);
        sessionOccurrence = next.count;
    }

    const message = [body, ex].filter(Boolean).join(' | ').slice(0, 4500);
    const intelSuffix = isFault
        ? `\n[runtime-intel fp=${fingerprint} sev=${severity} cat=${category} session×=${sessionOccurrence}]`
        : `\n[runtime-intel fp=${fingerprint} cat=${category} signal]`;
    const fullMessage = (message + intelSuffix).slice(0, 4500);

    buffer.push({
        title,
        message: fullMessage,
        ts,
        source,
        isFault,
        fingerprint,
        category,
        severity,
        sessionOccurrence,
    });
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
    fingerprintStats.clear();
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
 * @returns {{ tsIso: string, source: string, title: string, message: string, fingerprint: string, category: RuntimeFaultCategory, severity: RuntimeFaultSeverity, sessionOccurrence: number }[]}
 */
export function getRuntimeHubFaultEntries(limit = 300) {
    const n = Math.max(1, limit);
    const faults = buffer.filter((e) => e.isFault);
    return faults.slice(-n).map((e) => ({
        tsIso: new Date(e.ts).toISOString(),
        source: e.source,
        title: e.title,
        message: e.message,
        fingerprint: e.fingerprint,
        category: e.category,
        severity: e.severity,
        sessionOccurrence: e.sessionOccurrence,
    }));
}

/**
 * Количество сбоев в буфере за окно времени (мс), удовлетворяющих предикату.
 * Для перекрёстной самодиагностики подсистемы отзыва (второй контур к UI проверки серта).
 * @param {number} windowMs
 * @param {(e: RuntimeHubEntry) => boolean} predicate
 */
export function countRuntimeHubFaultsSince(windowMs, predicate) {
    const w = Math.max(0, Number(windowMs) || 0);
    if (!w) return 0;
    const cutoff = Date.now() - w;
    return buffer.filter((e) => e.isFault && e.ts >= cutoff && predicate(e)).length;
}

function topFingerprintRepeats(limit) {
    const rows = [...fingerprintStats.entries()].map(([fingerprint, v]) => ({
        fingerprint,
        count: v.count,
        firstTs: v.firstTs,
        lastTs: v.lastTs,
    }));
    rows.sort((a, b) => b.count - a.count || b.lastTs - a.lastTs);
    return rows.slice(0, limit);
}

function severityHistogram() {
    /** @type {Record<RuntimeFaultSeverity, number>} */
    const h = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const e of buffer) {
        if (!e.isFault) continue;
        h[e.severity] = (h[e.severity] || 0) + 1;
    }
    return h;
}

/** Мета для диагностического пакета и самопроверки (двухконтурное сравнение с буфером кокпита). */
export function getRuntimeHubBufferMeta() {
    const faults = buffer.filter((e) => e.isFault);
    const signals = buffer.filter((e) => !e.isFault);
    const uniqueFingerprints = new Set(faults.map((e) => e.fingerprint)).size;
    const faultCount = faults.length;
    const dupPressure = duplicatePressureFromCounts(faultCount, uniqueFingerprints);
    const repeatMax = topFingerprintRepeats(1)[0]?.count || 0;
    return {
        capacity: MAX_ENTRIES,
        total: buffer.length,
        faultCount,
        signalCount: signals.length,
        uniqueFaultFingerprints: uniqueFingerprints,
        duplicatePressure: dupPressure,
        fingerprintRepeatMax: repeatMax,
        severityHistogram: severityHistogram(),
        topFingerprintRepeats: topFingerprintRepeats(5),
    };
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
