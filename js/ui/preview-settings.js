'use strict';

import { THEME_DEFAULTS, DEFAULT_BORDER_RADIUS_PX } from '../config.js';
import {
    normalizeHex6,
    normalizeColorToHex,
    applyPrimaryPairWithVerification,
} from './color-settings-engine.js';
import { applyBirthdayModeFromSettings } from '../features/birthday-mode.js';
import { applyMotionMode, sanitizeMotionMode } from '../utils/motion-pref.js';

/** Множители для пары фонов светлая/тёмная тема (должны совпадать с логикой buildPalette). */
export const UI_BG_THEME_FACTORS = Object.freeze({ darkRel: 0.75, lightRel: 0.2 });

/**
 * По базовому цвету фона (пипетка) возвращает фоны для светлой и тёмной темы.
 * Цвет «привязан» к теме, в которой выбран (options.activeTheme): в ней он показывается как есть,
 * а парный фон другой темы сохраняет оттенок, но имеет «свою» светлоту: из тёмного выбора получается
 * настоящий светлый фон (≈96%), из светлого — настоящий тёмный (≈9–13%).
 * Без привязки считаются оба парных значения.
 */
export function deriveThemeBackgroundPairFromHex(
    bgHex,
    hexToHslFn,
    hslToHexFn,
    adjustHslFn,
    options = {},
) {
    const baseHsl = hexToHslFn(bgHex);
    if (!baseHsl) return { light: bgHex, dark: bgHex };
    const { darkRel, lightRel } = UI_BG_THEME_FACTORS;
    const computedLight =
        baseHsl.l < 60
            ? hslToHexFn(baseHsl.h, Math.min(baseHsl.s, 45), 96)
            : hslToHexFn(
                  ...Object.values(adjustHslFn(baseHsl, Math.round((100 - baseHsl.l) * lightRel), 0)),
              );
    const computedDark =
        baseHsl.l > 40
            ? hslToHexFn(baseHsl.h, Math.min(baseHsl.s, 40), Math.round(8 + baseHsl.l * 0.05))
            : hslToHexFn(...Object.values(adjustHslFn(baseHsl, -Math.round(baseHsl.l * darkRel), 0)));

    const activeTheme = options?.activeTheme;
    if (activeTheme === 'dark') return { light: computedLight, dark: bgHex };
    if (activeTheme === 'light') return { light: bgHex, dark: computedDark };
    return { light: computedLight, dark: computedDark };
}

/**
 * Модуль применения предпросмотра настроек UI
 * Вынесено из script.js
 */

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let DEFAULT_UI_SETTINGS = null;
let calculateSecondaryColor = null;
let hexToHsl = null;
let hslToHex = null;
let adjustHsl = null;
let setTheme = null;

export function setPreviewSettingsDependencies(deps) {
    if (deps.DEFAULT_UI_SETTINGS !== undefined) DEFAULT_UI_SETTINGS = deps.DEFAULT_UI_SETTINGS;
    if (deps.calculateSecondaryColor !== undefined)
        calculateSecondaryColor = deps.calculateSecondaryColor;
    if (deps.hexToHsl !== undefined) hexToHsl = deps.hexToHsl;
    if (deps.hslToHex !== undefined) hslToHex = deps.hslToHex;
    if (deps.adjustHsl !== undefined) adjustHsl = deps.adjustHsl;
    if (deps.setTheme !== undefined) setTheme = deps.setTheme;
}

/**
 * Память последнего применённого состояния — по корневому элементу документа.
 * Ползунки и пипетка вызывают applyPreviewSettings десятки раз в секунду; без памяти каждый вызов
 * пересчитывал палитру, дёргал setTheme (классы, matchMedia, localStorage) и пересоздавал
 * ResizeObserver шапки. Теперь неизменившиеся блоки пропускаются.
 */
const appliedMemo = new WeakMap();
function memoFor(root) {
    let m = appliedMemo.get(root);
    if (!m) {
        m = {};
        appliedMemo.set(root, m);
    }
    return m;
}

let coalescedPending = null;
let coalescedRaf = 0;

/**
 * Версия applyPreviewSettings для частых событий (drag, input): не чаще одного применения за кадр,
 * применяется последнее значение.
 * @param {Object} settings
 * @returns {Promise<void>} резолвится после применения кадра
 */
export function applyPreviewSettingsCoalesced(settings) {
    coalescedPending = settings;
    if (coalescedRaf) return coalescedPending && Promise.resolve();
    return new Promise((resolve) => {
        const run = () => {
            coalescedRaf = 0;
            const next = coalescedPending;
            coalescedPending = null;
            Promise.resolve(applyPreviewSettings(next)).finally(resolve);
        };
        coalescedRaf =
            typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame(run)
                : setTimeout(run, 16);
    });
}

/** Отключает ResizeObserver фиксированной шапки (перед повторным включением или выключением). */
function disconnectStaticHeaderResizeObserver(staticWrapper) {
    if (staticWrapper && staticWrapper._staticHeaderResizeObserver) {
        staticWrapper._staticHeaderResizeObserver.disconnect();
        delete staticWrapper._staticHeaderResizeObserver;
    }
}

/**
 * Измеряет занимаемую шапкой высоту: max(offsetHeight, ceil(getBoundingClientRect)) — подстраховка от субпикселей.
 * @param {HTMLElement} staticWrapper
 * @returns {number}
 */
export function measureStaticHeaderReservePx(staticWrapper) {
    if (!staticWrapper || typeof staticWrapper.getBoundingClientRect !== 'function') return 180;
    let fromRect = 0;
    try {
        const rect = staticWrapper.getBoundingClientRect();
        if (rect && Number.isFinite(rect.height)) fromRect = Math.ceil(rect.height);
    } catch {
        fromRect = 0;
    }
    const fromOffset = staticWrapper.offsetHeight || 0;
    const merged = Math.max(fromRect, fromOffset);
    return merged > 0 ? merged : 180;
}

/** Дополнительный px-зазор под шапку (резерв поверх измерения). */
const STATIC_HEADER_SCROLL_BUFFER_PX = 8;

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Применяет настройки UI для предпросмотра
 * @param {Object} settings - Объект с настройками UI
 */
export async function applyPreviewSettings(settings) {
    if (typeof settings !== 'object' || settings === null) {
        settings = JSON.parse(JSON.stringify(DEFAULT_UI_SETTINGS));
    }
    const root = document.documentElement;
    const { style } = root;
    const body = document.body;

    let primaryRaw =
        settings?.primaryColor || (DEFAULT_UI_SETTINGS && DEFAULT_UI_SETTINGS.primaryColor);
    if (
        typeof primaryRaw !== 'string' ||
        !/^#[a-fA-F0-9]{3}([a-fA-F0-9]{3})?$/.test(primaryRaw.trim())
    ) {
        primaryRaw =
            (DEFAULT_UI_SETTINGS && DEFAULT_UI_SETTINGS.primaryColor) || THEME_DEFAULTS.primary;
    }
    const primaryNorm = normalizeHex6(primaryRaw.trim()) || normalizeHex6(THEME_DEFAULTS.primary);
    const { primary, secondary, verified } = applyPrimaryPairWithVerification(
        style,
        primaryNorm,
        calculateSecondaryColor,
    );
    if (typeof document !== 'undefined' && document.documentElement === root && !verified) {
        console.warn(
            '[color-settings] Повторная проверка --color-primary/--color-secondary не сошлась с записанным значением.',
            { primary, secondary },
        );
    }

    const bgHex =
        settings?.isBackgroundCustom && settings?.backgroundColor
            ? normalizeColorToHex(settings.backgroundColor)
            : null;
    const isTextCustom = !!settings?.isTextCustom && !!settings?.customTextColor;
    const customText = isTextCustom ? normalizeColorToHex(settings.customTextColor) : null;

    const darkRelFactor = UI_BG_THEME_FACTORS.darkRel;
    const lightRelFactor = UI_BG_THEME_FACTORS.lightRel;
    const mode = settings?.theme || settings?.themeMode || DEFAULT_UI_SETTINGS?.themeMode || 'dark';
    const activeTheme =
        mode === 'dark'
            ? 'dark'
            : mode === 'light'
              ? 'light'
              : typeof window !== 'undefined' &&
                  window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
                ? 'dark'
                : 'light';

    // Палитра отталкивается от СТАНДАРТНЫХ цветов темы: при фоне, равном стандартному, она в точности
    // совпадает со стандартной (никакого скачка при первом движении пипетки), а при другом фоне
    // стандартные поверхности/рамки сдвигаются на ту же разницу по тону, насыщенности и светлоте.
    const ANCHOR = {
        dark: {
            bg: '#12121f', surf1: '#27273f', surf2: '#363653', border: '#3a3a52', input: '#2f2f4a',
            textP: '#ffffff', textS: '#b0b0b0', hover: 'rgba(255, 255, 255, 0.1)',
        },
        light: {
            bg: '#f9fafb', surf1: '#f3f4f6', surf2: '#ffffff', border: '#d1d5db', input: '#f9fafb',
            textP: '#111827', textS: '#4b5563', hover: 'rgba(0, 0, 0, 0.055)',
        },
    };
    const clampPct = (v) => Math.max(0, Math.min(100, v));
    const buildAnchoredPalette = (hsl, isDark) => {
        const a = isDark ? ANCHOR.dark : ANCHOR.light;
        const base = hexToHsl(a.bg);
        // свой фон слишком далёк от стандартного по светлоте — контраст текста надёжнее считать заново
        if (!base || (isDark ? hsl.l > 42 : hsl.l < 58)) return null;
        let dH = hsl.h - base.h;
        if (dH > 180) dH -= 360;
        if (dH < -180) dH += 360;
        const dS = hsl.s - base.s;
        const dL = hsl.l - base.l;
        const shift = (hex, lk = 1) => {
            const c = hexToHsl(hex);
            if (!c) return hex;
            const h = (c.h + dH + 360) % 360;
            return hslToHex(h, clampPct(c.s + dS), clampPct(c.l + dL * lk));
        };
        const surf1 = shift(a.surf1);
        const surf2 = shift(a.surf2);
        const border = shift(a.border);
        const input = shift(a.input);
        const text = customText
            ? { p: customText, s: customText }
            : { p: a.textP, s: a.textS };
        return { textP: text.p, textS: text.s, surf1, surf2, border, input, hover: a.hover };
    };

    const buildPalette = (themeBgHex, isDarkSlot) => {
        if (!themeBgHex) return null;
        const hsl = hexToHsl(themeBgHex);
        if (!hsl) return null;
        const anchored = buildAnchoredPalette(hsl, isDarkSlot);
        if (anchored) return anchored;
        const isDark = isDarkSlot;
        const darkBoost = Math.round(hsl.l * darkRelFactor);
        const lightBoost = Math.round((100 - hsl.l) * lightRelFactor);

        let textP = customText
            ? customText
            : hslToHex(...Object.values(adjustHsl(hsl, isDark ? 85 : -85, -30)));
        let textS = customText
            ? customText
            : hslToHex(...Object.values(adjustHsl(hsl, isDark ? 60 : -60, -15)));

        const dimPoints = Math.max(0, Math.min(30, Number(settings?.darkTextDimPoints ?? 12)));
        const MIN_DARK_TEXT_L = 58;
        if (isDark && !customText) {
            const tp = hexToHsl(textP);
            const ts = hexToHsl(textS);
            const tpL = Math.max(MIN_DARK_TEXT_L, tp.l - dimPoints);
            const tsL = Math.max(MIN_DARK_TEXT_L - 6, ts.l - Math.max(6, dimPoints - 4));
            textP = hslToHex(tp.h, tp.s, tpL);
            textS = hslToHex(ts.h, ts.s, tsL);
        }

        const surf1 = hslToHex(
            ...Object.values(adjustHsl(hsl, isDark ? -(6 + darkBoost) : 6 + lightBoost, -5)),
        );
        const surf2 = hslToHex(
            ...Object.values(adjustHsl(hsl, isDark ? -(10 + darkBoost) : 10 + lightBoost, -8)),
        );
        const borderL = isDark ? Math.min(72, hsl.l + 8) : Math.max(20, hsl.l - 22);
        const borderS = Math.max(0, Math.min(100, hsl.s - (isDark ? 18 : 10)));
        const border = hslToHex(hsl.h, borderS, borderL);
        const input = hslToHex(...Object.values(adjustHsl(hsl, isDark ? 3 : -3, -5)));
        const hover = hslToHex(
            ...Object.values(adjustHsl(hexToHsl(surf1), isDark ? 6 : -6, isDark ? -6 : 6)),
        );

        return { textP, textS, surf1, surf2, border, input, hover };
    };

    const memo = memoFor(root);
    const paletteKey = [
        bgHex || '',
        customText || '',
        activeTheme,
        settings?.backgroundAnchor || '',
        Number(settings?.darkTextDimPoints ?? 12),
    ].join('|');
    // Память верна, только пока переменные палитры реально стоят на элементе (метка в самом style):
    // если инлайн-стили кто-то очистил (сброс оформления, тесты), палитра пересчитывается.
    const paletteUnchanged =
        memo.paletteKey === paletteKey && root.style.getPropertyValue('--ac-palette-key') === paletteKey;
    memo.paletteKey = paletteKey;
    root.style.setProperty('--ac-palette-key', paletteKey);

    if (paletteUnchanged) {
        /* палитра фона/текста не менялась — пропускаем пересчёт ~20 CSS-переменных */
    } else if (bgHex) {
        const { light: bgLight, dark: bgDark } = deriveThemeBackgroundPairFromHex(
            bgHex,
            hexToHsl,
            hslToHex,
            adjustHsl,
            { activeTheme: settings?.backgroundAnchor === 'light' || settings?.backgroundAnchor === 'dark' ? settings.backgroundAnchor : activeTheme },
        );
        const palLight = buildPalette(bgLight, false);
        const palDark = buildPalette(bgDark, true);

        if (palLight && palDark) {
            body.classList.add('custom-background-active');

            style.setProperty('--override-background-light', bgLight);
            style.setProperty('--override-background-dark', bgDark);

            style.setProperty('--override-text-primary-light', palLight.textP);
            style.setProperty('--override-text-secondary-light', palLight.textS);
            style.setProperty('--override-surface-1-light', palLight.surf1);
            style.setProperty('--override-surface-2-light', palLight.surf2);
            style.setProperty('--override-border-light', palLight.border);
            style.setProperty('--override-input-bg-light', palLight.input);
            style.setProperty('--override-hover-light', palLight.hover);
            style.setProperty('--override-scrollbar-track-light', palLight.surf2);
            style.setProperty(
                '--override-scrollbar-thumb-light',
                `color-mix(in srgb, ${palLight.textS} 45%, transparent)`,
            );

            style.setProperty('--override-text-primary-dark', palDark.textP);
            style.setProperty('--override-text-secondary-dark', palDark.textS);
            style.setProperty('--override-surface-1-dark', palDark.surf1);
            style.setProperty('--override-surface-2-dark', palDark.surf2);
            style.setProperty('--override-border-dark', palDark.border);
            style.setProperty('--override-input-bg-dark', palDark.input);
            style.setProperty('--override-hover-dark', palDark.hover);
            style.setProperty('--override-scrollbar-track-dark', palDark.surf2);
            style.setProperty(
                '--override-scrollbar-thumb-dark',
                `color-mix(in srgb, ${palDark.textS} 45%, transparent)`,
            );
        } else {
            body.classList.remove('custom-background-active');
        }
    } else {
        body.classList.remove('custom-background-active');
        [
            '--override-background-light',
            '--override-background-dark',
            '--override-text-primary-light',
            '--override-text-secondary-light',
            '--override-surface-1-light',
            '--override-surface-2-light',
            '--override-border-light',
            '--override-input-bg-light',
            '--override-hover-light',
            '--override-scrollbar-track-light',
            '--override-scrollbar-thumb-light',
            '--override-text-primary-dark',
            '--override-text-secondary-dark',
            '--override-surface-1-dark',
            '--override-surface-2-dark',
            '--override-border-dark',
            '--override-input-bg-dark',
            '--override-hover-dark',
            '--override-scrollbar-track-dark',
            '--override-scrollbar-thumb-dark',
        ].forEach((v) => style.removeProperty(v));
    }

    const themeMode = settings?.theme || settings?.themeMode || DEFAULT_UI_SETTINGS.themeMode;
    const expectedDark = activeTheme === 'dark';
    const themeInSync =
        memo.themeMode === themeMode &&
        root.classList.contains('dark') === expectedDark &&
        !!root.dataset.theme;
    if (!themeInSync) {
        memo.themeMode = themeMode;
        setTheme(themeMode);
    }

    const fontSizePercent = Number.isFinite(settings?.fontSize) ? settings.fontSize : 80;
    root.style.setProperty('--root-font-size', `${fontSizePercent}%`);
    root.style.fontSize = `${fontSizePercent}%`;

    const radiusRaw = settings?.borderRadius;
    const hasUnit = typeof radiusRaw === 'string' && /[a-z%]+$/i.test(radiusRaw.trim());
    // Ползунок 0–20 → фактический базовый радиус: до 5 px — 1:1 (стандарт не меняется), дальше плавнее,
    // иначе производные радиусы (×1.25…×2.25) на максимуме превращали мелкие элементы в «таблетки» и налезали друг на друга.
    const sliderPx = Number.isFinite(radiusRaw) ? radiusRaw : DEFAULT_BORDER_RADIUS_PX;
    const effectivePx = sliderPx <= 5 ? sliderPx : Math.round((5 + (sliderPx - 5) * 0.45) * 10) / 10;
    const radiusValue = hasUnit ? radiusRaw.trim() : `${effectivePx}px`;
    root.style.setProperty('--border-radius', radiusValue);

    const density = Number.isFinite(settings?.contentDensity) ? settings.contentDensity : 3;
    // 3 — стандарт (0.75rem). Ниже стандарта шаг мельче и есть пол 0.4rem: на «Компактно» панели не должны терять внутренние отступы.
    const dClamped = Math.max(0, Math.min(6, density));
    const contentSpacingRem =
        dClamped <= 3 ? 0.4 + dClamped * ((0.75 - 0.4) / 3) : 0.75 + (dClamped - 3) * 0.25;
    root.style.setProperty('--content-spacing', `${Math.round(contentSpacingRem * 1000) / 1000}rem`);
    // Масштаб плотности для структурных элементов (карточки, вкладки, отступы страницы): 0 → 0.6, 3 → 1, 6 → 1.4
    root.style.setProperty('--density-scale', String(Math.round((0.6 + Math.max(0, Math.min(6, density)) * (0.8 / 6)) * 1000) / 1000));

    const appContent = document.getElementById('appContent');
    const staticWrapper = document.getElementById('staticHeaderWrapper');
    const staticWanted = settings?.staticHeader === true;
    const staticInSync =
        memo.staticHeader === staticWanted &&
        (staticWanted
            ? !!staticWrapper?._staticHeaderResizeObserver
            : !staticWrapper?.classList.contains('header-sticky'));
    if (appContent && staticWrapper && !staticInSync) {
        memo.staticHeader = staticWanted;
        if (settings?.staticHeader === true) {
            disconnectStaticHeaderResizeObserver(staticWrapper);
            staticWrapper.classList.add('header-sticky');
            appContent.classList.add('has-static-header');
            const updateHeight = () => {
                if (!appContent.classList.contains('has-static-header')) return;
                const raw = measureStaticHeaderReservePx(staticWrapper);
                const inset = raw + STATIC_HEADER_SCROLL_BUFFER_PX;
                appContent.style.setProperty('--static-header-height', `${raw}px`);
                appContent.style.setProperty('--static-header-scroll-inset', `${inset}px`);
                /* Inline — надёжнее утилит Tailwind (py-*), которые иначе могут «перебить» padding-top из листа. */
                appContent.style.setProperty('padding-top', `${inset}px`);
            };
            updateHeight();
            requestAnimationFrame(() => {
                updateHeight();
                requestAnimationFrame(updateHeight);
            });
            const ro = new ResizeObserver(() => {
                requestAnimationFrame(updateHeight);
            });
            ro.observe(staticWrapper);
            staticWrapper._staticHeaderResizeObserver = ro;
        } else {
            staticWrapper.classList.remove('header-sticky');
            appContent.classList.remove('has-static-header');
            appContent.style.removeProperty('--static-header-height');
            appContent.style.removeProperty('--static-header-scroll-inset');
            appContent.style.removeProperty('padding-top');
            disconnectStaticHeaderResizeObserver(staticWrapper);
        }
    }

    if (typeof settings?.motionMode !== 'undefined') {
        const motionMode = sanitizeMotionMode(settings.motionMode);
        if (memo.motionMode !== motionMode) {
            memo.motionMode = motionMode;
            applyMotionMode(motionMode);
        }
    }

    const birthdayWanted = settings?.birthdayModeEnabled === true;
    if (memo.birthday !== birthdayWanted || birthdayWanted) {
        memo.birthday = birthdayWanted;
        applyBirthdayModeFromSettings(settings);
    }
}
