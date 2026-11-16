'use strict';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Метка времени для имени файла в ЛОКАЛЬНОМ времени: 2026-11-16_14-05-09.
 * toISOString() давал UTC, и имя файла «отставало» от часов пользователя.
 * @param {Date} [date]
 * @param {{ seconds?: boolean }} [opts]
 */
export function localFileTimestamp(date = new Date(), opts = {}) {
    const withSeconds = opts.seconds !== false;
    const base = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}_${pad2(date.getHours())}-${pad2(date.getMinutes())}`;
    return withSeconds ? `${base}-${pad2(date.getSeconds())}` : base;
}
