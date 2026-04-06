'use strict';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { getPwaRuntimeSnapshot, getPwaCockpitBlock } from './pwa-register.js';

describe('getPwaRuntimeSnapshot', () => {
    const originalSw = navigator.serviceWorker;

    afterEach(() => {
        Object.defineProperty(navigator, 'serviceWorker', {
            value: originalSw,
            configurable: true,
        });
    });

    it('reports unsupported when serviceWorker is missing', () => {
        Object.defineProperty(navigator, 'serviceWorker', {
            value: undefined,
            configurable: true,
        });
        const snap = getPwaRuntimeSnapshot();
        expect(snap.supported).toBe(false);
        expect(snap.controller).toBe(false);
        expect(snap.assetQueryVersion).toMatch(/^\d{8}/);
    });

    it('reports controller when service worker API is present', () => {
        Object.defineProperty(navigator, 'serviceWorker', {
            value: {
                controller: {
                    scriptURL: 'http://localhost/sw.js',
                    state: 'activated',
                },
            },
            configurable: true,
        });
        const snap = getPwaRuntimeSnapshot();
        expect(snap.supported).toBe(true);
        expect(snap.controller).toBe(true);
        expect(snap.controllerScriptUrl).toContain('sw.js');
        expect(snap.controllerState).toBe('activated');
    });
});

describe('getPwaCockpitBlock', () => {
    const originalSw = navigator.serviceWorker;

    afterEach(() => {
        Object.defineProperty(navigator, 'serviceWorker', {
            value: originalSw,
            configurable: true,
        });
        vi.restoreAllMocks();
    });

    it('returns note when Service Worker API is missing', async () => {
        Object.defineProperty(navigator, 'serviceWorker', {
            value: undefined,
            configurable: true,
        });
        const b = await getPwaCockpitBlock();
        expect(b.supported).toBe(false);
        expect(b.note).toMatch(/недоступен/);
    });

    it('includes slim registration when getRegistration resolves', async () => {
        Object.defineProperty(navigator, 'serviceWorker', {
            value: {
                controller: { scriptURL: 'http://localhost/sw.js', state: 'activated' },
                getRegistration: vi.fn().mockResolvedValue({
                    scope: 'http://localhost/',
                    installing: null,
                    waiting: { state: 'installed', scriptURL: 'http://localhost/sw.js' },
                    active: { state: 'activated', scriptURL: 'http://localhost/sw.js' },
                }),
            },
            configurable: true,
        });
        const b = await getPwaCockpitBlock();
        expect(b.registration?.scope).toBe('http://localhost/');
        expect(b.registration?.waiting?.state).toBe('installed');
        expect(b.registration?.active?.scriptURL).toContain('sw.js');
    });
});
