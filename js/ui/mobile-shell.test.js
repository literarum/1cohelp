/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect } from 'vitest';
import { pickPinnedTabs, SHORT_LABELS, ACTION_TILES, PINNED_PREFERENCE } from './mobile-shell.js';

describe('pickPinnedTabs', () => {
    it('берёт приоритетные вкладки в заданном порядке', () => {
        const vis = ['linksTab', 'mainTab', 'programTab', 'bookmarksTab', 'clientAnalyticsTab'];
        expect(pickPinnedTabs(vis)).toEqual(['mainTab', 'programTab', 'bookmarksTab', 'clientAnalyticsTab']);
    });
    it('пропускает скрытые и добирает недостающие из остальных', () => {
        expect(pickPinnedTabs(['mainTab', 'linksTab', 'skziTab', 'webRegTab', 'xmlAnalyzerTab'])).toEqual([
            'mainTab',
            'linksTab',
            'skziTab',
            'webRegTab',
        ]);
    });
    it('работает с короткими списками и ограничением max', () => {
        expect(pickPinnedTabs(['mainTab'])).toEqual(['mainTab']);
        expect(pickPinnedTabs([])).toEqual([]);
        expect(pickPinnedTabs(['mainTab', 'programTab', 'bookmarksTab'], PINNED_PREFERENCE, 2)).toEqual(['mainTab', 'programTab']);
    });
});

describe('справочники', () => {
    it('у всех закреплённых вкладок есть короткая подпись и иконка', () => {
        for (const id of PINNED_PREFERENCE) {
            expect(SHORT_LABELS[id]).toBeTruthy();
            expect(SHORT_LABELS[id][1].length).toBeLessThanOrEqual(11);
        }
    });
    it('плитки действий уникальны', () => {
        const ids = ACTION_TILES.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
