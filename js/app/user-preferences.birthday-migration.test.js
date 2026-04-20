'use strict';

import { describe, it, expect } from 'vitest';
import { normalizeBirthdayModeUserPreference } from './user-preferences.js';

describe('normalizeBirthdayModeUserPreference', () => {
    it('принудительно выставляет birthdayModeEnabled в false (миграция после удаления переключателя из UI)', () => {
        const prefs = { theme: 'dark', birthdayModeEnabled: true };
        normalizeBirthdayModeUserPreference(prefs);
        expect(prefs.birthdayModeEnabled).toBe(false);
        expect(prefs.theme).toBe('dark');
    });

    it('не падает на null/undefined', () => {
        expect(() => normalizeBirthdayModeUserPreference(null)).not.toThrow();
        expect(() => normalizeBirthdayModeUserPreference(undefined)).not.toThrow();
    });

    it('оставляет false как false', () => {
        const prefs = { birthdayModeEnabled: false };
        normalizeBirthdayModeUserPreference(prefs);
        expect(prefs.birthdayModeEnabled).toBe(false);
    });
});
