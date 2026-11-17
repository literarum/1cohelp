'use strict';

/** Склонение по числу: pluralRu(21, ['обращение','обращения','обращений']) → 'обращение'. */
export function pluralRu(n, forms) {
    const abs = Math.abs(Math.trunc(Number(n) || 0));
    const d = abs % 10;
    const dd = abs % 100;
    if (dd >= 11 && dd <= 14) return forms[2];
    if (d === 1) return forms[0];
    if (d >= 2 && d <= 4) return forms[1];
    return forms[2];
}
