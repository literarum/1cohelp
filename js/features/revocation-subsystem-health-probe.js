'use strict';

/**
 * Перекрёстная самодиагностика подсистемы проверки отзыва сертификатов (авиационный второй контур):
 * 1) повторный зонд доступности API/helper (независимо от первого вызова в том же цикле);
 * 2) сверка с буфером runtime-hub по инцидентам FNS за скользящее окно.
 */

import { REVOCATION_API_BASE_URL } from '../config.js';
import {
    REVOCATION_LOCAL_HELPER_BASE_URL,
    REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER,
} from '../config/revocation-sources.js';
import { probeHelperAvailability } from './revocation-helper-probe.js';
import { countRuntimeHubFaultsSince } from './runtime-issue-hub.js';

/** Инциденты, записанные через ingestRuntimeHubIssue('FNS Revocation', …). */
function isFnsRevocationFaultEntry(e) {
    return (
        e.source === 'FNS Revocation' ||
        (typeof e.title === 'string' && e.title.includes('FNS Revocation')) ||
        (typeof e.message === 'string' && e.message.includes('Проверка отзыва ФНС'))
    );
}

/**
 * @param {(p: Promise<unknown>, ms: number) => Promise<unknown>} runWithTimeout
 * @param {(level: 'error'|'warn'|'info', title: string, message: string, meta?: object) => void} report
 * @param {{ probeTag?: 'startup'|'manual'|'watchdog'; runtimeFaultWindowMs?: number }} [opts]
 */
export async function runRevocationSubsystemHealthCrossCheck(runWithTimeout, report, opts = {}) {
    const runtimeWindow =
        typeof opts.runtimeFaultWindowMs === 'number' && opts.runtimeFaultWindowMs > 0
            ? opts.runtimeFaultWindowMs
            : opts.probeTag === 'watchdog'
              ? 5 * 60 * 1000
              : 24 * 60 * 60 * 1000;

    let secondProbeOk = false;
    try {
        if (REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER && REVOCATION_LOCAL_HELPER_BASE_URL) {
            const base = String(REVOCATION_LOCAL_HELPER_BASE_URL).trim().replace(/\/$/, '');
            if (base) {
                secondProbeOk = await runWithTimeout(
                    probeHelperAvailability(base, { path: '/health', timeoutMs: 7000 }),
                    10000,
                );
            }
        } else {
            const apiBase =
                typeof REVOCATION_API_BASE_URL === 'string'
                    ? REVOCATION_API_BASE_URL.trim().replace(/\/$/, '')
                    : '';
            if (apiBase) {
                secondProbeOk = await runWithTimeout(
                    probeHelperAvailability(apiBase, {
                        path: '/api/health',
                        timeoutMs: 7000,
                    }),
                    10000,
                );
            }
        }
    } catch (err) {
        report(
            'warn',
            'Отзыв сертификатов (контур B)',
            `Повторный зонд недоступен: ${err?.message || String(err)}`,
            { system: 'revocation_crosscheck' },
        );
        secondProbeOk = false;
    }

    if (!REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
        const apiBase =
            typeof REVOCATION_API_BASE_URL === 'string'
                ? REVOCATION_API_BASE_URL.trim().replace(/\/$/, '')
                : '';
        if (apiBase && !secondProbeOk) {
            report(
                'error',
                'Отзыв сертификатов (контур B)',
                'Повторный зонд облачного /api/health не подтвердил доступность (расхождение с основным контуром возможно при нестабильной сети).',
                { system: 'revocation_crosscheck' },
            );
        }
    } else if (REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
        const hb = String(REVOCATION_LOCAL_HELPER_BASE_URL || '')
            .trim()
            .replace(/\/$/, '');
        if (hb && !secondProbeOk) {
            report(
                'error',
                'Отзыв сертификатов (контур B)',
                'Повторный зонд CRL-Helper не подтвердил /health.',
                { system: 'revocation_crosscheck' },
            );
        }
    }

    const fnsRuntimeHits = countRuntimeHubFaultsSince(runtimeWindow, isFnsRevocationFaultEntry);
    if (fnsRuntimeHits > 0) {
        report(
            'warn',
            'Отзыв сертификатов (буфер runtime)',
            `За выбранное окно зафиксировано ${fnsRuntimeHits} сбоев подсистемы ФНС/отзыва. Откройте «Машинное отделение» → Ошибки или журнал проверки сертификата.`,
            { system: 'revocation_crosscheck' },
        );
    } else if (secondProbeOk) {
        report(
            'info',
            'Отзыв сертификатов (перекрёстная)',
            'Повторный зонд и буфер runtime согласованы: критичных инцидентов ФНС в окне нет.',
            { system: 'revocation_crosscheck' },
        );
    }
}
