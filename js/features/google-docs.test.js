import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __googleDocsInternals, fetchGoogleDocs } from './google-docs.js';

describe('google-docs transport compatibility', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        Object.defineProperty(globalThis.navigator, 'onLine', {
            value: true,
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses plain fetch URL call for Google Docs endpoint', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                {
                    status: 'success',
                    content: {
                        type: 'paragraphs',
                        data: ['A'],
                    },
                },
            ],
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchGoogleDocs(['doc-1']);

        expect(fetchMock).toHaveBeenCalled();
        const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
        expect(requestUrl).toContain('https://script.google.com/macros/s/');
        expect(requestOptions).toBeUndefined();
        expect(result[0].data).toEqual(['A']);
    });

    it('normalizes table rows from Apps Script into shablony blocks', () => {
        const normalized = __googleDocsInternals.normalizeShablonyData([
            {
                Название: 'Отправка отчета',
                Текст: 'Добрый день, отправьте отчет до 18:00.',
                Комментарий: 'Срочно',
            },
        ]);

        expect(normalized.length).toBeGreaterThan(1);
        expect(normalized[0]).toContain('⏩ Отправка отчета');
        expect(normalized.some((line) => line.includes('Текст: Добрый день'))).toBe(true);
    });
});
