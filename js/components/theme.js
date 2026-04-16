'use strict';

import { THEME_DEFAULTS } from '../config.js';
import { State } from '../app/state.js';
import {
    THEME_HINT_KEY as LOADING_THEME_HINT_KEY,
    THEME_RESOLVED_KEY as LOADING_THEME_RESOLVED_KEY,
    OVERLAY_SNAPSHOT_KEY as LOADING_OVERLAY_SNAPSHOT_KEY,
} from '../features/loading-overlay/index.js';

/**
 * Компонент темы (светлая / тёмная / системная).
 */

function persistLoadingThemeHint(mode, isDark) {
    try {
        const normalizedMode = mode === 'dark' || mode === 'light' ? mode : 'auto';
        localStorage.setItem(LOADING_THEME_HINT_KEY, normalizedMode);
        localStorage.setItem(LOADING_THEME_RESOLVED_KEY, isDark ? 'dark' : 'light');
    } catch {
        // no-op: storage can be unavailable in private mode/restricted contexts
    }
}

function parseCssColorToRgb(value) {
    const color = String(value || '').trim();
    if (!color) return null;
    const hexMatch = color.match(/^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/);
    if (hexMatch) {
        const raw = hexMatch[1];
        const hex =
            raw.length === 3
                ? raw
                      .split('')
                      .map((ch) => ch + ch)
                      .join('')
                : raw;
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        };
    }
    const rgbMatch = color.match(
        /^rgba?\(\s*(\d{1,3})(?:\.\d+)?\s*,\s*(\d{1,3})(?:\.\d+)?\s*,\s*(\d{1,3})(?:\.\d+)?(?:\s*,\s*[\d.]+\s*)?\)$/i,
    );
    if (!rgbMatch) return null;
    return {
        r: Math.max(0, Math.min(255, Number(rgbMatch[1]))),
        g: Math.max(0, Math.min(255, Number(rgbMatch[2]))),
        b: Math.max(0, Math.min(255, Number(rgbMatch[3]))),
    };
}

function rgbToHex({ r, g, b }) {
    const toHex = (n) =>
        Math.max(0, Math.min(255, Math.round(n)))
            .toString(16)
            .padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getRelativeLuminance(rgb) {
    const toLinear = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function buildLoadingOverlaySnapshot(isDarkTheme) {
    const root = document.documentElement;
    const rootStyles = getComputedStyle(root);
    const body = document.body;
    const bodyStyles = body ? getComputedStyle(body) : null;

    const backgroundCandidate =
        rootStyles.getPropertyValue('--color-background') ||
        rootStyles.getPropertyValue(`--override-background-${isDarkTheme ? 'dark' : 'light'}`) ||
        rootStyles.getPropertyValue('--override-background-base') ||
        bodyStyles?.backgroundColor ||
        '';
    const primaryCandidate = rootStyles.getPropertyValue('--color-primary');
    const secondaryCandidate = rootStyles.getPropertyValue('--color-secondary');

    const backgroundRgb = parseCssColorToRgb(backgroundCandidate);
    const primaryRgb = parseCssColorToRgb(primaryCandidate);
    const secondaryRgb = parseCssColorToRgb(secondaryCandidate);

    const tone = backgroundRgb
        ? getRelativeLuminance(backgroundRgb) < 0.46
            ? 'dark'
            : 'light'
        : isDarkTheme
          ? 'dark'
          : 'light';
    return {
        tone,
        background: backgroundRgb
            ? rgbToHex(backgroundRgb)
            : tone === 'dark'
              ? THEME_DEFAULTS.backgroundDark
              : THEME_DEFAULTS.backgroundLight,
        primary: primaryRgb
            ? rgbToHex(primaryRgb)
            : tone === 'dark'
              ? THEME_DEFAULTS.primaryDark
              : THEME_DEFAULTS.primaryLight,
        secondary: secondaryRgb
            ? rgbToHex(secondaryRgb)
            : tone === 'dark'
              ? THEME_DEFAULTS.secondaryDark
              : THEME_DEFAULTS.secondaryLight,
    };
}

function persistLoadingOverlaySnapshot(snapshot) {
    try {
        localStorage.setItem(LOADING_OVERLAY_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
        // no-op: storage can be unavailable in private mode/restricted contexts
    }
}

function applyLoadingOverlayTheme(isDark) {
    const snapshot = buildLoadingOverlaySnapshot(!!isDark);
    persistLoadingOverlaySnapshot(snapshot);
    const overlayTone = snapshot?.tone === 'dark' ? 'dark' : 'light';
    if (typeof window.__applyLoadingOverlayThemeVars === 'function') {
        window.__applyLoadingOverlayThemeVars(overlayTone, snapshot);
    }
    if (
        window._earlySphereAnimation &&
        typeof window._earlySphereAnimation.setTheme === 'function'
    ) {
        window._earlySphereAnimation.setTheme(overlayTone);
    }
}

export function setTheme(mode) {
    const root = document.documentElement;
    const apply = (isDark) => {
        root.classList.add('theme-switching');
        root.classList.toggle('dark', !!isDark);
        root.dataset.theme = isDark ? 'dark' : 'light';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                root.classList.remove('theme-switching');
            });
        });
    };
    if (setTheme._mq && setTheme._onChange) {
        try {
            setTheme._mq.removeEventListener('change', setTheme._onChange);
        } catch {
            // old browsers may not support removeEventListener on MediaQueryList
        }
        setTheme._mq = null;
        setTheme._onChange = null;
    }
    let isDark;
    if (mode === 'dark') isDark = true;
    else if (mode === 'light') isDark = false;
    else {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        setTheme._mq = mq;
        setTheme._onChange = (e) => {
            apply(e.matches);
            persistLoadingThemeHint('auto', e.matches);
            applyLoadingOverlayTheme(e.matches);
        };
        try {
            mq.addEventListener('change', setTheme._onChange);
        } catch {
            // fallback for browsers with legacy MediaQueryList API
        }
        isDark = mq.matches;
    }
    apply(isDark);
    persistLoadingThemeHint(mode, isDark);
    applyLoadingOverlayTheme(isDark);
    updateThemeToggleButtonIcons(isDark);
    if (State.userPreferences) {
        State.userPreferences.theme = mode;
    }
}

/**
 * Синхронизирует видимость иконок солнца/луны в кнопке переключения темы,
 * чтобы при смене темы не отображались обе иконки одновременно.
 */
function updateThemeToggleButtonIcons(isDark) {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const sunIcon = btn.querySelector('.fa-sun');
    const moonIcon = btn.querySelector('.fa-moon');
    if (sunIcon) {
        sunIcon.style.display = isDark ? '' : 'none';
        sunIcon.classList.toggle('hidden', !isDark);
    }
    if (moonIcon) {
        moonIcon.style.display = isDark ? 'none' : '';
        moonIcon.classList.toggle('hidden', isDark);
    }
}

/**
 * Миграция устаревших переменных цветов темы
 */
export function migrateLegacyThemeVars() {
    const root = document.documentElement;
    const styleAttr = root.getAttribute('style') || '';
    const matches = styleAttr.match(/--color-[a-z0-9-]+:\s*[^;]+/gi);
    if (!matches) return;
    for (const decl of matches) {
        const [name, rawVal] = decl.split(':');
        const value = rawVal.trim();
        const base = name.trim().replace(/^--color-/, '');
        root.style.setProperty(`--override-${base}-light`, value);
        root.style.setProperty(`--override-${base}-dark`, value);
        root.style.removeProperty(name.trim());
        if (name.trim() === '--color-hover-subtle') {
            root.style.setProperty(`--override-hover-light`, value);
            root.style.setProperty(`--override-hover-dark`, value);
            root.style.removeProperty('--color-hover-subtle');
        }
    }
}

/**
 * Применяет класс темы к документу (dark/light, --color-background, body theme-*-text).
 * Используется для синхронизации с системной темой.
 */
export function applyThemeClass(isDark) {
    const root = document.documentElement;
    root.classList.toggle('dark', !!isDark);
    root.dataset.theme = isDark ? 'dark' : 'light';
    persistLoadingThemeHint('auto', isDark);
    applyLoadingOverlayTheme(isDark);
    const style = root.style;
    style.setProperty(
        '--color-background',
        `var(--override-background-${isDark ? 'dark' : 'light'}, var(--override-background-base))`,
    );
    const body = document.body;
    if (body.classList.contains('custom-bg-image-active')) {
        body.classList.toggle('theme-dark-text', !!isDark);
        body.classList.toggle('theme-light-text', !isDark);
    }
}

/**
 * Обработчик изменения системной темы (prefers-color-scheme).
 */
export function onSystemThemeChange(e) {
    applyThemeClass(e.matches);
}

/**
 * Применение переопределений цветов темы
 * @param {Object} map - объект с переопределениями цветов
 */
export function applyThemeOverrides(map = {}) {
    const root = document.documentElement;
    function toKebab(s) {
        return String(s).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    }
    for (const key of Object.keys(map)) {
        const cfg = map[key];
        if (cfg && typeof cfg === 'object') {
            if (cfg.light) root.style.setProperty(`--override-${toKebab(key)}-light`, cfg.light);
            if (cfg.dark) root.style.setProperty(`--override-${toKebab(key)}-dark`, cfg.dark);
        }
    }
}
