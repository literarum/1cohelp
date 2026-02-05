'use strict';

import * as State from '../app/state.js';

/**
 * Компонент темы (светлая / тёмная / системная).
 */

export function setTheme(mode) {
    const root = document.documentElement;
    const apply = (isDark) => {
        root.classList.toggle('dark', !!isDark);
        root.dataset.theme = isDark ? 'dark' : 'light';
    };
    if (setTheme._mq && setTheme._onChange) {
        try {
            setTheme._mq.removeEventListener('change', setTheme._onChange);
        } catch (_) {}
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
        } catch (_) {}
        isDark = mq.matches;
    }
    apply(isDark);
    if (State.userPreferences) {
        State.userPreferences.theme = mode;
    }
}
