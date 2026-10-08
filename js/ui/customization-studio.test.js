'use strict';

import { describe, it, expect } from 'vitest';
import {
    STUDIO_KEYS,
    ACCENTS,
    LOOKS,
    defaultAppearance,
    normalizeHexLoose,
    pickAppearance,
    appearanceEqual,
    applyLookToAppearance,
    radiusPercent,
    rangeFillPercent,
    describeMotion,
} from './customization-studio.js';

describe('customization-studio: данные', () => {
    it('акценты — корректные уникальные hex, образы — уникальные id', () => {
        const hexes = ACCENTS.map((a) => a.hex);
        expect(new Set(hexes).size).toBe(hexes.length);
        for (const h of hexes) expect(normalizeHexLoose(h)).toBe(h.toLowerCase());
        const ids = LOOKS.map((l) => l.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain('classic');
    });

    it('каждый образ после применения даёт валидное оформление', () => {
        for (const look of LOOKS) {
            const a = applyLookToAppearance(defaultAppearance(), look);
            expect(['light', 'dark', 'auto']).toContain(a.theme);
            expect(normalizeHexLoose(a.primaryColor)).toBeTruthy();
            expect(a.contentDensity).toBeGreaterThanOrEqual(0);
            expect(a.contentDensity).toBeLessThanOrEqual(6);
        }
    });
});

describe('customization-studio: чистые функции', () => {
    it('normalizeHexLoose: короткие и некорректные значения', () => {
        expect(normalizeHexLoose('#ABC')).toBe('#aabbcc');
        expect(normalizeHexLoose(' #112233 ')).toBe('#112233');
        expect(normalizeHexLoose('red')).toBe('');
        expect(normalizeHexLoose(null)).toBe('');
        expect(normalizeHexLoose('#12345')).toBe('');
    });

    it('pickAppearance: только ключи оформления, мусор заменяется умолчаниями', () => {
        const a = pickAppearance({
            theme: 'neon',
            primaryColor: 'nope',
            isBackgroundCustom: true,
            backgroundColor: 'bad',
            contentDensity: 99,
            motionMode: 'turbo',
            tabOrder: ['a', 'b'],
        });
        expect(a.theme).toBe('dark');
        expect(a.primaryColor).toBe(defaultAppearance().primaryColor);
        expect(a.isBackgroundCustom).toBe(false);
        expect('backgroundColor' in a).toBe(false);
        expect(a.contentDensity).toBe(6);
        expect(a.motionMode).toBe('auto');
        expect('tabOrder' in a).toBe(false);
        for (const k of Object.keys(a)) expect(STUDIO_KEYS).toContain(k);
    });

    it('appearanceEqual: игнорирует посторонние поля и регистр hex', () => {
        const a = { theme: 'light', primaryColor: '#ABCDEF', foo: 1 };
        const b = { theme: 'light', primaryColor: '#abcdef', foo: 2 };
        expect(appearanceEqual(a, b)).toBe(true);
        expect(appearanceEqual(a, { ...b, theme: 'dark' })).toBe(false);
        expect(appearanceEqual(a, { ...b, motionMode: 'reduce' })).toBe(false);
    });

    it('applyLookToAppearance: сохраняет тему и режим движения, сбрасывает остальное', () => {
        const cur = { theme: 'light', motionMode: 'reduce', primaryColor: '#123456', contentDensity: 6 };
        const classic = LOOKS.find((l) => l.id === 'classic');
        const out = applyLookToAppearance(cur, classic);
        expect(out.motionMode).toBe('reduce');
        expect(out.primaryColor).toBe(defaultAppearance().primaryColor);
        expect(out.contentDensity).toBe(defaultAppearance().contentDensity);
    });

    it('radiusPercent / rangeFillPercent / describeMotion', () => {
        expect(radiusPercent(0)).toBe(0);
        expect(radiusPercent(10000)).toBe(100);
        expect(rangeFillPercent({ min: '0', max: '10', value: '5' })).toBe(50);
        expect(rangeFillPercent({ min: '0', max: '10', value: 'x' })).toBe(0);
        expect(rangeFillPercent({ min: '5', max: '5', value: '5' })).toBe(0);
        expect(describeMotion('auto', 'reduce')).toMatch(/системе/);
        expect(describeMotion('calm', 'calm')).toMatch(/спокойн/);
    });

    it('pickAppearance сохраняет тему, в которой выбран фон, только для кастомного фона', () => {
        const a = pickAppearance({ isBackgroundCustom: true, backgroundColor: '#112233', backgroundAnchor: 'dark' });
        expect(a.backgroundAnchor).toBe('dark');
        expect(pickAppearance({ isBackgroundCustom: true, backgroundColor: '#112233', backgroundAnchor: 'x' }).backgroundAnchor).toBeUndefined();
        expect(pickAppearance({ isBackgroundCustom: false, backgroundAnchor: 'dark' }).backgroundAnchor).toBeUndefined();
    });
});
