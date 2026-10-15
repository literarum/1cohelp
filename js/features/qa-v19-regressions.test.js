/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { parseXml } from './xml-analyzer-model.js';
import { parseNumberedAppealBlock } from './client-analytics-parse.js';
import { compareRecordsNewestFirst } from './client-analytics.js';

describe('QA v19: регрессии', () => {
    it('XML: «уникальных тегов» считает только элементы, без имён атрибутов', async () => {
        const d = await parseXml('<a x="1" y="2"><b z="3"/><b/><c/></a>');
        const s = d.stats();
        expect(s.distinctNames).toBe(3); // a, b, c
        expect(s.distinctAllNames).toBeGreaterThan(s.distinctNames);
    });

    it('база клиентов: из вопроса убираются подписи реквизитов вместе с номерами', () => {
        const r = parseNumberedAppealBlock(
            '1) ИНН 7707083893 КПП 770701001\nТел. +7 903 111-22-33\nВопрос: как подать отчёт?',
        );
        expect(r.question).toBe('Вопрос: как подать отчёт?');
        const inline = parseNumberedAppealBlock('3) ИНН 7707083893, КПП: 770701001 — не уходит отчёт');
        expect(inline.question).toBe('не уходит отчёт');
    });

    it('база клиентов: слово «КПП» в тексте вопроса не вырезается', () => {
        const r = parseNumberedAppealBlock('2) Клиент ИНН 7707083893 просит помочь с КПП в отчёте');
        expect(r.question).toContain('с КПП в отчёте');
    });

    it('база клиентов: при одинаковом времени загрузки новее пункт ниже по файлу', () => {
        const t = '2026-10-15T08:00:00.000Z';
        const list = [
            { id: 1, uploadedAt: t, listItemIndex: 1 },
            { id: 4, uploadedAt: t, listItemIndex: 4 },
            { id: 9, uploadedAt: '2026-10-16T08:00:00.000Z', listItemIndex: 1 },
        ].sort(compareRecordsNewestFirst);
        expect(list.map((r) => r.id)).toEqual([9, 4, 1]);
    });
});
