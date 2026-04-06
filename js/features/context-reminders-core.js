'use strict';

/**
 * Чистая логика напоминаний (без DOM/IndexedDB) — для тестов и предсказуемости дат.
 */

/**
 * @param {Date} base
 * @param {number} days — целое неотрицательное
 * @returns {Date}
 */
export function addCalendarDaysUtc(base, days) {
    const d = new Date(base.getTime());
    const n = Math.max(0, Math.floor(Number(days)) || 0);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
}

/**
 * Сортировка: сначала просроченные/ближайшие по dueAt (по возрастанию времени).
 * @param {{ dueAt: string, status?: string }} a
 * @param {{ dueAt: string, status?: string }} b
 * @returns {number}
 */
export function compareRemindersByDueAsc(a, b) {
    const ta = Date.parse(a?.dueAt || '');
    const tb = Date.parse(b?.dueAt || '');
    const va = Number.isFinite(ta) ? ta : 0;
    const vb = Number.isFinite(tb) ? tb : 0;
    if (va !== vb) return va - vb;
    const ida = a?.id != null ? Number(a.id) : 0;
    const idb = b?.id != null ? Number(b.id) : 0;
    return ida - idb;
}

/**
 * Напоминание считается «сработавшим» для уведомления, если pending и dueAt <= now.
 * @param {{ status?: string, dueAt?: string }} row
 * @param {number} nowMs
 */
export function isPendingDue(row, nowMs = Date.now()) {
    if (!row || row.status !== 'pending') return false;
    const t = Date.parse(row.dueAt || '');
    if (!Number.isFinite(t)) return false;
    return t <= nowMs;
}

/**
 * @param {string} intent
 * @param {Record<string, string>} labels
 */
export function intentLabel(intent, labels) {
    if (intent && labels[intent]) return labels[intent];
    return labels.other || intent || '';
}
