'use strict';

import { CURRENT_SCHEMA_VERSION, DB_NAME, DB_VERSION } from '../constants.js';
import {
    getRuntimeHubBufferMeta,
    getRuntimeHubFaultEntries,
    getRuntimeHubPerformanceSignalsForHealth,
} from './runtime-issue-hub.js';
import { getPwaCockpitBlock } from '../app/pwa-register.js';
import { getApplicationHealthStateForExport } from './application-health-state.js';
import { getRuntimeTelemetrySupportSnapshot } from './runtime-telemetry-observers.js';
import { getRuntimeFetchInterceptMeta } from './runtime-fetch-intercept.js';

/**
 * Синхронные «флаги» окружения браузера (первый контур; второй — getHighEntropyValues ниже).
 */
export function collectBrowserEnvironmentSnapshot() {
    if (typeof navigator === 'undefined') {
        return { unavailable: true };
    }
    const n = navigator;
    const sch = n.connection || n.mozConnection || n.webkitConnection;
    const out = {
        userAgent: n.userAgent,
        language: n.language,
        languages: n.languages ? [...n.languages] : undefined,
        platform: n.platform,
        cookieEnabled: n.cookieEnabled,
        onLine: n.onLine,
        hardwareConcurrency: n.hardwareConcurrency,
        deviceMemory: n.deviceMemory,
        maxTouchPoints: n.maxTouchPoints,
        pdfViewerEnabled: n.pdfViewerEnabled,
        webdriver: n.webdriver,
        doNotTrack: n.doNotTrack,
        vendor: n.vendor,
    };
    if (n.userAgentData) {
        out.userAgentData = {
            brands: n.userAgentData.brands ? [...n.userAgentData.brands] : undefined,
            mobile: n.userAgentData.mobile,
            platform: n.userAgentData.platform,
        };
    }
    if (sch) {
        out.connection = {
            effectiveType: sch.effectiveType,
            downlink: sch.downlink,
            rtt: sch.rtt,
            saveData: sch.saveData,
        };
    }
    if (typeof window !== 'undefined') {
        out.viewport = { width: window.innerWidth, height: window.innerHeight };
        out.locationHref = window.location.href;
    }
    if (typeof document !== 'undefined') {
        out.document = {
            visibilityState: document.visibilityState,
            referrer: document.referrer ? `${document.referrer.slice(0, 500)}` : '',
        };
    }
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        try {
            out.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            /* ignore */
        }
    }
    return out;
}

/**
 * Расширенные Client Hints (Chromium) — второй контур характеристик клиента.
 */
export async function collectHighEntropyUaHints() {
    if (typeof navigator === 'undefined' || !navigator.userAgentData?.getHighEntropyValues) {
        return null;
    }
    try {
        return await navigator.userAgentData.getHighEntropyValues([
            'architecture',
            'bitness',
            'model',
            'platformVersion',
            'fullVersionList',
            'wow64',
        ]);
    } catch {
        return null;
    }
}

/**
 * @param {object} ctx
 * @param {() => Promise<unknown>} [ctx.getFromIndexedDB]
 * @param {() => unknown} [ctx.getHudDiagnostics]
 * @param {() => unknown} [ctx.getWatchdog]
 * @param {() => unknown} [ctx.getSystemOverview]
 * @param {() => unknown} [ctx.getStateSnapshot]
 * @param {() => unknown} [ctx.getDbSummary]
 * @param {() => Promise<unknown>} [ctx.getPwaCockpitBlock]
 * @param {() => unknown[]} [ctx.getLogs]
 * @param {() => unknown[]} [ctx.getCockpitErrors]
 * @param {() => { tsIso: string, source: string, title: string, message: string }[]} [ctx.getHubFaultEntries]
 */
export async function buildCopilotDiagnosticBundle(ctx = {}) {
    const getFromIndexedDB = ctx.getFromIndexedDB;
    let storedSchemaVersion = null;
    if (typeof getFromIndexedDB === 'function') {
        try {
            storedSchemaVersion = await getFromIndexedDB('preferences', 'schemaVersion');
        } catch {
            storedSchemaVersion = null;
        }
    }

    const hubFaultLimit = 2000;
    const hubFaults = (
        ctx.getHubFaultEntries || (() => getRuntimeHubFaultEntries(hubFaultLimit))
    )();
    const highEntropy = await collectHighEntropyUaHints();

    let pwaBlock = null;
    try {
        pwaBlock =
            typeof ctx.getPwaCockpitBlock === 'function'
                ? await ctx.getPwaCockpitBlock()
                : await getPwaCockpitBlock();
    } catch (e) {
        pwaBlock = { error: e?.message || String(e) };
    }

    const hud = typeof ctx.getHudDiagnostics === 'function' ? ctx.getHudDiagnostics() : null;
    const watchdog = typeof ctx.getWatchdog === 'function' ? ctx.getWatchdog() : null;

    const logs = typeof ctx.getLogs === 'function' ? ctx.getLogs() : [];
    const cockpitErrors = typeof ctx.getCockpitErrors === 'function' ? ctx.getCockpitErrors() : [];

    return {
        bundleFormat: 'copilot1co-diagnostic-v1',
        exportedAt: new Date().toISOString(),
        app: {
            dbName: DB_NAME,
            dbVersion: DB_VERSION,
            schemaVersionCurrent: CURRENT_SCHEMA_VERSION,
            schemaVersionStored: storedSchemaVersion,
            schemaVersionsMatch:
                storedSchemaVersion == null ||
                String(storedSchemaVersion) === String(CURRENT_SCHEMA_VERSION),
        },
        browser: {
            sync: collectBrowserEnvironmentSnapshot(),
            userAgentDataHighEntropy: highEntropy,
        },
        health: {
            hudDiagnostics: hud,
            watchdog: watchdog,
            orchestration: getApplicationHealthStateForExport(),
            note: 'Снимок последней записи HUD (фоновая или ручная диагностика). Поле orchestration — журнал фаз самотестирования и перекрёстные заметки. Актуальный прогон: кнопка «Ручной прогон» в машинном отделении или «Запустить проверку систем» в настройках.',
        },
        runtime: {
            hubBufferMeta: getRuntimeHubBufferMeta(),
            hubFaults,
            performanceSignals: getRuntimeHubPerformanceSignalsForHealth(40),
            cockpitErrorBuffer: cockpitErrors,
            telemetryObservers: getRuntimeTelemetrySupportSnapshot(),
            fetchFailureReporting: getRuntimeFetchInterceptMeta(),
        },
        logs: {
            entries: logs,
            count: Array.isArray(logs) ? logs.length : 0,
        },
        overview: typeof ctx.getSystemOverview === 'function' ? ctx.getSystemOverview() : null,
        state: typeof ctx.getStateSnapshot === 'function' ? ctx.getStateSnapshot() : null,
        dbSummary: typeof ctx.getDbSummary === 'function' ? ctx.getDbSummary() : null,
        pwa: pwaBlock,
    };
}

export function diagnosticBundleToJsonString(bundle) {
    return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function suggestDiagnosticFilename(prefix = 'copilot-diagnostic') {
    const safe = new Date()
        .toISOString()
        .replace(/[:]/g, '-')
        .replace(/\.\d{3}Z$/, 'Z');
    return `${prefix}-${safe}.json`;
}
