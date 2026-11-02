/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSphereRenderer, SPHERE_EXIT_MS } from './sphere-renderer.js';

describe('sphere lifecycle', () => {
    let renderer, raf, cancel;
    beforeEach(() => {
        vi.useFakeTimers();
        document.documentElement.dataset.motion = 'full';
        raf = vi.fn(() => 17);
        cancel = vi.fn();
        vi.stubGlobal('requestAnimationFrame', raf);
        vi.stubGlobal('cancelAnimationFrame', cancel);
        const context = { setTransform: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(),
            createRadialGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
            beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
        renderer = createSphereRenderer(document.createElement('canvas'));
    });
    afterEach(() => {
        renderer.stop();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
        delete document.documentElement.dataset.motion;
    });
    it('finishes with suspended frames, cancels frame/listener on stop, and restarts a fresh cycle', async () => {
        const remove = vi.spyOn(window, 'removeEventListener');
        renderer.start();
        expect(raf).toHaveBeenCalledTimes(1);
        const first = renderer.finish();
        expect(renderer.finish()).toBe(first);
        let ended = false;
        first.then(() => { ended = true; });
        await vi.advanceTimersByTimeAsync(SPHERE_EXIT_MS - 1);
        expect(ended).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await first;
        renderer.stop();
        expect(cancel).toHaveBeenCalledWith(17);
        expect(remove).toHaveBeenCalledWith('resize', renderer.resize);
        renderer.start();
        expect(renderer.isRunning).toBe(true);
        expect(renderer.finish()).not.toBe(first);
        renderer.stop();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('renders a static sphere and uses a short fade when motion is reduced', async () => {
        document.documentElement.dataset.motion = 'reduce';
        renderer.start();
        renderer.resize();
        renderer.setTheme('light');
        expect(raf).not.toHaveBeenCalled();
        const end = renderer.finish();
        await vi.advanceTimersByTimeAsync(120);
        await end;
        expect(vi.getTimerCount()).toBe(0);
    });
});
