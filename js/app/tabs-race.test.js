import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { State } from './state.js';
// script.js imports components/tabs.js: exercise the actual production entry.
import { setActiveTab, setTabsDependencies } from '../components/tabs.js';

describe('last tab selection wins', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
        document.body.innerHTML = '<button id="mainTab" class="tab-btn"></button><button id="bookmarksTab" class="tab-btn"></button><button id="sedoTypesTab" class="tab-btn"></button><div id="mainContent" class="tab-content"></div><div id="bookmarksContent" class="tab-content hidden"></div><div id="sedoTypesContent" class="tab-content hidden"></div>';
        // jsdom has no Web Animations API: preserve the real browser's asynchronous entrance lifetime.
        document.querySelectorAll('.tab-content').forEach(panel => {
            panel.animate = vi.fn(() => ({ finished: new Promise(resolve => setTimeout(resolve, 180)), cancel: vi.fn() }));
        });
        State.currentSection = 'main'; State.userPreferences = { staticHeader: false };
        setTabsDependencies({ getVisibleModals: () => [], loadBookmarks: vi.fn() });
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    it('keeps the shown event when the incoming tab is selected twice', async () => {
        const shown = [];
        const handler = event => shown.push(event.detail.tabId);
        document.addEventListener('copilot1co:tabShown', handler);
        try {
            const first = setActiveTab('sedoTypes');
            const again = setActiveTab('sedoTypes');
            await vi.advanceTimersByTimeAsync(500);
            await Promise.all([first, again]);
            expect(shown).toEqual(['sedoTypes']);
        } finally { document.removeEventListener('copilot1co:tabShown', handler); }
    });
    it('shows the incoming content before waiting for an entrance animation', async () => {
        const navigation = setActiveTab('sedoTypes');
        await vi.advanceTimersByTimeAsync(1);
        const visibleImmediately = [...document.querySelectorAll('.tab-content:not(.hidden)')].map(e => e.id);
        await vi.advanceTimersByTimeAsync(500);
        await navigation;
        expect(visibleImmediately).toEqual(['sedoTypesContent']);
    });
    it('lets the latest selection bypass a pending renderer in an earlier section', async () => {
        document.getElementById('bookmarksContent').innerHTML = '<div id="bookmarksContainer"></div>';
        let finishLoading;
        setTabsDependencies({ loadBookmarks: () => new Promise(resolve => { finishLoading = resolve; }) });
        const earlier = setActiveTab('bookmarks');
        await vi.advanceTimersByTimeAsync(1);
        const last = setActiveTab('sedoTypes');
        await vi.advanceTimersByTimeAsync(1);
        expect([...document.querySelectorAll('.tab-content:not(.hidden)')].map(el => el.id)).toEqual(['sedoTypesContent']);
        finishLoading();
        await vi.advanceTimersByTimeAsync(500);
        await Promise.all([earlier, last]);
        expect(State.currentSection).toBe('sedoTypes');
        expect([...document.querySelectorAll('.tab-content:not(.hidden)')].map(el => el.id)).toEqual(['sedoTypesContent']);
    });
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
