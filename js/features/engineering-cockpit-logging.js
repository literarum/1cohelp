'use strict';

/** @typedef {{ seq?: number, ts: string, level: string, args: string[] }} CockpitLogEntry */

/** Уровни для фильтрации вкладки «Логи» (совпадают с console.* и boot). */
export const COCKPIT_LOG_FILTER_LEVELS = ['all', 'log', 'info', 'warn', 'error', 'debug', 'boot'];

/**
 * @param {string} level
 * @returns {boolean}
 */
export function isValidCockpitLogFilterLevel(level) {
    return COCKPIT_FILTER_SET.has(level);
}

const COCKPIT_FILTER_SET = new Set(COCKPIT_LOG_FILTER_LEVELS);

/**
 * @param {CockpitLogEntry[]} entries
 * @param {string} filterLevel
 * @returns {CockpitLogEntry[]}
 */
export function filterCockpitLogEntries(entries, filterLevel) {
    if (!Array.isArray(entries)) return [];
    if (filterLevel === 'all' || !isValidCockpitLogFilterLevel(filterLevel)) return [...entries];
    return entries.filter((e) => (e?.level || '') === filterLevel);
}

/**
 * Одна строка лога для UI / экспорта.
 * @param {CockpitLogEntry} entry
 * @returns {string}
 */
export function formatCockpitLogLine(entry) {
    if (!entry) return '';
    const seq = typeof entry.seq === 'number' ? entry.seq : '—';
    const lvl = String(entry.level || '?').toUpperCase();
    const body = Array.isArray(entry.args) ? entry.args.join(' ') : '';
    return `[#${seq}] [${entry.ts}] [${lvl}] ${body}`;
}

/**
 * @param {CockpitLogEntry[]} entries
 * @returns {string}
 */
export function formatCockpitLogText(entries) {
    if (!entries.length) return '';
    return entries.map(formatCockpitLogLine).join('\n');
}

/**
 * Краткая сводка для JSON-сводки и перекрёстной проверки с runtime hub.
 * @param {CockpitLogEntry[]} logs
 * @param {object | null} hubMeta
 * @param {number} bufferCapacity
 */
export function buildCockpitLoggingCrosscheck(logs, hubMeta, bufferCapacity) {
    const list = Array.isArray(logs) ? logs : [];
    const last = list.length ? list[list.length - 1] : null;
    const fc = hubMeta && typeof hubMeta.faultCount === 'number' ? hubMeta.faultCount : 0;
    const uf =
        hubMeta && typeof hubMeta.uniqueFaultFingerprints === 'number'
            ? hubMeta.uniqueFaultFingerprints
            : null;
    const diversityRatio = fc > 0 && uf != null ? uf / fc : null;
    return {
        bufferCapacity,
        entriesTotal: list.length,
        lastSeq: typeof last?.seq === 'number' ? last.seq : null,
        lastTs: last?.ts || null,
        runtimeHub: hubMeta || null,
        hubFaultDiversityRatio: diversityRatio,
        hubDuplicatePressure: hubMeta?.duplicatePressure ?? null,
        hubFingerprintRepeatMax: hubMeta?.fingerprintRepeatMax ?? null,
        hubTopFingerprintRepeats: Array.isArray(hubMeta?.topFingerprintRepeats)
            ? hubMeta.topFingerprintRepeats
            : [],
        note: 'Двухконтурность: нативная консоль браузера + буфер машинного отделения; ошибки дублируются в runtime-issue-hub.',
    };
}
