'use strict';

/**
 * Санитизация пользовательских настроек, прочитанных из IndexedDB / файла профиля.
 * Битое значение (строка вместо числа, «purple» вместо темы, #zzz вместо цвета и т.п.)
 * заменяется значением по умолчанию — приложение не должно ломаться из-за одного поля.
 *
 * Чистая функция: не зависит от DOM и IndexedDB.
 */

const THEMES = new Set(['light', 'dark', 'auto']);
const MOTION_MODES = new Set(['auto', 'calm', 'reduce']);
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const BOOLEAN_FIELDS = [
    'showBlacklistUsageWarning',
    'disableForcedBackupOnImport',
    'disableForcedBackupOnDbMerge',
    'staticHeader',
    'welcomeTextShownInitially',
    'onboardingTourCompleted',
    'onboardingTourAutoPromptConsumed',
    'backupReminderEnabled',
    'birthdayModeEnabled',
];

const OPTIONAL_COLOR_FIELDS = ['backgroundColor', 'customTextColor'];

function clampNumber(value, min, max, fallback, integer = false) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
    const c = Math.min(max, Math.max(min, n));
    return integer ? Math.round(c) : c;
}

/**
 * @param {Record<string, unknown>} prefs объединённые (дефолты + сохранённые) настройки
 * @param {Record<string, unknown>} defaults значения по умолчанию
 * @returns {{ prefs: Record<string, unknown>, fixes: string[] }}
 */
export function sanitizeUserPreferences(prefs, defaults) {
    const src = prefs && typeof prefs === 'object' ? prefs : {};
    const def = defaults && typeof defaults === 'object' ? defaults : {};
    const out = { ...src };
    const fixes = [];
    const fix = (key, value) => {
        if (out[key] !== value) fixes.push(key);
        out[key] = value;
    };

    fix('theme', THEMES.has(out.theme) ? out.theme : THEMES.has(def.theme) ? def.theme : 'dark');
    fix(
        'primaryColor',
        typeof out.primaryColor === 'string' && HEX_RE.test(out.primaryColor.trim())
            ? out.primaryColor.trim()
            : def.primaryColor,
    );
    OPTIONAL_COLOR_FIELDS.forEach((k) => {
        if (typeof out[k] === 'undefined' || out[k] === null || out[k] === '') return;
        if (!(typeof out[k] === 'string' && HEX_RE.test(out[k].trim()))) {
            fixes.push(k);
            delete out[k];
        }
    });
    if (typeof out.motionMode !== 'undefined') fix('motionMode', MOTION_MODES.has(out.motionMode) ? out.motionMode : 'auto');
    fix('fontSize', clampNumber(out.fontSize, 40, 250, def.fontSize ?? 80));
    fix('contentDensity', clampNumber(out.contentDensity, 0, 6, def.contentDensity ?? 3, true));
    fix('clientNotesFontSize', clampNumber(out.clientNotesFontSize, 70, 200, def.clientNotesFontSize ?? 100));
    if (typeof out.borderRadius !== 'undefined') fix('borderRadius', clampNumber(out.borderRadius, 0, 40, def.borderRadius ?? 8));
    fix('mainLayout', out.mainLayout === 'horizontal' ? 'horizontal' : (def.mainLayout ?? 'horizontal'));

    BOOLEAN_FIELDS.forEach((k) => {
        if (typeof out[k] === 'boolean') return;
        if (typeof out[k] === 'undefined') return;
        fix(k, typeof def[k] === 'boolean' ? def[k] : false);
    });

    if (typeof out.employeeExtension === 'undefined') out.employeeExtension = '';
    else if (typeof out.employeeExtension !== 'string') fix('employeeExtension', '');
    else if (out.employeeExtension.length > 32) fix('employeeExtension', out.employeeExtension.slice(0, 32));

    if (typeof out.textareaHeights === 'undefined') {
        out.textareaHeights = {};
    } else if (!out.textareaHeights || typeof out.textareaHeights !== 'object' || Array.isArray(out.textareaHeights)) {
        fix('textareaHeights', {});
    } else {
        const clean = {};
        let changed = false;
        Object.entries(out.textareaHeights).forEach(([k, v]) => {
            const n = clampNumber(v, 40, 4000, null);
            if (n === null) changed = true;
            else {
                clean[k] = n;
                if (n !== v) changed = true;
            }
        });
        if (changed) {
            fixes.push('textareaHeights');
            out.textareaHeights = clean;
        }
    }

    if (!Array.isArray(out.panelOrder)) fix('panelOrder', Array.isArray(def.panelOrder) ? [...def.panelOrder] : []);
    else out.panelOrder = out.panelOrder.filter((id) => typeof id === 'string');
    if (!Array.isArray(out.panelVisibility)) {
        fix('panelVisibility', Array.isArray(def.panelVisibility) ? [...def.panelVisibility] : []);
    }
    return { prefs: out, fixes };
}
