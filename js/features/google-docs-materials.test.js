import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Google Docs supplied audit regressions', () => {
    let docs;
    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        localStorage.clear();
        document.body.innerHTML = '<div id="doc-content-shablony"></div>';
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        for (const method of ['log', 'debug', 'warn', 'error']) vi.spyOn(console, method).mockImplementation(() => {});
        docs = await import('./google-docs.js');
    });
    afterEach(() => {
        window.__gdocsPoller?.stop();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        delete window.copyToClipboard;
        delete window.updateSearchIndex;
        vi.restoreAllMocks();
    });
    const docResult = (data, extra = {}) => [{ docId: 'synthetic-doc', data, ...extra }];

    it('keeps structured text objects instead of interpreting their type as a table heading', () => {
        expect(docs.normalizeShablonyData([{ text: 'Title', type: 'heading', level: 2 }, { text: 'Body', type: 'paragraph' }]))
            .toEqual(['➧ Title', 'Body']);
    });
    it('preserves the preamble and internal paragraph breaks for rendering and search', () => {
        const data = ['Preamble token', '', '➧ Title', 'First', '', 'Second'];
        const blocks = docs.parseShablonyContent(data);
        expect(blocks[0].content).toContain('Preamble token');
        expect(blocks[1].content).toBe('First\n\nSecond');
        docs.renderGoogleDocContent(docResult(data), document.getElementById('doc-content-shablony'), 'doc-content-shablony');
        const container = document.getElementById('doc-content-shablony');
        expect(container.textContent).toContain('Preamble token');
        expect(container.querySelector('[data-template-spacer]')).not.toBeNull();
        expect(docs.filterShablonyDataByQuery(data, 'Preamble')).toContain('Preamble token');
    });
    it('keeps separated list segments in their original order', () => {
        docs.renderGoogleDocContent(docResult(['➧ Title', '• First', 'Middle', '• Second']), document.getElementById('doc-content-shablony'), 'doc-content-shablony');
        const block = document.querySelector('.shablony-block');
        expect(block.querySelectorAll('ul')).toHaveLength(2);
        expect([...block.querySelectorAll('p, li')].map(e => e.textContent)).toEqual(['First', 'Middle', 'Second']);
    });
    it('rendering cached content preserves its original timestamp', () => {
        const cacheKey = 'copilot1co:gdoc-cache:synthetic-doc';
        localStorage.setItem(cacheKey, JSON.stringify({ ts: 123, data: ['➧ Title', 'Cached'] }));
        docs.renderGoogleDocContent(docResult(['➧ Title', 'Cached'], { status: 'cached' }), document.getElementById('doc-content-shablony'), 'doc-content-shablony');
        expect(JSON.parse(localStorage.getItem(cacheKey)).ts).toBe(123);
    });
    it('successful empty content clears stale DOM, cached data and search blocks', async () => {
        const { SHABLONY_DOC_ID } = await import('../constants.js');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => docResult(['➧ Title', 'Old']) })
            .mockResolvedValue({ ok: true, json: async () => [] }));
        window.updateSearchIndex = vi.fn().mockResolvedValue();
        await docs.syncGoogleDocsNow({ reason: 'manual' });
        expect(docs.getOriginalShablonyData()).toContain('Old');
        await docs.syncGoogleDocsNow({ reason: 'manual' });
        expect(document.getElementById('doc-content-shablony').textContent).not.toContain('Old');
        expect(docs.getOriginalShablonyData()).toEqual([]);
        expect(localStorage.getItem('copilot1co:gdoc-cache:' + SHABLONY_DOC_ID)).toBeNull();
        expect(window.updateSearchIndex).toHaveBeenLastCalledWith('shablony', SHABLONY_DOC_ID, [], 'update');
    });
    it.each(['headers', 'body'])('aborts and times out a stalled %s stage within the full request deadline', async stage => {
        let signal;
        const fetchMock = vi.fn((_url, options) => {
            signal = options?.signal;
            if (stage === 'headers') return new Promise(() => {});
            return Promise.resolve({ ok: true, text: () => new Promise(() => {}) });
        });
        vi.stubGlobal('fetch', fetchMock);
        const pending = docs.fetchGoogleDocs(['synthetic-doc'], true, { retryDelays: [] });
        await vi.advanceTimersByTimeAsync(12001);
        expect(signal?.aborted).toBe(true);
        const result = await pending;
        expect(result[0].errorInfo.kind).toBe('timeout');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('provides a native copy button and excludes controls from copied template text', () => {
        const copy = vi.fn();
        window.copyToClipboard = copy;
        docs.renderGoogleDocContent(docResult(['⏩ Category', '➧ Template', 'Synthetic body']), document.getElementById('doc-content-shablony'), 'doc-content-shablony');
        const button = document.querySelector('.copyable-block button[data-copy-template]');
        expect(button).not.toBeNull();
        expect(button.type).toBe('button');
        button.click();
        expect(copy).toHaveBeenCalledWith('Template\nSynthetic body', expect.any(String));
        expect(document.querySelector('.shablony-block:not(.copyable-block) button')).toBeNull();
    });
    it('never logs raw template content or API objects', async () => {
        const secretFixture = 'Synthetic marker for no-content logging';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => docResult(['➧ Title', secretFixture]) }));
        await docs.fetchGoogleDocs(['synthetic-doc'], true);
        const logged = ['log', 'debug', 'warn', 'error'].flatMap(method => console[method].mock.calls).flat();
        expect(logged.some(value => JSON.stringify(value)?.includes(secretFixture))).toBe(false);
    });
    it('connection test reports a Web App error array as unavailable rather than successful JSON', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ status: 'error', message: 'Public access not approved', content: { data: [] } }] }));
        expect(await docs.testGoogleScriptConnection()).toMatchObject({ ok: false, kind: 'server', hint: 'Public access not approved' });
    });
    it('connection test rejects unrecognized JSON instead of asserting that a document was returned', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unrelated: true }) }));
        expect(await docs.testGoogleScriptConnection()).toMatchObject({ ok: false, kind: 'format' });
    });
    it('connection test accepts a successful empty document and rejects a different document ID', async () => {
        const { SHABLONY_DOC_ID } = await import('../constants.js');
        const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [{ docId: SHABLONY_DOC_ID, status: 'success', content: { type: 'paragraphs', data: [] } }] })
            .mockResolvedValue({ ok: true, json: async () => [{ docId: 'different-doc', status: 'success', content: { type: 'paragraphs', data: [] } }] });
        vi.stubGlobal('fetch', fetchMock);
        expect(await docs.testGoogleScriptConnection()).toMatchObject({ ok: true, kind: 'ok' });
        expect(await docs.testGoogleScriptConnection()).toMatchObject({ ok: false, kind: 'format' });
    });
    it('malformed JSON never places response excerpts in returned errors or console logs', async () => {
        const marker = 'SYNTHETIC_PRIVATE_RESPONSE';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => marker }));
        const result = await docs.fetchGoogleDocs(['synthetic-doc'], true);
        expect(result[0].errorInfo.kind).toBe('parse');
        expect(JSON.stringify(result)).not.toContain('SYNTHETIC_');
        const logged = ['log', 'debug', 'warn', 'error'].flatMap(method => console[method].mock.calls).flat();
        expect(logged.some(value => JSON.stringify(value)?.includes('SYNTHETIC_'))).toBe(false);
    });
});
