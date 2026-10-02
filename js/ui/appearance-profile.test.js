import { describe, it, expect } from 'vitest';
import { buildAppearanceProfile, parseAppearanceProfile, PRESETS, PROFILE_FORMAT } from './appearance-profile.js';

describe('appearance-profile', () => {
    it('экспорт → импорт возвращает те же значения', () => {
        const prof = buildAppearanceProfile({ theme: 'light', primaryColor: '#112233', borderRadius: 6, other: 1 }, { ui: 'serif', scale: 110 });
        expect(prof.format).toBe(PROFILE_FORMAT);
        expect('other' in prof.appearance).toBe(false);
        const res = parseAppearanceProfile(JSON.stringify(prof), {});
        expect(res.ok).toBe(true);
        expect(res.appearance.theme).toBe('light');
        expect(res.appearance.primaryColor).toBe('#112233');
        expect(res.fonts.scale).toBe(110);
    });
    it('отклоняет мусор, чужие форматы и новые версии', () => {
        expect(parseAppearanceProfile('', {}).ok).toBe(false);
        expect(parseAppearanceProfile('{oops', {}).ok).toBe(false);
        expect(parseAppearanceProfile('{"format":"x"}', {}).ok).toBe(false);
        expect(parseAppearanceProfile(JSON.stringify({ format: PROFILE_FORMAT, version: 99 }), {}).ok).toBe(false);
        expect(parseAppearanceProfile('x'.repeat(70000), {}).ok).toBe(false);
    });
    it('санитизирует значения из файла', () => {
        const res = parseAppearanceProfile(
            JSON.stringify({ format: PROFILE_FORMAT, version: 1, appearance: { theme: 'neon', primaryColor: '#12', borderRadius: 'x' }, fonts: { ui: 'hack', scale: 999 } }),
            { theme: 'dark', primaryColor: '#3b82f6' },
        );
        expect(res.ok).toBe(true);
        expect(res.appearance.theme).toBe('dark');
        expect(res.appearance.primaryColor).toBe('#3b82f6');
        expect(res.fonts.ui).toBe('default');
        expect(res.fonts.scale).toBe(130);
        expect(res.fixes.length).toBeGreaterThan(0);
    });
    it('пресеты имеют уникальные id', () => {
        expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    });
});

describe('appearance-profile: скругление', () => {
    it('нечисловое скругление заменяется дефолтом', () => {
        const res = parseAppearanceProfile(
            JSON.stringify({ format: PROFILE_FORMAT, version: 1, appearance: { borderRadius: 'x' } }),
            { borderRadius: 8 },
        );
        expect(res.appearance.borderRadius).toBe(8);
    });
});
