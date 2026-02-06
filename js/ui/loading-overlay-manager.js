'use strict';

/**
 * Менеджер оверлея загрузки приложения.
 * Вынесен из script.js для уменьшения мегафайла и повторного использования.
 */
export const loadingOverlayManager = {
    overlayElement: null,
    styleElement: null,
    animationRunner: null,
    isSpawning: false,
    spawnProgress: 0,
    spawnDuration: 1500,
    spawnStartTime: 0,
    fadeOutDuration: 800,
    currentProgressValue: 0,

    createAndShow() {
        // Пытаемся использовать существующий оверлей из HTML
        const existingOverlay = document.getElementById('custom-loading-overlay');
        const existingStyles = document.getElementById('custom-loading-overlay-styles');
        
        if (existingOverlay) {
            this.overlayElement = existingOverlay;
            this.styleElement = existingStyles;
            console.log('Using existing overlay from HTML.');
            this.updateProgress(0, 'Загрузка');
            this.overlayElement.style.opacity = '1';
            this.overlayElement.style.display = 'flex';
            
            const canvas = this.overlayElement.querySelector('#loadingCanvas');
            if (canvas) {
                // Плавно перехватываем управление ранней анимацией без остановки
                if (window._earlySphereAnimation && window._earlySphereAnimation.isRunning) {
                    console.log('Smoothly taking over early sphere animation.');
                    // Получаем состояние ранней анимации для плавного перехода
                    const earlyState = window._earlySphereAnimation.getState ? window._earlySphereAnimation.getState() : null;
                    const earlyStop = window._earlySphereAnimation.stop;
                    const earlyResize = window._earlySphereAnimation.resize;
                    
                    // Запускаем новую анимацию сразу
                    this.isSpawning = false; // Не запускаем spawn заново, продолжаем текущую
                    this.spawnStartTime = performance.now();
                    this.spawnProgress = 1; // Устанавливаем полный прогресс, так как сфера уже появилась
                    
                    // Передаем состояние ранней анимации для плавного перехода
                    const { startAnimation, stopAnimation, resizeHandler } =
                        this._encapsulateAnimationScript(canvas, this, earlyState);
                    this.animationRunner = {
                        start: startAnimation,
                        stop: stopAnimation,
                        resize: resizeHandler,
                        isRunning: false,
                    };
                    
                    // Запускаем новую анимацию
                    this.animationRunner.start();
                    this.animationRunner.isRunning = true;
                    
                    // Останавливаем раннюю анимацию после небольшой задержки для плавного перехода
                    requestAnimationFrame(() => {
                        if (earlyStop) earlyStop();
                        if (earlyResize) {
                            window.removeEventListener('resize', earlyResize);
                        }
                        window._earlySphereAnimation.isRunning = false;
                    });
                    
                    window.addEventListener('resize', this.animationRunner.resize);
                    console.log('Animation smoothly transitioned from early to main.');
                } else {
                    // Если ранней анимации нет, запускаем обычным способом
                    this.isSpawning = true;
                    this.spawnStartTime = performance.now();
                    this.spawnProgress = 0;
                    
                    if (this.animationRunner) {
                        if (this.animationRunner.isRunning) {
                            this.animationRunner.stop();
                        }
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
                    console.log('Animation started for existing overlay from HTML.');
                }
            } else {
                console.error('Canvas элемент #loadingCanvas не найден в существующем оверлее из HTML!');
            }
            return;
        } else if (this.overlayElement && document.body.contains(this.overlayElement)) {
            console.log('Custom loading overlay already exists. Resetting progress and text.');
            this.updateProgress(0, 'Загрузка');
            this.overlayElement.style.opacity = '1';
            this.overlayElement.style.display = 'flex';
            if (this.animationRunner && !this.animationRunner.isRunning) {
                this.animationRunner.start();
            }
            return;
        } else {
            // Создаём новый оверлей если не найден
            console.log('Creating new overlay dynamically.');
            
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

            this.overlayElement = document.createElement('div');
            this.overlayElement.id = 'custom-loading-overlay';
            this.overlayElement.innerHTML = overlayHTML;

            this.overlayElement.style.position = 'fixed';
            this.overlayElement.style.top = '0';
            this.overlayElement.style.left = '0';
            this.overlayElement.style.width = '100%';
            this.overlayElement.style.height = '100%';
            this.overlayElement.style.zIndex = '99999';
            this.overlayElement.style.backgroundColor = '#0a0a1a';
            this.overlayElement.style.display = 'flex';
            this.overlayElement.style.justifyContent = 'center';
            this.overlayElement.style.alignItems = 'center';

            document.body.appendChild(this.overlayElement);
        }

        this.isSpawning = true;
        this.spawnStartTime = performance.now();
        this.spawnProgress = 0;

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
        } else {
            console.error('Canvas элемент #loadingCanvas не найден в созданном оверлее!');
        }

        this.updateProgress(0, 'Загрузка');
        console.log(
            'Custom loading overlay with progress bar (re-positioned loading text) created and shown.',
        );
    },

    async hideAndDestroy() {
        console.log(
            '[loadingOverlayManager.hideAndDestroy ASYNC V4] Начало плавного скрытия и уничтожения.',
        );
        
        // Плавно затемняем canvas (сферу) вместе с оверлеем
        const canvas = this.overlayElement?.querySelector('#loadingCanvas');
        const initialCanvasOpacity = canvas ? parseFloat(getComputedStyle(canvas).opacity) || 1 : 1;
        
        if (this.animationRunner) {
            // Не останавливаем анимацию сразу - пусть она плавно затемняется
            if (typeof this.animationRunner.resize === 'function') {
                window.removeEventListener('resize', this.animationRunner.resize);
            }
            console.log(
                '[loadingOverlayManager.hideAndDestroy ASYNC V4] Слушатель resize удален, анимация будет затемнена.',
            );
        }

        const overlayPromise = new Promise((resolve) => {
            if (this.overlayElement && document.body.contains(this.overlayElement)) {
                // Добавляем transition для плавного затемнения
                this.overlayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-out`;
                if (canvas) {
                    canvas.style.transition = `opacity ${this.fadeOutDuration}ms ease-out`;
                }
                
                // Устанавливаем opacity для плавного затемнения
                this.overlayElement.style.opacity = '0';
                if (canvas) {
                    canvas.style.opacity = '0';
                }
                
                console.log(
                    '[loadingOverlayManager.hideAndDestroy ASYNC V4] Начато плавное затемнение оверлея и сферы.',
                );

                const currentOverlayElement = this.overlayElement;

                setTimeout(() => {
                    // Останавливаем анимацию после затемнения
                    if (this.animationRunner && typeof this.animationRunner.stop === 'function') {
                        this.animationRunner.stop();
                        this.animationRunner.isRunning = false;
                    }
                    
                    if (document.body.contains(currentOverlayElement)) {
                        currentOverlayElement.remove();
                        console.log(
                            '[loadingOverlayManager.hideAndDestroy ASYNC V4] Элемент оверлея удален из DOM.',
                        );
                    }
                    if (this.overlayElement === currentOverlayElement) {
                        this.overlayElement = null;
                    }
                    resolve();
                }, this.fadeOutDuration);
            } else {
                console.log(
                    '[loadingOverlayManager.hideAndDestroy ASYNC V4] Оверлей не существует или не в DOM, разрешаем промис немедленно.',
                );
                if (this.overlayElement) this.overlayElement = null;
                resolve();
            }
        });

        if (this.styleElement && document.head.contains(this.styleElement)) {
            this.styleElement.remove();
            this.styleElement = null;
            console.log('[loadingOverlayManager.hideAndDestroy ASYNC V3] Элемент стилей удален.');
        }

        this.animationRunner = null;
        this.isSpawning = false;
        this.spawnProgress = 0;
        this.currentProgressValue = 0;

        await overlayPromise;
        console.log('[loadingOverlayManager.hideAndDestroy ASYNC V3] Процесс полностью завершен.');
    },

    updateProgress(percentage, message = null) {
        if (!this.overlayElement) {
            return;
        }

        const progressBarLine = this.overlayElement.querySelector('#progressBarLine');
        const progressPercentageText = this.overlayElement.querySelector('#progressPercentageText');
        const loadingTextElement = this.overlayElement.querySelector('#loadingText');

        const p = Math.max(0, Math.min(100, parseFloat(percentage) || 0));
        this.currentProgressValue = p;

        if (progressBarLine) {
            progressBarLine.style.width = `${p}%`;
        }
        if (progressPercentageText) {
            progressPercentageText.textContent = `${Math.round(p)}%`;
        }

        if (message && loadingTextElement) {
            const animatedDotsSpan = loadingTextElement.querySelector('#animated-dots');
            if (
                loadingTextElement.firstChild &&
                loadingTextElement.firstChild.nodeType === Node.TEXT_NODE
            ) {
                loadingTextElement.firstChild.nodeValue = message;
            } else {
                const textNode = document.createTextNode(message);
                if (animatedDotsSpan) {
                    loadingTextElement.insertBefore(textNode, animatedDotsSpan);
                } else {
                    loadingTextElement.textContent = '';
                    loadingTextElement.appendChild(textNode);
                }
            }
            if (animatedDotsSpan && !loadingTextElement.contains(animatedDotsSpan)) {
                loadingTextElement.appendChild(animatedDotsSpan);
            }
        }
    },

    _encapsulateAnimationScript(canvasElement, manager, initialState = null) {
        let localAnimationFrameId = null;
        const ctx = canvasElement.getContext('2d');
        let width_anim, height_anim, centerX_anim, centerY_anim;
        let particles_anim = [];
        // Используем состояние из ранней анимации для плавного перехода
        let globalTime_anim = initialState?.globalTime || 0;
        let rotationX_anim = initialState?.rotationX || 0;
        let rotationY_anim = initialState?.rotationY || 0;

        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const config_anim = {
            particleCount: 2000,
            sphereBaseRadius: 4,
            focalLength: 250,
            rotationSpeedX: 0.0003,
            rotationSpeedY: 0.002,
            breathAmplitude: 0.09,
            breathSpeed: 0.01,
            petalCount: 15,
            petalStrength: 0.2,
            baseParticleMinSize: 0.5,
            baseParticleMaxSize: 1,
            colorPalette: [
                [140, 70, 200, 1],
                [170, 90, 220, 0.9],
                [110, 50, 180, 0.9],
                [190, 100, 230, 0.95],
                [100, 100, 230, 1],
                [70, 70, 190, 0.95],
                [220, 150, 240, 0.85],
            ],
            backgroundColor: 'rgba(0, 0, 0, 0)',
            spawnIndigoColor: [75, 0, 130],
            spawnGlowBaseIntensity: 0.8,
            spawnGlowRadiusFactorBase: 2.0,
            spawnGlowRadiusFactorExtra: 3.0,
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
                this.baseSize =
                    config_anim.baseParticleMinSize +
                    Math.random() *
                        (config_anim.baseParticleMaxSize - config_anim.baseParticleMinSize);
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
                const dynamicSphereRadius =
                    currentSphereRadius * (1 + breathPulse * config_anim.breathAmplitude);
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
            }

            draw(spawnProgress) {
                const easedSpawnProgress = easeOutCubic(spawnProgress);
                if (this.currentDisplaySize <= 0.15) return;
                const mainAlpha = this.alphaFactor * easedSpawnProgress;
                if (mainAlpha <= 0.02) return;
                const mainSize = this.currentDisplaySize;

                const haloLayers = [
                    { sizeFactor: 3.5, alphaFactor: 0.15, innerStop: 0.1, outerStop: 0.75 },
                    { sizeFactor: 2.2, alphaFactor: 0.25, innerStop: 0.15, outerStop: 0.85 },
                ];
                for (const layer of haloLayers) {
                    const haloSize = mainSize * layer.sizeFactor;
                    const haloAlpha = mainAlpha * layer.alphaFactor;
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
                        `rgba(${this.color_r}, ${this.color_g}, ${this.color_b}, ${
                            haloAlpha * 0.5
                        })`,
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
                ctx.beginPath();
                ctx.arc(this.screenX, this.screenY, mainSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function init_anim() {
            width_anim = canvasElement.width = canvasElement.offsetWidth;
            height_anim = canvasElement.height = canvasElement.offsetHeight;
            centerX_anim = width_anim / 2;
            centerY_anim = height_anim / 2;

            particles_anim = [];
            for (let i = 0; i < config_anim.particleCount; i++) {
                particles_anim.push(new Particle_anim());
            }
        }

        function animate_anim(timestamp) {
            const deltaTime = timestamp - globalTime_anim;
            globalTime_anim = timestamp;

            ctx.fillStyle = config_anim.backgroundColor;
            ctx.clearRect(0, 0, width_anim, height_anim);

            if (manager.isSpawning && manager.spawnProgress < 1) {
                const elapsedTime = performance.now() - manager.spawnStartTime;
                manager.spawnProgress = Math.min(1, elapsedTime / manager.spawnDuration);
            } else if (manager.spawnProgress >= 1 && manager.isSpawning) {
                manager.isSpawning = false;
            }
            const currentEffectiveSpawnProgress = manager.isSpawning ? manager.spawnProgress : 1.0;

            const breathPulse = Math.sin(globalTime_anim * config_anim.breathSpeed);
            particles_anim.forEach((particle) => {
                particle.projectAndTransform(
                    config_anim.sphereBaseRadius,
                    breathPulse,
                    currentEffectiveSpawnProgress,
                );
            });

            particles_anim.forEach((particle) => {
                particle.draw(currentEffectiveSpawnProgress);
            });
            localAnimationFrameId = requestAnimationFrame(animate_anim);
        }

        const resizeHandler_anim = () => {
            if (localAnimationFrameId) {
                cancelAnimationFrame(localAnimationFrameId);
                localAnimationFrameId = null;
            }
            init_anim();
            if (
                !localAnimationFrameId &&
                manager.animationRunner &&
                manager.animationRunner.isRunning
            ) {
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

