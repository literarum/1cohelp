/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSphereRenderer,
    SPHERE_EXIT_MS,
    exitPhases,
    computeBudget,
    createRng,
    COSMIC_PALETTE_DARK,
} from './sphere-renderer.js';

/** Контекст-заглушка: любой метод — шпион, любые свойства принимаются. */
function fakeContext() {
    const calls = { drawImage: 0, arc: 0 };
    const target = {
        createRadialGradient: () => ({ addColorStop: () => {} }),
        drawImage: () => {
            calls.drawImage += 1;
        },
        arc: () => {
            calls.arc += 1;
        },
    };
    const ctx = new Proxy(target, {
        get: (t, k) => (k in t ? t[k] : () => {}),
        set: (t, k, v) => {
            t[k] = v;
            return true;
        },
    });
    return { ctx, calls };
}

describe('cosmic loading renderer', () => {
    let renderer;
    let raf;
    let cancel;
    let fake;
    beforeEach(() => {
        vi.useFakeTimers();
        document.documentElement.dataset.motion = 'full';
        raf = vi.fn(() => 17);
        cancel = vi.fn();
        vi.stubGlobal('requestAnimationFrame', raf);
        vi.stubGlobal('cancelAnimationFrame', cancel);
        fake = fakeContext();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake.ctx);
        renderer = createSphereRenderer(document.createElement('canvas'));
    });
    afterEach(() => {
        renderer.stop();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
        delete document.documentElement.dataset.motion;
    });

    it('finish резолвится по таймеру, stop снимает кадр и слушатель, повторный цикл чистый', async () => {
        const remove = vi.spyOn(window, 'removeEventListener');
        renderer.start();
        expect(raf).toHaveBeenCalledTimes(1);
        expect(fake.calls.drawImage).toBeGreaterThan(0); // в первый кадр частицы ещё прозрачны (появление)
        const first = renderer.finish();
        expect(renderer.finish()).toBe(first);
        let ended = false;
        first.then(() => {
            ended = true;
        });
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

    it('при «уменьшить движение» финал короткий (400 мс) и рисование работает', async () => {
        document.documentElement.dataset.motion = 'reduce';
        renderer.start();
        renderer.resize();
        renderer.setTheme('light');
        const end = renderer.finish();
        await vi.advanceTimersByTimeAsync(400);
        await end;
        renderer.stop();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('фазы финала: сжатие → вспышка → разлёт → затухание', () => {
        expect(exitPhases(0)).toEqual({ implode: 0, flash: 0, burst: 0, fade: 0 });
        const mid = exitPhases(0.3);
        expect(mid.implode).toBeCloseTo(1);
        expect(mid.flash).toBeCloseTo(1);
        expect(mid.burst).toBe(0);
        const late = exitPhases(0.8);
        expect(late.burst).toBeGreaterThan(0.9);
        expect(late.flash).toBe(0);
        expect(exitPhases(1).fade).toBe(1);
    });

    it('бюджет частиц масштабируется под экран и устройство, но не ниже порога', () => {
        const big = computeBudget({ width: 1920, height: 1080, cores: 8, reduced: false });
        const phone = computeBudget({ width: 390, height: 844, cores: 4, reduced: false });
        expect(big.shell).toBe(1500);
        expect(phone.shell).toBeLessThan(big.shell);
        expect(phone.shell).toBeGreaterThanOrEqual(Math.round(1500 * 0.45));
    });

    it('ГПСЧ детерминирован; палитра — от синего до маджента', () => {
        const a = createRng(1);
        const b = createRng(1);
        expect([a(), a(), a()]).toEqual([b(), b(), b()]);
        expect(COSMIC_PALETTE_DARK[0]).toBe('#3b82f6');
        expect(COSMIC_PALETTE_DARK).toContain('#ec4899');
    });
});
