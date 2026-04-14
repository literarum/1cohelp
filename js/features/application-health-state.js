'use strict';

/**
 * Оркестрация самотестирования: фазы (готовность / живучесть / глубокий ручной прогон),
 * кольцевой журнал watchdog и перекрёстные заметки для экспорта диагностики (двойной контур наблюдаемости).
 */

export const HEALTH_PHASE = Object.freeze({
    /** Стартовый пакет после загрузки приложения */
    STARTUP_READINESS: 'startup_readiness',
    /** Периодический или ручной цикл watchdog */
    PERIODIC_LIVENESS: 'periodic_liveness',
    /** Полный ручной прогон из настроек / кокпита */
    MANUAL_DEEP: 'manual_deep',
});

const MAX_WATCHDOG_SNAPSHOTS = 8;

/** @type {object | null} */
let lastStartupReadiness = null;
/** @type {object[]} */
const watchdogRing = [];
/** @type {object | null} */
let lastManualDeep = null;

function digestErrorTitles(errors) {
    if (!Array.isArray(errors) || errors.length === 0) return '';
    return [...errors]
        .map((e) => String(e?.title || '').trim())
        .filter(Boolean)
        .sort()
        .join('\u241e');
}

/**
 * @param {object} payload
 * @param {string} payload.phase — HEALTH_PHASE.*
 * @param {string} [payload.source]
 * @param {number} [payload.errorCount]
 * @param {number} [payload.warnCount]
 * @param {number} [payload.checkCount]
 * @param {number} [payload.runtimeFaultCount]
 * @param {string} [payload.watchdogSeverity]
 * @param {{ title?: string }[]} [payload.errors]
 */
export function recordApplicationHealthSnapshot(payload) {
    if (!payload || typeof payload !== 'object') return;
    const phase = payload.phase;
    if (!phase) return;

    const snap = {
        at: Date.now(),
        atIso: new Date().toISOString(),
        phase,
        source: typeof payload.source === 'string' ? payload.source : '',
        errorCount: Math.max(0, Math.floor(Number(payload.errorCount) || 0)),
        warnCount: Math.max(0, Math.floor(Number(payload.warnCount) || 0)),
        checkCount: Math.max(0, Math.floor(Number(payload.checkCount) || 0)),
        runtimeFaultCount: Math.max(0, Math.floor(Number(payload.runtimeFaultCount) || 0)),
        watchdogSeverity:
            typeof payload.watchdogSeverity === 'string' ? payload.watchdogSeverity : null,
        errorTitleDigest: digestErrorTitles(payload.errors),
    };

    if (phase === HEALTH_PHASE.STARTUP_READINESS) {
        lastStartupReadiness = snap;
    } else if (phase === HEALTH_PHASE.PERIODIC_LIVENESS) {
        watchdogRing.push(snap);
        while (watchdogRing.length > MAX_WATCHDOG_SNAPSHOTS) watchdogRing.shift();
    } else if (phase === HEALTH_PHASE.MANUAL_DEEP) {
        lastManualDeep = snap;
    }
}

/**
 * Сравнение записей health-зонда clientData (id + notes).
 * @param {unknown} a
 * @param {unknown} b
 */
export function clientDataHealthProbeRecordsMatch(a, b) {
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    return a.id === b.id && a.notes === b.notes;
}

function evaluateCrossCheckNotes() {
    const notes = [];

    if (
        lastStartupReadiness &&
        lastStartupReadiness.runtimeFaultCount > 0 &&
        lastStartupReadiness.errorCount === 0
    ) {
        notes.push(
            'Двойной контур: на завершении старта в буфере рантайма были сбои при нуле структурированных ошибок чеклиста — проверьте HUD и runtime hub.',
        );
    }

    if (watchdogRing.length >= 2) {
        const prev = watchdogRing[watchdogRing.length - 2];
        const curr = watchdogRing[watchdogRing.length - 1];
        const prevErr = prev.errorCount > 0;
        const currErr = curr.errorCount > 0;
        if (prevErr !== currErr && prev.source === 'interval' && curr.source === 'interval') {
            notes.push(
                'Два последних плановых цикла watchdog дали разный исход по ошибкам (есть/нет) — возможны гонки или нестабильные зависимости.',
            );
        }
    }

    if (lastManualDeep && lastStartupReadiness) {
        if (lastManualDeep.errorCount > 0 && lastStartupReadiness.errorCount === 0) {
            notes.push(
                'Двойной контур: глубокий ручной прогон зафиксировал ошибки при «чистом» последнем старте — проверьте регрессию, данные или условия прогона.',
            );
        }
    }

    if (lastManualDeep && watchdogRing.length > 0) {
        const wd = watchdogRing[watchdogRing.length - 1];
        if (
            wd &&
            wd.source === 'interval' &&
            wd.errorCount > 0 &&
            lastManualDeep.errorCount === 0
        ) {
            notes.push(
                'Два контура: последний плановый watchdog с ошибками, последний ручной прогон — без ошибок; возможна временная нестабильность или гонка.',
            );
        }
    }

    if (lastStartupReadiness && watchdogRing.length > 0) {
        const wd = watchdogRing[watchdogRing.length - 1];
        if (
            wd &&
            wd.source === 'interval' &&
            lastStartupReadiness.runtimeFaultCount === 0 &&
            wd.runtimeFaultCount >= 3 &&
            wd.errorCount === 0
        ) {
            notes.push(
                'Тройной контур: после «чистого» старта в последнем плановом watchdog накопились только рантайм-сбои при нуле ошибок чеклиста — сверьте буфер runtime и HUD.',
            );
        }
    }

    return notes;
}

/** Сброс состояния (тесты). */
export function resetApplicationHealthStateForTests() {
    lastStartupReadiness = null;
    watchdogRing.length = 0;
    lastManualDeep = null;
}

/**
 * Снимок для diagnostic bundle и внешних инструментов.
 */
export function getApplicationHealthStateForExport() {
    return {
        schema: 'copilot1co-application-health-state-v1',
        phases: HEALTH_PHASE,
        lastStartupReadiness,
        recentWatchdogCycles: watchdogRing.map((s) => ({ ...s })),
        lastManualDeep,
        crossCheckNotes: evaluateCrossCheckNotes(),
    };
}
