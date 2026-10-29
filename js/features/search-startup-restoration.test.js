/** @vitest-environment jsdom */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const bootstrapPath = resolve(process.cwd(), 'js/search-startup.js');
const bootstrap = existsSync(bootstrapPath) ? readFileSync(bootstrapPath, 'utf8') : '';
const windows = [];

function mount(initial = '100') {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        runScripts: 'outside-only', url: 'http://localhost/',
    });
    const win = dom.window;
    windows.push(win);
    const listeners = vi.spyOn(win.document, 'addEventListener');
    win.eval(bootstrap); // Real early script, before the parser reaches the input.
    win.document.body.innerHTML = '<input id="searchInput"><button id="clearSearchInputBtn"></button><div id="searchResults">stale result</div><input id="anotherInput">';
    const input = win.document.getElementById('searchInput');
    input.value = initial;
    const markTrustedEdit = (target = input) => {
        const handler = listeners.mock.calls.find(([type]) => type === 'beforeinput')?.[1];
        // jsdom cannot construct a trusted browser event; exercise its real registered handler.
        handler?.({ isTrusted: true, target });
    };
    return { win, input, markTrustedEdit };
}

async function initialPageShow(win) {
    win.dispatchEvent(new win.PageTransitionEvent('pageshow', { persisted: false }));
    await new Promise((resolve) => win.setTimeout(resolve, 5));
}

afterEach(() => { windows.splice(0).forEach((win) => win.close()); });

describe('fresh-document global search state', () => {
    it.each(['100', 'inherited browser text'])('starts empty for inherited %s and synchronizes stale result/clear state', (value) => {
        const { win, input } = mount(value);
        win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
        expect(input.value).toBe('');
        expect(win.document.getElementById('clearSearchInputBtn').classList.contains('hidden')).toBe(true);
        expect(win.document.getElementById('searchResults').classList.contains('hidden')).toBe(true);
        expect(win.document.getElementById('searchResults').textContent).toBe('');
    });

    it('also clears a value restored by the browser around the first pageshow', async () => {
        const { win, input } = mount('');
        win.__copilotSearchStartup?.initialize();
        win.addEventListener('pageshow', () => { input.value = '100'; }, { once: true });
        await initialPageShow(win);
        expect(input.value).toBe('');
    });

    it('preserves trusted input entered during a slow app boot, including 100', async () => {
        const { win, input, markTrustedEdit } = mount('');
        markTrustedEdit();
        input.value = '100';
        win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
        win.__copilotSearchStartup?.initialize();
        await initialPageShow(win);
        expect(input.value).toBe('100');
    });

    it('protects a user edit made before the deferred first-pageshow sync', async () => {
        const { win, input, markTrustedEdit } = mount('');
        win.__copilotSearchStartup?.initialize();
        win.dispatchEvent(new win.PageTransitionEvent('pageshow', { persisted: false }));
        markTrustedEdit();
        input.value = '100';
        await new Promise((resolve) => win.setTimeout(resolve, 5));
        expect(input.value).toBe('100');
    });

    it('preserves later queries across focus and bfcache return without resetting twice', async () => {
        const { win, input } = mount('');
        win.__copilotSearchStartup?.initialize();
        await initialPageShow(win);
        input.value = '100';
        input.focus();
        win.dispatchEvent(new win.PageTransitionEvent('pageshow', { persisted: true }));
        win.__copilotSearchStartup?.initialize();
        await new Promise((resolve) => win.setTimeout(resolve, 5));
        expect(input.value).toBe('100');
    });

    it('does not treat synthetic input or editing another control as a global user query', () => {
        const { win, input, markTrustedEdit } = mount();
        markTrustedEdit(win.document.getElementById('anotherInput'));
        input.dispatchEvent(new win.InputEvent('input', { bubbles: true, data: '100' }));
        win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
        expect(input.value).toBe('');
    });

    it('loads the guard before the search input can receive user edits', () => {
        const markup = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
        const head = markup.slice(0, markup.indexOf('</head>'));
        expect(head).toMatch(/<script src="js\/search-startup\.js\?v=[^"]+"><\/script>/);
    });
});
