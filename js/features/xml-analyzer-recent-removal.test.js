import { afterEach, describe, expect, it, vi } from 'vitest';
import { createXmlAnalyzerApp } from './xml-analyzer-app.js';

afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('XML analyzer without recently opened files', () => {
    it('does not show recent metadata or read the retired list during initialization', () => {
        localStorage.setItem('xmlAnalyzerRecent', JSON.stringify([{ name: 'synthetic.xml', size: 12, at: 1 }]));
        const get = vi.spyOn(Storage.prototype, 'getItem');
        document.body.innerHTML = '<div id="xmlAnalyzerInitialView"></div><button id="xmlAnalyzerAnalyzeBtn"></button>';
        createXmlAnalyzerApp(document.body);
        expect(document.querySelector('.xa-recent')).toBeNull();
        expect(get.mock.calls.some(([key]) => key === 'xmlAnalyzerRecent')).toBe(false);
        // Removing a panel does not authorize deleting unrelated stored user state.
        expect(localStorage.getItem('xmlAnalyzerRecent')).toContain('synthetic.xml');
    });

    it('adopts a document without recording new recent-file metadata', async () => {
        document.body.innerHTML = '<button id="xmlAnalyzerAnalyzeBtn"></button>';
        const app = createXmlAnalyzerApp(document.body);
        const set = vi.spyOn(Storage.prototype, 'setItem');
        const activate = vi.spyOn(app, '_activateRecord').mockResolvedValue();
        const record = { id: 'fixture', name: 'synthetic.xml', size: 12 };
        await app._adoptRecords([record], false);
        expect(app.docs).toContain(record);
        expect(activate).toHaveBeenCalledWith(record);
        expect(set.mock.calls.some(([key]) => key === 'xmlAnalyzerRecent')).toBe(false);
    });
});
