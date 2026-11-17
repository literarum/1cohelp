/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    isDarkBySchedule,
    msUntilNextSwitch,
    sanitizeThemeSchedule,
    readThemeSchedule,
    writeThemeSchedule,
    initThemeScheduleUI,
    THEME_SCHEDULE_KEY,
} from './theme-schedule.js';

const at = (h, m = 0, s = 0) => new Date(2026, 10, 17, h, m, s);

describe('тема по расписанию', () => {
    beforeEach(() => localStorage.clear());

    it('дневной интервал: светлая 08:00–20:00', () => {
        const s = { enabled: true, lightFrom: '08:00', darkFrom: '20:00' };
        expect(isDarkBySchedule(s, at(7, 59))).toBe(true);
        expect(isDarkBySchedule(s, at(8, 0))).toBe(false);
        expect(isDarkBySchedule(s, at(19, 59))).toBe(false);
        expect(isDarkBySchedule(s, at(20, 0))).toBe(true);
    });

    it('интервал через полночь: светлая с 22:00 до 06:00', () => {
        const s = { enabled: true, lightFrom: '22:00', darkFrom: '06:00' };
        expect(isDarkBySchedule(s, at(23))).toBe(false);
        expect(isDarkBySchedule(s, at(3))).toBe(false);
        expect(isDarkBySchedule(s, at(12))).toBe(true);
    });

    it('время до следующей смены', () => {
        const s = { enabled: true, lightFrom: '08:00', darkFrom: '20:00' };
        expect(msUntilNextSwitch(s, at(19, 0))).toBe(60 * 60000);
        expect(msUntilNextSwitch(s, at(21, 0))).toBe(11 * 60 * 60000);
        expect(msUntilNextSwitch(s, at(19, 59, 30))).toBe(30000);
    });

    it('мусор в настройках заменяется значениями по умолчанию', () => {
        expect(sanitizeThemeSchedule({ enabled: 'yes', lightFrom: '25:00', darkFrom: 'x' })).toEqual({
            enabled: false,
            lightFrom: '08:00',
            darkFrom: '20:00',
        });
        expect(sanitizeThemeSchedule({ lightFrom: '20:00', darkFrom: '20:00' }).darkFrom).not.toBe('20:00');
        localStorage.setItem(THEME_SCHEDULE_KEY, '{oops');
        expect(readThemeSchedule().enabled).toBe(false);
    });

    it('интерфейс: переключатель сохраняет сразу и не всплывает к студии', () => {
        document.body.innerHTML = `<div id="appCustomizationModal"><div class="ac-theme-cards">
            <input type="radio" name="themeMode" value="auto" checked></div></div>`;
        let studioChanges = 0;
        document.getElementById('appCustomizationModal').addEventListener('change', () => studioChanges++);
        let applied = 0;
        initThemeScheduleUI({ onChange: () => applied++ });
        const cb = document.querySelector('[data-ts="enabled"]');
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        expect(readThemeSchedule().enabled).toBe(true);
        expect(applied).toBe(1);
        expect(studioChanges).toBe(0);
        expect(document.querySelector('.ac-theme-schedule__times').hidden).toBe(false);
        expect(document.querySelector('.ac-theme-schedule__hint').textContent).toMatch(/Сейчас/);
        writeThemeSchedule({ enabled: false });
    });
});
