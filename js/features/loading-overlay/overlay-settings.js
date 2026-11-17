'use strict';

/**
 * Настройки оверлея загрузки (localStorage — читаются до загрузки базы, на первом кадре).
 *   duration: 'full' (не меньше 7 с при запуске) | 'quick' (без удержания)
 *   finale:   'explosion' | 'fade'
 *   palette:  'cosmic' (синий → маджента) | 'accent' (оттенки акцентного цвета пользователя)
 */

export const OVERLAY_SETTINGS_KEY = 'copilot.loadingOverlay.v1';
export const OVERLAY_DEFAULTS = Object.freeze({ duration: 'full', finale: 'explosion', palette: 'cosmic' });
const SNAPSHOT_KEY = 'copilot.loading-overlay.snapshot';

export function sanitizeOverlaySettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        duration: r.duration === 'quick' ? 'quick' : 'full',
        finale: r.finale === 'fade' ? 'fade' : 'explosion',
        palette: r.palette === 'accent' ? 'accent' : 'cosmic',
    };
}

export function readOverlaySettings() {
    try {
        return sanitizeOverlaySettings(JSON.parse(localStorage.getItem(OVERLAY_SETTINGS_KEY) || 'null'));
    } catch {
        return { ...OVERLAY_DEFAULTS };
    }
}

export function writeOverlaySettings(patch) {
    const next = sanitizeOverlaySettings({ ...readOverlaySettings(), ...patch });
    try {
        localStorage.setItem(OVERLAY_SETTINGS_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
    return next;
}

/** Акцентный цвет пользователя из снимка оформления (доступен на первом кадре). */
export function readAccentHex() {
    try {
        const snap = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
        const hex = typeof snap?.primary === 'string' ? snap.primary.trim() : '';
        return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
    } catch {
        return null;
    }
}

function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
    const hh = ((h % 360) + 360) % 360;
    const ss = Math.max(0, Math.min(100, s)) / 100;
    const ll = Math.max(0, Math.min(100, l)) / 100;
    const k = (n) => (n + hh / 30) % 12;
    const a = ss * Math.min(ll, 1 - ll);
    const f = (n) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 12 оттенков вокруг акцента: оттенок ±45°, светлота под тему.
 * @param {string} hex
 * @param {'dark'|'light'} theme
 */
export function accentPalette(hex, theme = 'dark') {
    const { h, s } = hexToHsl(hex);
    const sat = Math.max(55, Math.min(95, s));
    const out = [];
    for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const hue = h - 45 + t * 90;
        const light = theme === 'light' ? 34 + (i % 3) * 6 : 58 + (i % 3) * 8;
        out.push(hslToHex(hue, sat, light));
    }
    return out;
}
