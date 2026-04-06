'use strict';

/**
 * Кольцевой буфер событий подсистемы «Обучение» (диагностика без внешних сервисов).
 * Второй контур наблюдаемости рядом с консолью.
 */

const MAX = 48;
const entries = [];

/**
 * @param {'info'|'warn'|'error'} level
 * @param {string} code стабильный код события
 * @param {string} [detail]
 * @param {Record<string, unknown>} [context]
 */
export function logTrainingEvent(level, code, detail, context) {
    let ctxStr = '';
    if (context && typeof context === 'object') {
        try {
            ctxStr = JSON.stringify(context);
        } catch {
            ctxStr = '';
        }
    }
    const row = {
        ts: new Date().toISOString(),
        level,
        code,
        detail: detail || '',
        ...(ctxStr ? { context } : {}),
    };
    entries.push(row);
    while (entries.length > MAX) entries.shift();
    const msg = `[training:${code}] ${detail || ''}${ctxStr ? ` ${ctxStr}` : ''}`.trim();
    if (level === 'error') console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else console.info(msg);
}

/**
 * @returns {readonly object[]}
 */
export function getTrainingDiagnosticsLog() {
    return entries.slice();
}

export function clearTrainingDiagnosticsLog() {
    entries.length = 0;
}
