'use strict';

/**
 * Единая настройка «Анимации и движение».
 *
 * Режимы пользователя (`userPreferences.motionMode`):
 *   auto   — как в системе: полные анимации, если ОС не просит «уменьшить движение» (по умолчанию);
 *   calm   — спокойные: только короткие плавные переходы, без эффектов (блики, каскады, масштаб);
 *   reduce — минимум: анимации и переходы отключены (для vestibular-чувствительных, слабых устройств).
 *
 * Результат применяется как `html[data-motion="full|calm|reduce"]`; весь CSS и JS опирается на него.
 * Зеркало режима лежит в localStorage — чтобы выставить атрибут до первой отрисовки (без вспышки).
 * Модуль без зависимостей, безопасен в SSR/jsdom.
 */

export const MOTION_MODES = Object.freeze(['auto', 'calm', 'reduce']);
export const MOTION_STORAGE_KEY = 'copilot.motion.v1';

/** @param {unknown} v */
export function sanitizeMotionMode(v) {
    return typeof v === 'string' && MOTION_MODES.includes(v) ? v : 'auto';
}

/**
 * @param {string} mode  motionMode из настроек
 * @param {boolean} systemReduce  matchMedia('(prefers-reduced-motion: reduce)')
 * @returns {'full'|'calm'|'reduce'}
 */
export function resolveMotionLevel(mode, systemReduce) {
    const m = sanitizeMotionMode(mode);
    if (m === 'reduce') return 'reduce';
    if (systemReduce) return 'reduce';
    return m === 'calm' ? 'calm' : 'full';
}

function systemPrefersReduce() {
    try {
        return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

let currentMode = 'auto';
let mqBound = false;
const listeners = new Set();

function readMirror() {
    try {
        return sanitizeMotionMode(window.localStorage.getItem(MOTION_STORAGE_KEY));
    } catch {
        return 'auto';
    }
}

function writeMirror(mode) {
    try {
        if (mode === 'auto') window.localStorage.removeItem(MOTION_STORAGE_KEY);
        else window.localStorage.setItem(MOTION_STORAGE_KEY, mode);
    } catch {
        /* приватный режим / запрет хранилища — не критично */
    }
}

/** Текущий итоговый уровень движения. */
export function getMotionLevel() {
    return resolveMotionLevel(currentMode, systemPrefersReduce());
}

/** true, если нужно максимально убрать движение. Заменяет прямые matchMedia в коде. */
export function isReducedMotion() {
    return getMotionLevel() === 'reduce';
}

/** true, если разрешены «эффектные» анимации (блики, каскады, view-transition). */
export function isRichMotion() {
    return getMotionLevel() === 'full';
}

export function getMotionMode() {
    return currentMode;
}

/**
 * Применяет режим к документу и (по умолчанию) запоминает в зеркале.
 * @param {string} mode
 * @param {{ persistMirror?: boolean }} [opts]
 */
export function applyMotionMode(mode, opts = {}) {
    currentMode = sanitizeMotionMode(mode);
    const level = getMotionLevel();
    if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.setAttribute('data-motion', level);
        root.setAttribute('data-motion-mode', currentMode);
    }
    if (opts.persistMirror !== false) writeMirror(currentMode);
    listeners.forEach((fn) => {
        try {
            fn(level, currentMode);
        } catch (e) {
            console.warn('[motion-pref] listener', e);
        }
    });
    return level;
}

/** Подписка на смену уровня. Возвращает функцию отписки. */
export function onMotionChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/**
 * Ранняя инициализация: читает зеркало, ставит атрибут, следит за системной настройкой.
 * Вызывается при импорте — до рендера контента.
 */
export function initMotionPref() {
    if (typeof document === 'undefined') return;
    applyMotionMode(readMirror(), { persistMirror: false });
    if (mqBound) return;
    mqBound = true;
    try {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const onChange = () => applyMotionMode(currentMode, { persistMirror: false });
        if (mq?.addEventListener) mq.addEventListener('change', onChange);
        else if (mq?.addListener) mq.addListener(onChange);
    } catch {
        /* ignore */
    }
}

/**
 * Плавная смена темы через View Transitions API (если доступен и разрешены эффекты).
 * Всегда вызывает `change`, даже если API недоступен.
 * @param {() => void} change
 */
export function withThemeTransition(change) {
    try {
        if (isRichMotion() && typeof document.startViewTransition === 'function') {
            const t = document.startViewTransition(change);
            // промис: «изменение применено» — чтобы вызывающий мог обновить зависящие от него контролы
            return Promise.resolve(t && t.updateCallbackDone).catch(() => {});
        }
    } catch {
        /* упадём на обычную смену */
    }
    try {
        return Promise.resolve(change());
    } catch (e) {
        return Promise.reject(e);
    }
}

initMotionPref();
