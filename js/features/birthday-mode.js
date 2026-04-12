'use strict';

/**
 * Праздничный «режим дня рождения»: оформление, конфетти, доступность (prefers-reduced-motion).
 * Дублирование состояния: userPreferences (IndexedDB) + зеркало localStorage с проверкой записи.
 */

import { BIRTHDAY_MODE_LOCAL_MIRROR_KEY } from '../constants.js';

export const BIRTHDAY_FX_LAYER_ID = 'birthdayFxLayer';
export const BIRTHDAY_GARLAND_ID = 'birthdayGarland';
/** Обертка: вертикальное падение отдельно от горизонтального «снежного» качка (два transform-контура, без calc в keyframes падения). */
export const BIRTHDAY_CONFETTI_HOST_CLASS = 'birthday-confetti-host';
/** Мелкие яркие частицы — чуть больше плотность при меньшем размере в CSS */
const CONFETTI_COUNT = 52;
const GARLAND_BULB_COUNT = 22;
const GARLAND_BULB_COLORS = ['#ff6b9d', '#ffd93d', '#6bcb77', '#4d96ff', '#c56cf0', '#ff922b'];
/** Волна провода (циклы по длине гирлянды) — синхрон с path в syncBirthdayGarlandWave */
const GARLAND_WAVE_CYCLES = 1.75; /* 1.52 × ~1.15 */
/** Амплитуда в px: совпадает с path (viewBox высота = .birthday-garland__cord height в CSS) */
const GARLAND_WAVE_AMPLITUDE_PX = 3.85; /* 3.35 × ~1.15 */
const GARLAND_CORD_PATH_STEPS = 88;
const GARLAND_CORD_VIEW_W = 1000;
const GARLAND_CORD_VIEW_H = 15;
const GARLAND_CORD_MID_Y = 9.9;

let motionUnsubscribe = null;

/**
 * @param {unknown} settings
 * @returns {boolean}
 */
export function getBirthdayModeEnabled(settings) {
    return !!(settings && typeof settings === 'object' && settings.birthdayModeEnabled === true);
}

/**
 * @returns {boolean}
 */
export function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

/**
 * Пишет зеркало и сверяет чтением (двухконтурная проверка).
 * @param {boolean} enabled
 */
function mirrorBirthdayFlag(enabled) {
    if (typeof localStorage === 'undefined') return;
    const val = enabled ? '1' : '0';
    try {
        localStorage.setItem(BIRTHDAY_MODE_LOCAL_MIRROR_KEY, val);
        const readBack = localStorage.getItem(BIRTHDAY_MODE_LOCAL_MIRROR_KEY);
        if (readBack !== val) {
            console.warn('[birthday-mode] зеркало localStorage: расхождение после записи', {
                expected: val,
                readBack,
            });
        }
    } catch (e) {
        console.warn('[birthday-mode] не удалось записать зеркало localStorage', e);
    }
}

/**
 * Создаёт слой конфетти один раз (идемпотентно).
 * @returns {HTMLElement | null}
 */
export function ensureBirthdayFxLayer() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById(BIRTHDAY_FX_LAYER_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = BIRTHDAY_FX_LAYER_ID;
        el.className = 'birthday-fx-layer';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
    }
    if (el.childElementCount > 0 && !el.querySelector(`.${BIRTHDAY_CONFETTI_HOST_CLASS}`)) {
        el.replaceChildren();
    }
    if (!el.childElementCount) {
        for (let i = 0; i < CONFETTI_COUNT; i++) {
            const host = document.createElement('span');
            host.className = BIRTHDAY_CONFETTI_HOST_CLASS;
            host.style.left = `${((i * 53) % 100) + (i % 3) * 0.7}%`;
            host.style.animationDelay = `${(i % 14) * 0.28}s`;
            host.style.setProperty('--bc-dur', `${6 + (i % 5)}s`);

            const piece = document.createElement('span');
            piece.className = 'birthday-confetti';
            const swayPx = 14 + (i % 13) * 1.85;
            piece.style.setProperty('--bc-sway', `${swayPx.toFixed(2)}px`);
            piece.style.setProperty('--bc-sway-neg', `${(-swayPx).toFixed(2)}px`);
            piece.style.setProperty('--bc-sway-dur', `${1.55 + (i % 7) * 0.26}s`);

            host.appendChild(piece);
            el.appendChild(host);
        }
    }
    return el;
}

/**
 * Синусоида по индексу лампочки (0..n-1), совпадает с параметром пути провода.
 * @param {number} i
 * @param {number} n
 * @returns {number}
 */
function garlandWaveSin(i, n) {
    if (n < 2) return 0;
    return Math.sin((i / (n - 1)) * Math.PI * 2 * GARLAND_WAVE_CYCLES);
}

/**
 * Волнообразный провод (SVG) + вертикальное смещение лампочек через margin-top (подвес **верхним** краем).
 * @param {HTMLElement} garlandRoot
 */
export function syncBirthdayGarlandWave(garlandRoot) {
    const cord = garlandRoot.querySelector('.birthday-garland__cord');
    const row = garlandRoot.querySelector('.birthday-garland__bulbs');
    if (!cord || !row) return;
    const bulbs = row.querySelectorAll('.birthday-garland__bulb');
    const n = bulbs.length;
    if (!n) return;

    bulbs.forEach((bulb, i) => {
        const dy = GARLAND_WAVE_AMPLITUDE_PX * garlandWaveSin(i, n);
        bulb.style.setProperty('--garland-wave-y', `${dy}px`);
    });

    const vbW = GARLAND_CORD_VIEW_W;
    const vbH = GARLAND_CORD_VIEW_H;
    const mid = GARLAND_CORD_MID_Y;
    const amp = GARLAND_WAVE_AMPLITUDE_PX;
    const cycles = GARLAND_WAVE_CYCLES;
    const steps = GARLAND_CORD_PATH_STEPS;
    let d = `M 0 ${mid + amp * Math.sin(0)}`;
    for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const x = u * vbW;
        const y = mid + amp * Math.sin(u * Math.PI * 2 * cycles);
        d += ` L ${x} ${y}`;
    }

    const stroke = 'rgba(105, 78, 58, 0.92)';
    cord.innerHTML = `<svg class="birthday-garland__cord-svg" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="2.65" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * Гирлянда: провод и равномерные светящиеся лампочки (отдельно от виньета body::before).
 * @returns {HTMLElement | null}
 */
export function ensureBirthdayGarland() {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById(BIRTHDAY_GARLAND_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = BIRTHDAY_GARLAND_ID;
        el.className = 'birthday-garland';
        el.setAttribute('aria-hidden', 'true');
        const cord = document.createElement('div');
        cord.className = 'birthday-garland__cord';
        const row = document.createElement('div');
        row.className = 'birthday-garland__bulbs';
        el.appendChild(cord);
        el.appendChild(row);
        document.body.appendChild(el);
    }
    const row = el.querySelector('.birthday-garland__bulbs');
    if (row && row.childElementCount === 0) {
        for (let i = 0; i < GARLAND_BULB_COUNT; i++) {
            const bulb = document.createElement('span');
            bulb.className = 'birthday-garland__bulb';
            bulb.style.setProperty('--bulb-color', GARLAND_BULB_COLORS[i % GARLAND_BULB_COLORS.length]);
            bulb.style.setProperty('--tw-delay', `${(i % 9) * 0.14}s`);
            row.appendChild(bulb);
        }
    }
    if (row && row.querySelector('.birthday-garland__bulb')) {
        syncBirthdayGarlandWave(el);
    }
    return el;
}

export const DEFAULT_APP_SLOGAN = 'Ваш надежный второй пилот';
export const BIRTHDAY_APP_SLOGAN = 'Ребеночку 1 годик';

/**
 * @param {boolean} enabled
 */
export function syncAppBrandTitleBirthday(enabled) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('appBrandTitle');
    if (!el) return;
    if (enabled) {
        el.setAttribute('aria-label', 'Copilot 1СО, режим дня рождения');
    } else {
        el.removeAttribute('aria-label');
    }
}

/**
 * Слоган в шапке: праздничный текст только при включённом ДР, иначе — исходный из разметки/сохранённый.
 * @param {boolean} enabled
 */
export function syncAppSloganBirthday(enabled) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('appSlogan');
    if (!el) return;
    if (enabled) {
        if (!el.dataset.birthdayDefaultSlogan) {
            const t = el.textContent.trim();
            el.dataset.birthdayDefaultSlogan = t || DEFAULT_APP_SLOGAN;
        }
        el.textContent = BIRTHDAY_APP_SLOGAN;
    } else {
        el.textContent = el.dataset.birthdayDefaultSlogan || DEFAULT_APP_SLOGAN;
        delete el.dataset.birthdayDefaultSlogan;
    }
}

function teardownMotionListener() {
    if (typeof motionUnsubscribe === 'function') {
        try {
            motionUnsubscribe();
        } catch {
            /* ignore */
        }
    }
    motionUnsubscribe = null;
}

function ensureReducedMotionListener() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (motionUnsubscribe) return;
    try {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => {
            const root = document.documentElement;
            if (root.dataset.birthdayMode !== 'on') return;
            const reduced = prefersReducedMotion();
            root.classList.toggle('birthday-mode--reduced', reduced);
        };
        mq.addEventListener('change', onChange);
        motionUnsubscribe = () => mq.removeEventListener('change', onChange);
    } catch {
        motionUnsubscribe = null;
    }
}

/**
 * @param {boolean} enabled
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {{ applied: boolean, reason?: string }}
 */
export function applyBirthdayModeToDocument(enabled, options = {}) {
    if (typeof document === 'undefined' || !document.documentElement) {
        return { applied: false, reason: 'no-document' };
    }
    const root = document.documentElement;
    const reduced =
        options.reducedMotion !== undefined ? options.reducedMotion : prefersReducedMotion();

    root.dataset.birthdayMode = enabled ? 'on' : 'off';
    root.classList.toggle('birthday-mode', !!enabled);
    root.classList.toggle('birthday-mode--reduced', !!enabled && reduced);

    const layer = document.getElementById(BIRTHDAY_FX_LAYER_ID);
    if (layer) {
        layer.classList.toggle('birthday-fx-layer--hidden', !enabled);
    }

    const garland = document.getElementById(BIRTHDAY_GARLAND_ID);
    if (garland) {
        garland.classList.toggle('birthday-garland--hidden', !enabled);
    }

    if (enabled) {
        ensureBirthdayFxLayer();
        const activeLayer = document.getElementById(BIRTHDAY_FX_LAYER_ID);
        if (activeLayer) {
            activeLayer.classList.remove('birthday-fx-layer--hidden');
        }
        ensureBirthdayGarland();
        const g = document.getElementById(BIRTHDAY_GARLAND_ID);
        if (g) {
            g.classList.remove('birthday-garland--hidden');
        }
        ensureReducedMotionListener();
    } else {
        teardownMotionListener();
    }

    syncAppBrandTitleBirthday(!!enabled);
    syncAppSloganBirthday(!!enabled);
    mirrorBirthdayFlag(!!enabled);
    return { applied: true };
}

/**
 * @param {unknown} settings
 * @returns {{ applied: boolean, reason?: string }}
 */
export function applyBirthdayModeFromSettings(settings) {
    return applyBirthdayModeToDocument(getBirthdayModeEnabled(settings));
}
