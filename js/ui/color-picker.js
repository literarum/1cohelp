'use strict';

/**
 * Модуль цветового пипетника в модальном окне настроек UI.
 * Синхронизирует слайдеры Цвет/Насыщенность/Яркость с primaryColor и превью.
 */

let State = null;
let applyPreviewSettings = null;
let updatePreviewSettingsFromModal = null;
let hexToHsl = null;
let hslToHex = null;
let DEFAULT_UI_SETTINGS = null;

const DEFAULT_HEX = '#7E22CE';

export function setColorPickerDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.applyPreviewSettings !== undefined) applyPreviewSettings = deps.applyPreviewSettings;
    if (deps.updatePreviewSettingsFromModal !== undefined)
        updatePreviewSettingsFromModal = deps.updatePreviewSettingsFromModal;
    if (deps.hexToHsl !== undefined) hexToHsl = deps.hexToHsl;
    if (deps.hslToHex !== undefined) hslToHex = deps.hslToHex;
    if (deps.DEFAULT_UI_SETTINGS !== undefined) DEFAULT_UI_SETTINGS = deps.DEFAULT_UI_SETTINGS;
}

function normalizeHex(hex) {
    if (!hex || typeof hex !== 'string') return null;
    hex = hex.trim().replace(/^#/, '');
    if (hex.length === 3)
        hex = hex
            .split('')
            .map((c) => c + c)
            .join('');
    if (hex.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(hex)) return null;
    return '#' + hex;
}

/**
 * Обновляет превью-свотч и значения полей из текущих H,S,L
 */
function updateUIFromHsl(h, s, l) {
    const hex = hslToHex(h, s, l);
    const hueValue = document.getElementById('hue-value');
    const saturationValue = document.getElementById('saturation-value');
    const brightnessValue = document.getElementById('brightness-value');
    const previewSwatch = document.getElementById('color-preview-swatch');
    if (hueValue) hueValue.value = Math.round(h);
    if (saturationValue) saturationValue.value = Math.round(s);
    if (brightnessValue) brightnessValue.value = Math.round(l);
    if (previewSwatch) previewSwatch.style.backgroundColor = hex;
}

/**
 * Устанавливает состояние пипетника по HEX (для открытия модалки и сброса).
 * @param {string} hex - цвет в формате #RRGGBB или #RGB
 */
export function setColorPickerStateFromHex(hex) {
    const normalized = normalizeHex(hex) || DEFAULT_HEX;
    const hsl = hexToHsl(normalized);
    if (!hsl) return;
    const h = hsl.h;
    const s = hsl.s;
    const l = hsl.l;
    const hueSlider = document.getElementById('hue-slider');
    const saturationSlider = document.getElementById('saturation-slider');
    const brightnessSlider = document.getElementById('brightness-slider');
    const hueHandle = document.getElementById('hue-handle');
    const saturationHandle = document.getElementById('saturation-handle');
    const brightnessHandle = document.getElementById('brightness-handle');
    if (hueSlider && hueHandle) {
        hueHandle.style.left = (h / 360) * 100 + '%';
    }
    if (saturationSlider && saturationHandle) {
        saturationHandle.style.left = s + '%';
    }
    if (brightnessSlider && brightnessHandle) {
        brightnessHandle.style.left = l + '%';
    }
    updateGradients(h, s, l);
    updateUIFromHsl(h, s, l);
}

function updateGradients(h, _s, _l) {
    const satGrad = document.getElementById('saturation-slider-gradient');
    const brightGrad = document.getElementById('brightness-slider-gradient');
    const baseColor = hslToHex(h, 100, 50);
    if (satGrad) {
        satGrad.style.background = `linear-gradient(to right, #808080 0%, ${baseColor} 100%)`;
    }
    if (brightGrad) {
        brightGrad.style.background = `linear-gradient(to right, #000 0%, ${baseColor} 50%, #fff 100%)`;
    }
}

/**
 * Применяет текущие значения слайдеров к primaryColor и превью (target = elements).
 */
function getHslFromHandles() {
    const hueHandle = document.getElementById('hue-handle');
    const saturationHandle = document.getElementById('saturation-handle');
    const brightnessHandle = document.getElementById('brightness-handle');
    if (!hueHandle || !saturationHandle || !brightnessHandle) return null;
    const h = (parseFloat(hueHandle.style.left) || 0) * 3.6; // 0..100 -> 0..360
    const s = parseFloat(saturationHandle.style.left) || 0;
    const l = parseFloat(brightnessHandle.style.left) || 0;
    return { h, s, l };
}

function applyColorFromSliders() {
    const hsl = getHslFromHandles();
    if (!hsl || !State) return;
    const { h, s, l } = hsl;
    const hex = hslToHex(h, s, l);
    const target = (State.uiModalState && State.uiModalState.currentColorTarget) || 'elements';
    if (target === 'elements' && State.currentPreviewSettings) {
        State.currentPreviewSettings.primaryColor = hex;
        if (typeof updatePreviewSettingsFromModal === 'function') updatePreviewSettingsFromModal();
        if (typeof applyPreviewSettings === 'function')
            applyPreviewSettings(State.currentPreviewSettings);
    }
    if (target === 'background' && State.currentPreviewSettings) {
        State.currentPreviewSettings.backgroundColor = hex;
        State.currentPreviewSettings.isBackgroundCustom = true;
        if (typeof updatePreviewSettingsFromModal === 'function') updatePreviewSettingsFromModal();
        if (typeof applyPreviewSettings === 'function')
            applyPreviewSettings(State.currentPreviewSettings);
    }
    if (target === 'text' && State.currentPreviewSettings) {
        State.currentPreviewSettings.customTextColor = hex;
        State.currentPreviewSettings.isTextCustom = true;
        if (typeof updatePreviewSettingsFromModal === 'function') updatePreviewSettingsFromModal();
        if (typeof applyPreviewSettings === 'function')
            applyPreviewSettings(State.currentPreviewSettings);
    }
    State.isUISettingsDirty = true;
    updateUIFromHsl(h, s, l);
}

function updateGradientsFromHandles() {
    const hsl = getHslFromHandles();
    if (hsl) updateGradients(hsl.h, hsl.s, hsl.l);
}

function makeSliderDrag(sliderId, handleId, maxPercent, getValueFromPercent, setHandleFromValue) {
    const slider = document.getElementById(sliderId);
    const handle = document.getElementById(handleId);
    if (!slider || !handle) return;
    let isDrag = false;
    function move(e) {
        if (!isDrag) return;
        const rect = slider.getBoundingClientRect();
        const x = typeof e.clientX !== 'undefined' ? e.clientX : e.touches[0].clientX;
        let p = (x - rect.left) / rect.width;
        p = Math.max(0, Math.min(1, p));
        const percent = p * (maxPercent || 100);
        handle.style.left = percent + '%';
        const value = getValueFromPercent ? getValueFromPercent(percent) : percent;
        if (typeof setHandleFromValue === 'function') setHandleFromValue(value);
        updateGradientsFromHandles();
        applyColorFromSliders();
    }
    function stop() {
        isDrag = false;
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', stop);
        document.removeEventListener('touchmove', move, { passive: true });
        document.removeEventListener('touchend', stop);
    }
    slider.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDrag = true;
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', stop);
        move(e);
    });
    slider.addEventListener(
        'touchstart',
        (e) => {
            isDrag = true;
            document.addEventListener('touchmove', move, { passive: true });
            document.addEventListener('touchend', stop);
            move(e);
        },
        { passive: true },
    );
    slider.addEventListener('click', (e) => {
        if (e.target === handle) return;
        const rect = slider.getBoundingClientRect();
        let p = (e.clientX - rect.left) / rect.width;
        p = Math.max(0, Math.min(1, p));
        const percent = p * (maxPercent || 100);
        handle.style.left = percent + '%';
        const value = getValueFromPercent ? getValueFromPercent(percent) : percent;
        if (typeof setHandleFromValue === 'function') setHandleFromValue(value);
        updateGradientsFromHandles();
        applyColorFromSliders();
    });
}

/**
 * Инициализирует слайдеры и переключатель «Цвет элементов / фона / текста».
 * Вызывать один раз при первом открытии модалки настроек.
 */
export function initColorPicker() {
    const hueSlider = document.getElementById('hue-slider');
    const saturationSlider = document.getElementById('saturation-slider');
    const brightnessSlider = document.getElementById('brightness-slider');
    const colorTargetSelector = document.getElementById('colorTargetSelector');
    if (!hueSlider || !saturationSlider || !brightnessSlider) return;
    if (hueSlider.dataset.colorPickerInited === 'true') return;
    hueSlider.dataset.colorPickerInited = 'true';

    function _setHueFromPercent(percent) {
        const h = percent * 3.6;
        updateGradients(
            h,
            parseFloat(document.getElementById('saturation-handle')?.style.left) || 80,
            parseFloat(document.getElementById('brightness-handle')?.style.left) || 50,
        );
        return h;
    }
    function _setSatFromPercent(percent) {
        const s = percent;
        const h = parseFloat(document.getElementById('hue-handle')?.style.left) * 3.6 || 0;
        updateGradients(
            h,
            s,
            parseFloat(document.getElementById('brightness-handle')?.style.left) || 50,
        );
        return s;
    }
    function _setBrightFromPercent(percent) {
        const l = percent;
        const h = parseFloat(document.getElementById('hue-handle')?.style.left) * 3.6 || 0;
        const s = parseFloat(document.getElementById('saturation-handle')?.style.left) || 80;
        updateGradients(h, s, l);
        return l;
    }

    makeSliderDrag(
        'hue-slider',
        'hue-handle',
        100,
        (p) => p * 3.6,
        (h) => {
            const handle = document.getElementById('hue-handle');
            if (handle) handle.style.left = h / 3.6 + '%';
            const s = parseFloat(document.getElementById('saturation-handle')?.style.left) || 80;
            const l = parseFloat(document.getElementById('brightness-handle')?.style.left) || 50;
            updateUIFromHsl(h, s, l);
            updateGradients(h, s, l);
        },
    );
    makeSliderDrag(
        'saturation-slider',
        'saturation-handle',
        100,
        (p) => p,
        (s) => {
            const h = parseFloat(document.getElementById('hue-handle')?.style.left) * 3.6 || 0;
            const l = parseFloat(document.getElementById('brightness-handle')?.style.left) || 50;
            updateUIFromHsl(h, s, l);
            updateGradients(h, s, l);
        },
    );
    makeSliderDrag(
        'brightness-slider',
        'brightness-handle',
        100,
        (p) => p,
        (l) => {
            const h = parseFloat(document.getElementById('hue-handle')?.style.left) * 3.6 || 0;
            const s = parseFloat(document.getElementById('saturation-handle')?.style.left) || 80;
            updateUIFromHsl(h, s, l);
            updateGradients(h, s, l);
        },
    );

    if (colorTargetSelector && State) {
        colorTargetSelector.addEventListener('change', (e) => {
            const radio = e.target;
            if (radio.name === 'colorTarget' && radio.value) {
                State.uiModalState = State.uiModalState || {};
                State.uiModalState.currentColorTarget = radio.value;
                const hex =
                    (State.currentPreviewSettings && State.currentPreviewSettings.primaryColor) ||
                    (DEFAULT_UI_SETTINGS && DEFAULT_UI_SETTINGS.primaryColor) ||
                    DEFAULT_HEX;
                if (radio.value === 'elements') setColorPickerStateFromHex(hex);
                if (radio.value === 'background' && State.currentPreviewSettings?.backgroundColor)
                    setColorPickerStateFromHex(State.currentPreviewSettings.backgroundColor);
                if (radio.value === 'text' && State.currentPreviewSettings?.customTextColor)
                    setColorPickerStateFromHex(State.currentPreviewSettings.customTextColor);
            }
        });
    }
}
