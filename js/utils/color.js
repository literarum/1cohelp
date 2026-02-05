'use strict';

/**
 * Модуль утилит для работы с цветами
 * Содержит функции конвертации между различными цветовыми форматами
 */

/**
 * Конвертирует HEX цвет в RGB
 * @param {string} hex - цвет в формате HEX (#RGB или #RRGGBB)
 * @returns {Object|null} объект {r, g, b} или null
 */
export function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    let r = 0,
        g = 0,
        b = 0;
    hex = hex.startsWith('#') ? hex.slice(1) : hex;
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        return null;
    }
    return { r, g, b };
}

/**
 * Конвертирует RGB в HEX
 * @param {number} r - красный (0-255)
 * @param {number} g - зеленый (0-255)
 * @param {number} b - синий (0-255)
 * @returns {string} цвет в формате HEX
 */
export function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

/**
 * Конвертирует RGB в HSB (Hue, Saturation, Brightness)
 * @param {number} r - красный (0-255)
 * @param {number} g - зеленый (0-255)
 * @param {number} b - синий (0-255)
 * @returns {Object} объект {h, s, b}
 */
export function rgbToHsb(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    let h = 0,
        s = 0,
        v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max !== min) {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, b: v * 100 };
}

/**
 * Конвертирует HSB в RGB
 * @param {number} h - оттенок (0-360)
 * @param {number} s - насыщенность (0-100)
 * @param {number} b - яркость (0-100)
 * @returns {Object} объект {r, g, b}
 */
export function hsbToRgb(h, s, b) {
    h /= 360;
    s /= 100;
    b /= 100;
    let r, g, v;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = b * (1 - s);
    const q = b * (1 - f * s);
    const t = b * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0:
            (r = b), (g = t), (v = p);
            break;
        case 1:
            (r = q), (g = b), (v = p);
            break;
        case 2:
            (r = p), (g = b), (v = t);
            break;
        case 3:
            (r = p), (g = q), (v = b);
            break;
        case 4:
            (r = t), (g = p), (v = b);
            break;
        case 5:
            (r = b), (g = p), (v = q);
            break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(v * 255),
    };
}

/**
 * Конвертирует HEX в HSL
 * @param {string} hex - цвет в формате HEX
 * @returns {Object|null} объект {h, s, l} или null
 */
export function hexToHsl(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    let h,
        s,
        l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Конвертирует HSL в HEX
 * @param {number} h - оттенок (0-360)
 * @param {number} s - насыщенность (0-100)
 * @param {number} l - светлота (0-100)
 * @returns {string} цвет в формате HEX
 */
export function hslToHex(h, s, l) {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Вычисляет относительную яркость цвета
 * @param {string} hex - цвет в формате HEX
 * @returns {number} значение яркости (0-1)
 */
export function getLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const { r, g, b } = rgb;
    const a = [r, g, b].map(function (v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Корректирует HSL значения
 * @param {Object} hsl - объект {h, s, l}
 * @param {number} l_adjust - корректировка светлоты
 * @param {number} s_adjust - корректировка насыщенности
 * @returns {Object} скорректированный объект {h, s, l}
 */
export function adjustHsl(hsl, l_adjust = 0, s_adjust = 0) {
    return {
        h: hsl.h,
        s: Math.max(0, Math.min(100, hsl.s + s_adjust)),
        l: Math.max(0, Math.min(100, hsl.l + l_adjust)),
    };
}

/**
 * Вычисляет вторичный (более тёмный) цвет
 * @param {string} hex - исходный цвет в формате HEX
 * @param {number} percent - процент затемнения (по умолчанию 15)
 * @returns {string} затемнённый цвет в формате HEX
 */
export function calculateSecondaryColor(hex, percent = 15) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
        hex = hex
            .split('')
            .map((s) => s + s)
            .join('');
    }
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    const factor = 1 - percent / 100;
    r = Math.max(0, Math.floor(r * factor));
    g = Math.max(0, Math.floor(g * factor));
    b = Math.max(0, Math.floor(b * factor));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
        .toString(16)
        .padStart(2, '0')}`;
}
