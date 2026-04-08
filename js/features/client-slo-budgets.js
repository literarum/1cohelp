'use strict';

/**
 * Клиентские бюджеты SLO: скользящее окно ~7 суток, p95 латентности watchdog и сухого экспорта,
 * доля циклов с ошибками — раннее предупреждение до явного отказа (аналог synthetic/RUM + SLO).
 */

const STORAGE_KEY = 'copilot1co_client_slo_v1';
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SAMPLES = 500;

/** Когда localStorage недоступен (Node/vitest, приватный режим), держим буфер в памяти. */
let memoryFallbackStore = { samples: [] };

/** Бюджеты по умолчанию (мс для p95; errorRate — доля циклов с флагом ошибки за окно). */
export const DEFAULT_CLIENT_SLO_BUDGETS = {
    /** Тяжёлый цикл: IndexedDB, сухой экспорт, поверхность UI — бюджет с запасом под реальные клиенты. */
    watchdogCycleP95Ms: 22000,
    exportDryRunP95Ms: 95000,
    /** Доля watchdog-циклов с watchdogHadError за окно, выше — предупреждение */
    watchdogErrorRate: 0.12,
};

/**
 * @param {number[]} sortedAsc
 * @param {number} p 0..1
 */
export function percentileSorted(sortedAsc, p) {
    if (!sortedAsc.length) return null;
    const idx = Math.min(
        sortedAsc.length - 1,
        Math.max(0, Math.ceil(p * sortedAsc.length) - 1),
    );
    return sortedAsc[idx];
}

function loadRaw() {
    if (typeof localStorage !== 'undefined') {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.samples)) {
                    memoryFallbackStore = { samples: [...parsed.samples] };
                    return memoryFallbackStore;
                }
            }
        } catch {
            /* ignore */
        }
    }
    return memoryFallbackStore;
}

function saveRaw(data) {
    memoryFallbackStore = { samples: Array.isArray(data.samples) ? [...data.samples] : [] };
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ samples: memoryFallbackStore.samples }));
        } catch {
            /* квота или приватный режим — остаётся только память */
        }
    }
}

function trimSamples(samples, now = Date.now()) {
    const cutoff = now - WINDOW_MS;
    const filtered = samples.filter((s) => typeof s.ts === 'number' && s.ts >= cutoff);
    if (filtered.length > MAX_SAMPLES) {
        return filtered.slice(-MAX_SAMPLES);
    }
    return filtered;
}

/**
 * @typedef {{ ts: number, watchdogCycleMs?: number, exportDryRunMs?: number, runtimeFaultCount?: number, watchdogHadError?: boolean }} ClientSloSample
 */

/**
 * Добавить образец (watchdog, экспорт или оба).
 * @param {Partial<ClientSloSample>} sample
 */
export function recordClientSloSample(sample) {
    const now = Date.now();
    const bag = loadRaw();
    const entry = {
        ts: sample.ts ?? now,
        watchdogCycleMs:
            typeof sample.watchdogCycleMs === 'number' ? sample.watchdogCycleMs : undefined,
        exportDryRunMs:
            typeof sample.exportDryRunMs === 'number' ? sample.exportDryRunMs : undefined,
        runtimeFaultCount:
            typeof sample.runtimeFaultCount === 'number' ? sample.runtimeFaultCount : undefined,
        watchdogHadError: Boolean(sample.watchdogHadError),
    };
    bag.samples = trimSamples([...bag.samples, entry], now);
    saveRaw(bag);
}

/**
 * Оценить p95 и нарушения бюджета за окно.
 * @param {typeof DEFAULT_CLIENT_SLO_BUDGETS} [budgets]
 * @returns {{ warnings: string[], p95WatchdogMs: number|null, p95ExportMs: number|null, errorRate: number|null, sampleCount: number }}
 */
export function evaluateClientSloAgainstBudgets(budgets = DEFAULT_CLIENT_SLO_BUDGETS) {
    const now = Date.now();
    const { samples } = loadRaw();
    const recent = trimSamples(samples, now);
    const wd = recent
        .map((s) => s.watchdogCycleMs)
        .filter((n) => typeof n === 'number' && n > 0)
        .sort((a, b) => a - b);
    const ex = recent
        .map((s) => s.exportDryRunMs)
        .filter((n) => typeof n === 'number' && n > 0)
        .sort((a, b) => a - b);

    const p95WatchdogMs = wd.length ? percentileSorted(wd, 0.95) : null;
    const p95ExportMs = ex.length ? percentileSorted(ex, 0.95) : null;

    const wdWithFlag = recent.filter((s) => typeof s.watchdogCycleMs === 'number');
    const errorRate =
        wdWithFlag.length > 0
            ? wdWithFlag.filter((s) => s.watchdogHadError).length / wdWithFlag.length
            : null;

    const warnings = [];
    if (p95WatchdogMs != null && p95WatchdogMs > budgets.watchdogCycleP95Ms) {
        warnings.push(
            `Регресс SLO: p95 цикла watchdog за 7 суток ${Math.round(p95WatchdogMs)} мс > бюджета ${budgets.watchdogCycleP95Ms} мс.`,
        );
    }
    if (p95ExportMs != null && p95ExportMs > budgets.exportDryRunP95Ms) {
        warnings.push(
            `Регресс SLO: p95 сухого экспорта за 7 суток ${Math.round(p95ExportMs)} мс > бюджета ${budgets.exportDryRunP95Ms} мс.`,
        );
    }
    if (errorRate != null && errorRate > budgets.watchdogErrorRate) {
        warnings.push(
            `Регресс SLO: доля watchdog-циклов с ошибками ${(errorRate * 100).toFixed(1)}% > ${(budgets.watchdogErrorRate * 100).toFixed(0)}%.`,
        );
    }

    return {
        warnings,
        p95WatchdogMs,
        p95ExportMs,
        errorRate,
        sampleCount: recent.length,
    };
}

/** Для тестов и отладки */
export function _resetClientSloStorageForTests() {
    memoryFallbackStore = { samples: [] };
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }
}
