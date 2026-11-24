'use strict';

import { describe, it, expect } from 'vitest';
import {
    forecastDaily,
    forecastSNaive,
    forecastSeasonalMean,
    holtWintersAuto,
    holtWintersForecast,
    seasonalNaiveScale,
} from './client-analytics-forecast.js';
import { comparePeriods, buildStemFamilies, computeInsights } from './client-analytics-insights.js';
import { setCustomTopics, compileTopicKeywords, classifyText, activeTopics, TOPICS } from './client-analytics-text.js';

function series(days, fn) {
    const out = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(Date.UTC(2025, 0, 6 + i));
        out.push({ date: d.toISOString().slice(0, 10), count: fn(i) });
    }
    return out;
}

describe('прогноз', () => {
    it('сезонные базовые методы', () => {
        const y = [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17];
        expect(forecastSNaive(y, 3)).toEqual([11, 12, 13]);
        expect(forecastSeasonalMean(y, 1, 2)).toEqual([6]);
        expect(seasonalNaiveScale(y)).toBe(10);
    });

    it('Холт — Винтерс воспроизводит чистую недельную сезонность', () => {
        const pattern = [50, 60, 55, 58, 52, 10, 5];
        const y = Array.from({ length: 84 }, (_, i) => pattern[i % 7]);
        const fit = holtWintersAuto(y);
        const fc = holtWintersForecast(fit, 7);
        fc.forEach((v, k) => expect(Math.abs(v - pattern[(84 + k) % 7])).toBeLessThan(1));
    });

    it('выбор модели по бэктесту, интервалы, неотрицательность', () => {
        const pattern = [50, 60, 55, 58, 52, 10, 5];
        const d = series(140, (i) => pattern[i % 7] + ((i * 7919) % 11) - 5 + Math.floor(i / 14));
        const F = forecastDaily(d);
        expect(F.insufficient).toBe(false);
        expect(F.days).toHaveLength(14);
        expect(F.mase).toBeLessThan(1);
        for (const x of F.days) {
            expect(x.lo80).toBeLessThanOrEqual(x.value + 1e-9);
            expect(x.hi80).toBeGreaterThanOrEqual(x.value - 1e-9);
            expect(x.lo95).toBeGreaterThanOrEqual(0);
        }
        expect(F.days[0].date).toBe('2025-05-26');
    });

    it('короткий ряд — честный отказ', () => {
        expect(forecastDaily(series(20, () => 5)).insufficient).toBe(true);
    });
});

describe('свои темы', () => {
    it('ключевые слова: начало слова, фраза, «*»', () => {
        const re = compileTopicKeywords('акт сверки, взаиморасч*т');
        expect(re.test('нужен акт сверки')).toBe(true);
        expect(re.test('взаиморасчеты')).toBe(true);
        expect(re.test('пакт')).toBe(false);
        expect(compileTopicKeywords(' , ;')).toBeNull();
    });

    it('добавление и сброс', () => {
        setCustomTopics([{ id: 'x', label: 'Кассы', words: 'ккт, касс, офд' }]);
        expect(activeTopics()).toHaveLength(TOPICS.length + 1);
        expect(classifyText('не пробивает кассовый чек, ОФД не отвечает').topics).toContain('u_x');
        const I = computeInsights(
            [{ id: 1, inn: '', question: 'касса не работает', uploadedAt: '2025-01-01T00:00:00Z' }],
            { customTopics: [{ id: 'x', label: 'Кассы', words: 'касс' }] },
        );
        expect(I.topics.list.find((t) => t.id === 'u_x').count).toBe(1);
        setCustomTopics([]);
        expect(activeTopics()).toHaveLength(TOPICS.length);
    });
});

describe('сравнение периодов', () => {
    const recs = [];
    let id = 1;
    for (let d = 0; d < 60; d++) {
        const ymd = new Date(Date.UTC(2025, 0, 1 + d)).toISOString().slice(0, 10);
        const n = d < 30 ? 10 : 20; // во втором периоде темп вдвое выше
        for (let k = 0; k < n; k++) {
            recs.push({ id: id++, inn: `77070838${String(k % 9).padStart(2, '0')}`, question: d >= 30 && k < 10 ? 'требование из налоговой' : 'настроить ЭДО', appealDate: ymd, appealDateSource: 'block' });
        }
    }
    const C = comparePeriods(recs, { from: '2025-01-01', to: '2025-01-30' }, { from: '2025-01-31', to: '2025-03-01' });

    it('темп и его значимость', () => {
        expect(C.A.n).toBe(300);
        expect(C.B.n).toBe(600);
        expect(C.rate.ratio).toBeCloseTo(2, 6);
        expect(C.rate.p).toBeLessThan(0.001);
    });

    it('растущая тема и слово', () => {
        const claims = C.topics.find((t) => t.id === 'claims');
        expect(claims.shareA).toBe(0);
        expect(claims.shareB).toBeCloseTo(0.5, 6);
        expect(claims.significant).toBe(true);
        expect(C.rising.map((w) => w.word)).toContain('требование');
    });
});

describe('семейства основ', () => {
    it('сводит падежи отглагольных существительных, не трогая разные слова', () => {
        const tf = new Map(['обращ', 'обращен', 'отчет', 'отчетн', 'отчетност', 'ошибк', 'ошибок'].map((x) => [x, 1]));
        const m = buildStemFamilies(tf);
        expect(m.get('обращен')).toBe('обращ');
        expect(m.get('отчетност')).toBe('отчетн');
        expect(m.get('ошибок')).toBe('ошибк');
        expect(m.has('отчетн')).toBe(false);
    });

    it('в движке «обращение» и «обращения» — одно слово', () => {
        const I = computeInsights([
            { id: 1, question: 'обращение клиента', uploadedAt: '2025-01-01T00:00:00Z' },
            { id: 2, question: 'обращения клиентов', uploadedAt: '2025-01-01T00:00:00Z' },
        ]);
        const t = I.text.topTerms.find((x) => x.stem === 'обращ');
        expect(t.df).toBe(2);
    });
});
