'use strict';

/**
 * Профили частиц для оверлея загрузки: премиум-настройки для тёмной и светлой темы.
 * Один источник правды для раннего скрипта в index.html и для менеджера (синхронизировать при изменении).
 *
 * Тёмная тема: глубокий фон, усиленное свечение, «вау»-эффект.
 * Светлая тема: без halo/glow (на белом свечение выглядит странно); твёрдые точки, приглушённая палитра.
 */

/**
 * @typedef {Object} ThemeProfile
 * @property {number[][]} particlePalette - [r, g, b, alpha][]
 * @property {number} [particleCount]
 * @property {number} [haloSizeScale]
 * @property {number} [haloAlphaScale]
 * @property {number} [coreAlphaScale]
 * @property {boolean} [useHalo] - если false, в светлой теме рисуем только ядро (точки без свечения)
 * @property {number} [particleSizeScale] - множитель размера точки (например 1.05 = +5%)
 * @property {number} [breathAmplitude]
 * @property {number} [breathSpeed]
 * @property {number} [rotationSpeedX]
 * @property {number} [rotationSpeedY]
 */

/**
 * Возвращает профиль частиц для темы (совместим с ранним скриптом: particlePalette и опциональные scale/count).
 * @param {'dark' | 'light'} theme
 * @returns {ThemeProfile}
 */
export function getThemeProfile(theme) {
    if (theme === 'light') {
        return {
            // На светлом фоне — без свечения: приглушённые violet/purple, читаемые точки.
            particlePalette: [
                [67, 26, 130, 0.85],
                [88, 28, 135, 0.9],
                [107, 33, 168, 0.88],
                [124, 58, 237, 0.82],
                [99, 102, 241, 0.8],
                [129, 140, 248, 0.75],
                [139, 92, 246, 0.85],
                [79, 70, 229, 0.88],
                [67, 56, 202, 0.9],
            ],
            particleCount: 3733,
            particleSizeScale: 1.05,
            useHalo: false,
            haloSizeScale: 1,
            haloAlphaScale: 1,
            coreAlphaScale: 1,
            breathAmplitude: 0.1,
            breathSpeed: 0.011,
            rotationSpeedX: 0.00032,
            rotationSpeedY: 0.0021,
        };
    }
    return {
        particlePalette: [
            [160, 90, 220, 1],
            [190, 110, 245, 0.95],
            [130, 60, 200, 0.95],
            [210, 120, 250, 1],
            [120, 120, 240, 1],
            [90, 90, 210, 0.95],
            [235, 170, 255, 0.9],
            [180, 100, 255, 0.98],
            [148, 80, 230, 0.96],
        ],
        particleCount: 2600,
        haloSizeScale: 1.18,
        haloAlphaScale: 1.22,
        coreAlphaScale: 1.15,
        breathAmplitude: 0.1,
        breathSpeed: 0.011,
        rotationSpeedX: 0.00032,
        rotationSpeedY: 0.0021,
    };
}
