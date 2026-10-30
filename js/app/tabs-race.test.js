import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { State } from './state.js';
import { setActiveTab, setTabsDependencies } from './tabs.js';

describe('last tab selection wins', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
        document.body.innerHTML = '<button id="mainTab" class="tab-btn"></button><button id="bookmarksTab" class="tab-btn"></button><button id="sedoTypesTab" class="tab-btn"></button><div id="mainContent" class="tab-content"></div><div id="bookmarksContent" class="tab-content hidden"></div><div id="sedoTypesContent" class="tab-content hidden"></div>';
        State.currentSection = 'main'; State.userPreferences = { staticHeader: false };
        setTabsDependencies({ getVisibleModals: () => [], loadBookmarks: vi.fn() });
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    it('does not reactivate a slower, earlier selection or emit its shown event', async () => {
        const shown = [];
        const handler = event => shown.push(event.detail.tabId);
        document.addEventListener('copilot1co:tabShown', handler);
        try {
            const earlier = setActiveTab('bookmarks');
            await vi.advanceTimersByTimeAsync(40);
            const last = setActiveTab('sedoTypes');
            await vi.advanceTimersByTimeAsync(500);
            await Promise.all([earlier, last]);
            expect([...document.querySelectorAll('.tab-content:not(.hidden)')].map(e=>e.id)).toEqual(['sedoTypesContent']);
            expect(shown).toEqual(['sedoTypes']);
        } finally { document.removeEventListener('copilot1co:tabShown', handler); }
    });
});
