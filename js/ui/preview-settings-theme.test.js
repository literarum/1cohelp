/** @vitest-environment node */
'use strict';

import { describe, it, expect } from 'vitest';
import { deriveThemeBackgroundPairFromHex, UI_BG_THEME_FACTORS } from './preview-settings.js';
import { hexToHsl, hslToHex, adjustHsl } from '../utils/color.js';

describe('preview-settings theme helpers', () => {
    it('UI_BG_THEME_FACTORS зафиксированы для согласованности с кастомным фоном', () => {
        expect(UI_BG_THEME_FACTORS.darkRel).toBe(0.75);
        expect(UI_BG_THEME_FACTORS.lightRel).toBe(0.2);
    });

    it('deriveThemeBackgroundPairFromHex даёт различимые светлый и тёмный фон', () => {
        const { light, dark } = deriveThemeBackgroundPairFromHex(
            '#4488cc',
            hexToHsl,
            hslToHex,
            adjustHsl,
        );
        expect(light).toMatch(/^#[0-9a-f]{6}$/i);
        expect(dark).toMatch(/^#[0-9a-f]{6}$/i);
        expect(light.toLowerCase()).not.toBe(dark.toLowerCase());
    });

    it('deriveThemeBackgroundPairFromHex(activeTheme: dark) якорит выбранный hex в тёмный слот', () => {
        const seed = '#12121f';
        const { light, dark } = deriveThemeBackgroundPairFromHex(
            seed,
            hexToHsl,
            hslToHex,
            adjustHsl,
            {
                activeTheme: 'dark',
            },
        );
        expect(dark.toLowerCase()).toBe(seed);
        expect(light.toLowerCase()).not.toBe(seed);
    });

    it('deriveThemeBackgroundPairFromHex(activeTheme: light) якорит выбранный hex в светлый слот', () => {
        const seed = '#f9fafb';
        const { light, dark } = deriveThemeBackgroundPairFromHex(
            seed,
            hexToHsl,
            hslToHex,
            adjustHsl,
            {
                activeTheme: 'light',
            },
        );
        expect(light.toLowerCase()).toBe(seed);
        expect(dark.toLowerCase()).not.toBe(seed);
    });

    it('парный фон другой темы имеет «свою» светлоту (тёмный выбор → светлая пара и наоборот)', () => {
        const lum = (hex) => hexToHsl(hex).l;
        const fromDark = deriveThemeBackgroundPairFromHex('#1a2a4a', hexToHsl, hslToHex, adjustHsl, {
            activeTheme: 'dark',
        });
        expect(fromDark.dark.toLowerCase()).toBe('#1a2a4a');
        expect(lum(fromDark.light)).toBeGreaterThan(90);
        const fromLight = deriveThemeBackgroundPairFromHex('#dbeafe', hexToHsl, hslToHex, adjustHsl, {
            activeTheme: 'light',
        });
        expect(fromLight.light.toLowerCase()).toBe('#dbeafe');
        expect(lum(fromLight.dark)).toBeLessThan(18);
    });
});
