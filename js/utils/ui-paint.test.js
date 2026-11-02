import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForUiPaint } from './ui-paint.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('bounded UI paint scheduling', () => {
    it('waits for both real scheduled frames and clears the fallback', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
        let completed = false;
        const done = waitForUiPaint().then(result => { completed = true; return result; });
        await vi.advanceTimersByTimeAsync(16);
        expect(completed).toBe(false);
        await vi.advanceTimersByTimeAsync(16);
        expect(await done).toEqual({ painted: true });
        expect(vi.getTimerCount()).toBe(0);
    });
    it('cancels a stalled frame, reports fallback, and ignores a late callback', async () => {
        vi.useFakeTimers();
        let callback;
        const request = vi.fn(cb => { callback = cb; return 42; });
        const cancel = vi.fn();
        vi.stubGlobal('requestAnimationFrame', request);
        vi.stubGlobal('cancelAnimationFrame', cancel);
        const done = waitForUiPaint();
        await vi.advanceTimersByTimeAsync(150);
        expect(await done).toEqual({ painted: false });
        expect(cancel).toHaveBeenCalledWith(42);
        callback();
        expect(request).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
    it('does not require rendering in a hidden document', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        const request = vi.fn();
        vi.stubGlobal('requestAnimationFrame', request);
        expect(await waitForUiPaint()).toEqual({ painted: false });
        expect(request).not.toHaveBeenCalled();
    });
});
