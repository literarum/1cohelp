'use strict';

import { State } from '../app/state.js';

/**
 * Компонент темы (светлая / тёмная / системная).
 */

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
        setTheme._onChange = (e) => apply(e.matches);
        try {
            mq.addEventListener('change', setTheme._onChange);
        } catch {
            // fallback for browsers with legacy MediaQueryList API
        }
        isDark = mq.matches;
    }
    apply(isDark);
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
