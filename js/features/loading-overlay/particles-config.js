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
            [175, 100, 235, 1],
            [200, 125, 252, 0.98],
            [145, 75, 215, 0.98],
            [220, 140, 255, 1],
            [135, 135, 248, 1],
            [105, 105, 225, 0.98],
            [245, 185, 255, 0.95],
            [195, 115, 255, 1],
            [165, 95, 242, 0.98],
        ],
        particleCount: 2600,
        haloSizeScale: 1.35,
        haloAlphaScale: 1.5,
        coreAlphaScale: 1.22,
        breathAmplitude: 0.1,
        breathSpeed: 0.011,
        rotationSpeedX: 0.00032,
        rotationSpeedY: 0.0021,
    };
}
