'use strict';

/**
 * Независимый контур проверок среды исполнения (Storage API, контекст, память, вкладка).
 * Используется стартовой диагностикой, ручным прогоном и периодическим watchdog.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
 */

import {
    getRuntimeTelemetrySupportSnapshot,
    RUNTIME_LONGTASK_RECORD_MIN_MS,
} from './runtime-telemetry-observers.js';
import { inferSystemFromTitle } from './health-report-format.js';
import { getPwaRuntimeSnapshot } from '../app/pwa-register.js';

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatMb(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '—';
    return `${Math.round(bytes / 1024 / 1024)} МБ`;
}

/**
 * @param {(p: Promise<unknown>, ms: number) => Promise<unknown>} runWithTimeout
 * @param {{ probeTag?: 'startup'|'manual'|'watchdog' }} [opts]
 * @returns {Promise<{ level: 'info'|'warn'|'error', title: string, message: string, system?: string }[]>}
 */
export async function collectPlatformHealthProbeRows(runWithTimeout, opts = {}) {
    const tag =
        opts.probeTag === 'manual' || opts.probeTag === 'watchdog' ? opts.probeTag : 'startup';
    const lsKey =
        tag === 'manual'
            ? 'health-check-manual'
            : tag === 'watchdog'
              ? 'health-check-watchdog'
              : 'health-check';
    const ssKey =
        tag === 'manual'
            ? 'health-session-manual'
            : tag === 'watchdog'
              ? 'health-session-watchdog'
              : 'health-session';

    /** @type {{ level: 'info'|'warn'|'error', title: string, message: string }[]} */
    const rows = [];

    if (typeof window === 'undefined') return rows;

    // localStorage
    try {
        localStorage.setItem(lsKey, 'ok');
        const value = localStorage.getItem(lsKey);
        localStorage.removeItem(lsKey);
        if (value !== 'ok') {
            rows.push({
                level: 'warn',
                title: 'localStorage',
                message: 'Не удалось проверить запись/чтение.',
            });
        } else {
            rows.push({
                level: 'info',
                title: 'localStorage',
                message: 'Запись и чтение доступны.',
            });
        }
    } catch (err) {
        rows.push({
            level: 'error',
            title: 'localStorage',
            message: err?.message || String(err),
        });
    }

    // Secure context
    if (!window.isSecureContext) {
        rows.push({
            level: 'warn',
            title: 'Безопасный контекст',
            message:
                'Страница загружена не по HTTPS. Некоторые API (clipboard, storage) недоступны.',
        });
    } else {
        rows.push({
            level: 'info',
            title: 'Безопасный контекст',
            message: 'Страница в secure context (HTTPS или localhost).',
        });
    }

    // onLine
    if (!navigator.onLine) {
        rows.push({
            level: 'info',
            title: 'Сеть',
            message: 'Офлайн. API проверки сертификатов недоступны.',
        });
    } else {
        rows.push({
            level: 'info',
            title: 'Сеть',
            message: 'Подключение к сети есть (navigator.onLine).',
        });
    }

    // Network Information API (дублирующий индикатор, где доступен)
    try {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
            const eff = conn.effectiveType ?? '—';
            const down = conn.downlink != null ? `${conn.downlink} Мбит/с` : '—';
            const rtt = conn.rtt != null ? `${conn.rtt} мс` : '—';
            rows.push({
                level: 'info',
                title: 'Сеть (NetworkInformation)',
                message: `Тип: ${eff}, downlink: ${down}, RTT: ${rtt}.`,
            });
        } else {
            rows.push({
                level: 'info',
                title: 'Сеть (NetworkInformation)',
                message:
                    'API недоступен (часто Safari/Firefox). Состояние связи см. в строке «Сеть» (navigator.onLine).',
            });
        }
    } catch (err) {
        rows.push({
            level: 'info',
            title: 'Сеть (NetworkInformation)',
            message: `Проверка недоступна: ${err?.message || err}.`,
        });
    }

    // sessionStorage
    try {
        sessionStorage.setItem(ssKey, 'ok');
        const sv = sessionStorage.getItem(ssKey);
        sessionStorage.removeItem(ssKey);
        rows.push({
            level: sv === 'ok' ? 'info' : 'warn',
            title: 'sessionStorage',
            message:
                sv === 'ok' ? 'Запись и чтение доступны.' : 'Не удалось проверить запись/чтение.',
        });
    } catch (err) {
        rows.push({
            level: 'warn',
            title: 'sessionStorage',
            message: err?.message || String(err),
        });
    }

    // StorageManager.estimate
    if (navigator.storage?.estimate) {
        try {
            const est = await runWithTimeout(navigator.storage.estimate(), 4000);
            const usage = est.usage ?? 0;
            const quota = est.quota ?? 0;
            const percent = quota > 0 ? (usage / quota) * 100 : 0;
            const percentLabel =
                percent >= 1 ? `~${Math.round(percent)}%` : percent > 0 || usage > 0 ? '<1%' : '0%';
            let level = 'info';
            if (quota > 0 && percent >= 98) level = 'error';
            else if (quota > 0 && percent >= 90) level = 'warn';

            const usageMb = formatMb(usage);
            const quotaMb = quota > 0 ? formatMb(quota) : 'квота недоступна';
            let msg = `Занято ${percentLabel} (${usageMb} / ${quotaMb}).`;
            if (level === 'error') msg += ' Риск отказа записи в IndexedDB.';
            else if (level === 'warn') msg += ' Возможны сбои сохранения.';

            rows.push({ level, title: 'Хранилище', message: msg });
        } catch (err) {
            rows.push({
                level: 'info',
                title: 'Хранилище',
                message: `Оценка квоты недоступна: ${err?.message || err}.`,
            });
        }
    } else {
        rows.push({
            level: 'info',
            title: 'Хранилище',
            message: 'StorageManager.estimate недоступен в этом браузере.',
        });
    }

    // persistence
    if (navigator.storage?.persisted) {
        try {
            const persisted = await runWithTimeout(navigator.storage.persisted(), 2000);
            rows.push({
                level: 'info',
                title: 'Хранилище (persistence)',
                message: persisted
                    ? 'Persistent storage включён.'
                    : 'Данные могут быть очищены при нехватке места (persistence не гарантирована).',
            });
        } catch {
            rows.push({
                level: 'info',
                title: 'Хранилище (persistence)',
                message: 'Проверка persistence недоступна.',
            });
        }
    } else {
        rows.push({
            level: 'info',
            title: 'Хранилище (persistence)',
            message: 'navigator.storage.persisted недоступен в этом браузере.',
        });
    }

    // JS heap (Chromium)
    try {
        const m = performance?.memory;
        if (!m) {
            rows.push({
                level: 'info',
                title: 'Память JS (heap)',
                message: 'performance.memory недоступен (не Chromium или отключено).',
            });
        } else {
            const used = m.usedJSHeapSize;
            const lim = m.jsHeapSizeLimit;
            const pct = lim > 0 ? (used / lim) * 100 : 0;
            let level = 'info';
            if (pct >= 96) level = 'error';
            else if (pct >= 92) level = 'warn';
            rows.push({
                level,
                title: 'Память JS (heap)',
                message: `used ${formatMb(used)}, limit ${formatMb(lim)} (${pct.toFixed(1)}%).`,
            });
        }
    } catch (err) {
        rows.push({
            level: 'warn',
            title: 'Память JS (heap)',
            message: err?.message || String(err),
        });
    }

    // Device memory hint (Chrome)
    if (navigator.deviceMemory != null) {
        rows.push({
            level: 'info',
            title: 'Устройство (RAM, оценка)',
            message: `navigator.deviceMemory: ~${navigator.deviceMemory} ГБ (подсказка браузера).`,
        });
    } else {
        rows.push({
            level: 'info',
            title: 'Устройство (RAM, оценка)',
            message:
                'navigator.deviceMemory недоступен (часто десктоп или Safari/Firefox) — оценка RAM не сообщается.',
        });
    }

    // Вкладка / фон
    rows.push({
        level: 'info',
        title: 'Вкладка',
        message: `visibilityState: ${document.visibilityState}, hidden: ${document.hidden}.`,
    });

    if (typeof document.wasDiscarded === 'boolean' && document.wasDiscarded) {
        rows.push({
            level: 'warn',
            title: 'Вкладка (восстановление)',
            message:
                'Страница была выгружена браузером (wasDiscarded). Состояние могло сброситься.',
        });
    }

    // Cross-origin isolation
    rows.push({
        level: 'info',
        title: 'Cross-origin isolation',
        message: `crossOriginIsolated: ${Boolean(window.crossOriginIsolated)}.`,
    });

    // Service Worker (дублирующий контур: регистрация + снимок из pwa-register)
    if ('serviceWorker' in navigator) {
        const snap = getPwaRuntimeSnapshot();
        let msg = snap.controller
            ? 'Контроллер активен (кэш оболочки; офлайн возможен после успешной загрузки).'
            : 'Контроллер не активен (первый заход или страница ещё не под управлением SW).';
        msg += ` Версия активов: ${snap.assetQueryVersion}.`;
        if (snap.controllerScriptUrl) {
            msg += ` SW: ${snap.controllerScriptUrl}.`;
        }
        if (snap.controllerState) {
            msg += ` state: ${snap.controllerState}.`;
        }
        try {
            const reg = await runWithTimeout(navigator.serviceWorker.getRegistration(), 4000);
            if (reg) {
                msg += ` scope: ${reg.scope}.`;
                msg += reg.waiting
                    ? ' Есть ожидающее обновление (панель «Доступна новая версия»).'
                    : ' Ожидающего обновления нет.';
            }
        } catch (err) {
            msg += ` getRegistration: ${err?.message || String(err)}.`;
        }
        rows.push({
            level: 'info',
            title: 'Service Worker',
            message: msg,
        });
    }

    // Третий контур: доступность Reporting API и longtask (фактический сбор — runtime-telemetry-observers.js)
    const tel = getRuntimeTelemetrySupportSnapshot();
    rows.push({
        level: 'info',
        title: 'Телеметрия (Reporting API)',
        message: tel.reportingObserver
            ? 'ReportingObserver доступен; при событиях csp-violation / deprecation записи идут в буфер рантайма.'
            : 'ReportingObserver недоступен (часть браузеров / контекстов).',
    });
    rows.push({
        level: 'info',
        title: 'Телеметрия (long task)',
        message: tel.longtaskObserver
            ? `PerformanceObserver: longtask поддерживается; задачи ≥ ${RUNTIME_LONGTASK_RECORD_MIN_MS} ms пишутся как сигналы производительности (не как ошибки самопроверки).`
            : 'Тип longtask не в supportedEntryTypes (часто Safari/Firefox).',
    });

    for (const row of rows) {
        row.system = inferSystemFromTitle(row.title);
    }

    return rows;
}

/**
 * @param {(p: Promise<unknown>, ms: number) => Promise<unknown>} runWithTimeout
 * @param {(level: string, title: string, message: string) => void} report
 * @param {{ probeTag?: 'startup'|'manual'|'watchdog' }} [opts]
 */
export async function runPlatformHealthProbeSuite(runWithTimeout, report, opts = {}) {
    const rows = await collectPlatformHealthProbeRows(runWithTimeout, opts);
    for (const r of rows) {
        report(r.level, r.title, r.message, { system: r.system });
    }
}
