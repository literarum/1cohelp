'use strict';

/**
 * Третий контур телеметрии: Reporting API (CSP, deprecation) и Performance longtask.
 * События попадают в тот же буфер, что window.error / unhandledrejection (runtime-issue-hub).
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
 */

import { ingestRuntimeHubIssue } from './runtime-issue-hub.js';

let observersInitialized = false;

/** Минимальная длительность longtask для записи в буфер (снижение шума; порог браузера ~50 ms). */
export const RUNTIME_LONGTASK_RECORD_MIN_MS = 200;

function serializeReportBody(body) {
    if (!body) return '';
    try {
        if (typeof body.toJSON === 'function') return JSON.stringify(body.toJSON());
        return JSON.stringify(body);
    } catch {
        try {
            return String(body);
        } catch {
            return '[ReportBody]';
        }
    }
}

function initReportingObserver() {
    if (typeof ReportingObserver !== 'function') return;

    const handler = (reports) => {
        for (const report of reports) {
            const t = report.type || 'report';
            const bodyStr = serializeReportBody(report.body);
            const msg = bodyStr.length > 3200 ? `${bodyStr.slice(0, 3200)}…` : bodyStr;
            ingestRuntimeHubIssue(
                `reporting.${t}`,
                msg || t,
                { url: report.url },
                { mirror: true },
            );
        }
    };

    const typeSets = [
        ['csp-violation', 'deprecation', 'intervention'],
        ['csp-violation', 'deprecation'],
        ['deprecation'],
    ];

    for (const types of typeSets) {
        try {
            const ro = new ReportingObserver(handler, { types, buffered: true });
            ro.observe();
            return;
        } catch {
            /* следующий набор типов */
        }
    }
}

function initLongTaskObserver() {
    if (typeof PerformanceObserver !== 'function') return;
    const supported = PerformanceObserver.supportedEntryTypes;
    if (!Array.isArray(supported) || !supported.includes('longtask')) return;

    const callback = (list) => {
        for (const entry of list.getEntries()) {
            if (entry.duration < RUNTIME_LONGTASK_RECORD_MIN_MS) continue;
            const name = entry.name || 'unknown';
            const msg = `Блокировка main thread ~${entry.duration.toFixed(0)} ms (start ${entry.startTime.toFixed(0)} ms)`;
            ingestRuntimeHubIssue(
                'perf.longtask',
                msg,
                { name, duration: entry.duration },
                { mirror: false, signalOnly: true },
            );
        }
    };

    try {
        const po = new PerformanceObserver(callback);
        po.observe({ type: 'longtask', buffered: true });
        return;
    } catch {
        /* ignore */
    }
    try {
        const po = new PerformanceObserver(callback);
        po.observe({ entryTypes: ['longtask'] });
    } catch {
        /* ignore */
    }
}

/**
 * Идемпотентный запуск наблюдателей. Вызывать сразу после initRuntimeIssueHub().
 */
export function initRuntimeTelemetryObservers() {
    if (observersInitialized) return;
    observersInitialized = true;
    if (typeof window === 'undefined') return;

    try {
        initReportingObserver();
    } catch {
        /* не ломаем загрузку приложения */
    }
    try {
        initLongTaskObserver();
    } catch {
        /* ignore */
    }
}

/**
 * Для отчётов диагностики (platform-health-probes и т.д.).
 * @returns {{ reportingObserver: boolean, longtaskObserver: boolean }}
 */
export function getRuntimeTelemetrySupportSnapshot() {
    const reportingObserver = typeof ReportingObserver === 'function';
    let longtaskObserver = false;
    try {
        const s = PerformanceObserver.supportedEntryTypes;
        longtaskObserver = Array.isArray(s) && s.includes('longtask');
    } catch {
        longtaskObserver = false;
    }
    return { reportingObserver, longtaskObserver };
}
