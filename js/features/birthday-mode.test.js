/** @vitest-environment jsdom */
'use strict';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const BIRTHDAY_CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../css/components/birthday-mode.css');
import {
    getBirthdayModeEnabled,
    prefersReducedMotion,
    applyBirthdayModeToDocument,
    applyBirthdayModeFromSettings,
    syncAppBrandTitleBirthday,
    syncAppSloganBirthday,
    BIRTHDAY_APP_SLOGAN,
    DEFAULT_APP_SLOGAN,
    ensureBirthdayGarland,
    syncBirthdayGarlandWave,
    BIRTHDAY_FX_LAYER_ID,
    BIRTHDAY_GARLAND_ID,
    BIRTHDAY_CONFETTI_HOST_CLASS,
} from './birthday-mode.js';
import { BIRTHDAY_MODE_LOCAL_MIRROR_KEY } from '../constants.js';

describe('birthday-mode', () => {
    beforeEach(() => {
        document.documentElement.className = '';
        document.documentElement.removeAttribute('data-birthday-mode');
        delete document.documentElement.dataset.birthdayMode;
        document.body.innerHTML = '';
        try {
            localStorage.removeItem(BIRTHDAY_MODE_LOCAL_MIRROR_KEY);
        } catch {
            /* ignore */
        }
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('getBirthdayModeEnabled: только явный true', () => {
        expect(getBirthdayModeEnabled({ birthdayModeEnabled: true })).toBe(true);
        expect(getBirthdayModeEnabled({ birthdayModeEnabled: false })).toBe(false);
        expect(getBirthdayModeEnabled({})).toBe(false);
        expect(getBirthdayModeEnabled(null)).toBe(false);
    });

    it('prefersReducedMotion читает matchMedia', () => {
        window.matchMedia = vi.fn().mockImplementation((q) => ({
            matches: q === '(prefers-reduced-motion: reduce)',
            media: q,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        expect(prefersReducedMotion()).toBe(true);
    });

    it('applyBirthdayModeToDocument: включает классы и data-атрибут', () => {
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        applyBirthdayModeToDocument(true);
        expect(document.documentElement.dataset.birthdayMode).toBe('on');
        expect(document.documentElement.classList.contains('birthday-mode')).toBe(true);
        expect(document.documentElement.classList.contains('birthday-mode--reduced')).toBe(false);
        expect(document.getElementById(BIRTHDAY_FX_LAYER_ID)).toBeTruthy();
        const garland = document.getElementById(BIRTHDAY_GARLAND_ID);
        expect(garland).toBeTruthy();
        expect(garland.querySelectorAll('.birthday-garland__bulb').length).toBeGreaterThan(0);
    });

    it('applyBirthdayModeToDocument: при reduced motion — флаг reduced', () => {
        applyBirthdayModeToDocument(true, { reducedMotion: true });
        expect(document.documentElement.classList.contains('birthday-mode--reduced')).toBe(true);
    });

    it('applyBirthdayModeToDocument: выключает и зеркалирует в localStorage', () => {
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        applyBirthdayModeToDocument(true);
        applyBirthdayModeToDocument(false);
        expect(document.documentElement.dataset.birthdayMode).toBe('off');
        expect(document.documentElement.classList.contains('birthday-mode')).toBe(false);
        expect(localStorage.getItem(BIRTHDAY_MODE_LOCAL_MIRROR_KEY)).toBe('0');
    });

    it('syncAppBrandTitleBirthday выставляет aria-label при включении', () => {
        const h1 = document.createElement('h1');
        h1.id = 'appBrandTitle';
        document.body.appendChild(h1);
        syncAppBrandTitleBirthday(true);
        expect(h1.getAttribute('aria-label')).toBe('Copilot 1СО, режим дня рождения');
        syncAppBrandTitleBirthday(false);
        expect(h1.hasAttribute('aria-label')).toBe(false);
    });

    it('syncAppSloganBirthday: праздничный слоган и откат к сохранённому', () => {
        const p = document.createElement('p');
        p.id = 'appSlogan';
        p.textContent = DEFAULT_APP_SLOGAN;
        document.body.appendChild(p);
        syncAppSloganBirthday(true);
        expect(p.textContent).toBe(BIRTHDAY_APP_SLOGAN);
        syncAppSloganBirthday(false);
        expect(p.textContent).toBe(DEFAULT_APP_SLOGAN);
        expect(p.dataset.birthdayDefaultSlogan).toBeUndefined();
    });

    it('applyBirthdayModeToDocument: слоган меняется и восстанавливается', () => {
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        const p = document.createElement('p');
        p.id = 'appSlogan';
        p.textContent = 'Кастомный слоган';
        document.body.appendChild(p);
        applyBirthdayModeToDocument(true);
        expect(p.textContent).toBe(BIRTHDAY_APP_SLOGAN);
        applyBirthdayModeToDocument(false);
        expect(p.textContent).toBe('Кастомный слоган');
    });

    it('ensureBirthdayGarland создаёт лампочки один раз', () => {
        const g1 = ensureBirthdayGarland();
        const g2 = ensureBirthdayGarland();
        expect(g1).toBe(g2);
        expect(document.querySelectorAll('#birthdayGarland .birthday-garland__bulb').length).toBe(22);
    });

    it('волна: у лампочек --garland-wave-y, у провода SVG-path', () => {
        const g = ensureBirthdayGarland();
        expect(g).toBeTruthy();
        const bulbs = g.querySelectorAll('.birthday-garland__bulb');
        expect(bulbs.length).toBe(22);
        const w0 = bulbs[0].style.getPropertyValue('--garland-wave-y').trim();
        const w7 = bulbs[7].style.getPropertyValue('--garland-wave-y').trim();
        expect(w0).toBe('0px');
        expect(w7).not.toBe('0px');
        expect(w7.endsWith('px')).toBe(true);
        const cord = g.querySelector('.birthday-garland__cord');
        const svg = cord.querySelector('svg.birthday-garland__cord-svg');
        const path = svg.querySelector('path');
        expect(path.getAttribute('d')).toMatch(/^M\s+0[\d.\s,L-]+/);
        expect((path.getAttribute('d').match(/L/g) || []).length).toBeGreaterThan(60);
        syncBirthdayGarlandWave(g);
        expect(cord.querySelector('path')).toBeTruthy();
    });

    it('CSS: лампочка — margin-top от волны и transform-origin сверху', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        const bulbStart = raw.indexOf('.birthday-garland__bulb {');
        const bulbEnd = raw.indexOf('@media (prefers-reduced-motion: reduce)', bulbStart);
        const bulbBlock = raw.slice(bulbStart, bulbEnd);
        expect(bulbBlock).toMatch(/margin-top:\s*var\(\s*--garland-wave-y/);
        expect(bulbBlock).toMatch(/transform-origin:\s*top\s+center/);
    });

    it('CSS: свеча в birthday-mode меньше и ближе к «СО»', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        expect(raw).toMatch(/html\.birthday-mode\s+\.app-brand-title__candle-wrap\s*\{[\s\S]*?margin-inline-end/s);
        expect(raw).toMatch(/html\.birthday-mode\s+\.app-brand-title__candle-svg\s*\{[\s\S]*?width:\s*0\.46em/s);
        expect(raw).toMatch(/html\.birthday-mode\s+\.app-brand-title__letters-so\s*\{[\s\S]*?margin-left/s);
    });

    it('контейнер гирлянды: без overflow-hidden на основном блоке (регрессия «радуга» при обрезке filter)', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        const start = raw.indexOf('.birthday-garland {');
        const end = raw.indexOf('.birthday-garland--hidden');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const mainGarland = raw.slice(start, end);
        expect(mainGarland).not.toMatch(/overflow\s*:\s*hidden/);
        expect(mainGarland).not.toMatch(/contain\s*:\s*paint/);
    });

    it('конфетти в birthday-mode: мелкие яркие; слой fx не смещается clamp(top) (регрессия в #mainContent)', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        expect(raw).not.toMatch(
            /html\.birthday-mode\s+\.birthday-fx-layer\s*\{[\s\S]*?top:\s*clamp\(/m,
        );
        expect(raw).not.toMatch(
            /html\.birthday-mode\s+\.birthday-fx-layer\s+\.birthday-confetti[\s\S]*?display\s*:\s*none\s*!important/s,
        );
        expect(raw).toMatch(
            /html\.birthday-mode\s+\.birthday-fx-layer\s+\.birthday-confetti\s*\{[\s\S]*?width:\s*5px/s,
        );
    });

    it('CSS: снег — два контура (drop + sway); падение без calc(var(--bc-sway)*', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        const dropStart = raw.indexOf('@keyframes birthday-confetti-drop');
        const swayStart = raw.indexOf('@keyframes birthday-confetti-sway');
        expect(dropStart).toBeGreaterThan(-1);
        expect(swayStart).toBeGreaterThan(dropStart);
        const dropBlock = raw.slice(dropStart, swayStart);
        expect((dropBlock.match(/translate3d/g) || []).length).toBe(2);
        expect(dropBlock).not.toMatch(/calc\s*\(\s*var\s*\(\s*--bc-sway/);

        const swayStop = raw.indexOf('.birthday-confetti-host:nth-child(6n + 1)', swayStart);
        expect(swayStop).toBeGreaterThan(swayStart);
        const swayBlock = raw.slice(swayStart, swayStop);
        expect(swayBlock).toMatch(/--bc-sway-neg/);
        expect(swayBlock).toMatch(/--bc-sway\b/);
    });

    it('CSS: хост конфетти — ненулевой размер и fill-mode до старта (не «линия» у шапки)', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        const start = raw.indexOf('.birthday-confetti-host {');
        const end = raw.indexOf('@keyframes birthday-confetti-drop');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const block = raw.slice(start, end);
        expect(block).not.toMatch(/width:\s*0/);
        expect(block).not.toMatch(/height:\s*0/);
        expect(block).toMatch(/animation-fill-mode:\s*backwards/);
        expect(block).toMatch(/display:\s*flex/);
    });

    it('CSS: reduced mode для конфетти — мягкое падение, не статичная линия', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        const reducedStart = raw.indexOf('html.birthday-mode.birthday-mode--reduced .birthday-fx-layer .birthday-confetti-host {');
        expect(reducedStart).toBeGreaterThan(-1);
        const reducedEnd = raw.indexOf(
            'html.birthday-mode.birthday-mode--reduced .birthday-fx-layer .birthday-confetti-host .birthday-confetti',
            reducedStart,
        );
        expect(reducedEnd).toBeGreaterThan(reducedStart);
        const reducedHostBlock = raw.slice(reducedStart, reducedEnd);
        expect(reducedHostBlock).not.toMatch(/animation:\s*none/);
        expect(reducedHostBlock).not.toMatch(/top:\s*8%/);
        expect(reducedHostBlock).toMatch(/animation-duration:\s*calc\(\s*var\(--bc-dur,\s*7s\)\s*\*\s*2\.2\s*\)/);
    });

    it('конфетти: хост на частицу; --bc-sway и --bc-sway-neg на чипе', () => {
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        applyBirthdayModeToDocument(true);
        const hosts = document.querySelectorAll(`#${BIRTHDAY_FX_LAYER_ID} .${BIRTHDAY_CONFETTI_HOST_CLASS}`);
        const pieces = document.querySelectorAll(`#${BIRTHDAY_FX_LAYER_ID} .birthday-confetti`);
        expect(hosts.length).toBe(pieces.length);
        expect(hosts.length).toBeGreaterThan(40);
        for (const p of pieces) {
            expect(p.style.getPropertyValue('--bc-sway')).toMatch(/^\d+(\.\d+)?px$/);
            expect(p.style.getPropertyValue('--bc-sway-neg')).toMatch(/^-\d+(\.\d+)?px$/);
        }
    });

    it('CSS: слой конфетти выше липкой шапки (z-index 42), ниже гирлянды (45)', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        const start = raw.indexOf('.birthday-fx-layer {');
        const end = raw.indexOf('.birthday-fx-layer--hidden');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const block = raw.slice(start, end);
        expect(block).toMatch(/z-index:\s*42/);
    });

    it('лампочки: свечение смещено вверх и без огромного радиального хвоста (26px/10px)', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        const bulbStart = raw.indexOf('.birthday-garland__bulb {');
        const bulbEnd = raw.indexOf('@media (prefers-reduced-motion: reduce)', bulbStart);
        expect(bulbStart).toBeGreaterThan(-1);
        expect(bulbEnd).toBeGreaterThan(bulbStart);
        const bulbBlock = raw.slice(bulbStart, bulbEnd);
        expect(bulbBlock).toMatch(/drop-shadow\(\s*0\s+-1px/);
        expect(bulbBlock).toMatch(/0\s+-4px\s+12px/);
        expect(bulbBlock).not.toMatch(/0\s+0\s+26px\s+10px/);
    });

    it('лампочки гирлянды: keyframes не должны задавать filter (свечение через drop-shadow на элементе)', () => {
        const raw = readFileSync(BIRTHDAY_CSS_PATH, 'utf8');
        const start = raw.indexOf('@keyframes birthday-bulb-twinkle');
        const end = raw.indexOf('/* Логотип', start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const keyframesBlock = raw.slice(start, end);
        expect(keyframesBlock.includes('filter:')).toBe(false);
        expect(raw.includes('drop-shadow') && raw.includes('.birthday-garland__bulb')).toBe(true);
    });

    it('applyBirthdayModeFromSettings делегирует в applyBirthdayModeToDocument', () => {
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        applyBirthdayModeFromSettings({ birthdayModeEnabled: true });
        expect(document.documentElement.dataset.birthdayMode).toBe('on');
    });
});
