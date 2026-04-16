'use strict';

import { describe, it, expect, vi } from 'vitest';
import {
    pluralRuFiles,
    pluralRuAppeals,
    groupClientAnalyticsRecordsForDisplay,
    buildClientAnalyticsSearchIndexLine,
    filterClientAnalyticsRecordsByQuery,
    buildClientAnalyticsStructureSignature,
    decideClientAnalyticsDuplicateReason,
    navigateToBlacklistByInn,
} from './client-analytics.js';

describe('client-analytics pluralRuAppeals', () => {
    it('declines appeal count in Russian', () => {
        expect(pluralRuAppeals(1)).toBe('1 обращение');
        expect(pluralRuAppeals(2)).toBe('2 обращения');
        expect(pluralRuAppeals(4)).toBe('4 обращения');
        expect(pluralRuAppeals(5)).toBe('5 обращений');
        expect(pluralRuAppeals(11)).toBe('11 обращений');
        expect(pluralRuAppeals(21)).toBe('21 обращение');
        expect(pluralRuAppeals(22)).toBe('22 обращения');
    });
});

describe('client-analytics groupClientAnalyticsRecordsForDisplay', () => {
    it('merges records with the same normalized INN into one stack', () => {
        const { innStacks, noInnRecords } = groupClientAnalyticsRecordsForDisplay([
            {
                id: 1,
                inn: '7707083893',
                uploadedAt: '2026-01-01T10:00:00.000Z',
                question: 'Первый',
            },
            {
                id: 2,
                inn: 'ИНН 7707083893',
                uploadedAt: '2026-02-01T10:00:00.000Z',
                question: 'Второй',
            },
        ]);
        expect(noInnRecords).toHaveLength(0);
        expect(innStacks).toHaveLength(1);
        expect(innStacks[0].innKey).toBe('7707083893');
        expect(innStacks[0].records.map((r) => r.id)).toEqual([2, 1]);
    });

    it('keeps distinct INNs as separate stacks and sorts stacks by newest appeal', () => {
        const { innStacks } = groupClientAnalyticsRecordsForDisplay([
            { id: 1, inn: '1111111111', uploadedAt: '2026-01-05T00:00:00.000Z', question: 'a' },
            { id: 2, inn: '2222222222', uploadedAt: '2026-01-10T00:00:00.000Z', question: 'b' },
            { id: 3, inn: '1111111111', uploadedAt: '2026-01-03T00:00:00.000Z', question: 'c' },
        ]);
        expect(innStacks).toHaveLength(2);
        expect(innStacks[0].innKey).toBe('2222222222');
        expect(innStacks[1].innKey).toBe('1111111111');
        expect(innStacks[1].records.map((r) => r.id)).toEqual([1, 3]);
    });

    it('places records without extractable INN into noInnRecords', () => {
        const { innStacks, noInnRecords } = groupClientAnalyticsRecordsForDisplay([
            { id: 1, inn: '', phones: ['79001234567'], uploadedAt: '2026-01-01T00:00:00.000Z' },
        ]);
        expect(innStacks).toHaveLength(0);
        expect(noInnRecords).toHaveLength(1);
        expect(noInnRecords[0].id).toBe(1);
    });
});

describe('client-analytics pluralRuFiles', () => {
    it('declines file count in Russian', () => {
        expect(pluralRuFiles(1)).toBe('1 файл');
        expect(pluralRuFiles(2)).toBe('2 файла');
        expect(pluralRuFiles(4)).toBe('4 файла');
        expect(pluralRuFiles(5)).toBe('5 файлов');
        expect(pluralRuFiles(11)).toBe('11 файлов');
        expect(pluralRuFiles(21)).toBe('21 файл');
        expect(pluralRuFiles(22)).toBe('22 файла');
    });
});

describe('client-analytics search helpers', () => {
    it('builds searchable line from all major record fields', () => {
        const line = buildClientAnalyticsSearchIndexLine({
            inn: '7707083893',
            kpp: '770701001',
            phones: ['79031234567'],
            emails: ['client@example.com'],
            question: 'Проблема с ЭДО',
            contextSnippet: 'Контекст',
            sourceFileName: 'sample.txt',
            uploadedAt: '2026-04-09T12:00:00.000Z',
            confidence: 'high',
            listItemIndex: 4,
        });
        expect(line).toContain('7707083893');
        expect(line).toContain('770701001');
        expect(line).toContain('79031234567');
        expect(line).toContain('client@example.com');
        expect(line.toLowerCase()).toContain('проблема');
        expect(line).toContain('sample.txt');
        expect(line).toContain('4');
    });

    it('filters records using multi-token query across fields', () => {
        const records = [
            {
                id: 1,
                inn: '7707083893',
                kpp: '',
                phones: ['79031234567'],
                emails: ['first@example.com'],
                question: 'Вопрос по отчетности',
            },
            {
                id: 2,
                inn: '500100732259',
                kpp: '',
                phones: ['79035557788'],
                emails: ['second@example.com'],
                question: 'Совсем другой кейс',
            },
        ];
        const filtered = filterClientAnalyticsRecordsByQuery(records, '7707 отчет');
        expect(filtered.map((r) => r.id)).toEqual([1]);
    });
});

describe('client-analytics dedupe helpers', () => {
    it('builds stable structure signature regardless of records order', () => {
        const left = buildClientAnalyticsStructureSignature([
            { inn: '7707083893', kpp: '770701001', phones: ['79031234567'], emails: [] },
            { inn: '', kpp: '', phones: ['79039990000'], emails: ['a@b.ru'] },
        ]);
        const right = buildClientAnalyticsStructureSignature([
            { inn: '', kpp: '', phones: ['79039990000'], emails: ['a@b.ru'] },
            { inn: '7707083893', kpp: '770701001', phones: ['79031234567'], emails: [] },
        ]);
        expect(left).toBe(right);
    });

    it('detects duplicates by strict file name', () => {
        const reason = decideClientAnalyticsDuplicateReason(
            {
                name: 'Clients.txt',
                textSha256: 'new-text-hash',
                structureSha256: 'new-structure-hash',
                recordCount: 2,
            },
            [
                {
                    fileName: 'clients.txt',
                    textSha256: 'old-text-hash',
                    recordsStructureSha256: 'old-structure-hash',
                    recordsCount: 3,
                },
            ],
        );
        expect(reason?.kind).toBe('name');
    });

    it('detects duplicates by exact structure hash plus count', () => {
        const reason = decideClientAnalyticsDuplicateReason(
            {
                name: 'fresh.txt',
                textSha256: 'new-text-hash',
                structureSha256: 'same-structure',
                recordCount: 3,
            },
            [
                {
                    fileName: 'old.txt',
                    textSha256: 'other',
                    recordsStructureSha256: 'same-structure',
                    recordsCount: 3,
                },
            ],
        );
        expect(reason?.kind).toBe('structure');
    });
});

describe('client-analytics blacklist navigation', () => {
    it('switches tab and injects INN into blacklist search', async () => {
        const dispatchEvent = vi.fn();
        const focus = vi.fn();
        globalThis.document = {
            getElementById: vi.fn((id) =>
                id === 'blacklistSearchInput' ? { value: '', dispatchEvent, focus } : null,
            ),
        };
        const setActiveTabFn = vi.fn(async () => {});
        const result = await navigateToBlacklistByInn('ИНН: 7707083893', { setActiveTabFn });
        expect(result).toBe(true);
        expect(setActiveTabFn).toHaveBeenCalledWith(
            'blacklistedClients',
            true,
            expect.objectContaining({ navigationSource: 'programmatic' }),
        );
        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        expect(focus).toHaveBeenCalledTimes(1);
    });
});
