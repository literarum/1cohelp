'use strict';

/**
 * Профили оформления: пресеты, экспорт/импорт JSON, полный сброс оформления.
 *
 * Профиль = внешний вид из userPreferences (тема, цвета, скругления, плотность, фиксированная шапка)
 * + настройки шрифтов (localStorage). Импорт проходит строгую проверку схемы и санитизацию,
 * применение — через сохранение в IndexedDB и перезагрузку страницы (единственный способ гарантированно
 * пройти весь штатный конвейер применения оформления).
 *
 * Чистые функции (buildAppearanceProfile / parseAppearanceProfile / PRESETS) не зависят от DOM.
 */

import { sanitizeUserPreferences } from '../app/user-preferences-sanitize.js';
import { sanitizeFontSettings, FONT_DEFAULTS, loadFontSettings, saveFontSettings } from './font-settings.js';

export const PROFILE_FORMAT = 'copilot-appearance';
export const PROFILE_VERSION = 1;

/** Ключи userPreferences, входящие в профиль оформления. */
export const APPEARANCE_KEYS = [
    'theme',
    'primaryColor',
    'backgroundColor',
    'isBackgroundCustom',
    'customTextColor',
    'isTextCustom',
    'borderRadius',
    'contentDensity',
    'staticHeader',
    'motionMode',
];

const MAX_PROFILE_BYTES = 64 * 1024;

export const PRESETS = [
    { id: 'default', label: 'По умолчанию', hint: 'Исходное оформление', appearance: null, fonts: { ...FONT_DEFAULTS } },
    {
        id: 'contrast-dark',
        label: 'Контрастный тёмный',
        hint: 'Чёрный фон, белый текст, жёлтый акцент',
        appearance: {
            theme: 'dark', primaryColor: '#facc15', backgroundColor: '#000000', isBackgroundCustom: true,
            customTextColor: '#ffffff', isTextCustom: true,
        },
        fonts: { ...FONT_DEFAULTS },
    },
    {
        id: 'contrast-light',
        label: 'Контрастный светлый',
        hint: 'Белый фон, чёрный текст, синий акцент',
        appearance: {
            theme: 'light', primaryColor: '#1d4ed8', backgroundColor: '#ffffff', isBackgroundCustom: true,
            customTextColor: '#000000', isTextCustom: true,
        },
        fonts: { ...FONT_DEFAULTS },
    },
    { id: 'compact', label: 'Компактный', hint: 'Мельче текст, меньше скругления', appearance: { borderRadius: 4 }, fonts: { ...FONT_DEFAULTS, scale: 90, line: 95 } },
    { id: 'large', label: 'Крупный текст', hint: 'Крупнее шрифт и интервал', appearance: null, fonts: { ...FONT_DEFAULTS, scale: 115, line: 120 } },
];

/** @param {Record<string, unknown>} prefs @param {Record<string, unknown>} fonts */
export function buildAppearanceProfile(prefs, fonts, now = new Date()) {
    const appearance = {};
    APPEARANCE_KEYS.forEach((k) => {
        if (prefs && typeof prefs[k] !== 'undefined') appearance[k] = prefs[k];
    });
    return {
        format: PROFILE_FORMAT,
        version: PROFILE_VERSION,
        exportedAt: now.toISOString(),
        appearance,
        fonts: sanitizeFontSettings(fonts),
    };
}

/**
 * Разбор и проверка профиля из текста файла.
 * @param {string} text
 * @param {Record<string, unknown>} defaults значения по умолчанию для санитизации
 * @returns {{ ok: true, appearance: Record<string, unknown>, fonts: Record<string, unknown>, fixes: string[] } | { ok: false, error: string }}
 */
export function parseAppearanceProfile(text, defaults = {}) {
    if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'Файл пуст.' };
    if (text.length > MAX_PROFILE_BYTES) return { ok: false, error: 'Файл слишком большой для профиля оформления.' };
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return { ok: false, error: 'Файл не является корректным JSON.' };
    }
    if (!data || typeof data !== 'object' || data.format !== PROFILE_FORMAT) {
        return { ok: false, error: 'Это не профиль оформления Copilot 1СО (нет метки формата).' };
    }
    if (!Number.isFinite(data.version) || data.version > PROFILE_VERSION) {
        return { ok: false, error: 'Профиль создан более новой версией приложения.' };
    }
    const rawAppearance = data.appearance && typeof data.appearance === 'object' ? data.appearance : {};
    const picked = {};
    APPEARANCE_KEYS.forEach((k) => {
        if (typeof rawAppearance[k] !== 'undefined') picked[k] = rawAppearance[k];
    });
    const { prefs, fixes } = sanitizeUserPreferences({ ...defaults, ...picked }, defaults);
    const appearance = {};
    APPEARANCE_KEYS.forEach((k) => {
        if (typeof picked[k] !== 'undefined' && typeof prefs[k] !== 'undefined') appearance[k] = prefs[k];
    });
    return { ok: true, appearance, fonts: sanitizeFontSettings(data.fonts), fixes };
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

async function getDeps() {
    const [{ State }, prefsMod, notif, confirmMod] = await Promise.all([
        import('../app/state.js'),
        import('../app/user-preferences.js'),
        import('../services/notification.js'),
        import('./app-confirm-modal.js'),
    ]);
    return { State, saveUserPreferences: prefsMod.saveUserPreferences, NotificationService: notif.NotificationService, showAppConfirm: confirmMod.showAppConfirm };
}

async function applyAndReload({ appearance, fonts, replace }) {
    const { State, saveUserPreferences, NotificationService } = await getDeps();
    if (!State.userPreferences) State.userPreferences = {};
    if (replace) APPEARANCE_KEYS.forEach((k) => delete State.userPreferences[k]);
    Object.assign(State.userPreferences, appearance || {});
    const ok = await saveUserPreferences();
    saveFontSettings(fonts || loadFontSettings());
    if (!ok) {
        NotificationService.add('Не удалось сохранить оформление в базе. Шрифты применены.', 'error', { duration: 6000 });
        return;
    }
    NotificationService.add('Оформление сохранено. Перезагружаю страницу…', 'success', { duration: 1500 });
    setTimeout(() => window.location.reload(), 900);
}

function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function buildSection() {
    const sec = document.createElement('section');
    sec.className = 'app-customization-section appearance-profile-section';
    sec.setAttribute('aria-labelledby', 'acm-profile-heading');
    sec.innerHTML = `
        <h3 id="acm-profile-heading" class="app-customization-section-title ac-title">Профили</h3>
        <p class="app-customization-section-hint ac-hint">Перенос оформления между браузерами и компьютерами и полный сброс. Готовые образы — на вкладке «Оформление».</p>
        <div class="ap-actions ap-actions--cards">
            <button type="button" class="ap-btn ap-card" data-ap="export">
                <span class="ap-card__icon" aria-hidden="true"><i class="fas fa-file-export"></i></span>
                <span class="ap-card__text"><b>Экспорт профиля</b><small>Сохранить оформление в файл .json</small></span>
            </button>
            <button type="button" class="ap-btn ap-card" data-ap="import">
                <span class="ap-card__icon" aria-hidden="true"><i class="fas fa-file-import"></i></span>
                <span class="ap-card__text"><b>Импорт профиля</b><small>Загрузить оформление из файла</small></span>
            </button>
            <button type="button" class="ap-btn ap-btn--danger ap-card" data-ap="reset">
                <span class="ap-card__icon" aria-hidden="true"><i class="fas fa-rotate-left"></i></span>
                <span class="ap-card__text"><b>Сбросить всё оформление</b><small>Вернуть цвета, шрифты, форму и фон к стандартным</small></span>
            </button>
            <input type="file" accept="application/json,.json" hidden data-ap-file>
        </div>
        <p class="ap-note">Аварийный сброс, если интерфейс не открывается: добавьте к адресу <code>?resetUi=1</code>.</p>`;

    sec.addEventListener('click', async (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        try {
            const presetBtn = t.closest('[data-ap-preset]');
            if (presetBtn) {
                const preset = PRESETS.find((p) => p.id === presetBtn.getAttribute('data-ap-preset'));
                if (!preset) return;
                const { showAppConfirm } = await getDeps();
                const ok = await showAppConfirm({
                    title: `Пресет «${preset.label}»`,
                    message: 'Текущее оформление будет заменено, страница перезагрузится. Продолжить?',
                    confirmText: 'Применить',
                });
                if (ok) await applyAndReload({ appearance: preset.appearance, fonts: preset.fonts, replace: true });
                return;
            }
            const act = t.closest('[data-ap]')?.getAttribute('data-ap');
            if (act === 'export') {
                const { State } = await getDeps();
                const profile = buildAppearanceProfile(State.userPreferences || {}, loadFontSettings());
                download(`copilot-appearance-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(profile, null, 2));
            } else if (act === 'import') {
                sec.querySelector('[data-ap-file]').click();
            } else if (act === 'reset') {
                const { showAppConfirm } = await getDeps();
                const ok = await showAppConfirm({
                    title: 'Сбросить всё оформление?',
                    message: 'Тема, цвета, скругления, плотность и шрифты вернутся к исходным. Данные (закладки, заметки и т. д.) не затрагиваются.',
                    confirmText: 'Сбросить',
                    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
                });
                if (ok) await applyAndReload({ appearance: null, fonts: { ...FONT_DEFAULTS }, replace: true });
            }
        } catch (err) {
            console.warn('[appearance-profile]', err);
        }
    });

    sec.querySelector('[data-ap-file]').addEventListener('change', async (e) => {
        const input = e.target;
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        const { NotificationService, showAppConfirm } = await getDeps();
        if (file.size > MAX_PROFILE_BYTES) {
            NotificationService.add('Файл слишком большой для профиля оформления.', 'error', { duration: 5000 });
            return;
        }
        const res = parseAppearanceProfile(await file.text(), {});
        if (!res.ok) {
            NotificationService.add(`Профиль не загружен: ${res.error}`, 'error', { duration: 6000 });
            return;
        }
        const keys = Object.keys(res.appearance).length;
        const ok = await showAppConfirm({
            title: 'Применить профиль оформления?',
            message: `Параметров оформления: ${keys}, шрифты: ${res.fonts.ui}/${res.fonts.mono}, ${res.fonts.scale}%.${res.fixes.length ? ` Исправлено некорректных значений: ${res.fixes.length}.` : ''} Страница перезагрузится.`,
            confirmText: 'Применить',
        });
        if (ok) await applyAndReload({ appearance: res.appearance, fonts: res.fonts, replace: true });
    });
    return sec;
}

export function mountAppearanceProfileSection() {
    const target =
        document.querySelector('#appCustomizationModal [data-ac-mount="profiles"]') ||
        document.querySelector('#appCustomizationModal .app-customization-stack');
    if (!target) return false;
    if (target.querySelector('.appearance-profile-section')) return true;
    target.appendChild(buildSection());
    return true;
}

/** ?resetUi=1: после готовности БД очищает оформление в настройках, убирает параметр из адреса и перезагружает. */
async function runEmergencyReset() {
    const { State } = await getDeps();
    const started = Date.now();
    while (!(State.db && State.userPreferences) && Date.now() - started < 60000) {
        await new Promise((r) => setTimeout(r, 400));
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('resetUi');
    url.searchParams.delete('resetFonts');
    try {
        window.history.replaceState(null, '', url.toString());
    } catch {
        /* ignore */
    }
    if (!(State.db && State.userPreferences)) return;
    await applyAndReload({ appearance: null, fonts: { ...FONT_DEFAULTS }, replace: true });
}

export function initAppearanceProfile() {
    try {
        if (new URLSearchParams(window.location.search).get('resetUi') === '1') {
            void runEmergencyReset().catch((e) => console.warn('[appearance-profile] resetUi', e));
        }
    } catch {
        /* ignore */
    }
    const run = () => {
        if (!mountAppearanceProfileSection()) setTimeout(mountAppearanceProfileSection, 1500);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
}
