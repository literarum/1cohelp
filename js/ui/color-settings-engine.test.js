/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect } from 'vitest';
import {
    normalizeHex6,
    normalizeColorToHex,
    contrastRatio,
    evaluatePrimaryOnWhiteText,
    evaluateTextOnNeutral,
    verifyRootInlineVar,
    applyPrimaryPairWithVerification,
} from './color-settings-engine.js';
import { calculateSecondaryColor } from '../utils/color.js';

describe('color-settings-engine', () => {
    it('normalizeHex6 принимает #RGB и приводит к нижнему регистру #RRGGBB', () => {
        expect(normalizeHex6('#aBc')).toBe('#aabbcc');
        expect(normalizeHex6('  #112233 ')).toBe('#112233');
        expect(normalizeHex6('nope')).toBe(null);
    });

    it('normalizeColorToHex поддерживает rgb/rgba и отбрасывает полностью прозрачный цвет', () => {
        expect(normalizeColorToHex('rgb(17, 24, 39)')).toBe('#111827');
        expect(normalizeColorToHex('rgba(17,24,39,0.4)')).toBe('#111827');
        expect(normalizeColorToHex('rgba(17,24,39,0)')).toBe(null);
    });

    it('contrastRatio: белый и чёрный дают максимальный контраст', () => {
        const r = contrastRatio('#ffffff', '#000000');
        expect(r).toBeGreaterThan(20);
    });

    it('evaluatePrimaryOnWhiteText: светло-жёлтый акцент не проходит UI 3:1', () => {
        const x = evaluatePrimaryOnWhiteText('#ffff99');
        expect(x.meetsUiNonTextAA).toBe(false);
    });

    it('evaluateTextOnNeutral: тёмный текст на светлом фоне проходит AA', () => {
        const x = evaluateTextOnNeutral('#111827', '#f9fafb');
        expect(x.meetsNormalTextAA).toBe(true);
    });

    it('verifyRootInlineVar и applyPrimaryPairWithVerification согласованы', () => {
        const root = document.documentElement;
        const style = root.style;
        style.setProperty('--color-primary', '#000000');
        const { primary, secondary, verified } = applyPrimaryPairWithVerification(
            style,
            '#7e22ce',
            calculateSecondaryColor,
        );
        expect(verified).toBe(true);
        expect(primary).toBe('#7e22ce');
        expect(verifyRootInlineVar(style, '--color-primary', primary).ok).toBe(true);
        expect(verifyRootInlineVar(style, '--color-secondary', secondary).ok).toBe(true);
    });
});
