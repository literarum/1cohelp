'use strict';

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
    if (deps.calculateSecondaryColor !== undefined) calculateSecondaryColor = deps.calculateSecondaryColor;
    if (deps.hexToHsl !== undefined) hexToHsl = deps.hexToHsl;
    if (deps.hslToHex !== undefined) hslToHex = deps.hslToHex;
    if (deps.adjustHsl !== undefined) adjustHsl = deps.adjustHsl;
    if (deps.setTheme !== undefined) setTheme = deps.setTheme;
}

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

    const primary = settings?.primaryColor || DEFAULT_UI_SETTINGS.primaryColor;
    style.setProperty('--color-primary', primary);
    style.setProperty('--color-secondary', calculateSecondaryColor(primary));

    const bgHex =
        settings?.isBackgroundCustom && settings?.backgroundColor ? settings.backgroundColor : null;
    const isTextCustom = !!settings?.isTextCustom && !!settings?.customTextColor;
    const customText = isTextCustom ? settings.customTextColor : null;

    const darkRelFactor = 0.75;
    const lightRelFactor = 0.2;

    const buildPalette = (isDark) => {
        if (!bgHex) return null;
        const hsl = hexToHsl(bgHex);
        if (!hsl) return null;
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
        const border = hslToHex(...Object.values(adjustHsl(hsl, isDark ? 12 : -12, -10)));
        const input = hslToHex(...Object.values(adjustHsl(hsl, isDark ? 3 : -3, -5)));
        const hover = hslToHex(
            ...Object.values(adjustHsl(hexToHsl(surf1), isDark ? 6 : -6, isDark ? -6 : 6)),
        );

        return { textP, textS, surf1, surf2, border, input, hover };
    };

    const palLight = buildPalette(false);
    const palDark = buildPalette(true);

    if (bgHex && palLight && palDark) {
        body.classList.add('custom-background-active');

        const baseHsl = hexToHsl(bgHex);
        const bgLight = baseHsl
            ? hslToHex(
                  ...Object.values(
                      adjustHsl(baseHsl, Math.round((100 - baseHsl.l) * lightRelFactor), 0),
                  ),
              )
            : bgHex;
        const bgDark = baseHsl
            ? hslToHex(
                  ...Object.values(adjustHsl(baseHsl, -Math.round(baseHsl.l * darkRelFactor), 0)),
              )
            : bgHex;
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
        style.setProperty('--override-scrollbar-thumb-light', palLight.border);

        style.setProperty('--override-text-primary-dark', palDark.textP);
        style.setProperty('--override-text-secondary-dark', palDark.textS);
        style.setProperty('--override-surface-1-dark', palDark.surf1);
        style.setProperty('--override-surface-2-dark', palDark.surf2);
        style.setProperty('--override-border-dark', palDark.border);
        style.setProperty('--override-input-bg-dark', palDark.input);
        style.setProperty('--override-hover-dark', palDark.hover);
        style.setProperty('--override-scrollbar-track-dark', palDark.surf2);
        style.setProperty('--override-scrollbar-thumb-dark', palDark.border);
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

    setTheme(settings?.theme || settings?.themeMode || DEFAULT_UI_SETTINGS.themeMode);

    const fontSizePercent = Number.isFinite(settings?.fontSize) ? settings.fontSize : 80;
    root.style.setProperty('--root-font-size', `${fontSizePercent}%`);
    root.style.fontSize = `${fontSizePercent}%`;

    const radiusRaw = settings?.borderRadius;
    const hasUnit = typeof radiusRaw === 'string' && /[a-z%]+$/i.test(radiusRaw.trim());
    const radiusValue = hasUnit
        ? radiusRaw.trim()
        : `${Number.isFinite(radiusRaw) ? radiusRaw : 8}px`;
    root.style.setProperty('--border-radius', radiusValue);

    const density = Number.isFinite(settings?.contentDensity) ? settings.contentDensity : 3;
    root.style.setProperty('--content-spacing', `${density * 0.25}rem`);
}
