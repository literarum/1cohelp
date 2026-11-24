'use strict';

import { describe, it, expect } from 'vitest';
import { dayInfo, isWorkingDay, shiftToWorkingDay, deadlinesForMonth, workdaysToNextDeadline, deadlinesBetween } from './client-analytics-calendar.js';
import { calendarAdjust } from './client-analytics-forecast.js';
import { parseTxtIntoRecords, extractEmailCandidates, extractKppFromBlock, extractPhoneCandidates, extractPhoneExtensions } from './client-analytics-parse.js';
import { phoneInfo } from './client-analytics-registry.js';
import { computeInsights } from './client-analytics-insights.js';

function workdaysInYear(y) {
    let n = 0;
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) if (isWorkingDay(d.toISOString().slice(0, 10))) n++;
    return n;
}

describe('производственный календарь', () => {
    it('норма рабочих дней совпадает с официальной (пятидневка)', () => {
        expect(workdaysInYear(2024)).toBe(248);
        expect(workdaysInYear(2025)).toBe(247);
        expect(workdaysInYear(2026)).toBe(247);
    });

    it('переносы и рабочие субботы по постановлениям', () => {
        expect(dayInfo('2024-11-02').kind).toBe('workingSaturday');
        expect(dayInfo('2024-04-30').kind).toBe('holiday');
        expect(dayInfo('2025-11-01').kind).toBe('workingSaturday');
        expect(dayInfo('2025-06-13').kind).toBe('holiday');
        expect(dayInfo('2026-03-09').name).toBe('Международный женский день (перенос)');
        expect(dayInfo('2027-02-20').kind).toBe('workingSaturday');
        expect(dayInfo('2027-11-05').kind).toBe('holiday');
        expect(dayInfo('2023-05-01').known).toBe(false);
    });

    it('сроки переносятся на рабочий день', () => {
        expect(shiftToWorkingDay('2026-04-25')).toBe('2026-04-27');
        expect(deadlinesForMonth(2026, 11).map((d) => d.date)).toEqual(['2026-11-25', '2026-11-30']);
        expect(deadlinesForMonth(2026, 4)[0].label).toMatch(/НДС, РСВ, 6-НДФЛ/);
    });

    it('рабочие дни до срока', () => {
        const dl = deadlinesBetween('2026-11-01', '2026-11-30');
        expect(workdaysToNextDeadline('2026-11-25', dl)).toBe(0);
        expect(workdaysToNextDeadline('2026-11-23', dl)).toBe(2);
    });

    it('календарная поправка ряда: праздник → типичный уровень и коэффициент', () => {
        const dates = [];
        const y = [];
        for (let d = new Date(Date.UTC(2025, 3, 1)); d < new Date(Date.UTC(2025, 5, 30)); d.setUTCDate(d.getUTCDate() + 1)) {
            const ymd = d.toISOString().slice(0, 10);
            dates.push(ymd);
            y.push(dayInfo(ymd).working ? 50 : 5);
        }
        const cal = calendarAdjust(y, dates, dayInfo);
        const i = dates.indexOf('2025-05-02');
        expect(y[i]).toBe(5);
        expect(cal.adjusted[i]).toBe(50);
        expect(cal.holidayRatio).toBeCloseTo(0.1, 6);
    });
});

describe('разборщик v3', () => {
    it('КПП с латинскими буквами в 5–6 знаках, только заглавными', () => {
        expect(extractKppFromBlock('ИНН 7707083893 КПП 7701AB001')).toBe('7701AB001');
        expect(extractKppFromBlock('КПП 7701ab001')).toBeNull();
    });

    it('почта: кириллица и punycode', () => {
        expect(extractEmailCandidates('пишите: бухгалтер@компания.рф')).toEqual(['бухгалтер@компания.рф']);
        expect(extractEmailCandidates('info@xn--80ak6aa92e.xn--p1ai.')).toEqual(['info@xn--80ak6aa92e.xn--p1ai']);
        expect(extractEmailCandidates('a@b.c')).toEqual([]);
    });

    it('телефоны: добавочный, иностранный, 8-800', () => {
        expect(extractPhoneExtensions('+7 (495) 123-45-67 доб. 204')).toEqual({ 74951234567: '204' });
        expect(extractPhoneCandidates('тел +375 29 123-45-67')).toEqual(['+375291234567']);
        expect(phoneInfo('79031234567').kind).toBe('mobile');
        expect(phoneInfo('78005553535').kind).toBe('free');
        expect(phoneInfo('77011234567').kind).toBe('kz');
        expect(phoneInfo('+375291234567').label).toBe('Беларусь');
    });

    it('чистый вопрос без «ИНН/КПП /», «г.», «доб.»', () => {
        const [r] = parseTxtIntoRecords('1). 05.03.2025г. 10:00 ИНН/КПП 7707083893/770701001 тел. +7 (495) 123-45-67 доб. 1234 не уходит отчёт', 'a.txt');
        expect(r.question).toBe('не уходит отчёт');
        expect(r.appealTime).toBe('10:00');
        expect(r.kpp).toBe('770701001');
        expect(r.phoneExt).toEqual({ 74951234567: '1234' });
    });
});

describe('провалы и сроки в движке', () => {
    const recs = [];
    let id = 1;
    for (let d = new Date(Date.UTC(2025, 2, 1)); d < new Date(Date.UTC(2025, 6, 1)); d.setUTCDate(d.getUTCDate() + 1)) {
        const ymd = d.toISOString().slice(0, 10);
        const n = !dayInfo(ymd).working ? 2 : ymd === '2025-04-16' ? 0 : 15;
        for (let k = 0; k < n; k++) recs.push({ id: id++, question: 'как настроить ЭДО', appealDate: ymd, appealDateSource: 'block' });
    }
    const I = computeInsights(recs, { now: Date.UTC(2025, 7, 1) });
    it('пустой рабочий день найден, праздники провалами не считаются', () => {
        expect(I.time.dips.map((d) => d.date)).toEqual(['2025-04-16']);
        expect(I.time.holidayStats.holiday.days).toBeGreaterThan(0);
    });
});

describe('дата из шапки файла', () => {
    it('файл без шапки: пункт без даты не получает дату первого пункта', () => {
        const rows = parseTxtIntoRecords('1). 01.10.2025 ИНН 7707083893 первый\n2). ИНН 7707083893 второй без даты', 'обращения.txt');
        expect(rows[0].appealDate).toBe('2025-10-01');
        expect(rows[1].appealDate).toBeNull();
        expect(rows[1].appealDateSource).toBeNull();
    });
    it('шапка перед первым пунктом по-прежнему работает', () => {
        const rows = parseTxtIntoRecords('Выгрузка за 02.10.2025\n1). ИНН 7707083893 вопрос', 'x.txt');
        expect(rows[0].appealDate).toBe('2025-10-02');
        expect(rows[0].appealDateSource).toBe('file-header');
    });
});

describe('решение с первого обращения (FCR)', () => {
    const mk = (id, inn, day, q) => ({ id, inn, question: q, appealDate: `2025-10-${String(day).padStart(2, '0')}`, appealDateSource: 'block' });
    const recs = [
        mk(1, '7707083893', 1, 'Как настроить ЭДО с контрагентом'),
        mk(2, '7707083893', 3, 'ЭДО: контрагент не видит документы'),
        mk(3, '7707083893', 20, 'Пришло требование из налоговой'),
        mk(4, '500100732259', 2, 'Как настроить ЭДО с контрагентом'),
        mk(5, '500100732259', 2, 'Как настроить ЭДО с контрагентом'), // дословный дубль — не повтор
    ];
    for (let i = 0; i < 20; i++) recs.push(mk(100 + i, `77070838${String(10 + i)}`, 5, 'Вопрос про отчёт в СФР'));
    const I = computeInsights(recs, { now: Date.UTC(2025, 11, 1) });
    it('повтор по той же теме в 7 дней снижает FCR, дубль и другая тема — нет', () => {
        expect(I.fcr.w7.repeats).toBe(1);
        expect(I.index.repeat7).toEqual([1]);
        // темы с < 5 обращениями в таблицу FCR по темам не попадают (долю по 3 обращениям не оценить)
        expect(I.fcr.topics.find((t) => t.id === 'edo')).toBeUndefined();
        expect(I.fcr.w7.n).toBe(25);
    });
});
