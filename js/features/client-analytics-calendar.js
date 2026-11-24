'use strict';

/**
 * Производственный календарь РФ (пятидневная неделя) и сроки отчётности — для интерпретации
 * динамики обращений: праздники, перенесённые выходные, рабочие субботы и «дни сдачи».
 *
 * Источники (переносы выходных, постановления Правительства РФ):
 *   2024 — № 1314 от 10.08.2023;  2025 — № 1335 от 04.10.2024;
 *   2026 — № 1466 от 24.09.2025;  2027 — № 1187 от 17.09.2026.
 * Праздники по ст. 112 ТК РФ: 1–8 января, 23 февраля, 8 марта, 1 и 9 мая, 12 июня, 4 ноября
 * (совпавший с выходным праздник переносится на следующий рабочий день, кроме январских —
 * их переносит постановление).
 *
 * Для лет вне 2024–2027 календарь неизвестен: такие дни помечаются known = false и считаются
 * по обычной неделе (пн–пт). Это честнее, чем угадывать переносы.
 */

/** Нерабочие дни, выпадающие на пн–пт (праздники и перенесённые выходные). */
const NONWORKING_WEEKDAYS = {
    2024: ['01-01', '01-02', '01-03', '01-04', '01-05', '01-08', '02-23', '03-08', '04-29', '04-30', '05-01', '05-09', '05-10', '06-12', '11-04', '12-30', '12-31'],
    2025: ['01-01', '01-02', '01-03', '01-06', '01-07', '01-08', '05-01', '05-02', '05-08', '05-09', '06-12', '06-13', '11-03', '11-04', '12-31'],
    2026: ['01-01', '01-02', '01-05', '01-06', '01-07', '01-08', '01-09', '02-23', '03-09', '05-01', '05-11', '06-12', '11-04', '12-31'],
    2027: ['01-01', '01-04', '01-05', '01-06', '01-07', '01-08', '02-22', '02-23', '03-08', '05-03', '05-10', '06-14', '11-04', '11-05', '12-31'],
};

/** Рабочие субботы (перенос выходного). */
const WORKING_SATURDAYS = {
    2024: ['04-27', '11-02', '12-28'],
    2025: ['11-01'],
    2026: [],
    2027: ['02-20'],
};

const HOLIDAY_NAMES = {
    '01-01': 'Новогодние каникулы', '01-02': 'Новогодние каникулы', '01-03': 'Новогодние каникулы',
    '01-04': 'Новогодние каникулы', '01-05': 'Новогодние каникулы', '01-06': 'Новогодние каникулы',
    '01-07': 'Рождество', '01-08': 'Новогодние каникулы', '02-23': 'День защитника Отечества',
    '03-08': 'Международный женский день', '05-01': 'Праздник Весны и Труда', '05-09': 'День Победы',
    '06-12': 'День России', '11-04': 'День народного единства',
};

const sets = {};
function setFor(table, y) {
    const key = `${table === NONWORKING_WEEKDAYS ? 'n' : 's'}${y}`;
    if (!sets[key]) sets[key] = new Set(table[y] || []);
    return sets[key];
}

function weekdayOf(ymd) {
    return new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 — вс
}

export function isCalendarKnown(ymd) {
    return Object.prototype.hasOwnProperty.call(NONWORKING_WEEKDAYS, Number(String(ymd).slice(0, 4)));
}

/**
 * @param {string} ymd YYYY-MM-DD
 * @returns {{ working: boolean, kind: 'workday'|'weekend'|'holiday'|'workingSaturday', name: string|null, known: boolean }}
 */
export function dayInfo(ymd) {
    const y = Number(ymd.slice(0, 4));
    const md = ymd.slice(5);
    const wd = weekdayOf(ymd);
    const known = isCalendarKnown(ymd);
    if (known && wd === 6 && setFor(WORKING_SATURDAYS, y).has(md)) {
        return { working: true, kind: 'workingSaturday', name: 'Рабочая суббота (перенос)', known };
    }
    if (wd === 0 || wd === 6) return { working: false, kind: 'weekend', name: HOLIDAY_NAMES[md] || null, known };
    if (known && setFor(NONWORKING_WEEKDAYS, y).has(md)) {
        let name = HOLIDAY_NAMES[md] || null;
        if (!name) {
            // праздник, выпавший на выходной, переносится на ближайший рабочий день после него
            for (let back = 1; back <= 2 && !name; back++) {
                const prev = addDays(ymd, -back).slice(5);
                if (HOLIDAY_NAMES[prev]) name = `${HOLIDAY_NAMES[prev]} (перенос)`;
            }
        }
        return { working: false, kind: 'holiday', name: name || 'Перенесённый выходной', known };
    }
    return { working: true, kind: 'workday', name: null, known };
}

export function isWorkingDay(ymd) {
    return dayInfo(ymd).working;
}

function addDays(ymd, n) {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** Срок, выпавший на нерабочий день, переносится на ближайший следующий рабочий (ст. 6.1 НК РФ). */
export function shiftToWorkingDay(ymd) {
    let d = ymd;
    for (let i = 0; i < 14 && !isWorkingDay(d); i++) d = addDays(d, 1);
    return d;
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Сроки месяца (уже перенесённые на рабочий день). Включены только правила, подтверждённые
 * источниками: уведомления/отчёты — 25-е, уплата ЕНП — 28-е; ежеквартальные отчёты (НДС, РСВ,
 * 6-НДФЛ, ЕФС-1 раздел 2) — 25-е месяца после квартала; годовой 6-НДФЛ — 25 февраля;
 * годовая декларация по налогу на прибыль — 25 марта.
 * @returns {Array<{ date: string, kind: 'report'|'payment', label: string }>}
 */
export function deadlinesForMonth(year, month) {
    const out = [];
    const quarterly = [1, 4, 7, 10].includes(month);
    const reportParts = ['уведомления об исчисленных налогах'];
    if (month === 1) reportParts.push('ЕФС-1 (раздел 2, за год)');
    if (quarterly) reportParts.push('НДС, РСВ, 6-НДФЛ, ЕФС-1 (раздел 2) за квартал');
    if (month === 2) reportParts.push('6-НДФЛ за год');
    if (month === 3) reportParts.push('декларация по налогу на прибыль за год');
    out.push({ date: shiftToWorkingDay(`${year}-${pad(month)}-25`), kind: 'report', label: `Срок отчётности: ${reportParts.join('; ')}`, quarterly: quarterly || month === 1 || month === 2 || month === 3 });
    out.push({ date: shiftToWorkingDay(`${year}-${pad(month)}-28`), kind: 'payment', label: 'Срок уплаты ЕНП', quarterly: false });
    return out;
}

/** Все сроки в диапазоне дат. */
export function deadlinesBetween(from, to) {
    const out = [];
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    const ty = Number(to.slice(0, 4));
    const tm = Number(to.slice(5, 7));
    // захватываем месяц после конца диапазона: срок 25-го может сместиться за пределы месяца
    for (let guard = 0; guard < 200 && (y < ty || (y === ty && m <= tm + 1)); guard++) {
        for (const d of deadlinesForMonth(y, m)) if (d.date >= from && d.date <= addDays(to, 7)) out.push(d);
        m++;
        if (m > 12) {
            m = 1;
            y++;
        }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Число рабочих дней до ближайшего срока отчётности (0 — сам день срока). null — срока нет в 30 днях.
 * @param {string} ymd
 * @param {Array<{date:string,kind:string}>} deadlines отсортированные сроки
 */
export function workdaysToNextDeadline(ymd, deadlines, kind = 'report') {
    const next = deadlines.find((d) => d.kind === kind && d.date >= ymd);
    if (!next) return null;
    let n = 0;
    let d = ymd;
    for (let i = 0; i < 40 && d < next.date; i++) {
        d = addDays(d, 1);
        if (isWorkingDay(d)) n++;
    }
    return d === next.date ? n : null;
}
