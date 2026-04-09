'use strict';

/**
 * Профессиональное ядро настройки цветов UI: нормализация, WCAG-контраст,
 * двойная проверка применения критичных CSS-переменных (--color-primary и др.).
 * Единая точка для согласованности между preview-settings, color-picker и тестами.
 */

import { getLuminance } from '../utils/color.js';

/** @param {string} [input] */
export function normalizeHex6(input) {
    if (!input || typeof input !== 'string') return null;
    let hex = input.trim().replace(/^#/, '');
    if (hex.length === 3) {
        hex = hex
            .split('')
            .map((c) => c + c)
            .join('');
    }
    if (hex.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(hex)) return null;
    return `#${hex.toLowerCase()}`;
}

/**
 * Нормализует CSS-цвет в #rrggbb.
 * Поддержка legacy-персиста: значения вида rgb(...) / rgba(...).
 * Для полностью прозрачного rgba(..., 0) возвращает null.
 * @param {string} [input]
 */
export function normalizeColorToHex(input) {
    const hex = normalizeHex6(input);
    if (hex) return hex;
    if (!input || typeof input !== 'string') return null;
    const raw = input.trim();
    if (!raw) return null;
    if (/^transparent$/i.test(raw)) return null;

    const m = raw.match(
        /^rgba?\(\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})(?:\s*[/,]\s*([0-9.]+)\s*)?\)$/i,
    );
    if (!m) return null;
    const alpha = m[4] !== undefined ? Number(m[4]) : 1;
    if (Number.isFinite(alpha) && alpha <= 0) return null;

    const clamp = (n) => Math.max(0, Math.min(255, Number(n)));
    const toHex = (n) => clamp(n).toString(16).padStart(2, '0');
    return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

/**
 * WCAG 2.x relative luminance contrast (sRGB).
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
export function contrastRatio(hexA, hexB) {
    const a = normalizeHex6(hexA);
    const b = normalizeHex6(hexB);
    if (!a || !b) return 0;
    const L1 = getLuminance(a);
    const L2 = getLuminance(b);
    const light = Math.max(L1, L2);
    const dark = Math.min(L1, L2);
    return (light + 0.05) / (dark + 0.05);
}

/**
 * Акцентный цвет как фон кнопки с белым текстом (--color-text-on-primary).
 * WCAG 2.2: нетекстовые компоненты UI — обычно отсчитывают от 3:1 (non-text contrast / graphical).
 */
export function evaluatePrimaryOnWhiteText(primaryHex) {
    const hex = normalizeHex6(primaryHex);
    if (!hex) {
        return {
            ok: false,
            ratio: 0,
            meetsUiNonTextAA: false,
            meetsNormalTextAA: false,
        };
    }
    const ratio = contrastRatio('#ffffff', hex);
    return {
        ok: true,
        ratio,
        meetsUiNonTextAA: ratio >= 3,
        meetsNormalTextAA: ratio >= 4.5,
    };
}

/**
 * Пользовательский цвет текста на нейтральных фонах предпросмотра.
 */
export function evaluateTextOnNeutral(textHex, backgroundHex) {
    const fg = normalizeHex6(textHex);
    const bg = normalizeHex6(backgroundHex);
    if (!fg || !bg) {
        return { ok: false, ratio: 0, meetsNormalTextAA: false, meetsLargeTextAA: false };
    }
    const ratio = contrastRatio(fg, bg);
    return {
        ok: true,
        ratio,
        meetsNormalTextAA: ratio >= 4.5,
        meetsLargeTextAA: ratio >= 3,
    };
}

/**
 * Второй контур: чтение inline-стиля :root после setProperty.
 * @param {CSSStyleDeclaration} rootStyle — document.documentElement.style
 * @param {string} varName — например '--color-primary'
 * @param {string} expectedHex
 */
export function verifyRootInlineVar(rootStyle, varName, expectedHex) {
    const want = normalizeHex6(expectedHex);
    if (!want) return { ok: false, reason: 'invalid-expected', got: null };
    const raw = rootStyle.getPropertyValue(varName).trim();
    const got = normalizeHex6(raw);
    if (!got) return { ok: false, reason: 'missing-or-unparsed', got: raw || null };
    const ok = got.toLowerCase() === want.toLowerCase();
    return { ok, reason: ok ? null : 'mismatch', got };
}

/**
 * Применяет primary/secondary с повторной попыткой при расхождении read-back (устойчивость к гонкам/кэшу).
 * @param {CSSStyleDeclaration} style
 * @param {string} primaryHex
 * @param {(hex: string) => string} [calculateSecondary]
 */
export function applyPrimaryPairWithVerification(style, primaryHex, calculateSecondary) {
    const fallback = normalizeHex6(primaryHex) || null;
    let primary = fallback;
    if (!primary) {
        return { primary: null, secondary: null, verified: false, attempts: 0 };
    }

    let secondary = primary;
    if (typeof calculateSecondary === 'function') {
        try {
            const s = calculateSecondary(primary);
            secondary = normalizeHex6(s) || primary;
        } catch {
            secondary = primary;
        }
    }

    const attemptApply = () => {
        style.setProperty('--color-primary', primary);
        style.setProperty('--color-secondary', secondary);
    };

    let attempts = 0;
    let verified = false;
    while (attempts < 2 && !verified) {
        attempts += 1;
        attemptApply();
        const v1 = verifyRootInlineVar(style, '--color-primary', primary);
        const v2 = verifyRootInlineVar(style, '--color-secondary', secondary);
        verified = v1.ok && v2.ok;
    }

    return { primary, secondary, verified, attempts };
}
