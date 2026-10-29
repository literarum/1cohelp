import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderMergeAttachmentPreview } from './db-merge.js';

describe('renderMergeAttachmentPreview', () => {
    let createObjectURL;
    let revokeObjectURL;
    beforeEach(() => {
        // jsdom omits the native blob-URL API; keep rendering and cleanup real.
        let nextUrl = 0;
        createObjectURL = vi.fn(() => `blob:merge-preview/${nextUrl++}`);
        revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', class extends URL {
            static createObjectURL = createObjectURL;
            static revokeObjectURL = revokeObjectURL;
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('ничего не рисует без вложений', () => {
        const host = document.createElement('div');
        renderMergeAttachmentPreview(host, [{ storeName: 'screenshots', importOnly: [] }]);
        expect(host.children.length).toBe(0);
    });

    it('рисует миниатюры и PDF, ограничивает число и освобождает URL', () => {
        const host = document.createElement('div');
        const png = new Blob([new Uint8Array(10)], { type: 'image/png' });
        const shots = Array.from({ length: 30 }, () => ({ blob: png }));
        const pdfs = [{ name: 'a.pdf', blob: new Blob([new Uint8Array(2048)], { type: 'application/pdf' }) }];
        const release = renderMergeAttachmentPreview(host, [
            { storeName: 'screenshots', importOnly: shots },
            { storeName: 'pdfFiles', importOnly: pdfs },
        ]);
        expect(host.querySelectorAll('img').length).toBe(24);
        expect(host.textContent).toContain('и ещё 6');
        expect(host.textContent).toContain('a.pdf');
        expect(host.textContent).toContain('2.0 КБ');
        expect(createObjectURL).toHaveBeenCalledTimes(24);
        expect(revokeObjectURL).not.toHaveBeenCalled();
        release();
        expect(revokeObjectURL.mock.calls.map(([url]) => url)).toEqual(
            createObjectURL.mock.results.map(({ value }) => value),
        );
    });

    it('«Просмотр» PDF встраивает и убирает iframe, освобождая URL', () => {
        const host = document.createElement('div');
        const pdfs = [{ name: 'a.pdf', blob: new Blob([new Uint8Array(64)], { type: 'text/html' }) }];
        const release = renderMergeAttachmentPreview(host, [{ storeName: 'pdfFiles', importOnly: pdfs }]);
        const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Просмотр');
        expect(btn).toBeTruthy();
        btn.click();
        expect(host.querySelectorAll('iframe').length).toBe(1);
        expect(btn.textContent).toBe('Скрыть');
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(createObjectURL.mock.calls[0][0].type).toBe('application/pdf');
        expect(host.querySelector('iframe').getAttribute('src')).toBe(
            createObjectURL.mock.results[0].value,
        );
        btn.click();
        expect(host.querySelectorAll('iframe').length).toBe(0);
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        release();
        expect(revokeObjectURL).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith(createObjectURL.mock.results[0].value);
    });

    it('битый base64 не ломает превью', () => {
        const host = document.createElement('div');
        renderMergeAttachmentPreview(host, [
            { storeName: 'screenshots', importOnly: [{ blob: { base64: '%%%', type: 'image/png' } }] },
        ]);
        expect(host.textContent).toContain('нет данных');
    });
});

import { summarizeMergePlanByStore, buildMergeReportText } from './db-merge.js';

describe('сводка плана и отчёт слияния', () => {
    const plan = {
        perStore: {
            bookmarks: { toInsert: [{}, {}], toUpdate: [{}] },
            reglaments: { toInsert: [], toUpdate: [] },
            screenshots: { toInsert: [{}], toUpdate: [] },
        },
    };
    it('считает вставки и обновления по разделам, пропуская пустые', () => {
        const rows = summarizeMergePlanByStore(plan);
        const bm = rows.find((r) => r.store === 'bookmarks');
        expect(bm.inserts).toBe(2);
        expect(bm.updates).toBe(1);
        expect(rows.some((r) => r.store === 'reglaments')).toBe(false);
        expect(summarizeMergePlanByStore(null)).toEqual([]);
    });
    it('отчёт содержит файл, итоги и пометку о резервной копии', () => {
        const text = buildMergeReportText({
            sourceFileName: 'x.json',
            analysis: { schemaVersion: '22', storeDiffs: [] },
            mergePlan: plan,
            backupOutcome: 'skipped_by_user',
        });
        expect(text).toContain('x.json');
        expect(text).toContain('добавлено 3, обновлено 1');
        expect(text).toContain('пропущена пользователем');
    });
});

import { mergeFieldLabel } from './db-merge.js';
describe('mergeFieldLabel', () => {
    it('переводит известные поля и сохраняет неизвестные', () => {
        expect(mergeFieldLabel('title')).toBe('Название');
        expect(mergeFieldLabel('customField')).toBe('customField');
    });
});
