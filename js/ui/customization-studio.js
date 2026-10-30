'use strict';

/**
 * «Студия оформления» — окно кастомизации с живым предпросмотром до явного сохранения.
 *
 * Принципы:
 *  • Любое изменение видно сразу во всём приложении (панель стоит сбоку/снизу и не закрывает приложение).
 *  • Только «Сохранить» записывает изменения; закрытие и отмена восстанавливают состояние открытия.
 *  • Применение — не чаще одного раза за кадр (rAF), тяжёлые блоки пропускаются, если не менялись.
 *  • Независимость от окна «Настройки»: студия пишет только ключи оформления и не трогает порядок вкладок и т. п.
 *
 * Чистые функции (ACCENTS, LOOKS, pickAppearance, appearanceEqual, applyLookToAppearance, …) не зависят от DOM.
 */

import { MATERIAL_DEFAULTS, sanitizeMaterial } from './glass-material.js';
import { State } from '../app/state.js';
import { saveUserPreferences } from '../app/user-preferences.js';
import {
    THEME_DEFAULTS,
    DEFAULT_BORDER_RADIUS_PX,
    clampBorderRadiusPx,
    BORDER_RADIUS_SLIDER_MAX,
} from '../config.js';
import { applyPreviewSettings, applyPreviewSettingsCoalesced, cancelPreviewSettingsFrame } from './preview-settings.js';
import { setTheme } from '../components/theme.js';
import {
    beginBackgroundImagePreview, restoreBackgroundImagePreview, endBackgroundImagePreview,
    commitBackgroundImagePreview, acceptBackgroundImagePreview, rollbackBackgroundImageCommit,
    clearBackgroundImagePreview,
} from '../features/background-image.js';
import {
    initColorPicker,
    setColorPickerStateFromHex,
    resolveHexForCustomizationTarget,
} from './color-picker.js';
import {
    applyFontSettings,
    saveFontSettings,
    loadFontSettings,
    remountFontSettings,
    FONT_DEFAULTS,
    sanitizeFontSettings,
    beginFontSettingsPreview,
    commitFontSettingsPreview,
    endFontSettingsPreview,
} from './font-settings.js';
import {
    applyMotionMode,
    sanitizeMotionMode,
    withThemeTransition,
    getMotionLevel,
    onMotionChange,
} from '../utils/motion-pref.js';

// ---------------------------------------------------------------------------
// Чистые данные и функции
// ---------------------------------------------------------------------------

/** Ключи userPreferences, которыми управляет студия. */
export const STUDIO_KEYS = Object.freeze([
    'theme',
    'primaryColor',
    'backgroundColor',
    'backgroundAnchor',
    'isBackgroundCustom',
    'customTextColor',
    'isTextCustom',
    'borderRadius',
    'contentDensity',
    'motionMode',
    'staticHeader',
    'surfaceMaterial',
    'glassMatte',
    'glassRefraction',
]);

/** Готовые акценты. Первый — стандартный цвет приложения. */
export const ACCENTS = Object.freeze([
    { hex: THEME_DEFAULTS.primary, label: 'Фиолетовый (стандарт)' },
    { hex: '#6366f1', label: 'Индиго' },
    { hex: '#3b82f6', label: 'Синий' },
    { hex: '#06b6d4', label: 'Бирюзовый' },
    { hex: '#10b981', label: 'Изумрудный' },
    { hex: '#84cc16', label: 'Лаймовый' },
    { hex: '#f59e0b', label: 'Янтарный' },
    { hex: '#f97316', label: 'Оранжевый' },
    { hex: '#ef4444', label: 'Красный' },
    { hex: '#ec4899', label: 'Розовый' },
]);

/**
 * Готовые образы. `appearance` перекрывает очищенные значения, `fonts` — null оставляет шрифты как есть.
 * `thumb` — цвета миниатюры: фон, поверхность, акцент, текст.
 */
export const LOOKS = Object.freeze([
    {
        id: 'classic',
        label: 'Классика',
        hint: 'Стандартное оформление',
        appearance: {},
        fonts: { ...FONT_DEFAULTS },
        thumb: ['#12121f', '#1e1e32', '#9933ff', '#f3f4f6'],
    },
    {
        id: 'midnight',
        label: 'Полночь',
        hint: 'Глубокий синий, индиго',
        appearance: {
            theme: 'dark',
            primaryColor: '#6366f1',
            backgroundColor: '#0b1020',
            isBackgroundCustom: true,
        },
        fonts: null,
        thumb: ['#0b1020', '#151c33', '#6366f1', '#e5e7eb'],
    },
    {
        id: 'ocean',
        label: 'Океан',
        hint: 'Тёмная бирюза',
        appearance: {
            theme: 'dark',
            primaryColor: '#06b6d4',
            backgroundColor: '#06202b',
            isBackgroundCustom: true,
        },
        fonts: null,
        thumb: ['#06202b', '#0c3040', '#06b6d4', '#e0f2fe'],
    },
    {
        id: 'forest',
        label: 'Лес',
        hint: 'Спокойный зелёный',
        appearance: {
            theme: 'dark',
            primaryColor: '#10b981',
            backgroundColor: '#0b1f17',
            isBackgroundCustom: true,
        },
        fonts: null,
        thumb: ['#0b1f17', '#12332a', '#10b981', '#dcfce7'],
    },
    {
        id: 'dawn',
        label: 'Рассвет',
        hint: 'Светлая, тёплый акцент',
        appearance: {
            theme: 'light',
            primaryColor: '#f97316',
            backgroundColor: '#fff7ed',
            isBackgroundCustom: true,
        },
        fonts: null,
        thumb: ['#fff7ed', '#ffffff', '#f97316', '#431407'],
    },
    {
        id: 'paper',
        label: 'Бумага',
        hint: 'Светлая, синий акцент',
        appearance: {
            theme: 'light',
            primaryColor: '#3b82f6',
            backgroundColor: '#f8fafc',
            isBackgroundCustom: true,
        },
        fonts: null,
        thumb: ['#f8fafc', '#ffffff', '#3b82f6', '#0f172a'],
    },
    {
        id: 'contrast-dark',
        label: 'Контрастный тёмный',
        hint: 'Чёрный, белый, жёлтый',
        appearance: {
            theme: 'dark',
            primaryColor: '#facc15',
            backgroundColor: '#000000',
            isBackgroundCustom: true,
            customTextColor: '#ffffff',
            isTextCustom: true,
        },
        fonts: null,
        thumb: ['#000000', '#141414', '#facc15', '#ffffff'],
    },
    {
        id: 'contrast-light',
        label: 'Контрастный светлый',
        hint: 'Белый, чёрный, синий',
        appearance: {
            theme: 'light',
            primaryColor: '#1d4ed8',
            backgroundColor: '#ffffff',
            isBackgroundCustom: true,
            customTextColor: '#000000',
            isTextCustom: true,
        },
        fonts: null,
        thumb: ['#ffffff', '#f1f5f9', '#1d4ed8', '#000000'],
    },
    {
        id: 'compact',
        label: 'Компактный',
        hint: 'Плотнее, мельче углы',
        appearance: { borderRadius: 4, contentDensity: 2 },
        fonts: { ...FONT_DEFAULTS, scale: 92, line: 95 },
        thumb: ['#12121f', '#1e1e32', '#9933ff', '#f3f4f6'],
    },
    {
        id: 'comfort',
        label: 'Крупный и мягкий',
        hint: 'Крупнее текст, просторнее',
        appearance: { borderRadius: 14, contentDensity: 4 },
        fonts: { ...FONT_DEFAULTS, scale: 115, line: 120 },
        thumb: ['#12121f', '#1e1e32', '#9933ff', '#f3f4f6'],
    },
]);

/** Значения оформления «по умолчанию». */
export function defaultAppearance() {
    return {
        ...MATERIAL_DEFAULTS,
        theme: 'dark',
        primaryColor: THEME_DEFAULTS.primary,
        isBackgroundCustom: false,
        isTextCustom: false,
        borderRadius: DEFAULT_BORDER_RADIUS_PX,
        contentDensity: 3,
        motionMode: 'auto',
        staticHeader: false,
    };
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHexLoose(v) {
    if (typeof v !== 'string' || !HEX_RE.test(v.trim())) return '';
    let h = v.trim().toLowerCase();
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return h;
}

/**
 * Выбирает из настроек только оформление; пустые необязательные цвета не включает.
 * @param {Record<string, any>|null|undefined} src
 */
export function pickAppearance(src) {
    const out = {};
    const s = src && typeof src === 'object' ? src : {};
    const def = defaultAppearance();
    out.theme = ['light', 'dark', 'auto'].includes(s.theme || s.themeMode) ? s.theme || s.themeMode : def.theme;
    out.primaryColor = normalizeHexLoose(s.primaryColor) || def.primaryColor;
    out.isBackgroundCustom = !!(s.isBackgroundCustom && normalizeHexLoose(s.backgroundColor));
    if (out.isBackgroundCustom) {
        out.backgroundColor = normalizeHexLoose(s.backgroundColor);
        if (s.backgroundAnchor === 'dark' || s.backgroundAnchor === 'light') out.backgroundAnchor = s.backgroundAnchor;
    }
    out.isTextCustom = !!(s.isTextCustom && normalizeHexLoose(s.customTextColor));
    if (out.isTextCustom) out.customTextColor = normalizeHexLoose(s.customTextColor);
    out.borderRadius = clampBorderRadiusPx(s.borderRadius);
    const d = Number(s.contentDensity);
    out.contentDensity = Number.isFinite(d) ? Math.max(0, Math.min(6, Math.round(d))) : def.contentDensity;
    out.motionMode = sanitizeMotionMode(s.motionMode);
    out.staticHeader = s.staticHeader === true;
    Object.assign(out, sanitizeMaterial(s));
    return out;
}

/** Сравнение двух наборов оформления (после pickAppearance). */
export function appearanceEqual(a, b) {
    const x = pickAppearance(a);
    const y = pickAppearance(b);
    return STUDIO_KEYS.every((k) => (x[k] ?? null) === (y[k] ?? null));
}

/**
 * Результат применения образа к текущему оформлению. Чистая функция.
 * Сначала сбрасываются цвета/форма (как в «Классике»), затем накладывается образ;
 * тема и режим движения без явного указания в образе сохраняются.
 */
export function applyLookToAppearance(current, look) {
    const cur = pickAppearance(current);
    const def = defaultAppearance();
    const base = {
        theme: cur.theme,
        primaryColor: def.primaryColor,
        isBackgroundCustom: false,
        isTextCustom: false,
        borderRadius: def.borderRadius,
        contentDensity: def.contentDensity,
        motionMode: cur.motionMode,
        staticHeader: cur.staticHeader,
        ...sanitizeMaterial(cur),
    };
    return pickAppearance({ ...base, ...(look?.appearance || {}) });
}

/** Подпись процента для ползунка скругления. */
export function radiusPercent(px) {
    const v = clampBorderRadiusPx(px);
    return Math.round((v / BORDER_RADIUS_SLIDER_MAX) * 100);
}

/** Ширина заливки трека range в процентах. */
export function rangeFillPercent(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const v = Number(input.value);
    if (!Number.isFinite(v) || max <= min) return 0;
    return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}

export const MOTION_NOTES = Object.freeze({
    full: 'Сейчас: полные анимации.',
    calm: 'Сейчас: спокойные анимации.',
    reduce: 'Сейчас: движение уменьшено.',
});

/** Текст пояснения под переключателем движения. */
export function describeMotion(mode, level) {
    if (mode === 'auto' && level === 'reduce') {
        return 'В системе включено «уменьшение движения» — оно уважается, анимации отключены.';
    }
    return MOTION_NOTES[level] || MOTION_NOTES.full;
}

// ---------------------------------------------------------------------------
// Контроллер (DOM)
// ---------------------------------------------------------------------------

const PANE_STORAGE_KEY = 'ac.studio.pane';
const PANE_IDS = ['look', 'colors', 'fonts', 'shape', 'bg', 'motion', 'profiles'];

let controller = null;

/**
 * Создаёт и подключает контроллер к DOM окна. Повторный вызов возвращает существующий.
 * @param {{ root?: HTMLElement | null }} [opts]
 */
export function initCustomizationStudio(opts = {}) {
    if (controller) return controller;
    const root = opts.root || document.getElementById('appCustomizationModal');
    if (!root || !root.querySelector('[data-ac-studio]')) return null;
    controller = createController(root);
    return controller;
}

export function getCustomizationStudio() {
    return controller;
}

function createController(root) {
    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => Array.from(root.querySelectorAll(sel));

    const statusEl = $('#acStatus');
    const statusText = statusEl?.querySelector('.ac-status-text');
    const statusIcon = statusEl?.querySelector('i');

    let snapshot = null;
    let snapshotFonts = null;
    let previewSnapshot = null;
    let dirtyBeforeOpen = false;
    let sessionGeneration = 0;
    let persisting = null;
    let wasOpen = false;
    let activePane = 'look';
    let offMotion = null;

    // ----- Состояние ------------------------------------------------------
    function ensureCps() {
        if (!State.currentPreviewSettings || typeof State.currentPreviewSettings !== 'object') {
            State.currentPreviewSettings = JSON.parse(JSON.stringify(State.userPreferences || {}));
        }
        return State.currentPreviewSettings;
    }

    function readAppearance() {
        return pickAppearance(ensureCps());
    }

    /** Записывает набор оформления в предпросмотр (удаляя неактуальные необязательные цвета). */
    function writeAppearance(app) {
        const cps = ensureCps();
        cps.theme = app.theme;
        cps.themeMode = app.theme;
        cps.primaryColor = app.primaryColor;
        cps.isBackgroundCustom = !!app.isBackgroundCustom;
        if (app.isBackgroundCustom) {
            cps.backgroundColor = app.backgroundColor;
            if (app.backgroundAnchor) cps.backgroundAnchor = app.backgroundAnchor;
            else delete cps.backgroundAnchor;
        } else {
            delete cps.backgroundColor;
            delete cps.backgroundAnchor;
        }
        cps.isTextCustom = !!app.isTextCustom;
        if (app.isTextCustom) cps.customTextColor = app.customTextColor;
        else delete cps.customTextColor;
        cps.borderRadius = app.borderRadius;
        cps.contentDensity = app.contentDensity;
        cps.motionMode = app.motionMode;
        cps.staticHeader = app.staticHeader;
        Object.assign(cps, sanitizeMaterial(app));
        return cps;
    }

    // ----- Статус ---------------------------------------------------------
    function setStatus(state) {
        if (!statusEl) return;
        statusEl.dataset.state = state;
        const map = {
            saved: ['Сохранено', 'fa-circle-check'],
            pending: ['Не сохранено', 'fa-circle'],
            error: ['Не сохранилось — нажмите «Сохранить», чтобы повторить', 'fa-triangle-exclamation'],
        };
        const [text, icon] = map[state] || map.saved;
        if (statusText) statusText.textContent = text;
        if (statusIcon) statusIcon.className = `fas ${icon}`;
        statusEl.setAttribute('aria-label', text);
        statusEl.tabIndex = state === 'error' ? 0 : -1;
    }

    // ----- Применение и сохранение ---------------------------------------
    function applyNow() {
        const cps = ensureCps();
        return applyPreviewSettings(cps, { preview: true });
    }

    function applyFrame() {
        return applyPreviewSettingsCoalesced(ensureCps());
    }

    function markChanged() {
        setStatus('pending');
        State.isUISettingsDirty = true;
    }

    async function persistNow() {
        if (persisting) return persisting;
        if (!wasOpen) return false;
        sessionGeneration++;
        persisting = (async () => {
            const app = readAppearance();
            const saved = pickAppearance(State.userPreferences);
            const previousPreferences = JSON.parse(JSON.stringify(State.userPreferences || {}));
            let preferencesWritten = false;
            root.inert = true;
            State.userPreferences = { ...(State.userPreferences || {}), ...app };
            if (!app.isBackgroundCustom) {
                delete State.userPreferences.backgroundColor;
                delete State.userPreferences.backgroundAnchor;
            }
            if (!app.isTextCustom) delete State.userPreferences.customTextColor;
            let ok = false;
            try {
                if (!appearanceEqual(app, saved)) {
                    ok = await saveUserPreferences();
                    preferencesWritten = ok;
                } else ok = true;
                if (ok) {
                    await commitBackgroundImagePreview();
                    ok = commitFontSettingsPreview();
                }
            } catch (e) {
                ok = false;
                console.warn('[customization-studio] save failed', e);
            }
            if (!ok) {
                State.userPreferences = previousPreferences;
                if (preferencesWritten) await saveUserPreferences();
                try { await rollbackBackgroundImageCommit(); } catch (e) {
                    console.warn('[customization-studio] background rollback failed', e);
                }
                setStatus('error');
                return false;
            }
            acceptBackgroundImagePreview();
            setTheme(app.theme);
            applyMotionMode(app.motionMode);
            syncOriginalAfterSave(app);
            snapshot = app;
            snapshotFonts = loadFontSettings();
            previewSnapshot = JSON.parse(JSON.stringify(ensureCps()));
            setStatus('saved');
            return true;
        })();
        try {
            return await persisting;
        } finally {
            persisting = null;
            root.inert = false;
        }
    }

    function syncOriginalAfterSave(app) {
        if (State.originalUISettings && typeof State.originalUISettings === 'object') {
            Object.assign(State.originalUISettings, app);
            if (!app.isBackgroundCustom) {
                delete State.originalUISettings.backgroundColor;
                delete State.originalUISettings.backgroundAnchor;
            }
            if (!app.isTextCustom) delete State.originalUISettings.customTextColor;
        }
        const staticHeaderControl = document.querySelector('#customizeUIModal #toggleStaticHeader');
        if (staticHeaderControl) staticHeaderControl.checked = app.staticHeader;
        State.isUISettingsDirty = dirtyBeforeOpen;
    }

    // ----- Синхронизация контролов ---------------------------------------
    function syncRangeFill(input) {
        if (input) input.style.setProperty('--ac-fill', rangeFillPercent(input) + '%');
    }

    function syncShapeLabels(app) {
        const radius = $('#borderRadiusSlider');
        const density = $('#densitySlider');
        const radiusLabel = $('#borderRadiusPercentLabel');
        const densityLabel = $('#acDensityLabel');
        if (radius) {
            radius.value = String(app.borderRadius);
            syncRangeFill(radius);
            radius.setAttribute('aria-valuetext', radiusPercent(app.borderRadius) + '%');
        }
        if (density) {
            density.value = String(app.contentDensity);
            syncRangeFill(density);
        }
        if (radiusLabel) radiusLabel.textContent = radiusPercent(app.borderRadius) + '%';
        if (densityLabel) densityLabel.textContent = String(app.contentDensity);
    }

    function syncAccent(app) {
        const hex = normalizeHexLoose(app.primaryColor);
        let any = false;
        $$('#acSwatches .ac-swatch').forEach((b) => {
            const on = b.dataset.hex === hex;
            b.setAttribute('aria-checked', on ? 'true' : 'false');
            b.classList.toggle('is-selected', on);
            if (on) any = true;
        });
        const custom = $('#acSwatches .ac-swatch--custom');
        if (custom) {
            custom.classList.toggle('is-selected', !any);
            custom.setAttribute('aria-checked', !any ? 'true' : 'false');
            custom.style.setProperty('--sw', hex || '#888');
        }
    }

    function syncMotion(app) {
        const radio = $(`input[name="motionMode"][value="${app.motionMode}"]`);
        if (radio) radio.checked = true;
        $$('[data-motion-card]').forEach((c) =>
            c.classList.toggle('is-selected', c.dataset.motionCard === app.motionMode),
        );
        const note = $('#acMotionState');
        if (note) note.textContent = describeMotion(app.motionMode, getMotionLevel());
    }

    function syncTheme(app) {
        const radio = $(`input[name="themeMode"][value="${app.theme}"]`);
        if (radio) radio.checked = true;
        $$('[data-theme-card]').forEach((c) =>
            c.classList.toggle('is-selected', c.dataset.themeCard === app.theme),
        );
    }

    function syncPicker() {
        const cps = ensureCps();
        State.uiModalState = State.uiModalState || {};
        const target = State.uiModalState.currentColorTarget || 'elements';
        const radio = $(`#colorTargetSelector input[value="${target}"]`);
        if (radio) radio.checked = true;
        try {
            setColorPickerStateFromHex(resolveHexForCustomizationTarget(cps, State));
        } catch (e) {
            console.warn('[customization-studio] picker sync', e);
        }
    }

    function syncMaterial(app) {
        $$('input[name="surfaceMaterial"]').forEach((input) => { input.checked = input.value === app.surfaceMaterial; });
        ['glassMatte', 'glassRefraction'].forEach((key) => {
            const input = $('#' + key);
            if (input) { input.value = app[key]; input.disabled = app.surfaceMaterial !== 'glass'; syncRangeFill(input); }
            const output = $('#' + key + 'Value');
            if (output) output.textContent = app[key] + '%';
        });
        const controls = $('#acGlassControls');
        if (controls) controls.hidden = app.surfaceMaterial !== 'glass';
    }

    function syncAll() {
        const app = readAppearance();
        syncTheme(app);
        syncMaterial(app);
        syncAccent(app);
        syncShapeLabels(app);
        syncMotion(app);
        syncPicker();
        markActiveLook(app);
    }

    // ----- Образы и акценты -----------------------------------------------
    function renderSwatches() {
        const host = $('#acSwatches');
        if (!host || host.childElementCount) return;
        host.innerHTML =
            ACCENTS.map(
                (a) =>
                    `<button type="button" class="ac-swatch" role="radio" aria-checked="false" data-hex="${a.hex}" style="--sw:${a.hex}" title="${a.label}" aria-label="${a.label}"><i class="fas fa-check" aria-hidden="true"></i></button>`,
            ).join('') +
            `<button type="button" class="ac-swatch ac-swatch--custom" role="radio" aria-checked="false" title="Свой цвет — откроется вкладка «Цвета»" aria-label="Свой цвет"><i class="fas fa-eye-dropper" aria-hidden="true"></i></button>`;
    }

    function renderLooks() {
        const host = $('#acLooks');
        if (!host || host.childElementCount) return;
        host.innerHTML = LOOKS.map((l) => {
            const [bg, surf, acc, txt] = l.thumb;
            return `<button type="button" class="ac-look" data-look="${l.id}" title="${l.hint}" style="--lk-bg:${bg};--lk-surf:${surf};--lk-acc:${acc};--lk-txt:${txt}">
                <span class="ac-look-thumb" aria-hidden="true"><b></b><i></i><u></u></span>
                <span class="ac-look-name">${l.label}</span>
                <span class="ac-look-hint">${l.hint}</span>
            </button>`;
        }).join('');
    }

    function markActiveLook(app) {
        $$('#acLooks .ac-look').forEach((b) => {
            const look = LOOKS.find((l) => l.id === b.dataset.look);
            if (!look) return;
            const expected = applyLookToAppearance(app, look);
            const same = appearanceEqual({ ...expected, motionMode: app.motionMode, theme: look.appearance.theme || app.theme }, app);
            b.classList.toggle('is-selected', same);
            b.setAttribute('aria-pressed', same ? 'true' : 'false');
        });
    }

    function setAccent(hex) {
        State.uiModalState = State.uiModalState || {};
        State.uiModalState.currentColorTarget = 'elements';
        const app = { ...readAppearance(), primaryColor: normalizeHexLoose(hex) || THEME_DEFAULTS.primary };
        writeAppearance(app);
        syncAccent(app);
        markActiveLook(app);
        try {
            setColorPickerStateFromHex(app.primaryColor);
        } catch {
            /* пипетка ещё не готова */
        }
        const radio = $('#colorTargetSelector input[value="elements"]');
        if (radio) radio.checked = true;
        applyFrame();
        markChanged();
    }

    function applyLook(id) {
        const look = LOOKS.find((l) => l.id === id);
        if (!look) return;
        const prev = readAppearance();
        const next = applyLookToAppearance(prev, look);
        writeAppearance(next);
        if (next.theme !== prev.theme) void withThemeTransition(() => applyNow()).then(() => syncPicker());
        else applyNow();
        if (look.fonts) {
            const f = sanitizeFontSettings(look.fonts);
            applyFontSettings(f);
            saveFontSettings(f);
            remountFontSettings();
        }
        syncAll();
        markChanged();
    }

    // ----- Вкладки ---------------------------------------------------------
    function showPane(id, { focus = false } = {}) {
        if (!PANE_IDS.includes(id)) id = 'look';
        activePane = id;
        $$('.ac-tab').forEach((t) => {
            const on = t.dataset.pane === id;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
            if (on && focus) t.focus();
            if (on) t.scrollIntoView?.({ block: 'nearest', inline: 'center' });
        });
        $$('.ac-pane').forEach((p) => {
            p.hidden = p.dataset.pane !== id;
        });
        const resetBtn = $('#acResetPaneBtn');
        if (resetBtn) resetBtn.disabled = id === 'profiles';
        const panes = $('#acPanes');
        if (panes) panes.scrollTop = 0;
        try {
            window.sessionStorage.setItem(PANE_STORAGE_KEY, id);
        } catch {
            /* ignore */
        }
        if (id === 'colors') {
            try {
                initColorPicker();
                syncPicker();
            } catch (e) {
                console.warn('[customization-studio] picker init', e);
            }
        }
        if (id === 'fonts') remountFontSettings();
        if (id === 'motion') {
            syncMotion(readAppearance());
            playMotionDemo();
        }
    }

    // ----- Действия ---------------------------------------------------------
    function resetPane(id) {
        const def = defaultAppearance();
        const cur = readAppearance();
        let next = { ...cur };
        if (id === 'look') {
            next = { ...cur, theme: def.theme, primaryColor: def.primaryColor, ...MATERIAL_DEFAULTS };
        } else if (id === 'colors') {
            next = { ...cur, primaryColor: def.primaryColor, isBackgroundCustom: false, isTextCustom: false };
            delete next.backgroundColor;
            delete next.customTextColor;
        } else if (id === 'shape') {
            next = { ...cur, borderRadius: def.borderRadius, contentDensity: def.contentDensity };
        } else if (id === 'motion') {
            next = { ...cur, motionMode: 'auto' };
        } else if (id === 'fonts') {
            const f = { ...FONT_DEFAULTS };
            applyFontSettings(f);
            saveFontSettings(f);
            remountFontSettings();
            return;
        } else if (id === 'bg') {
            $('#backgroundImageRemoveBtn')?.click();
            return;
        } else {
            return;
        }
        writeAppearance(next);
        if (next.theme !== cur.theme) void withThemeTransition(() => applyNow()).then(() => syncPicker());
        else applyNow();
        syncAll();
        markChanged();
    }

    async function revertAll() {
        sessionGeneration++;
        if (persisting) await persisting;
        if (!snapshot) return;
        cancelPreviewSettingsFrame();
        State.currentPreviewSettings = JSON.parse(JSON.stringify(previewSnapshot));
        applyNow();
        // Restore the saved auto-mode subscription without writing a draft during rollback.
        const theme = readAppearance().theme;
        setTheme(theme, { preview: true, persistSystemChanges: theme === State.userPreferences?.theme });
        if (snapshotFonts) {
            applyFontSettings(snapshotFonts);
            saveFontSettings(snapshotFonts);
            remountFontSettings();
        }
        restoreBackgroundImagePreview();
        syncAll();
        State.isUISettingsDirty = dirtyBeforeOpen;
        setStatus('saved');
    }

    function applyProfile({ appearance, fonts, replace, sessionToken }) {
        if (!wasOpen || (sessionToken != null && sessionToken !== sessionGeneration)) return false;
        writeAppearance(pickAppearance({ ...(replace ? defaultAppearance() : readAppearance()), ...(appearance || {}) }));
        if (replace && !appearance) clearBackgroundImagePreview();
        if (fonts) {
            applyFontSettings(fonts);
            saveFontSettings(fonts);
            remountFontSettings();
        }
        applyNow();
        syncAll();
        markChanged();
        return true;
    }

    const DEMO_CAPTIONS = {
        full: 'Полные анимации: карточка выезжает, уведомление влетает, окно «всплывает».',
        calm: 'Спокойный режим: только короткое плавное появление, без движения и масштаба.',
        reduce: 'Движение отключено: всё появляется мгновенно, без анимации.',
    };

    function playMotionDemo() {
        const stage = $('#acMotionStage');
        if (!stage) return;
        const level = getMotionLevel();
        const caption = $('#acMotionDemoCaption');
        if (caption) caption.textContent = DEMO_CAPTIONS[level] || DEMO_CAPTIONS.full;
        stage.dataset.level = level;
        const actors = Array.from(stage.querySelectorAll('[data-demo], .ac-motion-chip'));
        actors.forEach((a) => a.classList.remove('is-playing', 'is-shown'));
        // перезапуск CSS-анимации
        void stage.offsetWidth;
        actors.forEach((a, i) => {
            a.style.setProperty('--demo-delay', level === 'full' ? `${i * 140}ms` : '0ms');
            a.classList.add('is-playing');
        });
        // «после»-состояние остаётся (акторы не исчезают), а в режиме reduce видно мгновенную подсветку
        stage.classList.remove('is-flash');
        void stage.offsetWidth;
        stage.classList.add('is-flash');
    }

    // ----- События -----------------------------------------------------------
    function onChange(e) {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.name === 'themeMode') {
            const prev = readAppearance();
            const next = { ...prev, theme: t.value };
            writeAppearance(next);
            syncTheme(next);
            markActiveLook(next);
            markChanged();
            // пипетка читает фактический цвет с экрана — обновляем её после того, как тема реально применена
            void withThemeTransition(() => applyNow()).then(() => syncPicker());
        } else if (t.name === 'surfaceMaterial') {
            const next = { ...readAppearance(), surfaceMaterial: t.value };
            writeAppearance(next);
            applyNow();
            syncAll();
            markChanged();
        } else if (t.name === 'motionMode') {
            const next = { ...readAppearance(), motionMode: sanitizeMotionMode(t.value) };
            writeAppearance(next);
            applyNow();
            syncMotion(next);
            markChanged();
            playMotionDemo();
        }
    }

    function onInput(e) {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.id === 'glassMatte' || t.id === 'glassRefraction') {
            const app = pickAppearance({ ...readAppearance(), [t.id]: t.value });
            writeAppearance(app);
            syncMaterial(app);
            applyFrame();
            markChanged();
        } else if (t.id === 'borderRadiusSlider') {
            const app = { ...readAppearance(), borderRadius: clampBorderRadiusPx(t.value) };
            writeAppearance(app);
            syncShapeLabels(app);
            applyFrame();
            markChanged();
        } else if (t.id === 'densitySlider') {
            const app = { ...readAppearance(), contentDensity: Math.round(Number(t.value)) };
            writeAppearance(app);
            syncShapeLabels(app);
            applyFrame();
            markChanged();
        }
    }

    function onClick(e) {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        const sw = t.closest('.ac-swatch');
        if (sw) {
            if (sw.classList.contains('ac-swatch--custom')) showPane('colors', { focus: true });
            else setAccent(sw.dataset.hex);
            return;
        }
        const look = t.closest('.ac-look');
        if (look) {
            applyLook(look.dataset.look);
            return;
        }
        const tab = t.closest('.ac-tab');
        if (tab) {
            showPane(tab.dataset.pane);
            return;
        }
        if (t.closest('#acResetPaneBtn')) {
            resetPane(activePane);
            return;
        }
        if (t.closest('#acResetColorsBtn')) {
            resetPane('colors');
            return;
        }
        if (t.closest('#appCustomizationCancelBtn')) {
            void revertAll();
            return;
        }
        if (t.closest('#acMotionDemoBtn')) {
            playMotionDemo();
            return;
        }
        if (t.closest('#acStatus') && statusEl?.dataset.state === 'error') {
            $('#appCustomizationSaveBtn')?.focus();
        }
    }

    function onTabKeydown(e) {
        const tab = e.target instanceof Element ? e.target.closest('.ac-tab') : null;
        if (!tab) return;
        const tabs = $$('.ac-tab');
        const i = tabs.indexOf(tab);
        let n = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n < 0) return;
        e.preventDefault();
        showPane(tabs[n].dataset.pane, { focus: true });
    }

    /** Любое взаимодействие внутри пипетки: пипетка уже применила предпросмотр — остаётся сохранить. */
    function onPickerActivity(e) {
        const inPicker = e.target instanceof Element && e.target.closest('#advancedColorPicker, #colorTargetSelector');
        if (!inPicker) return;
        if (e.type === 'change' && e.target instanceof HTMLInputElement && e.target.name === 'colorTarget') return;
        const app = readAppearance();
        syncAccent(app);
        markActiveLook(app);
        markChanged();
    }

    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onTabKeydown);
    root.addEventListener('customization-preview-change', markChanged);
    ['pointerup', 'keyup', 'change', 'input'].forEach((ev) => root.addEventListener(ev, onPickerActivity));

    // ----- Открытие / закрытие ---------------------------------------------
    function onOpen() {
        if (wasOpen) return;
        wasOpen = true;
        sessionGeneration++;
        renderSwatches();
        renderLooks();
        ensureCps();
        snapshot = readAppearance();
        previewSnapshot = JSON.parse(JSON.stringify(ensureCps()));
        dirtyBeforeOpen = State.isUISettingsDirty;
        snapshotFonts = loadFontSettings();
        beginFontSettingsPreview();
        beginBackgroundImagePreview();
        document.body.classList.add('ac-studio-open');
        let pane = 'look';
        try {
            pane = window.sessionStorage.getItem(PANE_STORAGE_KEY) || 'look';
        } catch {
            /* ignore */
        }
        try {
            initColorPicker();
        } catch (e) {
            console.warn('[customization-studio] picker init', e);
        }
        syncAll();
        showPane(pane);
        setStatus('saved');
        offMotion = onMotionChange(() => syncMotion(readAppearance()));
    }

    async function onClose() {
        if (!wasOpen) return;
        wasOpen = false;
        await revertAll();
        endFontSettingsPreview();
        endBackgroundImagePreview();
        document.body.classList.remove('ac-studio-open');
        if (offMotion) offMotion();
        offMotion = null;
    }

    const observer = new MutationObserver(() => {
        const open = !root.classList.contains('hidden');
        if (open) onOpen();
        else onClose();
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    if (!root.classList.contains('hidden')) onOpen();

    const api = {
        root,
        showPane,
        applyLook,
        setAccent,
        resetPane,
        applyProfile,
        revertAll,
        persistNow,
        discard: revertAll,
        markChanged,
        syncAll,
        getActivePane: () => activePane,
        isOpen: () => wasOpen,
        isSaving: () => Boolean(persisting),
        getSessionToken: () => sessionGeneration,
        destroy() {
            observer.disconnect();
            root.removeEventListener('change', onChange);
            root.removeEventListener('input', onInput);
            root.removeEventListener('click', onClick);
            root.removeEventListener('keydown', onTabKeydown);
            root.removeEventListener('customization-preview-change', markChanged);
            ['pointerup', 'keyup', 'change', 'input'].forEach((ev) =>
                root.removeEventListener(ev, onPickerActivity),
            );
            onClose();
            controller = null;
            if (typeof window !== 'undefined' && window.__copilotCustomizationStudio === api) {
                delete window.__copilotCustomizationStudio;
            }
        },
    };
    if (typeof window !== 'undefined') window.__copilotCustomizationStudio = api;
    return api;
}
