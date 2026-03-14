'use strict';

import { describe, expect, it, vi } from 'vitest';
import { runSearchAndIndexHealthTests } from './search-health-tests.js';

describe('search-health-tests', () => {
    it('вызывает report при отсутствии getFromIndexedDB', async () => {
        const report = vi.fn();
        await runSearchAndIndexHealthTests({ performDBOperation: vi.fn() }, report, (p) => p);
        expect(report).toHaveBeenCalledWith(
            'warn',
            'Поиск / индексация',
            expect.stringContaining('IndexedDB'),
        );
    });

    it('при пустом статусе индекса сообщает warn', async () => {
        const report = vi.fn();
        const getFromIndexedDB = vi.fn().mockResolvedValue(null);
        const performDBOperation = vi.fn().mockResolvedValue(0);
        await runSearchAndIndexHealthTests(
            { getFromIndexedDB, performDBOperation },
            report,
            (p) => p,
        );
        expect(getFromIndexedDB).toHaveBeenCalledWith('preferences', 'searchIndexStatus');
        const statusCalls = report.mock.calls.filter(
            (c) => c[1] && c[1].includes('статус индекса'),
        );
        expect(statusCalls.length).toBeGreaterThanOrEqual(1);
        expect(statusCalls.some((c) => c[0] === 'warn' || c[0] === 'info')).toBe(true);
    });

    it('при успешном статусе и непустом индексе сообщает info', async () => {
        const report = vi.fn();
        const getFromIndexedDB = vi.fn().mockResolvedValue({ built: true, version: 13 });
        const performDBOperation = vi
            .fn()
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce([
                {
                    word: 'тест',
                    refs: [{ store: 'algorithms', id: '1', field: 'title', weight: 1 }],
                },
            ]);
        await runSearchAndIndexHealthTests(
            { getFromIndexedDB, performDBOperation },
            report,
            (p) => p,
        );
        const infoCalls = report.mock.calls.filter((c) => c[0] === 'info');
        expect(infoCalls.length).toBeGreaterThanOrEqual(1);
        expect(report).toHaveBeenCalledWith(
            'info',
            expect.any(String),
            expect.stringContaining('Записей'),
        );
    });

    it('проверка токенизации всегда выполняется и даёт info при успехе', async () => {
        const report = vi.fn();
        const getFromIndexedDB = vi.fn().mockResolvedValue({});
        const performDBOperation = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce([]);
        await runSearchAndIndexHealthTests(
            { getFromIndexedDB, performDBOperation },
            report,
            (p) => p,
        );
        const tokenCalls = report.mock.calls.filter((c) => c[1] && c[1].includes('токенизация'));
        expect(tokenCalls.length).toBe(1);
        expect(tokenCalls[0][0]).toBe('info');
    });

    it('при переданном getGlobalSearchResults вызывает его и отчитывает результат', async () => {
        const report = vi.fn();
        const getFromIndexedDB = vi.fn().mockResolvedValue({ built: true });
        const performDBOperation = vi
            .fn()
            .mockResolvedValueOnce(10)
            .mockResolvedValueOnce([
                {
                    word: 'алг',
                    refs: [{ store: 'algorithms', id: '1', field: 'title', weight: 1 }],
                },
            ]);
        const getGlobalSearchResults = vi.fn().mockResolvedValue([{ id: '1', title: 'Алгоритм' }]);
        await runSearchAndIndexHealthTests(
            {
                getFromIndexedDB,
                performDBOperation,
                getGlobalSearchResults,
            },
            report,
            (p) => p,
        );
        expect(getGlobalSearchResults).toHaveBeenCalledWith('алгоритм');
        const execCalls = report.mock.calls.filter((c) => c[1] && c[1].includes('выполнение'));
        expect(execCalls.length).toBe(1);
        expect(execCalls[0][2]).toContain('результатов');
    });
});
