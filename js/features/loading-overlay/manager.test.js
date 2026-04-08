/** @vitest-environment jsdom */
'use strict';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { loadingOverlayManager } from './manager.js';

describe('loadingOverlayManager.hideAndDestroy', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.head.innerHTML = '';
        loadingOverlayManager.overlayElement = null;
        loadingOverlayManager.styleElement = null;
        loadingOverlayManager.animationRunner = null;
        loadingOverlayManager.fadeOutDuration = 0;
    });

    afterEach(() => {
        vi.useRealTimers();
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
});
