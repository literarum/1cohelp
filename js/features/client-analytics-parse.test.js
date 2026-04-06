'use strict';

import { describe, it, expect } from 'vitest';
import {
    isValidInn10Checksum,
    isValidInn12Checksum,
    innConfidence,
    normalizeRussianPhone,
    extractPhoneCandidates,
    extractKppNearInn,
    parseTxtIntoRecords,
    splitIntoSegments,
    splitIntoNumberedBlocks,
    stripLeadingNumberedMarker,
    hasNumberedAppealFormat,
} from './client-analytics-parse.js';

describe('client-analytics-parse', () => {
    it('validates INN 10 checksum (known valid sample)', () => {
        expect(isValidInn10Checksum('7707083893')).toBe(true);
        expect(isValidInn10Checksum('7707083894')).toBe(false);
    });

    it('rejects invalid length', () => {
        expect(isValidInn10Checksum('123')).toBe(false);
        expect(isValidInn12Checksum('7707083893')).toBe(false);
    });

    it('innConfidence reflects checksum', () => {
        expect(innConfidence('7707083893')).toBe('high');
        expect(innConfidence('1234567890')).toBe('medium');
    });

    it('normalizes Russian phones', () => {
        expect(normalizeRussianPhone('+7 (903) 123-45-67')).toBe('79031234567');
        expect(normalizeRussianPhone('8 903 123 45 67')).toBe('79031234567');
        expect(normalizeRussianPhone('9031234567')).toBe('79031234567');
    });

    it('extractKppNearInn finds labeled KPP', () => {
        expect(extractKppNearInn('ИНН 7707083893 КПП 770701001')).toBe('770701001');
    });

    it('splitIntoSegments separates blocks', () => {
        const s = splitIntoSegments('a\n\n\nb');
        expect(s.length).toBeGreaterThanOrEqual(2);
    });

    it('parseTxtIntoRecords extracts INN KPP phone question', () => {
        const txt = `Обращение 1
ИНН 7707083893
КПП 770701001
Тел. +7 903 111-22-33
Вопрос: как подать отчёт?`;
        const rows = parseTxtIntoRecords(txt, 't.txt');
        expect(rows.length).toBeGreaterThanOrEqual(1);
        const r = rows[0];
        expect(r.inn).toBe('7707083893');
        expect(r.kpp).toBe('770701001');
        expect(r.phones.some((p) => p.includes('79031112233') || p === '79031112233')).toBe(true);
        expect(r.question.toLowerCase()).toMatch(/вопрос|отчёт/i);
    });

    it('hasNumberedAppealFormat detects 1). style', () => {
        expect(hasNumberedAppealFormat('1). Вопрос\n2). Другой')).toBe(true);
        expect(hasNumberedAppealFormat('просто текст без номеров')).toBe(false);
    });

    it('splitIntoNumberedBlocks splits 1). and 2).', () => {
        const txt = `1). Первый вопрос
ИНН 7707083893
2). Второй вопрос
79031234567`;
        const blocks = splitIntoNumberedBlocks(txt);
        expect(blocks.length).toBe(2);
        expect(stripLeadingNumberedMarker(blocks[0]).toLowerCase()).toMatch(/первый/);
        expect(stripLeadingNumberedMarker(blocks[1]).toLowerCase()).toMatch(/второй/);
    });

    it('parseTxtIntoRecords parses multiple numbered appeals with INN and phone', () => {
        const txt = `1). Как подать отчёт за квартал?
ИНН 7707083893 КПП 770701001 Тел. +7 903 111-22-33

2). Отдельное обращение только с телефоном
79037778899

3). ИНН в конце текста вопроса про ЭДО
Нужна консультация 7707083893`;
        const rows = parseTxtIntoRecords(txt, 'multi.txt');
        expect(rows.length).toBe(3);
        expect(rows[0].inn).toBe('7707083893');
        expect(rows[0].kpp).toBe('770701001');
        expect(rows[0].listItemIndex).toBe(1);
        expect(rows[1].inn).toBe('');
        expect(rows[1].phones.some((p) => p.endsWith('9037778899') || p === '79037778899')).toBe(true);
        expect(rows[1].listItemIndex).toBe(2);
        expect(rows[2].inn).toBe('7707083893');
        expect(rows[2].listItemIndex).toBe(3);
    });

    it('parseTxtIntoRecords: INN at end of line after question', () => {
        const txt = `1). Клиент спрашивает про закрытие периода
Дополнительный текст. 7707083893`;
        const rows = parseTxtIntoRecords(txt, 'end.txt');
        expect(rows.length).toBe(1);
        expect(rows[0].inn).toBe('7707083893');
        expect(rows[0].question.toLowerCase()).toMatch(/клиент|период|дополнительный/i);
    });

    it('parseTxtIntoRecords: numbered appeal with КПП only (no INN, no phone)', () => {
        const txt = `1). Нужна справка
КПП 770701001
Вопрос по кадрам?`;
        const rows = parseTxtIntoRecords(txt, 'kpp-num.txt');
        expect(rows.length).toBe(1);
        expect(rows[0].inn).toBe('');
        expect(rows[0].kpp).toBe('770701001');
        expect(rows[0].phones.length).toBe(0);
        expect(rows[0].listItemIndex).toBe(1);
    });

    it('parseTxtIntoRecords: legacy text with labeled КПП only', () => {
        const txt = `КПП 770701001
Клиент просит уточнить срок сдачи.`;
        const rows = parseTxtIntoRecords(txt, 'kpp-legacy.txt');
        expect(rows.length).toBe(1);
        expect(rows[0].inn).toBe('');
        expect(rows[0].kpp).toBe('770701001');
    });
});
