/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyPreviewSettings, setPreviewSettingsDependencies } from './preview-settings.js';
import { calculateSecondaryColor, hexToHsl, hslToHex, adjustHsl } from '../utils/color.js';

describe('applyPreviewSettings custom background', () => {
    beforeEach(() => {
        document.documentElement.removeAttribute('style');
        document.body.removeAttribute('class');
        document.body.innerHTML = '<div id="appContent"></div><div id="staticHeaderWrapper"></div>';
        setPreviewSettingsDependencies({
            DEFAULT_UI_SETTINGS: { primaryColor: '#7e22ce', themeMode: 'dark' },
            calculateSecondaryColor,
            hexToHsl,
            hslToHex,
            adjustHsl,
            setTheme: vi.fn(),
        });
    });

    it('в dark mode сохраняет выбранный фон как active-theme background без провала в черный', async () => {
        const selectedBg = '#c4d4ff';
        await applyPreviewSettings({
            primaryColor: '#7e22ce',
            themeMode: 'dark',
            isBackgroundCustom: true,
            backgroundColor: selectedBg,
        });

        const appliedDarkBg = document.documentElement.style
            .getPropertyValue('--override-background-dark')
            .trim()
            .toLowerCase();
        expect(appliedDarkBg).toBe(selectedBg);
    });

    it('в dark mode не производит почти белый border для кастомного фона', async () => {
        await applyPreviewSettings({
            primaryColor: '#7e22ce',
            themeMode: 'dark',
            isBackgroundCustom: true,
            backgroundColor: '#c4d4ff',
        });

        const borderDark = document.documentElement.style
            .getPropertyValue('--override-border-dark')
            .trim()
            .toLowerCase();
        const borderHsl = hexToHsl(borderDark);
        expect(borderHsl).toBeTruthy();
        expect(borderHsl.l).toBeLessThan(85);
    });

    it('при legacy rgb backgroundColor в dark mode сохраняет кастомный фон как active-theme background', async () => {
        await applyPreviewSettings({
            primaryColor: '#7e22ce',
            themeMode: 'dark',
            isBackgroundCustom: true,
            backgroundColor: 'rgb(17, 24, 39)',
        });

        const appliedDarkBg = document.documentElement.style
            .getPropertyValue('--override-background-dark')
            .trim()
            .toLowerCase();
        expect(appliedDarkBg).toBe('#111827');
    });

    it('при birthdayModeEnabled включает праздничные атрибуты на documentElement', async () => {
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        await applyPreviewSettings({
            primaryColor: '#7e22ce',
            themeMode: 'dark',
            birthdayModeEnabled: true,
        });
        expect(document.documentElement.dataset.birthdayMode).toBe('on');
        expect(document.documentElement.classList.contains('birthday-mode')).toBe(true);
    });
});
