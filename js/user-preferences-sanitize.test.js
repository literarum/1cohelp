import { describe, it, expect } from 'vitest';
import { sanitizeUserPreferences } from './user-preferences-sanitize.js';

const DEF = {
    theme: 'dark', primaryColor: '#3b82f6', fontSize: 80, contentDensity: 3, clientNotesFontSize: 100,
    mainLayout: 'horizontal', panelOrder: ['main'], panelVisibility: [true], staticHeader: false,
};

describe('sanitizeUserPreferences', () => {
    it('корректные значения не меняются', () => {
        const { prefs, fixes } = sanitizeUserPreferences({ ...DEF, theme: 'light', fontSize: 120 }, DEF);
        expect(fixes).toEqual([]);
        expect(prefs.theme).toBe('light');
        expect(prefs.fontSize).toBe(120);
    });
    it('битые значения заменяются дефолтами', () => {
        const { prefs, fixes } = sanitizeUserPreferences(
            { ...DEF, theme: 'purple', primaryColor: 'zzz', fontSize: 'abc', contentDensity: 99, staticHeader: 'yes', textareaHeights: [1], employeeExtension: 5, backgroundColor: 'red' },
            DEF,
        );
        expect(prefs.theme).toBe('dark');
        expect(prefs.primaryColor).toBe('#3b82f6');
        expect(prefs.fontSize).toBe(80);
        expect(prefs.contentDensity).toBe(6);
        expect(prefs.staticHeader).toBe(false);
        expect(prefs.textareaHeights).toEqual({});
        expect(prefs.employeeExtension).toBe('');
        expect('backgroundColor' in prefs).toBe(false);
        expect(fixes.length).toBeGreaterThan(5);
    });
    it('числа-строки приводятся, высоты очищаются', () => {
        const { prefs } = sanitizeUserPreferences({ ...DEF, fontSize: '110', textareaHeights: { a: 100, b: 'x', c: 99999 } }, DEF);
        expect(prefs.fontSize).toBe(110);
        expect(prefs.textareaHeights).toEqual({ a: 100, c: 4000 });
    });
    it('null и мусор на входе не бросают', () => {
        expect(() => sanitizeUserPreferences(null, null)).not.toThrow();
        expect(sanitizeUserPreferences(undefined, DEF).prefs.theme).toBe('dark');
    });
});
