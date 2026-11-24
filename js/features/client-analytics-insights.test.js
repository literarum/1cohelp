'use strict';

import { describe, it, expect } from 'vitest';
import { computeInsights, effectiveDate, computeClientProfile, xrayRecord } from './client-analytics-insights.js';
import { fixHomoglyphs, tokenizeDetailed, classifyText, cleanDisplayText } from './client-analytics-text.js';
import { describeInn, kppReason, regionByCode } from './client-analytics-registry.js';
import {
    parseTxtIntoRecords,
    decodeTextBuffer,
    findDatesInText,
    extractAppealDateTime,
    dateFromFileName,
    isValidOgrn,
    scrubQuestionText,
    extractPhoneCandidates,
    pickPrimaryInn,
} from './client-analytics-parse.js';
import { csvCell } from './client-analytics-dashboard.js';

describe('разборщик v2', () => {
    it('windows-1251 и KOI8-R определяются по частоте букв', () => {
        const cp1251 = Uint8Array.from([0xcf, 0xf0, 0xee, 0xe1, 0xeb, 0xe5, 0xec, 0xe0, 0x20, 0xf1, 0x20, 0xee, 0xf2, 0xf7, 0xe5, 0xf2, 0xee, 0xec]);
        const r = decodeTextBuffer(cp1251);
        expect(r.encoding).toBe('windows-1251');
        expect(r.text).toBe('Проблема с отчетом');
        expect(decodeTextBuffer(new TextEncoder().encode('Привет')).encoding).toBe('utf-8');
        expect(decodeTextBuffer(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41])).text).toBe('A');
    });

    it('даты: форматы, невозможные даты и двузначный год', () => {
        const ds = findDatesInText('12.03.2025 10:15, 2025-04-01T09:30, 5 мая 2024 г. в 14:05, 31.02.2025, 01-02-03');
        expect(ds.map((d) => [d.date, d.time])).toEqual([
            ['2025-03-12', '10:15'],
            ['2025-04-01', '09:30'],
            ['2024-05-05', '14:05'],
        ]);
        expect(findDatesInText('от 07.11.24')[0].date).toBe('2024-11-07');
    });

    it('дата обращения — только из заголовка или с подписью, не период отчёта', () => {
        expect(extractAppealDateTime('12.03.2025 ИНН 7707083893\nотчёт за 31.12.2024').date).toBe('2025-03-12');
        expect(extractAppealDateTime('ИНН 7707083893\nне уходит отчёт за 31.12.2024')).toBeNull();
        expect(extractAppealDateTime('ИНН 7707083893\nДата: 01.02.2025').date).toBe('2025-02-01');
        expect(dateFromFileName('obrashcheniya_2025-03-12.txt')).toBe('2025-03-12');
        expect(dateFromFileName('20250312_vygruzka.txt')).toBe('2025-03-12');
        expect(dateFromFileName('spisok.txt')).toBeNull();
    });

    it('дата из шапки файла применяется к пунктам без своей даты', () => {
        const rows = parseTxtIntoRecords('Выгрузка от 05.06.2025\n1). ИНН 7707083893 вопрос\n2). 06.06.2025 ИНН 7707083893 другой', 'x.txt');
        expect(rows[0].appealDate).toBe('2025-06-05');
        expect(rows[0].appealDateSource).toBe('file-header');
        expect(rows[1].appealDate).toBe('2025-06-06');
        expect(rows[1].appealDateSource).toBe('block');
    });

    it('ОГРН / ОГРНИП: контрольное число', () => {
        expect(isValidOgrn('1027700132195')).toBe(true);
        expect(isValidOgrn('1027700132196')).toBe(false);
        expect(isValidOgrn('304500116000157')).toBe(true);
    });

    it('московский ИНН 97… не принимается за телефон, «тел. 9…» — не ИНН', () => {
        expect(extractPhoneCandidates('ИНН 9701049890')).toEqual([]);
        expect(extractPhoneCandidates('тел. 9161234567')).toEqual(['79161234567']);
        expect(pickPrimaryInn('тел 9161234567 ИНН 7707083893').digits).toBe('7707083893');
    });

    it('из вопроса убираются телефоны в любом написании, почта и повисшие подписи', () => {
        const q = scrubQuestionText('Тел.: +7 (903) 111-22-33, e-mail: buh@firma.ru Вопрос: не уходит отчёт', {
            phones: ['79031112233'],
            emails: ['buh@firma.ru'],
        });
        expect(q).toBe('не уходит отчёт');
        // слово «КПП» в обычной фразе не трогается
        expect(scrubQuestionText('проблема с КПП', {})).toBe('проблема с КПП');
    });

    it('невидимые символы внутри ИНН не мешают распознаванию', () => {
        const rows = parseTxtIntoRecords('1). Вопрос про ЭДО 7707​083893', 'z.txt');
        expect(rows[0].inn).toBe('7707083893');
        expect(rows[0].sourceText).toContain('7707083893');
        expect(rows[0].parserVersion).toBe(2);
    });
});

describe('текстовый конвейер', () => {
    it('латинские двойники и «1C»', () => {
        expect(fixHomoglyphs('пpодление').word).toBe('продление');
        expect(fixHomoglyphs('1C').word).toBe('1с');
        expect(fixHomoglyphs('excel').fixed).toBe(false);
        const t = tokenizeDetailed('Не видит тoкен');
        expect(t.find((x) => x.surface === 'тoкен').homoglyph).toBe(true);
    });

    it('рубрикатор и намерения', () => {
        const c = classifyText('Срочно! Не отправляется декларация НДС в ФНС, ошибка ФЛК');
        expect(c.topics).toEqual(expect.arrayContaining(['fns', 'send', 'errors']));
        expect(c.intent).toBe('problem');
        expect(c.urgency).toBeGreaterThanOrEqual(2);
        expect(classifyText('Как настроить ЭДО с контрагентом?').topics).toContain('edo');
    });

    it('очистка отображаемого текста', () => {
        expect(cleanDisplayText('a  b​\r\n\n\n\nc')).toBe('a b\n\nc');
    });
});

describe('справочники', () => {
    it('регион и тип по ИНН, причина КПП', () => {
        expect(describeInn('7707083893')).toMatchObject({ kind: 'ЮЛ', region: 'Москва' });
        expect(describeInn('9701049890').region).toBe('Москва');
        expect(describeInn('500100732259')).toMatchObject({ kind: 'ФЛ/ИП', region: 'Московская область' });
        expect(regionByCode('93')).toBe('Донецкая Народная Республика');
        expect(kppReason('770701001').label).toBe('по месту нахождения организации');
        expect(kppReason('773643001').label).toBe('филиал');
    });
});

function makeRecords() {
    const recs = [];
    let id = 1;
    const qs = [
        'Не уходит отчёт РСВ в ФНС, ошибка ФЛК',
        'Как продлить сертификат ЭЦП на токене?',
        'Пришло требование из налоговой, как ответить',
        'Как настроить ЭДО с контрагентом в 1С',
    ];
    for (let d = 0; d < 60; d++) {
        const ymd = new Date(Date.UTC(2025, 0, 1 + d)).toISOString().slice(0, 10);
        const n = d === 40 ? 40 : 4; // всплеск
        for (let k = 0; k < n; k++) {
            recs.push({
                id: id++,
                inn: k % 2 ? '7707083893' : '500100732259',
                kpp: '',
                phones: k % 3 ? ['79031112233'] : [],
                emails: [],
                question: qs[(d + k) % qs.length],
                uploadedAt: '2025-03-10T10:00:00.000Z',
                sourceFileId: 1,
                appealDate: ymd,
                appealTime: `${String(9 + (k % 8)).padStart(2, '0')}:15`,
                appealDateSource: 'block',
                parserVersion: 2,
            });
        }
    }
    return recs;
}

describe('движок аналитики', () => {
    const recs = makeRecords();
    const I = computeInsights(recs, { now: Date.UTC(2025, 5, 1) });

    it('сводка и согласованность счётчиков', () => {
        expect(I.overview.records).toBe(recs.length);
        expect(I.time.daily.reduce((s, d) => s + d.count, 0)).toBe(recs.length);
        expect(I.time.weekday.reduce((s, v) => s + v, 0)).toBe(recs.length);
        expect(I.overview.from).toBe('2025-01-01');
        expect(I.overview.to).toBe('2025-03-01');
        expect(Object.keys(I.perRecord)).toHaveLength(recs.length);
    });

    it('всплеск найден робастным z', () => {
        expect(I.time.anomalies[0].date).toBe('2025-02-10');
        expect(I.time.hasTime).toBe(true);
    });

    it('темы, индексы для проваливания и дубликаты', () => {
        const fns = I.topics.list.find((t) => t.id === 'fns');
        expect(fns.count).toBe(I.index.topic.fns.length);
        expect(I.duplicates.templates.length).toBeGreaterThan(0);
        expect(I.duplicates.templates[0].count).toBeGreaterThan(10);
        expect(I.clusters.insufficient).toBe(false);
        const sizes = I.clusters.list.reduce((s, c) => s + c.size, 0);
        expect(sizes + I.clusters.unclustered).toBe(recs.length);
    });

    it('клиенты: концентрация и связи через общий телефон', () => {
        expect(I.clients.total).toBe(2); // 7707083893 и 500100732259
        expect(I.clients.gini).toBeGreaterThanOrEqual(0);
        expect(I.clients.linkedGroups.length).toBe(1);
    });

    it('качество: ИНН с неверной контрольной суммой отмечены', () => {
        const bad = I.quality.checks.find((c) => c.key === 'innInvalid');
        expect(bad.count).toBe(I.index.quality.innInvalid.length);
    });

    it('детерминированность', () => {
        const J = computeInsights(recs, { now: Date.UTC(2025, 5, 1) });
        expect(J.clusters.list.map((c) => c.size)).toEqual(I.clusters.list.map((c) => c.size));
    });

    it('пустая база не падает', () => {
        const E = computeInsights([]);
        expect(E.overview.records).toBe(0);
        expect(E.time.insufficient).toBe(true);
    });
});

describe('вспомогательное', () => {
    it('эффективная дата: из текста, иначе загрузка', () => {
        expect(effectiveDate({ appealDate: '2025-01-02', appealDateSource: 'block' }).source).toBe('block');
        expect(effectiveDate({ uploadedAt: '2025-01-02T10:00:00.000Z' }).source).toBe('upload');
    });

    it('профиль клиента и рентген записи', () => {
        const p = computeClientProfile([
            { appealDate: '2025-01-01', question: 'ошибка ФЛК' },
            { appealDate: '2025-03-01', question: 'ошибка ФЛК' },
        ]);
        expect(p.monthly.map((m) => m.count)).toEqual([1, 0, 1]);
        expect(p.gaps.median).toBe(59);
        const x = xrayRecord({ question: 'Не видит тoкен 1C', inn: '7707083893' });
        expect(x.tokens.some((t) => t.homoglyph)).toBe(true);
        expect(x.inn.valid).toBe(true);
    });

    it('CSV защищён от формул Excel', () => {
        expect(csvCell('=1+1')).toBe("'=1+1");
        expect(csvCell('a;b')).toBe('"a;b"');
    });
});
