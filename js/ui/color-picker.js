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
 * Дорожка градиента — первый дочерний блок (внутренний rounded); считаем по его getBoundingClientRect,
 * иначе ручка и 0–100% не совпадают с полосой и вылезают за градиент.
 */
function getTrackAndSliderRects(slider) {
    const sliderRect = slider.getBoundingClientRect();
    const trackEl = slider.querySelector('[data-color-track]') || slider.firstElementChild;
    const trackRect = trackEl ? trackEl.getBoundingClientRect() : sliderRect;
    return { sliderRect, trackRect };
}

function getHandleHalfWidth(handle) {
    const w = handle.offsetWidth || handle.getBoundingClientRect().width;
    return w > 0 ? w / 2 : 10;
}

/**
 * Ставит центр ручки над дорожкой градиента: логическое 0–100 → left% относительно padding-box слайдера.
 */
function setHandleLogicalPercent(slider, handle, logical0to100) {
    if (!slider || !handle) return;
    const { sliderRect, trackRect } = getTrackAndSliderRects(slider);
    const hw = getHandleHalfWidth(handle);
    const travel = trackRect.width - 2 * hw;
    const lp = Math.max(0, Math.min(100, logical0to100));
    let centerGlobalX;
    if (travel <= 1e-9) {
        centerGlobalX = trackRect.left + trackRect.width / 2;
    } else {
        centerGlobalX = trackRect.left + hw + (lp / 100) * travel;
    }
    const leftPercent = ((centerGlobalX - sliderRect.left) / sliderRect.width) * 100;
    handle.style.left = `${Math.max(0, Math.min(100, leftPercent))}%`;
}

/**
 * Обратное к setHandleLogicalPercent: логическое 0–100 по left% и геометрии дорожки.
 */
function logicalPercentFromHandle(slider, handle) {
    if (!slider || !handle) return 0;
    const { sliderRect, trackRect } = getTrackAndSliderRects(slider);
    const hw = getHandleHalfWidth(handle);
    const travel = trackRect.width - 2 * hw;
    const leftPercent = parseFloat(handle.style.left);
    if (Number.isNaN(leftPercent)) return 0;
    const centerGlobalX = sliderRect.left + (leftPercent / 100) * sliderRect.width;
    if (travel <= 1e-9) return 0;
    const lp = ((centerGlobalX - trackRect.left - hw) / travel) * 100;
    return Math.max(0, Math.min(100, lp));
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
    function applyHandlesFromHsl() {
        if (hueSlider && hueHandle) {
            setHandleLogicalPercent(hueSlider, hueHandle, (h / 360) * 100);
        }
        if (saturationSlider && saturationHandle) {
            setHandleLogicalPercent(saturationSlider, saturationHandle, s);
        }
        if (brightnessSlider && brightnessHandle) {
            setHandleLogicalPercent(brightnessSlider, brightnessHandle, l);
        }
    }
    applyHandlesFromHsl();
    updateGradients(h, s, l);
    updateUIFromHsl(h, s, l);
    /* После показа модалки геометрия дорожки может обновиться на следующем кадре */
    requestAnimationFrame(applyHandlesFromHsl);
}

function updateGradients(h, _s, _l) {
    const satGrad = document.getElementById('saturation-slider-gradient');
    const brightGrad = document.getElementById('brightness-slider-gradient');
    const baseColor = hslToHex(h, 100, 50);
    /* Только backgroundImage — не затирать background-size из CSS (иначе градиент «не доходит» до края) */
    if (satGrad) {
        satGrad.style.backgroundImage = `linear-gradient(to right, #808080 0%, ${baseColor} 100%)`;
    }
    if (brightGrad) {
        brightGrad.style.backgroundImage = `linear-gradient(to right, #000 0%, ${baseColor} 50%, #fff 100%)`;
    }
}

/**
 * Применяет текущие значения слайдеров к primaryColor и превью (target = elements).
 */
function getHslFromHandles() {
    const hueSlider = document.getElementById('hue-slider');
    const saturationSlider = document.getElementById('saturation-slider');
    const brightnessSlider = document.getElementById('brightness-slider');
    const hueHandle = document.getElementById('hue-handle');
    const saturationHandle = document.getElementById('saturation-handle');
    const brightnessHandle = document.getElementById('brightness-handle');
    if (!hueHandle || !saturationHandle || !brightnessHandle) return null;
    const h = logicalPercentFromHandle(hueSlider, hueHandle) * 3.6;
    const s = logicalPercentFromHandle(saturationSlider, saturationHandle);
    const l = logicalPercentFromHandle(brightnessSlider, brightnessHandle);
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
    function pointerToLogicalPercent(e) {
        const { trackRect } = getTrackAndSliderRects(slider);
        const hw = getHandleHalfWidth(handle);
        const travel = Math.max(1e-9, trackRect.width - 2 * hw);
        const clientX = typeof e.clientX !== 'undefined' ? e.clientX : e.touches[0].clientX;
        const centerGlobalX = Math.max(
            trackRect.left + hw,
            Math.min(trackRect.right - hw, clientX),
        );
        return ((centerGlobalX - trackRect.left - hw) / travel) * (maxPercent || 100);
    }
    function move(e) {
        if (!isDrag) return;
        const logicalPercent = pointerToLogicalPercent(e);
        setHandleLogicalPercent(slider, handle, logicalPercent);
        const value = getValueFromPercent ? getValueFromPercent(logicalPercent) : logicalPercent;
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
        const logicalPercent = pointerToLogicalPercent(e);
        setHandleLogicalPercent(slider, handle, logicalPercent);
        const value = getValueFromPercent ? getValueFromPercent(logicalPercent) : logicalPercent;
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

    makeSliderDrag(
        'hue-slider',
        'hue-handle',
        100,
        (p) => p * 3.6,
        (h) => {
            const s = logicalPercentFromHandle(
                saturationSlider,
                document.getElementById('saturation-handle'),
            );
            const l = logicalPercentFromHandle(
                brightnessSlider,
                document.getElementById('brightness-handle'),
            );
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
            const h =
                logicalPercentFromHandle(hueSlider, document.getElementById('hue-handle')) * 3.6 || 0;
            const l = logicalPercentFromHandle(
                brightnessSlider,
                document.getElementById('brightness-handle'),
            );
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
            const h =
                logicalPercentFromHandle(hueSlider, document.getElementById('hue-handle')) * 3.6 || 0;
            const s = logicalPercentFromHandle(
                saturationSlider,
                document.getElementById('saturation-handle'),
            );
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
