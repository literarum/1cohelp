'use strict';

import { THEME_DEFAULTS } from '../../config.js';
import {
    THEME_HINT_KEY,
    THEME_RESOLVED_KEY,
    OVERLAY_SNAPSHOT_KEY,
    DEFAULT_THEME,
    OVERLAY_BG_DARK_DEEP,
    OVERLAY_BG_LIGHT,
} from './constants.js';

/**
 * Читает сохранённый снимок цветов оверлея из localStorage.
 * @returns {object | null}
 */
export function readStoredOverlaySnapshot() {
    try {
        const raw = localStorage.getItem(OVERLAY_SNAPSHOT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Разрешает тему для оверлея: при первом входе (нет ключей) — всегда DEFAULT_THEME (dark).
 * Используется ранним скриптом в index.html и менеджером после загрузки.
 * @returns {'dark' | 'light'}
 */
export function resolveThemeFromStorage() {
    const hint = safeGetItem(THEME_HINT_KEY);
    const storedResolved = safeGetItem(THEME_RESOLVED_KEY);
    const snapshot = readStoredOverlaySnapshot();

    if (hint === 'dark' || hint === 'light') return hint;
    if (hint === 'auto') {
        const prefersDark =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
    }
    if (storedResolved === 'dark' || storedResolved === 'light') return storedResolved;
    if (snapshot?.tone === 'dark' || snapshot?.tone === 'light') return snapshot.tone;

    return DEFAULT_THEME;
}

function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function parseHexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const normalized = String(hex).trim().replace(/^#/, '');
    if (!/^[a-fA-F0-9]{6}$/.test(normalized)) return null;
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function toRgba(hex, alpha) {
    const rgb = parseHexToRgb(hex);
    if (!rgb) {
        const fallback = parseHexToRgb(THEME_DEFAULTS.primary);
        if (fallback) return `rgba(${fallback.r}, ${fallback.g}, ${fallback.b}, ${alpha})`;
        return `rgba(138, 43, 226, ${alpha})`;
    }
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Применяет CSS-переменные оверлея и опционально фон html для устранения FOUC.
 * Должен вызываться до первой отрисовки (ранний скрипт в head) и при смене темы в приложении.
 * @param {'dark' | 'light'} theme
 * @param {object | null} snapshot - снимок { tone, background, primary, secondary }
 * @param {object} [opts]
 * @param {boolean} [opts.setHtmlBackground=true] - задать document.documentElement.style.backgroundColor
 */
export function applyLoadingOverlayThemeVars(theme, snapshot, opts = {}) {
    const { setHtmlBackground = true } = opts;
    const normalizedTheme = theme === 'light' ? 'light' : 'dark';
    const tone =
        snapshot && (snapshot.tone === 'dark' || snapshot.tone === 'light')
            ? snapshot.tone
            : normalizedTheme;
    const isDarkTone = tone === 'dark';
    const primary =
        snapshot && typeof snapshot.primary === 'string'
            ? snapshot.primary
            : isDarkTone
              ? THEME_DEFAULTS.primaryDark
              : THEME_DEFAULTS.primaryLight;
    const secondary =
        snapshot && typeof snapshot.secondary === 'string'
            ? snapshot.secondary
            : isDarkTone
              ? THEME_DEFAULTS.secondaryDark
              : THEME_DEFAULTS.secondaryLight;
    const background =
        snapshot && typeof snapshot.background === 'string'
            ? snapshot.background
            : isDarkTone
              ? OVERLAY_BG_DARK_DEEP
              : OVERLAY_BG_LIGHT;

    const root = document.documentElement;
    root.dataset.loadingOverlayTheme = tone;
    root.style.setProperty('--loading-overlay-bg', background);
    root.style.setProperty(
        '--loading-overlay-text-gradient',
        isDarkTone
            ? `linear-gradient(120deg, ${primary}, #4B0082, ${secondary}, #4B0082, ${primary})`
            : `linear-gradient(120deg, #1e293b, ${primary}, ${secondary}, ${primary}, #1e293b)`,
    );
    root.style.setProperty(
        '--loading-overlay-track-bg',
        isDarkTone ? toRgba(primary, 0.15) : toRgba(primary, 0.2),
    );
    root.style.setProperty(
        '--loading-overlay-progress-gradient',
        isDarkTone
            ? `linear-gradient(90deg, ${primary}, ${secondary}, #4B0082, ${secondary}, ${primary})`
            : `linear-gradient(90deg, ${primary}, ${secondary}, #6366f1, ${secondary}, ${primary})`,
    );
    root.style.setProperty(
        '--loading-overlay-percent-gradient',
        isDarkTone
            ? `linear-gradient(120deg, ${primary}, #c084fc, ${secondary}, #c084fc, ${primary})`
            : `linear-gradient(120deg, #334155, ${primary}, ${secondary}, ${primary}, #334155)`,
    );

    if (setHtmlBackground) {
        root.style.backgroundColor = background;
    }
}
