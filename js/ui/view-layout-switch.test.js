import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyView } from './view-manager.js';

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
    document.body.innerHTML = '<section class="tab-content"><button class="view-toggle" data-view="list">List</button><div id="programAlgorithms" data-section-id="programAlgorithms" data-view="cards"><div class="view-item algorithm-card">Content</div></div></section>';
});
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('atomic card/list layout changes', () => {
    it('suppresses style interpolation during a layout change without moving keyboard focus', async () => {
        const container = document.getElementById('programAlgorithms');
        const button = document.querySelector('button');
        button.focus();
        applyView(container, 'list');
        expect(container.dataset.view).toBe('list');
        expect(container.classList.contains('view-layout-changing')).toBe(true);
        expect(document.activeElement).toBe(button);
        await vi.advanceTimersByTimeAsync(40);
        expect(container.classList.contains('view-layout-changing')).toBe(false);
        expect(container.textContent).toBe('Content');
    });
    it('keeps the latest layout protected when an older paint callback finishes', async () => {
        const container = document.getElementById('programAlgorithms');
        applyView(container, 'list');
        await vi.advanceTimersByTimeAsync(16);
        applyView(container, 'cards');
        await vi.advanceTimersByTimeAsync(16);
        expect(container.dataset.view).toBe('cards');
        expect(container.classList.contains('view-layout-changing')).toBe(true);
        await vi.advanceTimersByTimeAsync(20);
        expect(container.classList.contains('view-layout-changing')).toBe(false);
    });
});
