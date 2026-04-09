/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hexToHsl, hslToHex, adjustHsl } from '../utils/color.js';
import { THEME_DEFAULTS } from '../config.js';
import {
    setColorPickerDependencies,
    setColorPickerStateFromHex,
    initColorPicker,
    resolveHexForCustomizationTarget,
} from './color-picker.js';
import {
    populateCustomizationModalControls,
    setUISettingsModalDependencies,
} from './ui-settings-modal.js';
import { deriveThemeBackgroundPairFromHex } from './preview-settings.js';

/** jsdom сериализует присвоенный hex в rgb(); сравниваем канонически. */
function styleBackgroundToHex6(el) {
    const raw = el?.style?.backgroundColor?.trim() || '';
    if (!raw) return '';
    const hexish = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexish) return hexish[0].toLowerCase();
    const m = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return raw.toLowerCase();
    const h = (n) => Number(n).toString(16).padStart(2, '0');
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`.toLowerCase();
}

function mountPickerDom() {
    document.body.innerHTML = `
        <div id="appCustomizationModal">
            <div id="themeModeSelector">
                <input type="radio" name="themeMode" value="light" />
                <input type="radio" name="themeMode" value="dark" />
            </div>
            <div id="advancedColorPicker">
                <div id="color-preview-swatch"></div>
                <input id="color-hex-input" type="text" />
                <p id="color-accessibility-hint"></p>
                <button type="button" id="color-hex-copy-btn">Копировать</button>
                <div class="app-customization-sliders">
                    <input id="hue-value" type="text" readonly />
                    <div id="hue-slider" class="relative w-full h-4">
                        <div id="hue-slider-gradient" data-color-track=""></div>
                        <div id="hue-handle" class="absolute" style="left:0%"></div>
                    </div>
                    <input id="saturation-value" type="text" readonly />
                    <div id="saturation-slider" class="relative w-full h-4">
                        <div id="saturation-slider-gradient" data-color-track=""></div>
                        <div id="saturation-handle" class="absolute" style="left:80%"></div>
                    </div>
                    <input id="brightness-value" type="text" readonly />
                    <div id="brightness-slider" class="relative w-full h-4">
                        <div id="brightness-slider-gradient" data-color-track=""></div>
                        <div id="brightness-handle" class="absolute" style="left:88%"></div>
                    </div>
                </div>
            </div>
            <div id="colorTargetSelector">
                <input type="radio" name="colorTarget" value="elements" checked />
                <input type="radio" name="colorTarget" value="background" />
                <input type="radio" name="colorTarget" value="text" />
            </div>
            <div id="customization-dual-theme-preview">
                <div id="customization-preview-light"></div>
                <div id="customization-preview-dark"></div>
            </div>
        </div>
    `;
}

function keySlider(el, key, opts = {}) {
    el.dispatchEvent(
        new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
            ...opts,
        }),
    );
}

function dispatchPointer(el, type, init = {}) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 });
    Object.defineProperty(ev, 'pointerType', { value: init.pointerType ?? 'touch' });
    Object.defineProperty(ev, 'button', { value: init.button ?? 0 });
    Object.defineProperty(ev, 'clientX', { value: init.clientX ?? 0 });
    Object.defineProperty(ev, 'clientY', { value: init.clientY ?? 0 });
    el.dispatchEvent(ev);
}

describe('color-picker + customization populate', () => {
    let pickerHexCalls;
    let State;
    let applyPreviewSettingsMock;

    beforeEach(() => {
        document.body.innerHTML = '';
        document.documentElement.style.removeProperty('--override-background-dark');
        document.documentElement.style.removeProperty('--override-background-light');
        document.documentElement.style.removeProperty('--color-primary');
        pickerHexCalls = [];
        State = {
            uiModalState: { currentColorTarget: 'elements' },
            currentPreviewSettings: {
                primaryColor: THEME_DEFAULTS.primary,
                themeMode: 'dark',
            },
            isUISettingsDirty: false,
        };
        applyPreviewSettingsMock = vi.fn();
        setColorPickerDependencies({
            State,
            applyPreviewSettings: applyPreviewSettingsMock,
            updatePreviewSettingsFromModal: vi.fn(),
            hexToHsl,
            hslToHex,
            DEFAULT_UI_SETTINGS: { primaryColor: THEME_DEFAULTS.primary, themeMode: 'dark' },
            adjustHsl,
            THEME_DEFAULTS,
        });
        setUISettingsModalDependencies({
            State,
            DEFAULT_UI_SETTINGS: { primaryColor: THEME_DEFAULTS.primary, themeMode: 'dark' },
            setColorPickerStateFromHex: (hex) => {
                pickerHexCalls.push(hex);
                setColorPickerStateFromHex(hex);
            },
        });
    });

    it('populateCustomizationModalControls: при цели «фон» синхронизирует пипетку с backgroundColor', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        populateCustomizationModalControls({
            primaryColor: '#9933ff',
            backgroundColor: '#00aa55',
            isBackgroundCustom: true,
            themeMode: 'dark',
        });
        expect(pickerHexCalls.at(-1)).toMatch(/#00aa55/i);
    });

    it('dual-theme preview: кастомный фон + themeMode=dark — тёмная колонка совпадает с якорным hex (как applyPreviewSettings)', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        State.currentPreviewSettings = {
            primaryColor: '#9933ff',
            backgroundColor: '#00aa55',
            isBackgroundCustom: true,
            themeMode: 'dark',
        };
        setColorPickerStateFromHex('#00aa55');
        const darkEl = document.getElementById('customization-preview-dark');
        const lightEl = document.getElementById('customization-preview-light');
        const { dark: d, light: l } = deriveThemeBackgroundPairFromHex(
            '#00aa55',
            hexToHsl,
            hslToHex,
            adjustHsl,
            { activeTheme: 'dark' },
        );
        expect(styleBackgroundToHex6(darkEl)).toBe(d.toLowerCase());
        expect(styleBackgroundToHex6(lightEl)).toBe(l.toLowerCase());
    });

    it('dual-theme preview: кастомный фон + themeMode=light — светлая колонка совпадает с якорным hex', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        State.currentPreviewSettings = {
            primaryColor: '#9933ff',
            backgroundColor: '#e8f0ff',
            isBackgroundCustom: true,
            themeMode: 'light',
        };
        setColorPickerStateFromHex('#e8f0ff');
        const darkEl = document.getElementById('customization-preview-dark');
        const lightEl = document.getElementById('customization-preview-light');
        const { dark: d, light: l } = deriveThemeBackgroundPairFromHex(
            '#e8f0ff',
            hexToHsl,
            hslToHex,
            adjustHsl,
            { activeTheme: 'light' },
        );
        expect(styleBackgroundToHex6(lightEl)).toBe(l.toLowerCase());
        expect(styleBackgroundToHex6(darkEl)).toBe(d.toLowerCase());
    });

    it('populateCustomizationModalControls: при themeMode=auto выбирает реально активную тему документа', () => {
        mountPickerDom();
        document.documentElement.classList.remove('dark');
        populateCustomizationModalControls({
            primaryColor: '#9933ff',
            themeMode: 'auto',
        });
        expect(
            document.querySelector('#appCustomizationModal input[name="themeMode"][value="light"]')
                .checked,
        ).toBe(true);

        document.documentElement.classList.add('dark');
        populateCustomizationModalControls({
            primaryColor: '#9933ff',
            themeMode: 'auto',
        });
        expect(
            document.querySelector('#appCustomizationModal input[name="themeMode"][value="dark"]')
                .checked,
        ).toBe(true);
    });

    it('resolveHexForCustomizationTarget: для кастомного фона приоритет у реально отрисованного background (DOM)', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        document.body.classList.add('custom-background-active');
        document.documentElement.style.setProperty('--override-background-dark', '#223344');
        document.documentElement.classList.add('dark');
        const hex = resolveHexForCustomizationTarget(
            {
                isBackgroundCustom: true,
                backgroundColor: '#00aa55',
                themeMode: 'dark',
            },
            State,
        );
        expect(hex.toLowerCase()).toBe('#223344');
        document.body.classList.remove('custom-background-active');
        document.documentElement.style.removeProperty('--override-background-dark');
    });

    it('resolveHexForCustomizationTarget: для legacy rgb backgroundColor нормализует в hex без ухода в fallback', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        document.documentElement.style.setProperty('--override-background-dark', '#223344');
        const hex = resolveHexForCustomizationTarget(
            {
                isBackgroundCustom: true,
                backgroundColor: 'rgb(17, 24, 39)',
                themeMode: 'dark',
            },
            State,
        );
        expect(hex.toLowerCase()).toBe('#111827');
        document.documentElement.style.removeProperty('--override-background-dark');
    });

    it('resolveHexForCustomizationTarget: кастомный фон + themeMode=auto возвращает активный слот темы, а не исходный saved hex', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        const mm = window.matchMedia;
        window.matchMedia = vi.fn().mockReturnValue({ matches: true });
        const saved = '#e8f0ff';
        const pair = deriveThemeBackgroundPairFromHex(saved, hexToHsl, hslToHex, adjustHsl, {
            activeTheme: 'dark',
        });
        document.documentElement.classList.add('dark');
        document.documentElement.style.setProperty('--override-background-dark', pair.dark);
        const hex = resolveHexForCustomizationTarget(
            {
                isBackgroundCustom: true,
                backgroundColor: saved,
                themeMode: 'auto',
            },
            State,
        );
        expect(hex.toLowerCase()).toBe(pair.dark.toLowerCase());
        document.documentElement.style.removeProperty('--override-background-dark');
        window.matchMedia = mm;
    });

    it('resolveHexForCustomizationTarget: кастомный фон без валидного hex — fallback на отрисованный/DOM', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        document.documentElement.style.setProperty('--override-background-dark', '#223344');
        document.documentElement.classList.add('dark');
        const hex = resolveHexForCustomizationTarget(
            {
                isBackgroundCustom: true,
                backgroundColor: 'not-a-color',
                themeMode: 'dark',
            },
            State,
        );
        expect(hex.toLowerCase()).toBe('#223344');
        document.documentElement.style.removeProperty('--override-background-dark');
    });

    it('populateCustomizationModalControls: при цели «текст» и своём цвете — customTextColor', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'text';
        populateCustomizationModalControls({
            primaryColor: '#9933ff',
            customTextColor: '#ffeedd',
            isTextCustom: true,
            themeMode: 'dark',
        });
        expect(pickerHexCalls.at(-1)).toMatch(/#ffeedd/i);
    });

    it('setColorPickerStateFromHex: поля H/S/L совпадают с hexToHsl (округление)', () => {
        mountPickerDom();
        const hex = '#4466aa';
        setColorPickerStateFromHex(hex);
        const { h, s, l } = hexToHsl(hex);
        expect(document.getElementById('hue-value').value).toBe(String(Math.round(h)));
        expect(document.getElementById('saturation-value').value).toBe(String(Math.round(s)));
        expect(document.getElementById('brightness-value').value).toBe(String(Math.round(l)));
    });

    it('initColorPicker: после blur поля HEX применяется цвет и обновляются показания слайдеров', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        initColorPicker();
        const inp = document.getElementById('color-hex-input');
        inp.value = '#00FF00';
        inp.dispatchEvent(new Event('blur', { bubbles: true }));
        const { h, s, l } = hexToHsl('#00ff00');
        expect(document.getElementById('hue-value').value).toBe(String(Math.round(h)));
        expect(document.getElementById('saturation-value').value).toBe(String(Math.round(s)));
        expect(document.getElementById('brightness-value').value).toBe(String(Math.round(l)));
        expect(applyPreviewSettingsMock).toHaveBeenCalled();
    });

    it('initColorPicker: смена цели на фон подставляет фон по умолчанию темы, если кастом не задан', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        initColorPicker();
        State.currentPreviewSettings.backgroundColor = undefined;
        State.currentPreviewSettings.isBackgroundCustom = false;
        State.currentPreviewSettings.themeMode = 'dark';
        document.documentElement.classList.add('dark');
        const bgRadio = document.querySelector('#colorTargetSelector input[value="background"]');
        bgRadio.checked = true;
        bgRadio.dispatchEvent(new Event('change', { bubbles: true }));
        expect(State.uiModalState.currentColorTarget).toBe('background');
        const { h, s, l } = hexToHsl(THEME_DEFAULTS.backgroundDark);
        expect(parseInt(document.getElementById('hue-value').value, 10)).toBe(Math.round(h));
        expect(parseInt(document.getElementById('saturation-value').value, 10)).toBe(Math.round(s));
        expect(parseInt(document.getElementById('brightness-value').value, 10)).toBe(Math.round(l));
    });

    it('resolveHexForCustomizationTarget: фон без кастома следует --color-background и html.dark, а не устаревшему themeMode', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        document.documentElement.classList.add('dark');
        document.documentElement.style.setProperty('--color-background', '#112233');
        const hex = resolveHexForCustomizationTarget(
            { isBackgroundCustom: false, themeMode: 'light' },
            State,
        );
        expect(hex.toLowerCase()).toBe('#112233');
        document.documentElement.style.removeProperty('--color-background');
    });

    it('resolveHexForCustomizationTarget: при расхождении побеждает канонический --color-background, а body используется как fallback', () => {
        mountPickerDom();
        State.uiModalState.currentColorTarget = 'background';
        document.body.style.backgroundColor = 'rgb(17, 24, 39)';
        document.documentElement.style.setProperty('--color-background', '#12121f');
        const hex = resolveHexForCustomizationTarget(
            { isBackgroundCustom: false, themeMode: 'dark' },
            State,
        );
        expect(hex.toLowerCase()).toBe('#12121f');
        document.body.style.removeProperty('background-color');
        document.documentElement.style.removeProperty('--color-background');
    });

    it('initColorPicker: слайдеры получают role=slider и клавиша ArrowRight сдвигает оттенок', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        setColorPickerStateFromHex('#ff0000');
        const h0 = parseInt(document.getElementById('hue-value').value, 10);
        initColorPicker();
        const hueSlider = document.getElementById('hue-slider');
        expect(hueSlider.getAttribute('role')).toBe('slider');
        expect(hueSlider.getAttribute('tabindex')).toBe('0');
        hueSlider.focus();
        keySlider(hueSlider, 'ArrowRight');
        const h1 = parseInt(document.getElementById('hue-value').value, 10);
        expect(h0).toBe(0);
        expect(h1).toBe(1);
    });

    it('initColorPicker: ArrowRight на насыщенности увеличивает S на 1 (до потолка 100)', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        setColorPickerStateFromHex('#808080');
        initColorPicker();
        const sat = document.getElementById('saturation-slider');
        sat.focus();
        const s0 = parseInt(document.getElementById('saturation-value').value, 10);
        keySlider(sat, 'ArrowRight');
        expect(parseInt(document.getElementById('saturation-value').value, 10)).toBe(Math.min(100, s0 + 1));
    });

    it('после изменения с клавиатуры live region содержит HEX текущего цвета', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        setColorPickerStateFromHex('#00ff00');
        initColorPicker();
        const live = document.getElementById('color-picker-live-region');
        expect(live).toBeTruthy();
        expect(live.getAttribute('aria-live')).toBe('polite');
        document.getElementById('brightness-slider').focus();
        keySlider(document.getElementById('brightness-slider'), 'ArrowLeft');
        const h = parseInt(document.getElementById('hue-value').value, 10);
        const s = parseInt(document.getElementById('saturation-value').value, 10);
        const l = parseInt(document.getElementById('brightness-value').value, 10);
        const expected = hslToHex(h, s, l);
        expect(live.textContent.toUpperCase()).toContain(expected.toUpperCase());
    });

    it('initColorPicker: после pointerdown synthetic click не должен сбрасывать яркость в 0', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        const slider = document.getElementById('brightness-slider');
        const track = document.getElementById('brightness-slider-gradient');
        const handle = document.getElementById('brightness-handle');
        slider.getBoundingClientRect = () => ({
            left: 0,
            right: 200,
            top: 0,
            bottom: 16,
            width: 200,
            height: 16,
        });
        track.getBoundingClientRect = () => ({
            left: 0,
            right: 200,
            top: 0,
            bottom: 16,
            width: 200,
            height: 16,
        });
        Object.defineProperty(handle, 'offsetWidth', { configurable: true, value: 20 });

        setColorPickerStateFromHex('#808080');
        initColorPicker();

        dispatchPointer(slider, 'pointerdown', { pointerType: 'touch', pointerId: 5, clientX: 150 });
        dispatchPointer(slider, 'pointerup', { pointerType: 'touch', pointerId: 5, clientX: 150 });
        const afterPointerDown = parseInt(document.getElementById('brightness-value').value, 10);
        expect(afterPointerDown).toBeGreaterThan(0);

        slider.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 0 }));
        const afterClick = parseInt(document.getElementById('brightness-value').value, 10);
        expect(afterClick).toBe(afterPointerDown);
    });

    it('initColorPicker: касание по хэндлу без движения не должно резко менять значение', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        const slider = document.getElementById('brightness-slider');
        const track = document.getElementById('brightness-slider-gradient');
        const handle = document.getElementById('brightness-handle');
        slider.getBoundingClientRect = () => ({
            left: 0,
            right: 200,
            top: 0,
            bottom: 16,
            width: 200,
            height: 16,
        });
        track.getBoundingClientRect = () => ({
            left: 0,
            right: 200,
            top: 0,
            bottom: 16,
            width: 200,
            height: 16,
        });
        handle.getBoundingClientRect = () => ({
            left: 166,
            right: 186,
            top: -2,
            bottom: 18,
            width: 20,
            height: 20,
        });
        Object.defineProperty(handle, 'offsetWidth', { configurable: true, value: 20 });

        setColorPickerStateFromHex('#808080');
        initColorPicker();
        const before = parseInt(document.getElementById('brightness-value').value, 10);
        dispatchPointer(slider, 'pointerdown', { pointerType: 'touch', pointerId: 9, clientX: 176 });
        dispatchPointer(slider, 'pointerup', { pointerType: 'touch', pointerId: 9, clientX: 176 });
        const after = parseInt(document.getElementById('brightness-value').value, 10);
        expect(after).toBe(before);
    });

    it('initColorPicker: click рядом с хэндлом без pointer-событий не должен менять значение', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        const slider = document.getElementById('brightness-slider');
        const track = document.getElementById('brightness-slider-gradient');
        const handle = document.getElementById('brightness-handle');
        slider.getBoundingClientRect = () => ({
            left: 0,
            right: 200,
            top: 0,
            bottom: 16,
            width: 200,
            height: 16,
        });
        track.getBoundingClientRect = () => ({
            left: 0,
            right: 200,
            top: 0,
            bottom: 16,
            width: 200,
            height: 16,
        });
        handle.getBoundingClientRect = () => ({
            left: 166,
            right: 186,
            top: -2,
            bottom: 18,
            width: 20,
            height: 20,
        });
        Object.defineProperty(handle, 'offsetWidth', { configurable: true, value: 20 });

        setColorPickerStateFromHex('#808080');
        initColorPicker();
        const before = parseInt(document.getElementById('brightness-value').value, 10);
        slider.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 176, clientY: 8 }));
        const after = parseInt(document.getElementById('brightness-value').value, 10);
        expect(after).toBe(before);
    });

    it('initColorPicker: клик с малым смещением от текущего значения hue не должен давать резкий скачок', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        const slider = document.getElementById('hue-slider');
        const track = document.getElementById('hue-slider-gradient');
        const handle = document.getElementById('hue-handle');
        slider.getBoundingClientRect = () => ({
            left: 0,
            right: 600,
            top: 0,
            bottom: 16,
            width: 600,
            height: 16,
        });
        track.getBoundingClientRect = () => ({
            left: 0,
            right: 600,
            top: 0,
            bottom: 16,
            width: 600,
            height: 16,
        });
        handle.getBoundingClientRect = () => ({
            left: 290,
            right: 310,
            top: -2,
            bottom: 18,
            width: 20,
            height: 20,
        });
        Object.defineProperty(handle, 'offsetWidth', { configurable: true, value: 20 });

        setColorPickerStateFromHex('#00ffff');
        initColorPicker();
        const before = parseInt(document.getElementById('hue-value').value, 10);
        // Click near current logical value but outside strict handle hitbox
        slider.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 320, clientY: 8 }),
        );
        const after = parseInt(document.getElementById('hue-value').value, 10);
        expect(Math.abs(after - before)).toBeLessThanOrEqual(3);
    });

    it('initColorPicker: pointermove с нечисловым clientX не должен сбрасывать канал в чёрный', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        const slider = document.getElementById('hue-slider');
        const track = document.getElementById('hue-slider-gradient');
        const handle = document.getElementById('hue-handle');
        slider.getBoundingClientRect = () => ({
            left: 0,
            right: 600,
            top: 0,
            bottom: 16,
            width: 600,
            height: 16,
        });
        track.getBoundingClientRect = () => ({
            left: 0,
            right: 600,
            top: 0,
            bottom: 16,
            width: 600,
            height: 16,
        });
        handle.getBoundingClientRect = () => ({
            left: 290,
            right: 310,
            top: -2,
            bottom: 18,
            width: 20,
            height: 20,
        });
        Object.defineProperty(handle, 'offsetWidth', { configurable: true, value: 20 });

        setColorPickerStateFromHex('#00ffff');
        initColorPicker();
        const before = parseInt(document.getElementById('hue-value').value, 10);

        dispatchPointer(slider, 'pointerdown', { pointerType: 'touch', pointerId: 42, clientX: 300, clientY: 8 });
        dispatchPointer(slider, 'pointermove', { pointerType: 'touch', pointerId: 42, clientX: NaN, clientY: 8 });
        dispatchPointer(slider, 'pointerup', { pointerType: 'touch', pointerId: 42, clientX: 300, clientY: 8 });

        const after = parseInt(document.getElementById('hue-value').value, 10);
        expect(after).toBe(before);
    });

    it('initColorPicker: узкая дорожка (ширина < 2× половины ручки) не должна сбрасывать светлоту в 0 при движении', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        const slider = document.getElementById('brightness-slider');
        const track = document.getElementById('brightness-slider-gradient');
        const handle = document.getElementById('brightness-handle');
        const narrow = { left: 0, right: 12, top: 0, bottom: 16, width: 12, height: 16 };
        slider.getBoundingClientRect = () => narrow;
        track.getBoundingClientRect = () => narrow;
        handle.getBoundingClientRect = () => ({
            left: 2,
            right: 22,
            top: -2,
            bottom: 18,
            width: 20,
            height: 20,
        });
        Object.defineProperty(handle, 'offsetWidth', { configurable: true, value: 20 });

        setColorPickerStateFromHex('#e8e8e8');
        initColorPicker();
        const beforeL = parseInt(document.getElementById('brightness-value').value, 10);
        expect(beforeL).toBeGreaterThan(80);

        dispatchPointer(slider, 'pointerdown', { pointerType: 'touch', pointerId: 77, clientX: 6, clientY: 8 });
        dispatchPointer(slider, 'pointermove', { pointerType: 'touch', pointerId: 77, clientX: 9, clientY: 8 });
        dispatchPointer(slider, 'pointerup', { pointerType: 'touch', pointerId: 77, clientX: 9, clientY: 8 });

        const afterL = parseInt(document.getElementById('brightness-value').value, 10);
        expect(afterL).toBe(beforeL);
    });

    it('initColorPicker: нулевая ширина трека в layout — маппинг по ширине родительского slider', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        const slider = document.getElementById('brightness-slider');
        const track = document.getElementById('brightness-slider-gradient');
        const handle = document.getElementById('brightness-handle');
        const wideSlider = { left: 100, right: 500, top: 590, bottom: 606, width: 400, height: 16 };
        const emptyTrack = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
        slider.getBoundingClientRect = () => wideSlider;
        track.getBoundingClientRect = () => emptyTrack;
        handle.getBoundingClientRect = () => ({
            left: 430,
            right: 450,
            top: 588,
            bottom: 608,
            width: 20,
            height: 20,
        });
        Object.defineProperty(handle, 'offsetWidth', { configurable: true, value: 20 });

        setColorPickerStateFromHex('#6644cc');
        initColorPicker();
        const beforeL = parseInt(document.getElementById('brightness-value').value, 10);

        dispatchPointer(slider, 'pointerdown', { pointerType: 'mouse', pointerId: 31, clientX: 150, clientY: 600 });
        dispatchPointer(slider, 'pointermove', { pointerType: 'mouse', pointerId: 31, clientX: 450, clientY: 600 });
        dispatchPointer(slider, 'pointerup', { pointerType: 'mouse', pointerId: 31, clientX: 450, clientY: 600 });

        const afterL = parseInt(document.getElementById('brightness-value').value, 10);
        expect(afterL).not.toBe(beforeL);
        expect(afterL).toBeGreaterThan(beforeL);
    });

    it('initColorPicker: при currentPreviewSettings=null жест по светлоте клонирует userPreferences и вызывает applyPreviewSettings', () => {
        mountPickerDom();
        delete document.getElementById('hue-slider').dataset.colorPickerInited;
        State.currentPreviewSettings = null;
        State.userPreferences = {
            primaryColor: '#6644cc',
            themeMode: 'dark',
            borderRadius: 8,
            contentDensity: 3,
        };

        const slider = document.getElementById('brightness-slider');
        const track = document.getElementById('brightness-slider-gradient');
        const handle = document.getElementById('brightness-handle');
        const wide = { left: 0, right: 400, top: 0, bottom: 16, width: 400, height: 16 };
        slider.getBoundingClientRect = () => wide;
        track.getBoundingClientRect = () => wide;
        handle.getBoundingClientRect = () => ({
            left: 330,
            right: 350,
            top: -2,
            bottom: 18,
            width: 20,
            height: 20,
        });
        Object.defineProperty(handle, 'offsetWidth', { configurable: true, value: 20 });

        setColorPickerStateFromHex('#6644cc');
        initColorPicker();
        applyPreviewSettingsMock.mockClear();

        dispatchPointer(slider, 'pointerdown', { pointerType: 'mouse', pointerId: 3, clientX: 50, clientY: 8 });
        dispatchPointer(slider, 'pointermove', { pointerType: 'mouse', pointerId: 3, clientX: 320, clientY: 8 });
        dispatchPointer(slider, 'pointerup', { pointerType: 'mouse', pointerId: 3, clientX: 320, clientY: 8 });

        expect(State.currentPreviewSettings).not.toBeNull();
        expect(State.currentPreviewSettings.primaryColor).toMatch(/^#/i);
        expect(applyPreviewSettingsMock).toHaveBeenCalled();
        const lInput = parseInt(document.getElementById('brightness-value').value, 10);
        expect(lInput).toBeGreaterThan(40);
        expect(parseInt(slider.getAttribute('aria-valuenow'), 10)).toBe(lInput);
    });

    it('resolveHexForCustomizationTarget: «Элементы» предпочитает отрисованный --color-primary устаревшему primaryColor', () => {
        document.documentElement.style.setProperty('--color-primary', '#ff5500');
        const hex = resolveHexForCustomizationTarget(
            { primaryColor: '#111111', themeMode: 'dark' },
            { uiModalState: { currentColorTarget: 'elements' } },
        );
        expect(hex.toLowerCase()).toBe('#ff5500');
    });
});
