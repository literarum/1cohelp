import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeOverlaySettings, readOverlaySettings, writeOverlaySettings, accentPalette, readAccentHex } from './overlay-settings.js';

describe('overlay-settings', () => {
    beforeEach(() => localStorage.clear());
    it('значения по умолчанию и очистка мусора', () => {
        expect(readOverlaySettings()).toEqual({ duration: 'full', finale: 'explosion', palette: 'cosmic' });
        expect(sanitizeOverlaySettings({ duration: 'x', finale: 'fade', palette: 1 })).toEqual({ duration: 'full', finale: 'fade', palette: 'cosmic' });
    });
    it('запись частичная', () => {
        writeOverlaySettings({ duration: 'quick' });
        expect(readOverlaySettings().duration).toBe('quick');
        expect(readOverlaySettings().finale).toBe('explosion');
    });
    it('палитра от акцента: 12 валидных цветов, акцент из снимка оформления', () => {
        const p = accentPalette('#10b981', 'dark');
        expect(p).toHaveLength(12);
        p.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
        expect(readAccentHex()).toBeNull();
        localStorage.setItem('copilot.loading-overlay.snapshot', JSON.stringify({ primary: '#10B981' }));
        expect(readAccentHex()).toBe('#10b981');
    });
});
