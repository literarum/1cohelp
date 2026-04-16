'use strict';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeHelperAvailability } from './revocation-helper-probe.js';

describe('probeHelperAvailability', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns true when JSON body has ok: true', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({ ok: true, service: 't' })),
                }),
            ),
        );
        await expect(
            probeHelperAvailability('https://api.example', { path: '/api/health', timeoutMs: 100 }),
        ).resolves.toBe(true);
    });

    it('returns true when body is not strict JSON but contains ok:true marker', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve('prefix {"ok":true} suffix'),
                }),
            ),
        );
        await expect(
            probeHelperAvailability('https://api.example', { path: '/api/health', timeoutMs: 100 }),
        ).resolves.toBe(true);
    });

    it('returns false on non-OK HTTP status', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: false,
                    status: 503,
                    text: () => Promise.resolve(JSON.stringify({ ok: true })),
                }),
            ),
        );
        await expect(
            probeHelperAvailability('https://api.example', { path: '/api/health', timeoutMs: 100 }),
        ).resolves.toBe(false);
    });

    it('returns false when JSON ok is not true', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({ ok: false })),
                }),
            ),
        );
        await expect(
            probeHelperAvailability('https://api.example', { path: '/api/health', timeoutMs: 100 }),
        ).resolves.toBe(false);
    });

    it('returns false on fetch rejection', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new Error('network down'))),
        );
        await expect(
            probeHelperAvailability('https://api.example', { path: '/api/health', timeoutMs: 100 }),
        ).resolves.toBe(false);
    });
});
