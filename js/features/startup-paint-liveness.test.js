import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForUiSurfaceDomProbeReady } from './ui-surface-health-suite.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('startup audit when rendering callbacks are suspended', () => {
    it('settles without treating a missing animation frame as missing DOM', async () => {
        vi.useFakeTimers();
        vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
        const callbacks = [];
        vi.stubGlobal('requestAnimationFrame', vi.fn(cb => { callbacks.push(cb); return callbacks.length; }));
        let settled = false;
        const pending = waitForUiSurfaceDomProbeReady().then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(500);
        const settledBeforeFrames = settled;
        while (callbacks.length) callbacks.shift()();
        await pending;
        expect(settledBeforeFrames).toBe(true);
    });
});
