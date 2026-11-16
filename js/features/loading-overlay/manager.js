'use strict';

import {
    readStoredOverlaySnapshot,
    resolveThemeFromStorage,
    applyLoadingOverlayThemeVars,
} from './theme-resolver.js';
import { getThemeProfile } from './particles-config.js';

import { createSphereRenderer } from './sphere-renderer.js';

/** Минимальное время показа оверлея (мс): анимация успевает раскрыться целиком. */
export const MIN_VISIBLE_MS = 7000;

/** Подпись этапа по проценту загрузки. */
export function phaseLabel(percent) {
    if (percent >= 100) return 'Готово';
    if (percent >= 85) return 'Последние штрихи';
    if (percent >= 60) return 'Настройка интерфейса';
    if (percent >= 35) return 'Загрузка данных';
    if (percent >= 12) return 'Подключение базы';
    return 'Инициализация';
}

/**
 * Отображаемый прогресс: не обгоняет реальный и растёт не быстрее, чем течёт минимальное окно,
 * поэтому полоса заполняется плавно и доходит до 100% к концу окна.
 */
export function displayedProgress(real, elapsedMs, minVisibleMs = MIN_VISIBLE_MS) {
    const r = Math.max(0, Math.min(100, Number(real) || 0));
    if (!(minVisibleMs > 0)) return r;
    const cap = Math.max(0, Math.min(100, (elapsedMs / minVisibleMs) * 100));
    return Math.min(r, cap);
}

/**
 * Менеджер оверлея загрузки. Централизованное управление показом/скрытием, темой и анимацией.
 * Интегрируется с ранним скриптом в index.html (тема и canvas) и с app-init/onload.
 */
export const loadingOverlayManager = {
    overlayElement: null,
    styleElement: null,
    animationRunner: null,
    isSpawning: false,
    spawnProgress: 0,
    spawnDuration: 1500,
    spawnStartTime: 0,
    fadeOutDuration: 180,
    currentProgressValue: 0,
    exitScaleStartTime: 0,
    /** Минимум показа; тесты выставляют 0. */
    minVisibleMs: MIN_VISIBLE_MS,
    /** Момент показа (performance.now). Ранний оверлей виден с начала навигации → 0. */
    _shownAt: 0,
    /** Минимум для текущего показа: только запуск приложения; оверлеи операций (экспорт/импорт) — без задержки. */
    _holdMs: MIN_VISIBLE_MS,
    _progressFrame: null,

    _startProgressTicker() {
        if (this._progressFrame !== null || typeof requestAnimationFrame !== 'function') return;
        const loop = () => {
            this._progressFrame = null;
            if (!this.overlayElement) return;
            this._renderProgress();
            this._progressFrame = requestAnimationFrame(loop);
        };
        this._progressFrame = requestAnimationFrame(loop);
    },

    _stopProgressTicker() {
        if (this._progressFrame !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this._progressFrame);
        }
        this._progressFrame = null;
    },

    _renderProgress() {
        if (!this.overlayElement) return;
        const elapsed = performance.now() - (this._shownAt || 0);
        const shown = displayedProgress(this.currentProgressValue, elapsed, this._holdMs);
        const bar = this.overlayElement.querySelector('#progressBarLine');
        const pct = this.overlayElement.querySelector('#progressPercentageText');
        const phase = this.overlayElement.querySelector('#loadingPhaseText');
        if (bar) {
            bar.style.width = `${shown.toFixed(1)}%`;
            bar.parentElement?.setAttribute('aria-valuenow', String(Math.floor(shown)));
        }
        const rounded = `${Math.floor(shown)}%`;
        if (pct && pct.textContent !== rounded) pct.textContent = rounded;
        const label = phaseLabel(shown);
        if (phase && phase.textContent !== label) phase.textContent = label;
    },

    readStoredOverlaySnapshot() {
        return readStoredOverlaySnapshot();
    },

    getResolvedTheme() {
        const snapshot = this.readStoredOverlaySnapshot();
        if (snapshot?.tone === 'dark' || snapshot?.tone === 'light') return snapshot.tone;
        const root = document.documentElement;
        if (root?.dataset?.theme === 'light' || root?.dataset?.theme === 'dark')
            return root.dataset.theme;
        if (
            root?.dataset?.loadingOverlayTheme === 'light' ||
            root?.dataset?.loadingOverlayTheme === 'dark'
        ) {
            return root.dataset.loadingOverlayTheme;
        }
        return root.classList.contains('dark') ? 'dark' : 'light';
    },

    /** Профиль для анимации: palette, particleCount, halo scales, useHalo (false = только точки, без свечения) */
    getThemeProfile(theme) {
        const p = getThemeProfile(theme === 'light' ? 'light' : 'dark');
        return {
            palette: p.particlePalette,
            particleCount: p.particleCount,
            haloSizeScale: p.haloSizeScale ?? 1,
            haloAlphaScale: p.haloAlphaScale ?? 1,
            coreAlphaScale: p.coreAlphaScale ?? 1,
            useHalo: p.useHalo !== false,
            particleSizeScale: p.particleSizeScale ?? 1,
        };
    },

    applyOverlayTheme(theme) {
        const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
        const snapshot = this.readStoredOverlaySnapshot();
        applyLoadingOverlayThemeVars(normalizedTheme, snapshot, { setHtmlBackground: true });
        if (this.overlayElement) {
            this.overlayElement.style.backgroundColor = 'var(--loading-overlay-bg, #020206)';
        }
        if (
            window._earlySphereAnimation &&
            typeof window._earlySphereAnimation.setTheme === 'function'
        ) {
            window._earlySphereAnimation.setTheme(normalizedTheme);
        }
    },

    /**
     * Promise, который разрешается, когда оверлей полностью скрыт (после взрыва).
     * Используется, чтобы не открывать диалоги и уведомления поверх анимации.
     */
    whenHidden() {
        const visible =
            this.overlayElement ||
            document.documentElement.classList.contains('copilot-overlay-visible');
        if (!visible) return Promise.resolve();
        if (!this._hiddenWaiters) this._hiddenWaiters = [];
        return new Promise((resolve) => this._hiddenWaiters.push(resolve));
    },

    _notifyHidden() {
        document.documentElement.classList.remove('copilot-overlay-visible');
        const waiters = this._hiddenWaiters || [];
        this._hiddenWaiters = [];
        waiters.forEach((fn) => {
            try {
                fn();
            } catch {
                /* ignore */
            }
        });
        try {
            document.dispatchEvent(new CustomEvent('copilot1co:loading-overlay-hidden'));
        } catch {
            /* ignore */
        }
    },

    createAndShow() {
        document.documentElement.classList.add('loading-overlay-active', 'copilot-overlay-visible');
        this.applyOverlayTheme(resolveThemeFromStorage());
        const existingOverlay = document.getElementById('custom-loading-overlay');
        const existingStyles = document.getElementById('custom-loading-overlay-styles');

        if (existingOverlay) {
            // Первый показ — это ранний оверлей из index.html, видимый с начала навигации.
            const isFirstBootShow = !existingOverlay.hasAttribute('data-loading-overlay-parked');
            this.overlayElement = existingOverlay;
            this.currentProgressValue = 0;
            this.styleElement = existingStyles;
            this.updateProgress(1, 'Загрузка');
            this.overlayElement.style.opacity = '1';
            this.overlayElement.style.display = 'flex';
            this.overlayElement.style.visibility = '';
            this.overlayElement.style.pointerEvents = '';
            this.overlayElement.removeAttribute('aria-hidden');
            this.overlayElement.removeAttribute('data-loading-overlay-parked');

            this.overlayElement.classList.remove('is-exiting');
            this._shownAt = isFirstBootShow ? 0 : performance.now();
            this._holdMs = isFirstBootShow ? this.minVisibleMs : 0;
            this._startProgressTicker();
            this._showGeneration = (this._showGeneration || 0) + 1;
            this._hidePromise = null;
            const canvas = this.overlayElement.querySelector('#loadingCanvas');
            if (canvas) {
                this.animationRunner?.stop();
                this.animationRunner = window._earlySphereAnimation || createSphereRenderer(canvas);
                this.animationRunner.setTheme(this.getResolvedTheme());
                this.animationRunner.start();
            }
            return;
        }

        if (this.overlayElement && document.body.contains(this.overlayElement)) {
            this.updateProgress(1, 'Загрузка');
            this.overlayElement.style.opacity = '1';
            this.overlayElement.style.display = 'flex';
            this.overlayElement.style.visibility = '';
            this.overlayElement.style.pointerEvents = '';
            this.overlayElement.removeAttribute('aria-hidden');
            this.overlayElement.removeAttribute('data-loading-overlay-parked');
            if (this.animationRunner && !this.animationRunner.isRunning) {
                this.animationRunner.start();
            }
            return;
        }

        const overlayHTML = `
            <canvas id="loadingCanvas"></canvas>
            <div class="loading-text" id="loadingText">Загрузка<span id="animated-dots"></span></div>
            <div class="progress-indicator-container">
                <div class="progress-bar-line-track" role="progressbar" aria-label="Загрузка" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <div class="progress-bar-line" id="progressBarLine"></div>
                </div>
                <div class="progress-meta">
                    <span class="loading-phase" id="loadingPhaseText">Инициализация</span>
                    <span class="progress-percentage-text" id="progressPercentageText">0%</span>
                </div>
            </div>
        `;
        const overlayCSS = `
        #custom-loading-overlay {
            margin: 0;
            overflow: hidden;
            height: 100vh;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            position: relative;
        }

        /* Деликатный фон-туманность: мягкие цветные облака дрейфуют позади сферы, виньетка собирает взгляд к центру */
        #custom-loading-overlay::before,
        #custom-loading-overlay::after {
        content: '';
        position: absolute;
        inset: -10%;
        pointer-events: none;
        z-index: 0;
        }
        #custom-loading-overlay::before {
        background:
            radial-gradient(42% 38% at 50% 48%, rgba(124, 58, 237, 0.20), transparent 70%),
            radial-gradient(34% 30% at 22% 28%, rgba(99, 102, 241, 0.13), transparent 72%),
            radial-gradient(38% 34% at 80% 74%, rgba(192, 38, 211, 0.11), transparent 72%),
            radial-gradient(28% 26% at 70% 18%, rgba(56, 189, 248, 0.07), transparent 70%);
        animation: loading-nebula-drift 26s ease-in-out infinite alternate;
        will-change: transform;
        }
        #custom-loading-overlay::after {
        inset: 0;
        background: radial-gradient(ellipse at center, transparent 45%, rgba(2, 0, 12, 0.55) 100%);
        }
        html[data-loading-overlay-theme='light'] #custom-loading-overlay::before {
        background:
            radial-gradient(42% 38% at 50% 48%, rgba(124, 58, 237, 0.10), transparent 70%),
            radial-gradient(34% 30% at 22% 28%, rgba(99, 102, 241, 0.08), transparent 72%),
            radial-gradient(38% 34% at 80% 74%, rgba(192, 38, 211, 0.06), transparent 72%);
        }
        html[data-loading-overlay-theme='light'] #custom-loading-overlay::after {
        background: radial-gradient(ellipse at center, transparent 55%, rgba(76, 29, 149, 0.10) 100%);
        }
        @keyframes loading-nebula-drift {
        0% { transform: translate3d(-1.5%, -1%, 0) scale(1); }
        100% { transform: translate3d(1.5%, 1.2%, 0) scale(1.06); }
        }
        @media (prefers-reduced-motion: reduce) {
        #custom-loading-overlay::before { animation: none; }
        }
        html[data-motion='reduce'] #custom-loading-overlay::before { animation: none; }
        #loadingCanvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
        .loading-text {
            position: absolute; bottom: 12%; left: 50%; transform: translateX(-50%);
            max-width: 90%; padding: 0 20px; box-sizing: border-box;
            font-size: 20px; letter-spacing: 1px; line-height: 1.4; font-weight: 600; z-index: 10;
            background: var(--loading-overlay-text-gradient, linear-gradient(120deg, #8A2BE2, #4B0082, rgb(80, 0, 186), #4B0082, #8A2BE2));
            background-size: 250% 100%;
            -webkit-background-clip: text; background-clip: text;
            -webkit-text-fill-color: transparent; text-fill-color: transparent;
            animation: gradient-text-flow-smooth 4s linear infinite; text-align: center;
        }
        #animated-dots { display: inline-block; min-width: 25px; text-align: left; }
        #animated-dots::before { content: "."; animation: ellipsis-content-for-span 1.5s infinite steps(1, end); }
        .progress-indicator-container {
            position: absolute; bottom: 5%; left: 50%; transform: translateX(-50%);
            width: 280px; display: flex; flex-direction: column; align-items: center; z-index: 10;
        }
        .progress-bar-line-track {
            width: 100%; height: 6px;
            background-color: var(--loading-overlay-track-bg, rgba(138, 43, 226, 0.15));
            border-radius: 3px; margin-bottom: 8px; overflow: hidden;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
        }
        .progress-bar-line {
            width: 0%; height: 100%;
            background: var(--loading-overlay-progress-gradient, linear-gradient(90deg, #8A2BE2, #A020F0, #4B0082, #A020F0, #8A2BE2));
            background-size: 300% 100%; border-radius: 3px;
            transition: width 0.25s ease-out;
            animation: progress-gradient-flow 2s linear infinite;
        }
        @keyframes progress-gradient-flow { 0% { background-position: 0% center; } 100% { background-position: -300% center; } }
        .progress-percentage-text {
            font-size: 14px; font-weight: 600; letter-spacing: 0.5px;
            background: var(--loading-overlay-percent-gradient, linear-gradient(120deg, #9333ea, #c084fc, #9333ea));
            background-size: 200% 100%;
            -webkit-background-clip: text; background-clip: text;
            -webkit-text-fill-color: transparent; text-fill-color: transparent;
            animation: gradient-text-flow-smooth 3s linear infinite;
        }
        @keyframes gradient-text-flow-smooth { 0% { background-position: 0% center; } 100% { background-position: -250% center; } }
        @keyframes ellipsis-content-for-span { 0% { content: "."; } 33% { content: ".."; } 66% { content: "..."; } 100% { content: "."; } }
        `;

        this.overlayElement = document.createElement('div');
        this.overlayElement.id = 'custom-loading-overlay';
        this.overlayElement.innerHTML = overlayHTML;
        this.overlayElement.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;' +
            'background-color:var(--loading-overlay-bg, #020206);display:flex;justify-content:center;align-items:center;';

        this.styleElement = document.createElement('style');
        this.styleElement.id = 'custom-loading-overlay-styles';
        this.styleElement.textContent = overlayCSS;
        document.head.appendChild(this.styleElement);
        document.body.appendChild(this.overlayElement);
        this.isSpawning = false;
        this.spawnStartTime = performance.now();
        this.spawnProgress = 1;

        this._showGeneration = (this._showGeneration || 0) + 1;
        this._hidePromise = null;
        this._shownAt = performance.now();
        this._holdMs = 0;
        this._startProgressTicker();
        const canvas = this.overlayElement.querySelector('#loadingCanvas');
        if (canvas) {
            this.animationRunner = createSphereRenderer(canvas);
            this.animationRunner.setTheme(this.getResolvedTheme());
            this.animationRunner.start();
        }
        this.updateProgress(1, 'Загрузка');
    },

    hideAndDestroy() {
        if (this._hidePromise) return this._hidePromise;
        const overlay = this.overlayElement;
        const runner = this.animationRunner;
        const generation = this._showGeneration;
        // Загрузка завершена: реальный прогресс 100%, полоса догоняет его плавно.
        this.currentProgressValue = 100;
        const elapsed = performance.now() - (this._shownAt || 0);
        const holdMs = Math.max(0, Math.min(this._holdMs || 0, this.minVisibleMs || 0) - elapsed);
        const hold =
            holdMs > 0 ? new Promise((resolve) => setTimeout(resolve, holdMs)) : Promise.resolve();
        const startExit = () => {
            if (generation !== this._showGeneration) return null;
            this._renderProgress();
            document.documentElement.classList.remove('loading-overlay-active');
            if (overlay) {
                overlay.style.pointerEvents = 'none';
                overlay.classList.add('is-exiting');
            }
            return runner?.finish
                ? runner.finish()
                : new Promise((resolve) => setTimeout(resolve, this.fadeOutDuration));
        };
        const completion = holdMs > 0 ? hold.then(startExit) : startExit();
        this._hidePromise = Promise.resolve(completion).then(() => {
            if (generation !== this._showGeneration) return;
            this._stopProgressTicker();
            runner?.stop?.();
            if (overlay && document.body.contains(overlay)) {
                overlay.style.display = 'none';
                overlay.style.visibility = 'hidden';
                overlay.setAttribute('aria-hidden', 'true');
                overlay.setAttribute('data-loading-overlay-parked', '1');
            }
            this.overlayElement = null;
            this.styleElement = null;
            this.animationRunner = null;
            this.isSpawning = false;
            this.spawnProgress = 0;
            this.currentProgressValue = 0;
            this._hidePromise = null;
            this._notifyHidden();
        });
        return this._hidePromise;
    },

    updateProgress(percentage, message = null) {
        if (!this.overlayElement) return;
        const loadingTextElement = this.overlayElement.querySelector('#loadingText');
        const p = Math.max(0, Math.min(100, parseFloat(percentage) || 0));
        // Прогресс не откатывается назад (стадии иногда сообщают меньшие значения).
        this.currentProgressValue = Math.max(this.currentProgressValue || 0, p);
        this._renderProgress();
        this._startProgressTicker();
        if (message && loadingTextElement) {
            const animatedDotsSpan = loadingTextElement.querySelector('#animated-dots');
            const textNode = document.createTextNode(message);
            if (loadingTextElement.firstChild?.nodeType === Node.TEXT_NODE) {
                loadingTextElement.firstChild.nodeValue = message;
            } else {
                loadingTextElement.textContent = '';
                loadingTextElement.appendChild(textNode);
                if (animatedDotsSpan) loadingTextElement.appendChild(animatedDotsSpan);
            }
            if (animatedDotsSpan && !loadingTextElement.contains(animatedDotsSpan)) {
                loadingTextElement.appendChild(animatedDotsSpan);
            }
        }
    },

    async runExitEffect() {
        await this.animationRunner?.finish?.();
    },
};
