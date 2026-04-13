/** @vitest-environment jsdom */
'use strict';

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { setActiveTab, setTabsDependencies } from './tabs.js';
import { State } from '../app/state.js';

function minimalTabChrome() {
    return `
        <div id="appContent">
            <button type="button" class="tab-btn" id="mainTab"></button>
            <button type="button" class="tab-btn" id="bookmarksTab"></button>
            <button type="button" class="tab-btn" id="programTab"></button>
            <div id="mainContent" class="tab-content">MAIN</div>
            <div id="bookmarksContent" class="tab-content hidden"><div id="bookmarksContainer"></div></div>
            <div id="programContent" class="tab-content hidden">PROGRAM</div>
        </div>
    `;
}

describe('setActiveTab — изоляция панелей вкладок', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        const ls = {};
        vi.stubGlobal('localStorage', {
            getItem: (k) => (k in ls ? ls[k] : null),
            setItem: (k, v) => {
                ls[k] = String(v);
            },
            removeItem: (k) => {
                delete ls[k];
            },
            clear: () => {
                for (const k of Object.keys(ls)) delete ls[k];
            },
        });
        globalThis.requestAnimationFrame = (cb) => {
            cb();
            return 0;
        };
        setTabsDependencies({
            renderFavoritesPage: vi.fn().mockResolvedValue(undefined),
            renderRemindersPage: vi.fn().mockResolvedValue(undefined),
            renderTrainingPage: vi.fn().mockResolvedValue(undefined),
            renderClientAnalyticsPage: vi.fn().mockResolvedValue(undefined),
            loadBookmarks: vi.fn().mockResolvedValue(undefined),
            updateVisibleTabs: vi.fn(),
            getVisibleModals: vi.fn(() => []),
        });
        State.userPreferences.staticHeader = false;
        State.userPreferences.showBlacklistUsageWarning = false;
        State.currentSection = 'main';
    });

    it('при двух одновременно видимых панелях оставляет видимой только целевую', async () => {
        document.body.innerHTML = minimalTabChrome();
        const main = document.getElementById('mainContent');
        const bookmarks = document.getElementById('bookmarksContent');
        bookmarks.classList.remove('hidden');
        expect(main.classList.contains('hidden')).toBe(false);
        expect(bookmarks.classList.contains('hidden')).toBe(false);

        await setActiveTab('program', true, {});

        expect(document.getElementById('mainContent').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('bookmarksContent').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('programContent').classList.contains('hidden')).toBe(false);

        const visible = [...document.querySelectorAll('.tab-content')].filter(
            (el) => !el.classList.contains('hidden'),
        );
        expect(visible).toHaveLength(1);
        expect(visible[0].id).toBe('programContent');
    });

    it('сериализует параллельные вызовы: итоговое состояние соответствует последнему tabId', async () => {
        document.body.innerHTML = minimalTabChrome();
        const bookmarks = document.getElementById('bookmarksContent');
        bookmarks.classList.remove('hidden');

        await Promise.all([setActiveTab('bookmarks', true, {}), setActiveTab('program', true, {})]);

        const visible = [...document.querySelectorAll('.tab-content')].filter(
            (el) => !el.classList.contains('hidden'),
        );
        expect(visible).toHaveLength(1);
        expect(visible[0].id).toBe('programContent');
        expect(State.currentSection).toBe('program');
    });
});
