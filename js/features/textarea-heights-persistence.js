'use strict';

/**
 * Сохранение и восстановление высоты растягиваемых по вертикали полей ввода (textarea с resize-y).
 * Значения хранятся в State.userPreferences.textareaHeights и сохраняются в IndexedDB.
 */

const MIN_HEIGHT_PX = 80;
const MAX_HEIGHT_PX = 800;

/** ID textarea, высоты которых сохраняем (статически присутствуют в DOM) */
const PERSISTED_TEXTAREA_IDS = ['clientNotes'];

let State = null;
let saveUserPreferences = null;
let debounce = null;

export function setTextareaHeightsDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.saveUserPreferences !== undefined) saveUserPreferences = deps.saveUserPreferences;
    if (deps.debounce !== undefined) debounce = deps.debounce;
}

/**
 * Применяет сохранённые высоты ко всем известным textarea по id.
 * Вызывать после загрузки настроек и когда элементы уже в DOM.
 */
export function applySavedTextareaHeights() {
    if (
        !State ||
        !State.userPreferences ||
        typeof State.userPreferences.textareaHeights !== 'object'
    )
        return;
    const heights = State.userPreferences.textareaHeights;
    for (const id of PERSISTED_TEXTAREA_IDS) {
        const saved = heights[id];
        if (typeof saved !== 'number') continue;
        const el = document.getElementById(id);
        if (!el || el.tagName !== 'TEXTAREA') continue;
        const clamped = Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, saved));
        el.style.height = `${clamped}px`;
    }
}

function persistTextareaHeight(id, heightPx) {
    if (!State || !State.userPreferences) return;
    const clamped = Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, heightPx));
    if (!State.userPreferences.textareaHeights) State.userPreferences.textareaHeights = {};
    State.userPreferences.textareaHeights[id] = clamped;
    if (typeof saveUserPreferences === 'function') saveUserPreferences();
}

let _initialized = false;

/**
 * Применяет сохранённые высоты и подписывается на изменение размеров (ResizeObserver)
 * для сохранения высоты при ручном растягивании. Вызывать один раз после готовности DOM.
 */
export function initTextareaHeightsPersistence() {
    if (_initialized) return;
    applySavedTextareaHeights();

    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes && typeof ResizeObserver !== 'undefined' && typeof debounce === 'function') {
        const saveHeight = debounce(() => {
            const h = clientNotes.offsetHeight;
            if (h >= MIN_HEIGHT_PX && h <= MAX_HEIGHT_PX) persistTextareaHeight('clientNotes', h);
        }, 400);
        const ro = new ResizeObserver(() => saveHeight());
        ro.observe(clientNotes);
        _initialized = true;
    }
}
