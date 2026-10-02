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

/**
 * Подсчёт записей по уровням (для счётчиков на чипах фильтра).
 * @param {CockpitLogEntry[]} entries
 * @returns {Record<string, number>}
 */
export function countCockpitLogLevels(entries) {
    const out = { all: 0 };
    for (const lvl of COCKPIT_LOG_FILTER_LEVELS) if (lvl !== 'all') out[lvl] = 0;
    if (!Array.isArray(entries)) return out;
    for (const e of entries) {
        out.all += 1;
        const l = e?.level || '';
        if (l in out) out[l] += 1;
    }
    return out;
}

/** Нормализует набор выбранных уровней: пустой набор или «all» означает «все». */
export function normalizeCockpitLevelSet(levels) {
    const arr = Array.isArray(levels) ? levels : levels instanceof Set ? [...levels] : [];
    const valid = arr.filter((l) => l !== 'all' && isValidCockpitLogFilterLevel(l));
    return new Set(valid);
}

/**
 * Фильтр по набору уровней и подстроке (без учёта регистра; «#123» ищет по номеру записи).
 * @param {CockpitLogEntry[]} entries
 * @param {{ levels?: Iterable<string>, query?: string }} [opts]
 */
export function queryCockpitLogEntries(entries, opts = {}) {
    if (!Array.isArray(entries)) return [];
    const levels = normalizeCockpitLevelSet(opts.levels ? [...opts.levels] : []);
    const q = String(opts.query || '').trim().toLowerCase();
    if (!levels.size && !q) return entries.slice();
    const seqQuery = /^#\d+$/.test(q) ? Number(q.slice(1)) : null;
    return entries.filter((e) => {
        if (levels.size && !levels.has(e?.level || '')) return false;
        if (!q) return true;
        if (seqQuery != null) return e?.seq === seqQuery;
        const hay = `${e?.ts || ''} ${e?.level || ''} ${Array.isArray(e?.args) ? e.args.join(' ') : ''}`.toLowerCase();
        return hay.includes(q);
    });
}

/**
 * Окно виртуализации: какие строки фиксированной высоты реально рисовать.
 * @returns {{ start: number, end: number, offsetTop: number, totalHeight: number }}
 */
export function computeVirtualWindow({ total, rowHeight, scrollTop, viewportHeight, overscan = 8 }) {
    const n = Math.max(0, total | 0);
    const rh = Math.max(1, rowHeight || 1);
    const totalHeight = n * rh;
    if (!n) return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };
    const first = Math.floor(Math.max(0, scrollTop) / rh);
    const visible = Math.ceil(Math.max(1, viewportHeight) / rh);
    const start = Math.max(0, first - overscan);
    const end = Math.min(n, first + visible + overscan);
    return { start, end, offsetTop: start * rh, totalHeight };
}

/** NDJSON: одна JSON-запись на строку (удобно для jq и загрузки в системы логов). */
export function formatCockpitLogNdjson(entries) {
    if (!Array.isArray(entries) || !entries.length) return '';
    return entries
        .map((e) =>
            JSON.stringify({
                seq: e?.seq ?? null,
                ts: e?.ts || null,
                level: e?.level || null,
                message: Array.isArray(e?.args) ? e.args.join(' ') : '',
            }),
        )
        .join('\n');
}

/** Многострочное сообщение записи для панели «Подробности». */
export function formatCockpitLogDetail(entry) {
    if (!entry) return '';
    const head = `#${entry.seq ?? '—'} · ${entry.ts || ''} · ${String(entry.level || '?').toUpperCase()}`;
    const body = Array.isArray(entry.args) ? entry.args.join('\n') : '';
    return `${head}\n${body}`;
}
