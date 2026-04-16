'use strict';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRuntimeHubBuffer, getRuntimeHubFaultEntries } from './runtime-issue-hub.js';
import {
    getRuntimeFetchInterceptMeta,
    initRuntimeFetchFailureReporting,
    resetRuntimeFetchInterceptForTests,
} from './runtime-fetch-intercept.js';

describe('runtime-fetch-intercept', () => {
    beforeEach(() => {
        clearRuntimeHubBuffer();
        resetRuntimeFetchInterceptForTests();
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        resetRuntimeFetchInterceptForTests();
        vi.unstubAllGlobals();
        clearRuntimeHubBuffer();
    });

    it('records HTTP error responses (non-opaque)', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 502,
                statusText: 'Bad Gateway',
                type: 'basic',
            }),
        );
        initRuntimeFetchFailureReporting();
        await globalThis.fetch('https://api.example.com/data');
        const rows = getRuntimeHubFaultEntries(10);
        expect(rows.some((r) => r.source === 'fetch.http_error')).toBe(true);
        expect(rows.find((r) => r.source === 'fetch.http_error')?.category).toBe('network_fetch');
        expect(getRuntimeFetchInterceptMeta().installed).toBe(true);
    });

    it('records thrown fetch errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        initRuntimeFetchFailureReporting();
        await expect(globalThis.fetch('https://x.test/z')).rejects.toThrow(/fetch/i);
        expect(getRuntimeHubFaultEntries(10).some((r) => r.source === 'fetch.network_error')).toBe(
            true,
        );
    });

    it('does not record opaque status 0 false-ok as HTTP errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 0,
                statusText: '',
                type: 'opaque',
            }),
        );
        initRuntimeFetchFailureReporting();
        await globalThis.fetch('https://third-party.example/no-cors');
        expect(
            getRuntimeHubFaultEntries(5).filter((r) => r.source.startsWith('fetch.')),
        ).toHaveLength(0);
    });
});
