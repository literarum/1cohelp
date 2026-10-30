/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

describe('loading palette versus application theme', () => {
    it('updating the loading palette cannot overwrite an already selected app theme', () => {
        const dom = new JSDOM(readFileSync('index.html', 'utf8'), {url:'http://localhost/',runScripts:'outside-only'});
        try {
            dom.window.matchMedia = () => ({matches:false});
            const source = [...dom.window.document.scripts].find(s => s.textContent.includes('window.__applyLoadingOverlayThemeVars = function')).textContent;
            dom.window.eval(source);
            const root = dom.window.document.documentElement;
            for (const theme of ['light','dark']) {
                root.classList.toggle('dark', theme==='dark');
                root.dataset.theme = theme;
                const opposite = theme==='light'?'dark':'light';
                dom.window.__applyLoadingOverlayThemeVars(theme, {tone:opposite,background:opposite==='dark'?'#12121f':'#ffffff'});
                expect(root.classList.contains('dark')).toBe(theme==='dark');
                expect(root.dataset.theme).toBe(theme);
                expect(root.dataset.loadingOverlayTheme).toBe(opposite);
            }
        } finally {dom.window.close();}
    });
});
