/** @vitest-environment jsdom */
'use strict';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadingOverlayManager, displayedProgress, phaseLabel, MIN_VISIBLE_MS } from './manager.js';

describe('loadingOverlayManager.hideAndDestroy', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.head.innerHTML = '';
        loadingOverlayManager.overlayElement = null;
        loadingOverlayManager.styleElement = null;
        loadingOverlayManager.animationRunner = null;
        loadingOverlayManager.fadeOutDuration = 0;
        loadingOverlayManager._holdMs = 0;
        loadingOverlayManager.currentProgressValue = 0;
        loadingOverlayManager._showGeneration = 0;
        loadingOverlayManager._hidePromise = null;
    });

    afterEach(() => {
        vi.useRealTimers();
        delete window._earlySphereAnimation;
    });

    it('паркует оверлей в DOM вместо удаления (id для UI health)', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <div id="custom-loading-overlay" style="opacity:1">
                <canvas id="loadingCanvas"></canvas>
                <div class="loading-text" id="loadingText">Загрузка<span id="animated-dots"></span></div>
                <div class="progress-indicator-container">
                    <div class="progress-bar-line-track">
                        <div class="progress-bar-line" id="progressBarLine"></div>
                    </div>
                    <div class="progress-percentage-text" id="progressPercentageText">0%</div>
                </div>
            </div>`;
        const styleEl = document.createElement('style');
        styleEl.id = 'custom-loading-overlay-styles';
        document.head.appendChild(styleEl);

        const overlay = document.getElementById('custom-loading-overlay');
        loadingOverlayManager.overlayElement = overlay;
        loadingOverlayManager.styleElement = styleEl;
        loadingOverlayManager.animationRunner = {
            stop: vi.fn(),
            resize: vi.fn(),
            isRunning: true,
        };

        const p = loadingOverlayManager.hideAndDestroy();
        await vi.advanceTimersByTimeAsync(10);
        await p;

        expect(document.getElementById('custom-loading-overlay')).toBeTruthy();
        expect(document.getElementById('custom-loading-overlay-styles')).toBeTruthy();
        expect(document.getElementById('animated-dots')).toBeTruthy();
        expect(document.getElementById('progressBarLine')).toBeTruthy();
        expect(document.getElementById('progressPercentageText')).toBeTruthy();
        expect(overlay?.getAttribute('data-loading-overlay-parked')).toBe('1');
        expect(overlay?.style.display).toBe('none');
    });

    it('starts one explosion, releases input immediately, and parks only after it finishes', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="custom-loading-overlay"><canvas id="loadingCanvas"></canvas></div>';
        const overlay = document.getElementById('custom-loading-overlay');
        let finish;
        const runner = { isRunning: true, stop: vi.fn(), finish: vi.fn(() => new Promise(r => { finish = r; })) };
        loadingOverlayManager.overlayElement = overlay;
        loadingOverlayManager.animationRunner = runner;
        document.documentElement.classList.add('loading-overlay-active');
        const first = loadingOverlayManager.hideAndDestroy();
        const second = loadingOverlayManager.hideAndDestroy();
        expect(runner.finish).toHaveBeenCalledTimes(1);
        expect(overlay.style.pointerEvents).toBe('none');
        expect(document.documentElement.classList.contains('loading-overlay-active')).toBe(false);
        expect(overlay.style.display).not.toBe('none');
        finish();
        await Promise.all([first, second]);
        expect(overlay.style.display).toBe('none');
        expect(runner.stop).toHaveBeenCalledTimes(1);
    });
});

describe('минимальное время показа оверлея запуска', () => {
    afterEach(() => vi.useRealTimers());

    it('displayedProgress не обгоняет ни реальный прогресс, ни время', () => {
        expect(displayedProgress(100, 3500, 7000)).toBe(50);
        expect(displayedProgress(30, 6000, 7000)).toBe(30);
        expect(displayedProgress(100, 9000, 7000)).toBe(100);
        expect(displayedProgress(80, 0, 0)).toBe(80);
        expect(MIN_VISIBLE_MS).toBe(7000);
    });

    it('phaseLabel', () => {
        expect(phaseLabel(0)).toBe('Инициализация');
        expect(phaseLabel(50)).toBe('Загрузка данных');
        expect(phaseLabel(100)).toBe('Готово');
    });

    it('взрыв стартует не раньше 7 секунд с начала показа; до этого ввод заблокирован', async () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="custom-loading-overlay"><canvas id="loadingCanvas"></canvas></div>';
        const overlay = document.getElementById('custom-loading-overlay');
        const runner = { isRunning: true, stop: vi.fn(), finish: vi.fn(() => Promise.resolve()) };
        loadingOverlayManager.overlayElement = overlay;
        loadingOverlayManager.animationRunner = runner;
        loadingOverlayManager._hidePromise = null;
        loadingOverlayManager.minVisibleMs = 7000;
        loadingOverlayManager._holdMs = 7000;
        loadingOverlayManager._shownAt = performance.now();
        const done = loadingOverlayManager.hideAndDestroy();
        await vi.advanceTimersByTimeAsync(6900);
        expect(runner.finish).not.toHaveBeenCalled();
        expect(overlay.style.pointerEvents).not.toBe('none');
        await vi.advanceTimersByTimeAsync(200);
        await done;
        expect(runner.finish).toHaveBeenCalledTimes(1);
        expect(overlay.style.display).toBe('none');
    });
});
