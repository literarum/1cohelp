'use strict';

import { describe, it, expect } from 'vitest';
import {
    orgNameKey,
    normalizeFrogEntries,
    buildFrogIndex,
    matchRecordToFrogs,
    summarizeAppealsForFrogEntry,
    buildFrogPhoneLevelMap,
} from './client-analytics-frogs.js';
import { computeInsights } from './client-analytics-insights.js';
import { mannWhitneyU, spearman, oddsRatio, rocAuc, twoProportionZ, trainLogistic, crossValidatedAuc, ranks } from './client-analytics-math.js';

const FROGS = [
    { id: 1, organizationName: 'ООО «Ромашка Плюс»', inn: '7707083893', phone: '', level: 3, notes: 'бухгалтер: +7 (911) 222-33-44, buh@romashka.ru', dateAdded: '2025-02-01T00:00:00Z' },
    { id: 2, organizationName: 'ИП Сидоров', inn: '', phone: '8 903 111-22-33', level: 1, notes: '', dateAdded: '2025-01-01T00:00:00Z' },
    { id: 3, organizationName: 'АО Василёк', inn: '7707083894', phone: 'нет', level: 2, notes: '', dateAdded: '2025-01-01T00:00:00Z' },
];

describe('жабы: сопоставление', () => {
    it('ключ названия без формы собственности и кавычек', () => {
        expect(orgNameKey('ООО «Ромашка Плюс»')).toBe('ромашка плюс');
        expect(orgNameKey('Общество с ограниченной ответственностью "Ёлка"')).toBe('елка');
    });

    it('нормализация записей ЧС: телефоны и данные из примечания', () => {
        const [a, b, c] = normalizeFrogEntries(FROGS);
        expect(a.notesPhones).toEqual(['79112223344']);
        expect(a.notesEmails).toEqual(['buh@romashka.ru']);
        expect(b.phones).toEqual(['79031112233']);
        expect(c.innValid).toBe(false);
        expect(c.phones).toEqual([]);
    });

    it('совпадения разной силы', () => {
        const idx = buildFrogIndex(FROGS);
        expect(matchRecordToFrogs({ inn: '7707083893' }, idx)).toMatchObject({ level: 3, via: ['inn'] });
        expect(matchRecordToFrogs({ inn: '', phones: ['79031112233'] }, idx)).toMatchObject({ level: 1, via: ['phone'] });
        expect(matchRecordToFrogs({ inn: '', emails: ['BUH@romashka.ru'] }, idx)).toMatchObject({ level: 3, via: ['notes'] });
        expect(matchRecordToFrogs({ inn: '500100732259', inns: ['500100732259', '7707083893'] }, idx).via).toContain('inn-text');
        const weak = matchRecordToFrogs({ inn: '', question: 'Звонили из Ромашка Плюс по поводу ЭЦП' }, idx);
        expect(weak.level).toBe(0);
        expect(weak.weakLevel).toBe(3);
        expect(weak.via).toEqual(['name']);
        expect(matchRecordToFrogs({ inn: '1111111111', question: 'Ромашка' }, idx).entries).toEqual([]);
    });

    it('карта телефонов для значков на карточках', () => {
        const m = buildFrogPhoneLevelMap(FROGS);
        expect(m.get('79031112233')).toBe(1);
        expect(m.get('79112223344')).toBe(3);
    });

    it('сводка обращений одной жабы (для окна ЧС)', () => {
        const recs = [
            { id: 1, inn: '7707083893', appealDate: '2025-01-10', question: 'a', phones: [] },
            { id: 2, inn: '7707083893', appealDate: '2025-03-10', question: 'b', phones: [] },
            { id: 3, inn: '', appealDate: '2025-03-11', question: 'опять Ромашка Плюс', phones: [] },
        ];
        const s = summarizeAppealsForFrogEntry(FROGS[0], recs);
        expect(s.count).toBe(2);
        expect(s.mentions).toBe(1);
        expect(s.afterAdded).toBe(1);
        expect(s.recent[0].id).toBe(2);
    });
});

describe('жабы: статистика', () => {
    it('ранги со связками', () => {
        expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    });

    it('Манн — Уитни: явный сдвиг значим, эффект ≈ 1', () => {
        const r = mannWhitneyU([10, 11, 12, 13, 14, 15], [1, 2, 3, 4, 5, 6]);
        expect(r.p).toBeLessThan(0.01);
        expect(r.effect).toBeCloseTo(1, 6);
        expect(mannWhitneyU([1, 2, 3, 4], [1, 2, 3, 4]).p).toBeGreaterThan(0.9);
    });

    it('Спирмен: монотонная связь = 1', () => {
        expect(spearman([1, 2, 3, 4, 5], [2, 4, 8, 16, 32]).rho).toBeCloseTo(1, 10);
    });

    it('отношение шансов и z-тест долей', () => {
        const o = oddsRatio(30, 70, 10, 90);
        expect(o.or).toBeGreaterThan(3);
        expect(o.significant).toBe(true);
        expect(twoProportionZ(30, 100, 10, 100).p).toBeLessThan(0.001);
    });

    it('AUC и логистическая регрессия разделяют классы', () => {
        expect(rocAuc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0])).toBe(1);
        const X = [];
        const y = [];
        for (let i = 0; i < 60; i++) {
            X.push([i % 2 ? 5 + (i % 7) / 10 : 1 + (i % 5) / 10]);
            y.push(i % 2);
        }
        const m = trainLogistic(X, y);
        expect(m.predict([5.5])).toBeGreaterThan(0.8);
        expect(m.predict([1.2])).toBeLessThan(0.2);
        expect(crossValidatedAuc(X, y, 5)).toBeGreaterThan(0.95);
    });
});

describe('жабы в движке аналитики', () => {
    const recs = [];
    let id = 1;
    for (let k = 0; k < 400; k++) {
        const frog = k % 20 === 0;
        const inn = frog ? '7707083893' : `50010073225${k % 10}`;
        recs.push({
            id: id++,
            inn,
            phones: [],
            emails: [],
            question: frog ? 'Безобразие, жалоба: не уходит отчёт!!' : 'Как настроить ЭДО с контрагентом',
            appealDate: new Date(Date.UTC(2025, 0, 1 + (k % 60))).toISOString().slice(0, 10),
            appealDateSource: 'block',
            uploadedAt: '2025-03-01T00:00:00Z',
            parserVersion: 2,
        });
    }
    const I = computeInsights(recs, { blacklistEntries: FROGS, now: Date.UTC(2025, 5, 1) });

    it('обращения жаб найдены и проиндексированы', () => {
        expect(I.frogs.summary.appeals).toBe(20);
        expect(I.index.frog.all).toHaveLength(20);
        expect(I.index.frog.l3).toHaveLength(20);
        expect(I.overview.frogAppeals).toBe(20);
        const anyFrog = I.index.frog.all[0];
        expect(I.perRecord[anyFrog].f).toMatchObject({ l: 3, v: ['inn'] });
    });

    it('различия жаб значимы: негатив и жалобы', () => {
        const neg = I.frogs.proportions.find((p) => p.label.startsWith('Негативная'));
        expect(neg.p1).toBe(1);
        expect(neg.significant).toBe(true);
        expect(I.frogs.words.map((w) => w.word)).toContain('безобразие');
    });

    it('гигиена списка: неверный ИНН и нераспознанный телефон', () => {
        const h = Object.fromEntries(I.frogs.hygiene.map((x) => [x.key, x.count]));
        expect(h.invalidInn).toBe(1);
        expect(h.badPhone).toBe(1);
    });

    it('пустой чёрный список не ломает расчёт', () => {
        const J = computeInsights(recs.slice(0, 50), {});
        expect(J.frogs.insufficient).toBe(true);
    });
});
