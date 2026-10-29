import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Google Docs outage containment and recovery', () => {
    let docs;
    beforeEach(async () => {
        vi.resetModules();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        localStorage.clear();
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        docs = await import('./google-docs.js');
    });
    afterEach(() => {
        docs.getGoogleDocsConnectionState().poller && window.__gdocsPoller?.stop();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('does not replay opaque network/CORS failures through immediate retries, XHR or probes', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        const xhr = vi.fn(() => { throw new Error('XHR must not repeat the same CORS request'); });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('XMLHttpRequest', xhr);
        const pending = docs.fetchGoogleDocs(['synthetic-doc'], true);
        await vi.runAllTimersAsync();
        const result = await pending;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(xhr).not.toHaveBeenCalled();
        expect(result[0].errorInfo).toMatchObject({ kind: 'network', attempts: 1, status: null });
        expect(result[0].error).toBeTruthy();
    });

    it('backs off background failures even with fresh-data force, retaining the actual HTTP status', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
        vi.stubGlobal('fetch', fetchMock);
        const first = await docs.syncGoogleDocsNow({ reason: 'interval', force: true });
        const second = await docs.syncGoogleDocsNow({ reason: 'interval', force: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(first.ok).toBe(false);
        expect(second).toMatchObject({ ok: false, errorInfo: { kind: 'http', status: 404 } });
        expect(second.errorInfo).toMatchObject({ deferred: true, attempts: 0 });
        expect(docs.getGoogleDocsConnectionState()).toMatchObject({ status: 'error', consecutiveFailures: 1 });
    });

    it('increases background cooldown after recurring failures and automatically retries when due', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
        vi.stubGlobal('fetch', fetchMock);
        await docs.syncGoogleDocsNow({ reason: 'interval' });
        await vi.advanceTimersByTimeAsync(30000);
        await docs.syncGoogleDocsNow({ reason: 'interval' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(30000);
        await docs.syncGoogleDocsNow({ reason: 'catchup:focus' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(30000);
        await docs.syncGoogleDocsNow({ reason: 'interval' });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('manual retry bypasses cooldown and a real success clears outage status and cooldown', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
            .mockResolvedValue({ ok: true, json: async () => [] });
        vi.stubGlobal('fetch', fetchMock);
        await docs.syncGoogleDocsNow({ reason: 'interval' });
        const recovered = await docs.syncGoogleDocsNow({ reason: 'manual', force: true });
        expect(recovered.ok).toBe(true);
        expect(docs.getGoogleDocsConnectionState()).toMatchObject({ status: 'ok', lastError: null });
        await docs.syncGoogleDocsNow({ reason: 'interval' });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('caps cooldown at thirty minutes, then attempts automatic recovery', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
        vi.stubGlobal('fetch', fetchMock);
        for (let attempt = 0; attempt < 8; attempt++) await docs.syncGoogleDocsNow({ reason: 'manual', force: true });
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000 - 1);
        await docs.syncGoogleDocsNow({ reason: 'interval' });
        expect(fetchMock).toHaveBeenCalledTimes(8);
        await vi.advanceTimersByTimeAsync(1);
        await docs.syncGoogleDocsNow({ reason: 'interval' });
        expect(fetchMock).toHaveBeenCalledTimes(9);
    });

    it('retains bounded retries for explicit transient HTTP errors', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 })
            .mockResolvedValue({ ok: true, json: async () => [] });
        vi.stubGlobal('fetch', fetchMock);
        const pending = docs.fetchGoogleDocs(['synthetic-doc'], true, { retryDelays: [10] });
        await vi.runAllTimersAsync();
        expect(await pending).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('changing the endpoint clears the cooldown so the new deployment can recover immediately', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
            .mockResolvedValue({ ok: true, json: async () => [] });
        vi.stubGlobal('fetch', fetchMock);
        await docs.syncGoogleDocsNow({ reason: 'interval' });
        expect(docs.setGoogleScriptUrl('https://script.google.com/macros/s/synthetic-deployment-id-123456789/exec')).toBe(true);
        expect((await docs.syncGoogleDocsNow({ reason: 'interval' })).ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent manual sync and preserves loaded content on a later outage', async () => {
        document.body.innerHTML = '<div id="doc-content-shablony"></div>';
        let complete;
        const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
            .mockResolvedValue({ ok: false, status: 404 });
        vi.stubGlobal('fetch', fetchMock);
        const first = docs.syncGoogleDocsNow({ reason: 'manual' });
        const joined = docs.syncGoogleDocsNow({ reason: 'manual' });
        expect(joined).toBe(first);
        complete({ ok: true, json: async () => [{ status: 'success', content: { data: ['➧ Synthetic title', 'Synthetic text'] } }] });
        expect((await first).ok).toBe(true);
        const content = document.getElementById('doc-content-shablony').textContent;
        expect(content).toContain('Synthetic text');
        const failure = await docs.syncGoogleDocsNow({ reason: 'manual' });
        expect(failure).toMatchObject({ ok: false, usingCache: true });
        expect(docs.getGoogleDocsConnectionState()).toMatchObject({ status: 'error', usingCache: true });
        expect(document.getElementById('doc-content-shablony').textContent).toBe(content);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
