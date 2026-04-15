'use strict';

/**
 * Чистые функции откладывания напоминания о бэкапе (тесты + второй контур логики).
 */

export const STORAGE_KEY_DEFER_UNTIL = 'copilot_backup_reminder_defer_until_v1';

/**
 * @param {number} nowMs
 * @param {number|null|undefined} deferUntilMs
 */
export function isBackupReminderSuppressedByDefer(nowMs, deferUntilMs) {
    if (deferUntilMs == null || deferUntilMs <= 0) return false;
    return nowMs < deferUntilMs;
}

/**
 * @param {string} localDatetime value from input[type=datetime-local]
 * @param {number} nowMs
 * @returns {number|null} epoch ms UTC or null if invalid / not strictly after nowMs
 */
export function parseDeferLocalDatetimeToUtcMs(localDatetime, nowMs) {
    if (!localDatetime || typeof localDatetime !== 'string') return null;
    const d = new Date(localDatetime);
    if (!Number.isFinite(d.getTime())) return null;
    if (d.getTime() <= nowMs) return null;
    return d.getTime();
}

export function readDeferUntilMs() {
    try {
        const v = localStorage.getItem(STORAGE_KEY_DEFER_UNTIL);
        if (v == null || v === '') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

export function writeDeferUntilMs(n) {
    try {
        if (n == null || n <= 0) {
            localStorage.removeItem(STORAGE_KEY_DEFER_UNTIL);
            return;
        }
        localStorage.setItem(STORAGE_KEY_DEFER_UNTIL, String(n));
    } catch {
        /* второй контур: таймер в памяти всё равно сработает, пока вкладка жива */
    }
}
