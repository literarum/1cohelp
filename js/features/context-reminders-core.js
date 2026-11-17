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

/** Повтор напоминания. */
export const REMINDER_REPEAT_LABELS = Object.freeze({
    none: 'Не повторять',
    daily: 'Каждый день',
    weekdays: 'По будням',
    weekly: 'Каждую неделю',
    monthly: 'Каждый месяц',
});

export function normalizeRepeat(v) {
    return Object.prototype.hasOwnProperty.call(REMINDER_REPEAT_LABELS, v) ? v : 'none';
}

/** Один шаг повтора от даты (локальное время: «каждый день в 10:00» остаётся в 10:00). */
function stepOnce(d, repeat, anchorDay) {
    const n = new Date(d.getTime());
    if (repeat === 'daily') n.setDate(n.getDate() + 1);
    else if (repeat === 'weekly') n.setDate(n.getDate() + 7);
    else if (repeat === 'weekdays') {
        do n.setDate(n.getDate() + 1);
        while (n.getDay() === 0 || n.getDay() === 6);
    } else if (repeat === 'monthly') {
        const day = anchorDay || d.getDate();
        n.setDate(1);
        n.setMonth(n.getMonth() + 1);
        // 31-е в коротком месяце — последний день месяца.
        const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
        n.setDate(Math.min(day, last));
    }
    return n;
}

/**
 * Следующий срок повторяющегося напоминания: первый после nowMs (пропущенные периоды не копятся).
 * @param {string} dueIso прежний срок
 * @param {string} repeat
 * @param {number} [nowMs]
 * @param {number} [anchorDay] день месяца из первого срока (для «каждый месяц» 31-е не «сползает» на 28-е)
 * @returns {string|null} ISO; null — повтора нет
 */
export function nextRepeatDue(dueIso, repeat, nowMs = Date.now(), anchorDay = null) {
    const r = normalizeRepeat(repeat);
    if (r === 'none') return null;
    let d = new Date(dueIso);
    if (!Number.isFinite(d.getTime())) return null;
    let guard = 0;
    do {
        d = stepOnce(d, r, anchorDay);
        guard += 1;
    } while (d.getTime() <= nowMs && guard < 5000);
    return d.toISOString();
}
