'use strict';

/**
 * Объединение потоков ошибок runtime hub и буфера кокпита без ложной дедупликации по тексту
 * (повторяющиеся инциденты в разное время сохраняются).
 */

function safeSerialize(value, maxLen = 2000) {
    try {
        if (typeof value === 'string')
            return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
        const json = JSON.stringify(value, null, 2);
        if (!json) return String(value);
        return json.length > maxLen ? `${json.slice(0, maxLen)}…` : json;
    } catch {
        return String(value);
    }
}

export function formatCockpitErrorLine(entry) {
    return [
        `[${entry.ts}] [${entry.source}]`,
        entry.message,
        entry.extra ? `extra: ${safeSerialize(entry.extra, 2000)}` : null,
    ]
        .filter(Boolean)
        .join('\n');
}

/**
 * @param {{ tsIso: string, source: string, title: string, message: string }[]} hubEntries
 * @param {{ ts: string, source: string, message: string, extra?: unknown }[]} cockpitEntries
 * @returns {string}
 */
export function mergeHubAndCockpitFaultRows(hubEntries, cockpitEntries) {
    const seen = new Set();
    const rows = [];

    /** Ключ по времени + источнику + телу ошибки (без заголовка Runtime/…), чтобы убрать дубль hub↔cockpit. */
    const pushUnique = (tsIso, source, messageCore, block) => {
        const key = `${tsIso}\0${source}\0${messageCore}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ tsIso, block });
    };

    for (const e of hubEntries) {
        const block = [`[${e.tsIso}] [${e.source}]`, e.title, e.message].filter(Boolean).join('\n');
        pushUnique(e.tsIso, e.source, e.message, block);
    }
    for (const e of cockpitEntries) {
        const block = formatCockpitErrorLine(e);
        pushUnique(e.ts, e.source, e.message, block);
    }

    rows.sort((a, b) => a.tsIso.localeCompare(b.tsIso));
    if (!rows.length) return 'Ошибки runtime не зафиксированы.';
    return rows.map((r) => r.block).join('\n\n---\n\n');
}
