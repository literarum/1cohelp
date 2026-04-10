'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import {
    __resetForTests,
    captureNavigationSnapshot,
    pushNavigationEntry,
    popNavigationEntry,
    peekBackEntry,
    stackDepth,
    NavigationSource,
    scheduleScrollRestore,
} from './contextual-back-navigation.js';

describe('contextual-back-navigation', () => {
    beforeEach(() => {
        __resetForTests();
    });

    it('push and pop maintain LIFO order', () => {
        pushNavigationEntry(
            { v: 1, section: 'main', windowScrollY: 0, mainScrollY: 0, reglaments: null },
            'main',
        );
        pushNavigationEntry(
            { v: 1, section: 'program', windowScrollY: 1, mainScrollY: 2, reglaments: null },
            'program',
        );
        expect(stackDepth()).toBe(2);
        const b = popNavigationEntry();
        expect(b?.labelSectionId).toBe('program');
        const a = popNavigationEntry();
        expect(a?.labelSectionId).toBe('main');
        expect(stackDepth()).toBe(0);
    });

    it('caps stack depth at MAX_STACK', () => {
        for (let i = 0; i < 12; i++) {
            pushNavigationEntry(
                {
                    v: 1,
                    section: 'main',
                    windowScrollY: i,
                    mainScrollY: 0,
                    reglaments: null,
                },
                'main',
            );
        }
        expect(stackDepth()).toBeLessThanOrEqual(8);
    });

    it('peekBackEntry does not mutate stack', () => {
        pushNavigationEntry(
            { v: 1, section: 'links', windowScrollY: 0, mainScrollY: 0, reglaments: null },
            'links',
        );
        expect(peekBackEntry()?.labelSectionId).toBe('links');
        expect(stackDepth()).toBe(1);
    });

    it('captureNavigationSnapshot reads State and reglaments dataset', async () => {
        const dom = new JSDOM(
            `<!doctype html><html><body>
        <div id="appContent"><main style="height:200px;overflow:auto"></main></div>
        <div id="reglamentsList" data-current-category="cat-a"></div>
      </body></html>`,
            { url: 'https://example.test/' },
        );
        globalThis.document = dom.window.document;
        globalThis.window = dom.window;
        const { State } = await import('../app/state.js');
        State.currentSection = 'reglaments';
        const list = document.getElementById('reglamentsList');
        list.classList.remove('hidden');

        const snap = captureNavigationSnapshot();
        expect(snap.section).toBe('reglaments');
        expect(snap.reglaments?.listVisible).toBe(true);
        expect(snap.reglaments?.currentCategory).toBe('cat-a');

        delete globalThis.document;
        delete globalThis.window;
    });

    it('scheduleScrollRestore applies scroll positions', async () => {
        vi.useFakeTimers();
        const dom = new JSDOM(
            `<!doctype html><html><body>
        <div id="appContent"><main style="height:400px;overflow:auto"></main></div>
      </body></html>`,
            { url: 'https://example.test/', pretendToBeVisual: true },
        );
        globalThis.document = dom.window.document;
        globalThis.window = dom.window;
        const scrollToSpy = vi.fn();
        globalThis.scrollTo = scrollToSpy;
        globalThis.requestAnimationFrame = (cb) => cb();
        dom.window.requestAnimationFrame = (cb) => cb();
        dom.window.scrollTo = scrollToSpy;
        const main = document.querySelector('main');
        main.scrollTo = vi.fn();

        scheduleScrollRestore({ windowScrollY: 120, mainScrollY: 340 }, 10);
        await vi.advanceTimersByTimeAsync(10);

        expect(scrollToSpy).toHaveBeenCalled();
        expect(main.scrollTo).toHaveBeenCalledWith(
            expect.objectContaining({ top: 340, behavior: 'auto' }),
        );

        vi.useRealTimers();
        delete globalThis.document;
        delete globalThis.window;
        delete globalThis.scrollTo;
        delete globalThis.requestAnimationFrame;
    });

    it('NavigationSource.PROGRAMMATIC is stable string', () => {
        expect(NavigationSource.PROGRAMMATIC).toBe('programmatic');
    });
});
