'use strict';

import { describe, it, expect, vi } from 'vitest';
import {
    collectAlgorithmIdsFromAlgorithmsStore,
    isPlausibleHttpUrl,
    runLightDataIntegrityPass,
} from './data-integrity-pass.js';

describe('collectAlgorithmIdsFromAlgorithmsStore', () => {
    it('собирает id из main и секций-массивов', () => {
        const ids = collectAlgorithmIdsFromAlgorithmsStore({
            data: {
                main: { id: 'main', title: 'x' },
                tools: [{ id: 'a1' }, { id: 'a2' }],
            },
        });
        expect(ids.has('main')).toBe(true);
        expect(ids.has('a1')).toBe(true);
        expect(ids.has('a2')).toBe(true);
    });

    it('возвращает пустое множество при отсутствии data', () => {
        expect(collectAlgorithmIdsFromAlgorithmsStore(null).size).toBe(0);
    });
});

describe('isPlausibleHttpUrl', () => {
    it('принимает нормализуемый URL', () => {
        expect(isPlausibleHttpUrl('https://example.com/x')).toBe(true);
        expect(isPlausibleHttpUrl('example.com')).toBe(true);
    });

    it('отклоняет javascript: и data:', () => {
        expect(isPlausibleHttpUrl('javascript:alert(1)')).toBe(false);
        expect(isPlausibleHttpUrl('data:text/html,hi')).toBe(false);
    });

    it('пустая строка допустима (нет URL для проверки)', () => {
        expect(isPlausibleHttpUrl('')).toBe(true);
    });
});

describe('runLightDataIntegrityPass', () => {
    it('возвращает предупреждение без performDBOperation', async () => {
        const rows = await runLightDataIntegrityPass(
            { runWithTimeout: (p) => p },
            { profile: 'fast' },
        );
        expect(rows.some((r) => r.level === 'warn' && r.title.includes('Контур'))).toBe(true);
    });

    it('находит несоответствие count и getAll', async () => {
        const performDBOperation = vi.fn((_store, _mode, fn) => {
            const mock = {
                count: () => Promise.resolve(2),
                getAll: () => Promise.resolve([{ id: 1 }]),
            };
            return fn(mock);
        });
        const runWithTimeout = (p) => p;
        const rows = await runLightDataIntegrityPass(
            { performDBOperation, getFromIndexedDB: async () => null, runWithTimeout },
            { profile: 'full' },
        );
        expect(
            rows.some(
                (r) =>
                    r.level === 'error' &&
                    r.title.includes('согласованность') &&
                    r.message.includes('count()=2'),
            ),
        ).toBe(true);
    });

    it('обнаруживает сироту в избранном', async () => {
        const bm = [{ id: 1, url: 'https://a.com' }];
        const fav = [{ itemType: 'bookmark', originalItemId: '99' }];
        const performDBOperation = vi.fn((store, _mode, fn) => {
            const data = {
                bookmarks: bm,
                links: [],
                extLinks: [],
                reglaments: [],
                favorites: fav,
                pdfFiles: [],
                screenshots: [],
            };
            const rows = data[store] || [];
            const mock = {
                count: () => Promise.resolve(rows.length),
                getAll: () => Promise.resolve(rows),
            };
            return fn(mock);
        });
        const getFromIndexedDB = vi.fn(async () => ({
            data: { main: { id: 'main' }, x: [] },
        }));
        const runWithTimeout = (p) => p;
        const rows = await runLightDataIntegrityPass(
            { performDBOperation, getFromIndexedDB, runWithTimeout },
            { profile: 'full' },
        );
        expect(
            rows.some(
                (r) =>
                    r.level === 'error' &&
                    r.title.includes('Избранное') &&
                    r.message.includes('bookmark:99'),
            ),
        ).toBe(true);
    });
});
