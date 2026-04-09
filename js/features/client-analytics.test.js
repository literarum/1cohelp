'use strict';

import { describe, it, expect, vi } from 'vitest';
import {
    pluralRuFiles,
    buildClientAnalyticsSearchIndexLine,
    filterClientAnalyticsRecordsByQuery,
    buildClientAnalyticsStructureSignature,
    decideClientAnalyticsDuplicateReason,
    navigateToBlacklistByInn,
} from './client-analytics.js';

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
                id === 'blacklistSearchInput'
                    ? { value: '', dispatchEvent, focus }
                    : null,
            ),
        };
        const setActiveTabFn = vi.fn(async () => {});
        const result = await navigateToBlacklistByInn('ИНН: 7707083893', { setActiveTabFn });
        expect(result).toBe(true);
        expect(setActiveTabFn).toHaveBeenCalledWith('blacklistedClients', true);
        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        expect(focus).toHaveBeenCalledTimes(1);
    });
});
