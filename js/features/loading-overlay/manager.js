'use strict';

import {
    readStoredOverlaySnapshot,
    resolveThemeFromStorage,
    applyLoadingOverlayThemeVars,
} from './theme-resolver.js';
import { getThemeProfile } from './particles-config.js';

const EXIT_WIND_UP_MS = 750;
const EXIT_EXPLODE_MS = 3300;
const EXIT_TOTAL_MS = EXIT_WIND_UP_MS + EXIT_EXPLODE_MS;
const EXIT_SHRINK_SCALE = 0.175;
const EXIT_MAX_SCALE = 18;
const EXIT_GLOW_MULTIPLIER_MAX = 12;

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
    fadeOutDuration: 500,
    currentProgressValue: 0,
    exitScaleStartTime: 0,

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

    createAndShow() {
        this.applyOverlayTheme(resolveThemeFromStorage());
        const existingOverlay = document.getElementById('custom-loading-overlay');
        const existingStyles = document.getElementById('custom-loading-overlay-styles');

        if (existingOverlay) {
            this.overlayElement = existingOverlay;
            this.styleElement = existingStyles;
            this.updateProgress(1, 'Загрузка');
            this.overlayElement.style.opacity = '1';
            this.overlayElement.style.display = 'flex';
            this.overlayElement.style.visibility = '';
            this.overlayElement.style.pointerEvents = '';
            this.overlayElement.removeAttribute('aria-hidden');
            this.overlayElement.removeAttribute('data-loading-overlay-parked');

            const canvas = this.overlayElement.querySelector('#loadingCanvas');
            if (canvas) {
                if (window._earlySphereAnimation) {
                    if (!window._earlySphereAnimation.isRunning) {
                        window._earlySphereAnimation.start();
                    }
                    this.isSpawning = false;
                    this.spawnStartTime = performance.now();
                    this.spawnProgress = 1;
                    this.animationRunner = {
                        start: function () {},
                        stop: window._earlySphereAnimation.stop || function () {},
                        resize: window._earlySphereAnimation.resize || function () {},
                        isRunning: true,
                    };
                } else {
                    this.isSpawning = false;
                    this.spawnStartTime = performance.now();
                    this.spawnProgress = 1;
                    if (this.animationRunner) {
                        if (this.animationRunner.isRunning) this.animationRunner.stop();
                        if (typeof this.animationRunner.resize === 'function') {
                            window.removeEventListener('resize', this.animationRunner.resize);
                        }
                    }
                    const { startAnimation, stopAnimation, resizeHandler } =
                        this._encapsulateAnimationScript(canvas, this);
                    this.animationRunner = {
                        start: startAnimation,
                        stop: stopAnimation,
                        resize: resizeHandler,
                        isRunning: false,
                    };
                    this.animationRunner.start();
                    this.animationRunner.isRunning = true;
                    window.addEventListener('resize', this.animationRunner.resize);
                }
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
                <div class="progress-bar-line-track">
                    <div class="progress-bar-line" id="progressBarLine"></div>
                </div>
                <div class="progress-percentage-text" id="progressPercentageText">0%</div>
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

        const canvas = this.overlayElement.querySelector('#loadingCanvas');
        if (canvas) {
            const { startAnimation, stopAnimation, resizeHandler } =
                this._encapsulateAnimationScript(canvas, this);
            this.animationRunner = {
                start: startAnimation,
                stop: stopAnimation,
                resize: resizeHandler,
                isRunning: false,
            };
            this.animationRunner.start();
            this.animationRunner.isRunning = true;
            window.addEventListener('resize', this.animationRunner.resize);
        }
        this.updateProgress(1, 'Загрузка');
    },

    async hideAndDestroy() {
        const runnerToStop = this.animationRunner;
        const earlyToStop =
            window._earlySphereAnimation && window._earlySphereAnimation.isRunning
                ? window._earlySphereAnimation
                : null;
        const canvas = this.overlayElement?.querySelector('#loadingCanvas');
        const overlayPromise = new Promise((resolve) => {
            if (this.overlayElement && document.body.contains(this.overlayElement)) {
                this.overlayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-out`;
                if (canvas) canvas.style.transition = `opacity ${this.fadeOutDuration}ms ease-out`;
                this.overlayElement.style.opacity = '0';
                if (canvas) canvas.style.opacity = '0';
                const currentOverlayElement = this.overlayElement;
                const currentStyleElement = this.styleElement;
                setTimeout(() => {
                    if (runnerToStop?.stop) {
                        runnerToStop.stop();
                        if (runnerToStop.resize)
                            window.removeEventListener('resize', runnerToStop.resize);
                        runnerToStop.isRunning = false;
                    }
                    if (earlyToStop?.stop) {
                        earlyToStop.stop();
                        if (earlyToStop.resize)
                            window.removeEventListener('resize', earlyToStop.resize);
                        earlyToStop.isRunning = false;
                    }
                    /* Парковка в DOM вместо remove: id оверлея остаются для UI health / полного аудита index. */
                    if (document.body.contains(currentOverlayElement)) {
                        currentOverlayElement.style.transition = '';
                        currentOverlayElement.style.opacity = '';
                        currentOverlayElement.style.display = 'none';
                        currentOverlayElement.style.visibility = 'hidden';
                        currentOverlayElement.style.pointerEvents = 'none';
                        currentOverlayElement.setAttribute('aria-hidden', 'true');
                        currentOverlayElement.setAttribute('data-loading-overlay-parked', '1');
                        if (canvas) {
                            canvas.style.transition = '';
                            canvas.style.opacity = '';
                        }
                    }
                    /* #custom-loading-overlay-styles остаётся в head (ранний index + повторный показ). */
                    if (this.overlayElement === currentOverlayElement) this.overlayElement = null;
                    if (this.styleElement === currentStyleElement) this.styleElement = null;
                    resolve();
                }, this.fadeOutDuration);
            } else {
                if (runnerToStop?.stop) {
                    runnerToStop.stop();
                    if (runnerToStop?.resize)
                        window.removeEventListener('resize', runnerToStop.resize);
                }
                if (earlyToStop?.stop) {
                    earlyToStop.stop();
                    if (earlyToStop?.resize)
                        window.removeEventListener('resize', earlyToStop.resize);
                    earlyToStop.isRunning = false;
                }
                this.overlayElement = null;
                this.styleElement = null;
                resolve();
            }
        });
        this.animationRunner = null;
        this.isSpawning = false;
        this.spawnProgress = 0;
        this.currentProgressValue = 0;
        await overlayPromise;
    },

    updateProgress(percentage, message = null) {
        if (!this.overlayElement) return;
        const progressBarLine = this.overlayElement.querySelector('#progressBarLine');
        const progressPercentageText = this.overlayElement.querySelector('#progressPercentageText');
        const loadingTextElement = this.overlayElement.querySelector('#loadingText');
        const p = Math.max(0, Math.min(100, parseFloat(percentage) || 0));
        this.currentProgressValue = p;
        if (progressBarLine) progressBarLine.style.width = `${p}%`;
        if (progressPercentageText) progressPercentageText.textContent = `${Math.round(p)}%`;
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
        this.exitScaleStartTime = performance.now();
        const early = window._earlySphereAnimation;
        if (early?.setExitStartTime && early?.getExitPromise) {
            early.setExitStartTime();
            await early.getExitPromise();
            return;
        }
        await new Promise((r) => setTimeout(r, EXIT_TOTAL_MS + 100));
    },

    _encapsulateAnimationScript(canvasElement, manager, initialState = null) {
        let localAnimationFrameId = null;
        const ctx = canvasElement.getContext('2d');
        let width_anim, height_anim, centerX_anim, centerY_anim;
        let particles_anim = [];
        let currentTheme_anim = manager.getResolvedTheme();
        let themeProfile_anim = manager.getThemeProfile(currentTheme_anim);
        let globalTime_anim = initialState?.globalTime || 0;
        let rotationX_anim = initialState?.rotationX || 0;
        let rotationY_anim = initialState?.rotationY || 0;
        let rotationStartTime_anim = 0;
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
        const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

        function getExitScale_anim() {
            if (!manager.exitScaleStartTime) return 1;
            const elapsed = performance.now() - manager.exitScaleStartTime;
            if (elapsed >= EXIT_TOTAL_MS) return EXIT_MAX_SCALE;
            if (elapsed < EXIT_WIND_UP_MS) {
                const t = elapsed / EXIT_WIND_UP_MS;
                return 1 + (EXIT_SHRINK_SCALE - 1) * easeOutQuint(t);
            }
            const t = (elapsed - EXIT_WIND_UP_MS) / EXIT_EXPLODE_MS;
            return EXIT_SHRINK_SCALE + (EXIT_MAX_SCALE - EXIT_SHRINK_SCALE) * easeOutQuart(t);
        }
        function getExitGlowMultiplier_anim() {
            if (!manager.exitScaleStartTime) return 1;
            const elapsed = performance.now() - manager.exitScaleStartTime;
            if (elapsed < EXIT_WIND_UP_MS) {
                const t = elapsed / EXIT_WIND_UP_MS;
                return 1 + (EXIT_GLOW_MULTIPLIER_MAX - 1) * easeOutQuint(t);
            }
            return EXIT_GLOW_MULTIPLIER_MAX;
        }

        const profile = manager.getThemeProfile(currentTheme_anim);
        const config_anim = {
            particleCount: profile.particleCount ?? 2200,
            sphereBaseRadius: 4,
            focalLength: 250,
            rotationSpeedX: 0.0003,
            rotationSpeedY: 0.002,
            breathAmplitude: 0.09,
            breathSpeed: 0.01,
            petalCount: 15,
            petalStrength: 0.2,
            baseParticleMinSize: 0.45,
            baseParticleMaxSize: 1.1,
            particleSizeScale: profile.particleSizeScale ?? 1,
            colorPalette: profile.palette,
            backgroundColor: 'rgba(0, 0, 0, 0)',
        };

        class Particle_anim {
            constructor() {
                const u = Math.random();
                const v = Math.random();
                const theta = 2 * Math.PI * u;
                const phi = Math.acos(2 * v - 1);
                this.baseR_factor = 0.75 + Math.random() * 0.25;
                const petalModulation =
                    1 +
                    config_anim.petalStrength *
                        Math.sin(phi) *
                        Math.cos(
                            config_anim.petalCount * theta +
                                Math.PI / (Math.random() > 0.5 ? 2 : 1),
                        );
                const effectiveR_factor = this.baseR_factor * petalModulation;
                this.x0 = effectiveR_factor * Math.sin(phi) * Math.cos(theta);
                this.y0 = effectiveR_factor * Math.sin(phi) * Math.sin(theta);
                this.z0 = effectiveR_factor * Math.cos(phi);
                const colorData =
                    config_anim.colorPalette[
                        Math.floor(Math.random() * config_anim.colorPalette.length)
                    ];
                this.color_r = colorData[0];
                this.color_g = colorData[1];
                this.color_b = colorData[2];
                this.baseAlphaMultiplier = colorData[3];
                const sizeBase =
                    config_anim.baseParticleMinSize +
                    Math.random() *
                        (config_anim.baseParticleMaxSize - config_anim.baseParticleMinSize);
                this.baseSize = sizeBase * (config_anim.particleSizeScale ?? 1);
                this.noiseAmp = 0.03 + Math.random() * 0.04;
                this.noiseFreq = 0.005 + Math.random() * 0.01;
                this.noisePhaseX = Math.random() * Math.PI * 2;
                this.noisePhaseY = Math.random() * Math.PI * 2;
                this.noisePhaseZ = Math.random() * Math.PI * 2;
                this.screenX = 0;
                this.screenY = 0;
                this.projectedSize = 0;
                this.alphaFactor = 0;
                this.depth = 0;
                this.currentDisplaySize = 0;
            }
            projectAndTransform(currentSphereRadius, breathPulse, spawnProgress) {
                const timeBasedNoisePhase = globalTime_anim * this.noiseFreq;
                const dX = Math.sin(this.noisePhaseX + timeBasedNoisePhase) * this.noiseAmp;
                const dY = Math.cos(this.noisePhaseY + timeBasedNoisePhase) * this.noiseAmp;
                const dZ = Math.sin(this.noisePhaseZ + timeBasedNoisePhase) * this.noiseAmp;
                let x = this.x0 + dX;
                let y = this.y0 + dY;
                let z = this.z0 + dZ;
                let tempX_rotY = x * Math.cos(rotationY_anim) - z * Math.sin(rotationY_anim);
                let tempZ_rotY = x * Math.sin(rotationY_anim) + z * Math.cos(rotationY_anim);
                x = tempX_rotY;
                z = tempZ_rotY;
                let tempY_rotX = y * Math.cos(rotationX_anim) - z * Math.sin(rotationX_anim);
                let tempZ_rotX = y * Math.sin(rotationX_anim) + z * Math.cos(rotationX_anim);
                y = tempY_rotX;
                z = tempZ_rotX;
                const exitScale = getExitScale_anim();
                const dynamicSphereRadius =
                    currentSphereRadius *
                    (1 + breathPulse * config_anim.breathAmplitude) *
                    exitScale;
                const perspectiveFactor =
                    config_anim.focalLength /
                    (config_anim.focalLength - z * dynamicSphereRadius * 0.8);
                this.screenX = centerX_anim + x * dynamicSphereRadius * perspectiveFactor;
                this.screenY = centerY_anim + y * dynamicSphereRadius * perspectiveFactor;
                const normalizedDepth = z;
                this.projectedSize = Math.max(
                    0.1,
                    this.baseSize * perspectiveFactor * ((normalizedDepth + 1.2) / 2.2),
                );
                this.alphaFactor = Math.max(
                    0.1,
                    Math.min(1, ((normalizedDepth + 1.5) / 2.5) * this.baseAlphaMultiplier),
                );
                this.depth = z;
                const easedSpawnProgress = easeOutCubic(spawnProgress);
                this.currentDisplaySize = this.projectedSize * easedSpawnProgress;
                if (exitScale > 1.5) {
                    this.currentDisplaySize = Math.max(this.currentDisplaySize, 0.14);
                }
            }
            draw(spawnProgress, glowMultiplier = 1) {
                const easedSpawnProgress = easeOutCubic(spawnProgress);
                if (this.currentDisplaySize <= 0.15) return;
                const mainAlpha = Math.min(
                    1,
                    this.alphaFactor *
                        easedSpawnProgress *
                        glowMultiplier *
                        (themeProfile_anim.coreAlphaScale ?? 1),
                );
                if (mainAlpha <= 0.02) return;
                const mainSize = this.currentDisplaySize;
                const useHalo = themeProfile_anim.useHalo !== false;
                if (useHalo) {
                    const haloSizeScale = themeProfile_anim.haloSizeScale ?? 1;
                    const haloAlphaScale = themeProfile_anim.haloAlphaScale ?? 1;
                    const haloLayers = [
                        { sizeFactor: 5, alphaFactor: 0.2, innerStop: 0.05, outerStop: 0.8 },
                        { sizeFactor: 3.5, alphaFactor: 0.28, innerStop: 0.1, outerStop: 0.75 },
                        { sizeFactor: 2.2, alphaFactor: 0.4, innerStop: 0.15, outerStop: 0.85 },
                    ];
                    for (const layer of haloLayers) {
                        const haloSize = mainSize * layer.sizeFactor * haloSizeScale;
                        const haloAlpha = Math.min(
                            1,
                            mainAlpha * layer.alphaFactor * haloAlphaScale,
                        );
                        if (haloAlpha <= 0.01 || haloSize <= 0.2) continue;
                        const gradient = ctx.createRadialGradient(
                            this.screenX,
                            this.screenY,
                            haloSize * layer.innerStop,
                            this.screenX,
                            this.screenY,
                            haloSize,
                        );
                        gradient.addColorStop(
                            0,
                            `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, ${haloAlpha})`,
                        );
                        gradient.addColorStop(
                            layer.outerStop,
                            `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, ${haloAlpha * 0.5})`,
                        );
                        gradient.addColorStop(
                            1,
                            `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, 0)`,
                        );
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(this.screenX, this.screenY, haloSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                if (useHalo) {
                    const coreGradient = ctx.createRadialGradient(
                        this.screenX,
                        this.screenY,
                        0,
                        this.screenX,
                        this.screenY,
                        mainSize,
                    );
                    coreGradient.addColorStop(
                        0,
                        `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, ${mainAlpha})`,
                    );
                    coreGradient.addColorStop(
                        1,
                        `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, 0)`,
                    );
                    ctx.fillStyle = coreGradient;
                } else {
                    ctx.fillStyle = `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, ${mainAlpha})`;
                }
                ctx.beginPath();
                ctx.arc(this.screenX, this.screenY, mainSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const setupCanvas_anim = () => {
            const dpr = window.devicePixelRatio || 1;
            width_anim = window.innerWidth;
            height_anim = window.innerHeight;
            canvasElement.width = width_anim * dpr;
            canvasElement.height = height_anim * dpr;
            ctx.resetTransform();
            ctx.scale(dpr, dpr);
            centerX_anim = width_anim / 2;
            centerY_anim = height_anim / 2;
            config_anim.sphereBaseRadius = Math.min(width_anim, height_anim) * 0.1584;
        };

        function init_anim() {
            setupCanvas_anim();
            themeProfile_anim = manager.getThemeProfile(manager.getResolvedTheme());
            config_anim.colorPalette = themeProfile_anim.palette;
            config_anim.particleCount =
                themeProfile_anim.particleCount ?? config_anim.particleCount;
            config_anim.particleSizeScale = themeProfile_anim.particleSizeScale ?? 1;
            particles_anim = [];
            const particleCount = config_anim.particleCount;
            for (let i = 0; i < particleCount; i++) {
                particles_anim.push(new Particle_anim());
            }
        }

        function animate_anim(timestamp) {
            const nextTheme = manager.getResolvedTheme();
            if (nextTheme !== currentTheme_anim) {
                currentTheme_anim = nextTheme;
                themeProfile_anim = manager.getThemeProfile(currentTheme_anim);
                config_anim.colorPalette = themeProfile_anim.palette;
                config_anim.particleCount =
                    themeProfile_anim.particleCount ?? config_anim.particleCount;
                config_anim.particleSizeScale = themeProfile_anim.particleSizeScale ?? 1;
                particles_anim = [];
                for (let i = 0; i < config_anim.particleCount; i++) {
                    particles_anim.push(new Particle_anim());
                }
            }
            timestamp = timestamp || performance.now();
            if (!rotationStartTime_anim) rotationStartTime_anim = timestamp;
            const elapsedMs = timestamp - rotationStartTime_anim;
            rotationX_anim = elapsedMs * (config_anim.rotationSpeedX / 16);
            rotationY_anim = elapsedMs * (config_anim.rotationSpeedY / 16);
            globalTime_anim++;

            ctx.fillStyle = config_anim.backgroundColor;
            ctx.clearRect(0, 0, width_anim, height_anim);

            let currentEffectiveSpawnProgress = 1.0;
            if (manager.isSpawning && manager.spawnProgress < 1) {
                const elapsedTime = performance.now() - manager.spawnStartTime;
                manager.spawnProgress = Math.min(1, elapsedTime / manager.spawnDuration);
                currentEffectiveSpawnProgress = manager.spawnProgress;
            } else if (manager.spawnProgress >= 1 && manager.isSpawning) {
                manager.isSpawning = false;
            }

            const breathPulse = Math.sin(globalTime_anim * config_anim.breathSpeed);
            const exitGlowMultiplier = getExitGlowMultiplier_anim();
            particles_anim.forEach((p) => {
                p.projectAndTransform(
                    config_anim.sphereBaseRadius,
                    breathPulse,
                    currentEffectiveSpawnProgress,
                );
            });
            particles_anim.forEach((p) => {
                p.draw(currentEffectiveSpawnProgress, exitGlowMultiplier);
            });
            localAnimationFrameId = requestAnimationFrame(animate_anim);
        }

        const resizeHandler_anim = () => {
            if (localAnimationFrameId) {
                cancelAnimationFrame(localAnimationFrameId);
                localAnimationFrameId = null;
            }
            init_anim();
            if (!localAnimationFrameId && manager.animationRunner?.isRunning) {
                localAnimationFrameId = requestAnimationFrame(animate_anim);
            }
        };

        return {
            startAnimation: () => {
                init_anim();
                if (!localAnimationFrameId) {
                    localAnimationFrameId = requestAnimationFrame(animate_anim);
                }
            },
            stopAnimation: () => {
                if (localAnimationFrameId) {
                    cancelAnimationFrame(localAnimationFrameId);
                    localAnimationFrameId = null;
                }
            },
            resizeHandler: resizeHandler_anim,
        };
    },
};
