'use strict';

/**
 * Модуль цветового пипетника в модальном окне настроек UI.
 * Каноническое состояние — HSL в памяти; слайдеры только отображают и задают его (без рассинхрона с style.left).
 */

import { deriveThemeBackgroundPairFromHex } from './preview-settings.js';
import {
    normalizeHex6,
    normalizeColorToHex,
    evaluatePrimaryOnWhiteText,
    evaluateTextOnNeutral,
} from './color-settings-engine.js';

let State = null;
let applyPreviewSettings = null;
let updatePreviewSettingsFromModal = null;
let hexToHsl = null;
let hslToHex = null;
let adjustHsl = null;
let DEFAULT_UI_SETTINGS = null;
let THEME_DEFAULTS_REF = null;

const DEFAULT_HEX = '#7E22CE';

/** @type {{ h: number, s: number, l: number }} */
let pickerHsl = { h: 270, s: 62, l: 44 };

/** Порог смещения указателя, после которого клик в конце жеста не обрабатываем (анти-дребезг mouseup+click). */
const DRAG_SUPPRESS_CLICK_PX = 6;

/** Меньше — любой шум координат даёт скачок 0↔100%; не меняем канал по указателю, держим текущее значение. */
const MIN_TRAVEL_PX_FOR_POINTER = 8;

/** ARIA и шаги клавиатуры (второй контур ввода рядом с pointer). */
const SLIDER_ACCESS = {
    h: {
        ariaLabel: 'Оттенок, от 0 до 359 градусов',
        min: 0,
        max: 359,
        smallStep: 1,
        pageStep: 15,
    },
    s: {
        ariaLabel: 'Насыщенность, от 0 до 100 процентов',
        min: 0,
        max: 100,
        smallStep: 1,
        pageStep: 10,
    },
    l: {
        ariaLabel: 'Светлота, от 0 до 100 процентов',
        min: 0,
        max: 100,
        smallStep: 1,
        pageStep: 10,
    },
};

export function setColorPickerDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.applyPreviewSettings !== undefined) applyPreviewSettings = deps.applyPreviewSettings;
    if (deps.updatePreviewSettingsFromModal !== undefined)
        updatePreviewSettingsFromModal = deps.updatePreviewSettingsFromModal;
    if (deps.hexToHsl !== undefined) hexToHsl = deps.hexToHsl;
    if (deps.hslToHex !== undefined) hslToHex = deps.hslToHex;
    if (deps.DEFAULT_UI_SETTINGS !== undefined) DEFAULT_UI_SETTINGS = deps.DEFAULT_UI_SETTINGS;
    if (deps.adjustHsl !== undefined) adjustHsl = deps.adjustHsl;
    if (deps.THEME_DEFAULTS !== undefined) THEME_DEFAULTS_REF = deps.THEME_DEFAULTS;
}

const normalizeHex = normalizeHex6;

function clampHue(h) {
    let x = Number(h);
    if (!Number.isFinite(x)) x = 0;
    x %= 360;
    if (x < 0) x += 360;
    return x;
}

function clampSL(v) {
    const x = Number(v);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
}

function cssColorToHex(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    if (/^transparent$/i.test(raw)) return null;
    const normalized = normalizeHex(raw);
    if (normalized) return normalized;
    const m = raw.match(
        /^rgba?\(\s*([0-9]{1,3})\s*[,\s]\s*([0-9]{1,3})\s*[,\s]\s*([0-9]{1,3})(?:\s*[/,]\s*([0-9.]+)\s*)?\)$/i,
    );
    if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])].map((n) =>
        Math.max(0, Math.min(255, n)),
    );
    const hex = (n) => n.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Резолв var(--token) в RGB через движок (getPropertyValue на :root часто отдаёт цепочку var(), не цвет). */
function sampleBackgroundCssVarToHex(varName) {
    if (!document.body || typeof getComputedStyle !== 'function') return null;
    const probe = document.createElement('div');
    probe.setAttribute('data-app-bg-color-probe', '1');
    probe.style.cssText = [
        'position:absolute',
        'left:-9999px',
        'top:0',
        'width:1px',
        'height:1px',
        'pointer-events:none',
        'visibility:hidden',
        `background-color:var(${varName})`,
    ].join(';');
    document.body.appendChild(probe);
    try {
        const rgb = getComputedStyle(probe).backgroundColor;
        return cssColorToHex(typeof rgb === 'string' ? rgb.trim() : '');
    } finally {
        probe.remove();
    }
}

/**
 * Фактический фон интерфейса для пипетки «Фон».
 * Порядок как у «Элементы» (--color-primary): сначала то, что уже согласовано каскадом с html.dark,
 * затем резервы. Раньше оверрайд читался с ключом от effectiveThemeIsDark(settings) — при рассинхроне
 * настроек и класса dark на <html> подставлялся неверный слот, а ползунки расходились с экраном.
 */
function getRenderedBackgroundHex(_settings) {
    if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return null;
    const root = document.documentElement;
    if (!root) return null;
    const style = getComputedStyle(root);

    const tryColorString = (raw) => {
        const t = typeof raw === 'string' ? raw.trim() : '';
        if (!t || /^var\(/i.test(t)) return null;
        return cssColorToHex(t);
    };

    const fromComputedBackground = (el) => {
        if (!el) return null;
        const raw = getComputedStyle(el).backgroundColor;
        return cssColorToHex(typeof raw === 'string' ? raw.trim() : '');
    };

    /*
     * Канонический источник истины для фона приложения — семантический токен --color-background.
     * Он уже учитывает активную тему и override-слоты; поэтому резолвим его первым через probe.
     * Если токен временно недоступен (ранняя инициализация/нестандартное окружение), берём painted body/html.
     */
    const fromProbe = sampleBackgroundCssVarToHex('--color-background');
    if (fromProbe) return fromProbe;

    const fromToken = tryColorString(style.getPropertyValue('--color-background'));
    if (fromToken) return fromToken;

    const bodyPainted = fromComputedBackground(document.body);
    if (bodyPainted) return bodyPainted;

    const htmlPainted = fromComputedBackground(root);
    if (htmlPainted) return htmlPainted;

    const domDark = root.classList.contains('dark');
    const overrideRaw = style
        .getPropertyValue(`--override-background-${domDark ? 'dark' : 'light'}`)
        .trim();
    const themedOverride = cssColorToHex(overrideRaw);
    if (themedOverride) return themedOverride;

    const TD = THEME_DEFAULTS_REF;
    const fallbackHex = domDark
        ? TD?.backgroundDark || '#12121f'
        : TD?.backgroundLight || '#f9fafb';
    return normalizeHex(fallbackHex);
}

/** Реально отрисованный акцент — источник истины для слоя «Элементы». */
function getRenderedPrimaryHex() {
    if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return null;
    const root = document.documentElement;
    if (!root) return null;
    return cssColorToHex(getComputedStyle(root).getPropertyValue('--color-primary'));
}

/**
 * Дорожка градиента — первый [data-color-track] или первый дочерний блок.
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
 * Метрики для указателя/ручки по одному прямоугольнику (трек или весь слайдер).
 * Половина ручки ограничивается половиной ширины; travel должен быть >= MIN для стабильного маппинга.
 */
function mappingMetricsForRect(rect, hwRaw) {
    const w = rect.width;
    if (!Number.isFinite(w) || w < 1) {
        return { ok: false, hw: hwRaw, travel: 0, mappingRect: rect };
    }
    const hw = Math.min(hwRaw, Math.max(0, w / 2 - 0.5));
    const travel = w - 2 * hw;
    const ok = travel > 1e-6 && travel >= MIN_TRAVEL_PX_FOR_POINTER;
    return { ok, hw, travel, mappingRect: rect };
}

/**
 * Сначала градиент-трек; если у него в layout нет полезной ширины (часто у absolute inset-0 до reflow),
 * второй контур — весь контейнер #hue-slider / #brightness-slider (как у пользователя ~488px при width(track)=0).
 */
function effectiveTrackTravel(slider, handle) {
    const { sliderRect, trackRect } = getTrackAndSliderRects(slider);
    const hwRaw = getHandleHalfWidth(handle);
    const fromTrack = mappingMetricsForRect(trackRect, hwRaw);
    if (fromTrack.ok) {
        return { ...fromTrack, sliderRect, trackRect };
    }
    const fromSlider = mappingMetricsForRect(sliderRect, hwRaw);
    return { ...fromSlider, sliderRect, trackRect };
}

function setHandleLogicalPercent(slider, handle, logical0to100) {
    if (!slider || !handle) return;
    const { sliderRect } = getTrackAndSliderRects(slider);
    const lp = Math.max(0, Math.min(100, logical0to100));
    const { ok, hw, travel, mappingRect } = effectiveTrackTravel(slider, handle);
    let centerGlobalX;
    if (!ok) {
        const r = mappingRect.width >= 1 ? mappingRect : sliderRect;
        centerGlobalX = r.left + r.width / 2;
    } else {
        centerGlobalX = mappingRect.left + hw + (lp / 100) * travel;
    }
    const leftPercent =
        ((centerGlobalX - sliderRect.left) / Math.max(sliderRect.width, 1e-6)) * 100;
    handle.style.left = `${Math.max(0, Math.min(100, leftPercent))}%`;
}

function ensureLiveRegion() {
    let el = document.getElementById('color-picker-live-region');
    if (el) return el;
    const host = document.getElementById('advancedColorPicker');
    if (!host) return null;
    el = document.createElement('div');
    el.id = 'color-picker-live-region';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.className = 'sr-only';
    el.setAttribute('data-purpose', 'color-picker-announcements');
    host.appendChild(el);
    return el;
}

function liveRegionLayerPhrase() {
    const t = State?.uiModalState?.currentColorTarget || 'elements';
    if (t === 'elements') return 'цвет элементов';
    if (t === 'background') return 'цвет фона';
    return 'цвет текста';
}

function announcePickerColorNow() {
    const el = ensureLiveRegion();
    if (!el || typeof hslToHex !== 'function') return;
    const hex = hslToHex(pickerHsl.h, pickerHsl.s, pickerHsl.l);
    el.textContent = `Текущий ${liveRegionLayerPhrase()}: ${hex.toUpperCase()}`;
}

function updateHexInputSyncFromPicker() {
    const inp = document.getElementById('color-hex-input');
    if (!inp || typeof hslToHex !== 'function') return;
    const hex = hslToHex(pickerHsl.h, pickerHsl.s, pickerHsl.l);
    inp.value = hex.toUpperCase();
    inp.removeAttribute('aria-invalid');
}

/**
 * Подсказки по контрасту (WCAG 2.x) — второй контур обратной связи наряду с aria-live пипетки.
 */
function updateColorAccessibilityHint() {
    const el = document.getElementById('color-accessibility-hint');
    if (!el || typeof hslToHex !== 'function') return;
    const hex = hslToHex(pickerHsl.h, pickerHsl.s, pickerHsl.l);
    const target = State?.uiModalState?.currentColorTarget || 'elements';

    if (target === 'background') {
        el.textContent =
            'Для фона палитра текста и панелей пересчитывается автоматически при предпросмотре и сохранении.';
        return;
    }
    if (target === 'elements') {
        const { ratio, meetsUiNonTextAA, meetsNormalTextAA } = evaluatePrimaryOnWhiteText(hex);
        const r = ratio.toFixed(2);
        if (!meetsUiNonTextAA) {
            el.textContent = `Контраст белого текста на акценте: ${r}:1 — ниже 3:1 (ориентир WCAG для графики и крупных элементов UI). Сделайте оттенок темнее или насыщеннее.`;
        } else if (!meetsNormalTextAA) {
            el.textContent = `Контраст белого текста на акценте: ${r}:1 — для мелкого текста на кнопках желательно ≥ 4.5:1.`;
        } else {
            el.textContent = `Контраст белого текста на акценте: ${r}:1 — хороший запас читаемости.`;
        }
        return;
    }
    if (target === 'text') {
        const onLight = evaluateTextOnNeutral(hex, '#f9fafb');
        const onDark = evaluateTextOnNeutral(hex, '#12121f');
        const lightOk = onLight.meetsNormalTextAA;
        const darkOk = onDark.meetsNormalTextAA;
        if (!lightOk || !darkOk) {
            el.textContent = `Контраст на нейтрали: светлая тема ${onLight.ratio.toFixed(2)}:1, тёмная ${onDark.ratio.toFixed(2)}:1. Для основного текста целевой минимум 4.5:1 в обеих темах.`;
        } else {
            const worst = Math.min(onLight.ratio, onDark.ratio);
            el.textContent = `Контраст на нейтрали: не хуже ${worst.toFixed(2)}:1 — укладывается в AA для обычного текста.`;
        }
    }
}

function bindHexInputAndCopyControls() {
    const inp = document.getElementById('color-hex-input');
    const btn = document.getElementById('color-hex-copy-btn');
    if (inp && inp.dataset.hexInputBound !== 'true') {
        inp.dataset.hexInputBound = 'true';
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitHexInputOnCommitIntent();
            }
        });
        inp.addEventListener('blur', () => {
            const v = inp.value.trim();
            if (!v) {
                updateHexInputSyncFromPicker();
                inp.removeAttribute('aria-invalid');
                return;
            }
            commitHexInputOnCommitIntent();
        });
    }
    if (btn && btn.dataset.hexCopyBound !== 'true') {
        btn.dataset.hexCopyBound = 'true';
        btn.addEventListener('click', async () => {
            const hex =
                typeof hslToHex === 'function'
                    ? hslToHex(pickerHsl.h, pickerHsl.s, pickerHsl.l)
                    : '';
            const text = hex.toUpperCase();
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else if (inp) {
                    inp.value = text;
                    inp.select();
                    document.execCommand('copy');
                }
            } catch {
                /* ignore */
            }
        });
    }
}

function commitHexInputOnCommitIntent() {
    const inp = document.getElementById('color-hex-input');
    if (!inp) return;
    const v = inp.value.trim();
    if (!v) {
        updateHexInputSyncFromPicker();
        return;
    }
    const parsed = normalizeHex(v);
    if (!parsed) {
        inp.setAttribute('aria-invalid', 'true');
        updateHexInputSyncFromPicker();
        return;
    }
    inp.removeAttribute('aria-invalid');
    setColorPickerStateFromHex(parsed);
    applyPreviewFromPickerHsl();
}

function ariaValueNowForChannel(channel) {
    if (channel === 'h') {
        let n = Math.round(pickerHsl.h) % 360;
        if (n < 0) n += 360;
        return n;
    }
    if (channel === 's') return Math.round(pickerHsl.s);
    return Math.round(pickerHsl.l);
}

function ariaValueTextForChannel(channel) {
    if (channel === 'h') return `${Math.round(pickerHsl.h)} градусов`;
    if (channel === 's') return `${Math.round(pickerHsl.s)} процентов`;
    return `${Math.round(pickerHsl.l)} процентов`;
}

function updateSliderAria(sliderEl, channel) {
    if (!sliderEl) return;
    const cfg = SLIDER_ACCESS[channel];
    sliderEl.setAttribute('aria-valuemin', String(cfg.min));
    sliderEl.setAttribute('aria-valuemax', String(cfg.max));
    sliderEl.setAttribute('aria-valuenow', String(ariaValueNowForChannel(channel)));
    sliderEl.setAttribute('aria-valuetext', ariaValueTextForChannel(channel));
    if (!sliderEl.getAttribute('aria-label')) {
        sliderEl.setAttribute('aria-label', cfg.ariaLabel);
    }
}

function updateAllSlidersAria() {
    updateSliderAria(document.getElementById('hue-slider'), 'h');
    updateSliderAria(document.getElementById('saturation-slider'), 's');
    updateSliderAria(document.getElementById('brightness-slider'), 'l');
}

function applyKeyboardNudge(channel, key) {
    const cfg = SLIDER_ACCESS[channel];
    if (key === 'Home' || key === 'End') {
        if (channel === 'h') pickerHsl.h = key === 'Home' ? 0 : 359;
        else if (channel === 's') pickerHsl.s = key === 'Home' ? 0 : 100;
        else pickerHsl.l = key === 'Home' ? 0 : 100;
        return;
    }
    const page = key === 'PageUp' || key === 'PageDown';
    const mag = page ? cfg.pageStep : cfg.smallStep;
    let delta = 0;
    if (key === 'ArrowRight' || key === 'ArrowUp' || key === 'PageUp') delta = mag;
    else if (key === 'ArrowLeft' || key === 'ArrowDown' || key === 'PageDown') delta = -mag;
    else return;

    if (channel === 'h') pickerHsl.h = clampHue(pickerHsl.h + delta);
    else if (channel === 's') pickerHsl.s = clampSL(pickerHsl.s + delta);
    else pickerHsl.l = clampSL(pickerHsl.l + delta);
}

function bindSliderKeyboardAndAria(sliderId, channel) {
    const slider = document.getElementById(sliderId);
    if (!slider || slider.dataset.sliderA11yBound === 'true') return;
    slider.dataset.sliderA11yBound = 'true';
    slider.setAttribute('tabindex', '0');
    slider.setAttribute('role', 'slider');
    updateSliderAria(slider, channel);

    const keys = new Set([
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
    ]);
    slider.addEventListener('keydown', (e) => {
        if (!keys.has(e.key)) return;
        e.preventDefault();
        applyKeyboardNudge(channel, e.key);
        syncHandlesFromPickerHsl();
        updateGradients(pickerHsl.h, pickerHsl.s, pickerHsl.l);
        applyPreviewFromPickerHsl();
        announcePickerColorNow();
    });
}

function syncHandlesFromPickerHsl() {
    const { h, s, l } = pickerHsl;
    const hueSlider = document.getElementById('hue-slider');
    const saturationSlider = document.getElementById('saturation-slider');
    const brightnessSlider = document.getElementById('brightness-slider');
    const hueHandle = document.getElementById('hue-handle');
    const saturationHandle = document.getElementById('saturation-handle');
    const brightnessHandle = document.getElementById('brightness-handle');
    if (hueSlider && hueHandle) setHandleLogicalPercent(hueSlider, hueHandle, (h / 360) * 100);
    if (saturationSlider && saturationHandle)
        setHandleLogicalPercent(saturationSlider, saturationHandle, s);
    if (brightnessSlider && brightnessHandle)
        setHandleLogicalPercent(brightnessSlider, brightnessHandle, l);
}

function updateUIFromHsl(h, s, l) {
    const hex = hslToHex(h, s, l);
    const hueValue = document.getElementById('hue-value');
    const saturationValue = document.getElementById('saturation-value');
    const brightnessValue = document.getElementById('brightness-value');
    const previewSwatch = document.getElementById('color-preview-swatch');
    if (hueValue) hueValue.value = String(Math.round(h));
    if (saturationValue) saturationValue.value = String(Math.round(s));
    if (brightnessValue) brightnessValue.value = String(Math.round(l));
    if (previewSwatch) previewSwatch.style.backgroundColor = hex;
    updateHexInputSyncFromPicker();
    updateColorAccessibilityHint();
}

function updateGradients(h, _s, _l) {
    const satGrad = document.getElementById('saturation-slider-gradient');
    const brightGrad = document.getElementById('brightness-slider-gradient');
    const baseColor = hslToHex(h, 100, 50);
    if (satGrad) {
        satGrad.style.backgroundImage = `linear-gradient(to right, #808080 0%, ${baseColor} 100%)`;
    }
    if (brightGrad) {
        brightGrad.style.backgroundImage = `linear-gradient(to right, #000 0%, ${baseColor} 50%, #fff 100%)`;
    }
}

/**
 * Пипетка должна работать даже если открыли кастомизацию до loadUISettings:
 * иначе applyPreviewFromPickerHsl выходил в начале — не вызывался applyPreviewSettings и не обновлялся aria-valuenow.
 */
function ensureCurrentPreviewSettingsObject() {
    if (!State) return;
    if (State.currentPreviewSettings && typeof State.currentPreviewSettings === 'object') return;
    try {
        if (State.userPreferences && typeof State.userPreferences === 'object') {
            State.currentPreviewSettings = JSON.parse(JSON.stringify(State.userPreferences));
            return;
        }
    } catch {
        /* fall through */
    }
    if (DEFAULT_UI_SETTINGS && typeof DEFAULT_UI_SETTINGS === 'object') {
        try {
            State.currentPreviewSettings = JSON.parse(JSON.stringify(DEFAULT_UI_SETTINGS));
        } catch {
            State.currentPreviewSettings = { ...DEFAULT_UI_SETTINGS };
        }
    } else {
        State.currentPreviewSettings = {};
    }
}

function applyPreviewFromPickerHsl() {
    const { h, s, l } = pickerHsl;
    if (typeof hslToHex !== 'function') return;
    const hex = hslToHex(h, s, l);
    const target =
        (State && State.uiModalState && State.uiModalState.currentColorTarget) || 'elements';

    if (State) {
        ensureCurrentPreviewSettingsObject();
        const cps = State.currentPreviewSettings;
        if (cps && typeof cps === 'object') {
            if (target === 'elements') {
                cps.primaryColor = hex;
            } else if (target === 'background') {
                cps.backgroundColor = hex;
                cps.isBackgroundCustom = true;
            } else if (target === 'text') {
                cps.customTextColor = hex;
                cps.isTextCustom = true;
            }
            if (typeof updatePreviewSettingsFromModal === 'function')
                updatePreviewSettingsFromModal();
            if (typeof applyPreviewSettings === 'function') applyPreviewSettings(cps);
            State.isUISettingsDirty = true;
        }
    }

    updateUIFromHsl(h, s, l);
    updateDualThemePreviewStrip();
    updateAllSlidersAria();
}

/**
 * Предпросмотр «как будет» в светлой и тёмной теме без переключения глобальной темы приложения.
 */
function updateDualThemePreviewStrip() {
    const lightEl = document.getElementById('customization-preview-light');
    const darkEl = document.getElementById('customization-preview-dark');
    if (!lightEl || !darkEl || !State?.currentPreviewSettings) return;

    const target = State.uiModalState?.currentColorTarget || 'elements';
    const prev = State.currentPreviewSettings;
    const TD = THEME_DEFAULTS_REF;
    const primary =
        prev.primaryColor || DEFAULT_UI_SETTINGS?.primaryColor || TD?.primary || DEFAULT_HEX;

    const neutralLight = '#f9fafb';
    const neutralDark = '#12121f';
    const defaultTextLight = '#111827';
    const defaultTextDark = '#ffffff';

    if (target === 'background' && hexToHsl && hslToHex && adjustHsl) {
        const baseRaw =
            prev.isBackgroundCustom && prev.backgroundColor
                ? prev.backgroundColor
                : resolveHexForCustomizationTarget(prev, {
                      uiModalState: { currentColorTarget: 'background' },
                  });
        const base = normalizeColorToHex(baseRaw) || DEFAULT_HEX;
        const activeTheme = activeUiThemeKeyForBackground(prev);
        const { light: bgL, dark: bgD } = deriveThemeBackgroundPairFromHex(
            base,
            hexToHsl,
            hslToHex,
            adjustHsl,
            { activeTheme },
        );
        lightEl.style.backgroundColor = bgL;
        darkEl.style.backgroundColor = bgD;
        lightEl.style.color = defaultTextLight;
        darkEl.style.color = defaultTextDark;
        for (const el of [lightEl, darkEl]) {
            const strip = el.querySelector('[data-role="accent"]');
            if (strip) strip.style.opacity = '0';
        }
    } else if (target === 'text') {
        const tc =
            prev.isTextCustom && prev.customTextColor
                ? prev.customTextColor
                : effectiveThemeIsDark(prev)
                  ? defaultTextDark
                  : defaultTextLight;
        lightEl.style.backgroundColor = neutralLight;
        darkEl.style.backgroundColor = neutralDark;
        lightEl.style.color = tc;
        darkEl.style.color = tc;
        for (const el of [lightEl, darkEl]) {
            const strip = el.querySelector('[data-role="accent"]');
            if (strip) strip.style.opacity = '0';
        }
    } else {
        lightEl.style.backgroundColor = neutralLight;
        darkEl.style.backgroundColor = neutralDark;
        lightEl.style.color = defaultTextLight;
        darkEl.style.color = defaultTextDark;
        for (const el of [lightEl, darkEl]) {
            const strip = el.querySelector('[data-role="accent"]');
            if (strip) {
                strip.style.opacity = '1';
                strip.style.backgroundColor = primary;
            }
        }
    }

    lightEl.dataset.previewTarget = target;
    darkEl.dataset.previewTarget = target;
}

function effectiveThemeIsDark(settings) {
    const mode = settings?.theme || settings?.themeMode || 'dark';
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return true;
    }
}

/**
 * Какой слот темы считается «якорем» для выбранного в пипетке hex фона — дословно как в applyPreviewSettings (preview-settings.js).
 * Без этого dual-preview рисовал оба столбца через симметричный derive и расходился с реальными --override-background-*.
 */
function activeUiThemeKeyForBackground(settings) {
    const mode = settings?.theme || settings?.themeMode || DEFAULT_UI_SETTINGS?.themeMode || 'dark';
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    try {
        return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
}

/**
 * HEX для пипетки с учётом текущей цели и флагов кастомизации (единая логика для модалки и переключателя).
 *
 * Фон — два контура согласованности:
 * 1) Кастомный: нормализованный `backgroundColor` в настройках (источник истины пользователя);
 *    при невалидном hex — `getRenderedBackgroundHex` (DOM / оверрайды / дефолт палитры).
 * 2) Не кастомный: `getRenderedBackgroundHex` (computed + резерв THEME_DEFAULTS), затем явный fallback.
 */
export function resolveHexForCustomizationTarget(settings, state) {
    const target = state?.uiModalState?.currentColorTarget || 'elements';
    const TD = THEME_DEFAULTS_REF;
    const primary =
        settings?.primaryColor || DEFAULT_UI_SETTINGS?.primaryColor || TD?.primary || DEFAULT_HEX;

    if (target === 'elements') {
        return getRenderedPrimaryHex() || normalizeHex(primary) || DEFAULT_HEX;
    }
    if (target === 'background') {
        if (settings?.isBackgroundCustom && settings.backgroundColor) {
            const saved = normalizeColorToHex(settings.backgroundColor);
            if (saved) {
                const hasAppliedCustomBg = !!document.body?.classList.contains(
                    'custom-background-active',
                );
                if (hasAppliedCustomBg) {
                    const rendered = getRenderedBackgroundHex(settings);
                    if (rendered) return rendered;
                }
                /*
                 * Для кастомного фона source-of-truth пользователя — saved base color,
                 * но показывать в пипетке нужно фактически активный слот темы "здесь и сейчас".
                 * Иначе при theme=auto и смене системной темы пипетка показывает не тот цвет,
                 * который реально отрисован на фоне приложения.
                 */
                if (hexToHsl && hslToHex && adjustHsl) {
                    const activeTheme = activeUiThemeKeyForBackground(settings);
                    const pair = deriveThemeBackgroundPairFromHex(
                        saved,
                        hexToHsl,
                        hslToHex,
                        adjustHsl,
                        { activeTheme },
                    );
                    const activeHex = activeTheme === 'dark' ? pair.dark : pair.light;
                    return normalizeColorToHex(activeHex) || saved;
                }
                return saved;
            }
            const fromDom = getRenderedBackgroundHex(settings);
            return fromDom || DEFAULT_HEX;
        }
        const fromDom = getRenderedBackgroundHex(settings);
        if (fromDom) return fromDom;
        const dark = effectiveThemeIsDark(settings);
        const raw = dark ? TD?.backgroundDark || '#12121f' : TD?.backgroundLight || '#f9fafb';
        return normalizeHex(raw) || DEFAULT_HEX;
    }
    if (target === 'text') {
        if (settings?.isTextCustom && settings.customTextColor) {
            return normalizeColorToHex(settings.customTextColor) || DEFAULT_HEX;
        }
        return effectiveThemeIsDark(settings) ? '#ffffff' : '#111827';
    }
    return normalizeHex(primary) || DEFAULT_HEX;
}

export function setColorPickerStateFromHex(hex) {
    const normalized = normalizeHex(hex) || DEFAULT_HEX;
    const hsl = hexToHsl(normalized);
    if (!hsl) return;
    pickerHsl = { h: clampHue(hsl.h), s: clampSL(hsl.s), l: clampSL(hsl.l) };

    function applyFrame() {
        ensureLiveRegion();
        syncHandlesFromPickerHsl();
        updateGradients(pickerHsl.h, pickerHsl.s, pickerHsl.l);
        updateUIFromHsl(pickerHsl.h, pickerHsl.s, pickerHsl.l);
        updateAllSlidersAria();
        updateDualThemePreviewStrip();
    }
    applyFrame();
    requestAnimationFrame(applyFrame);
}

function pointerToLogicalPercent(slider, handle, clientX, fallbackLp) {
    const fb = Number(fallbackLp);
    const safeFallback = Number.isFinite(fb) ? Math.max(0, Math.min(100, fb)) : 50;
    if (!Number.isFinite(clientX)) return safeFallback;
    const { mappingRect, ok, hw, travel } = effectiveTrackTravel(slider, handle);
    if (!ok || travel < MIN_TRAVEL_PX_FOR_POINTER) return safeFallback;
    const centerGlobalX = Math.max(
        mappingRect.left + hw,
        Math.min(mappingRect.right - hw, clientX),
    );
    const raw = ((centerGlobalX - mappingRect.left - hw) / travel) * 100;
    if (!Number.isFinite(raw)) return safeFallback;
    return Math.max(0, Math.min(100, raw));
}

function makeSliderDrag(sliderId, handleId, channel) {
    const slider = document.getElementById(sliderId);
    const handle = document.getElementById(handleId);
    if (!slider || !handle) return;

    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let suppressClick = false;
    let suppressClickUntil = 0;

    function nowMs() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    function pointerHitsHandle(clientX, clientY) {
        const rect = handle.getBoundingClientRect();
        const margin = 16;
        return (
            clientX >= rect.left - margin &&
            clientX <= rect.right + margin &&
            clientY >= rect.top - margin &&
            clientY <= rect.bottom + margin
        );
    }

    function currentLogicalPercentForChannel() {
        if (channel === 'h') return (pickerHsl.h / 360) * 100;
        if (channel === 's') return pickerHsl.s;
        return pickerHsl.l;
    }

    function applyChannelFromPercent(p) {
        let lp = Number(p);
        if (!Number.isFinite(lp)) lp = currentLogicalPercentForChannel();
        lp = Math.max(0, Math.min(100, lp));
        if (channel === 'h') pickerHsl.h = clampHue((lp / 100) * 360);
        else if (channel === 's') pickerHsl.s = clampSL(lp);
        else pickerHsl.l = clampSL(lp);
        syncHandlesFromPickerHsl();
        updateGradients(pickerHsl.h, pickerHsl.s, pickerHsl.l);
        applyPreviewFromPickerHsl();
    }

    function onPointerMove(e) {
        if (e.pointerId !== activePointerId) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > DRAG_SUPPRESS_CLICK_PX || dy > DRAG_SUPPRESS_CLICK_PX) suppressClick = true;
        const lp = pointerToLogicalPercent(
            slider,
            handle,
            e.clientX,
            currentLogicalPercentForChannel(),
        );
        applyChannelFromPercent(lp);
    }

    function endPointer(e) {
        if (e.pointerId !== activePointerId) return;
        if (typeof slider.releasePointerCapture === 'function') {
            try {
                slider.releasePointerCapture(activePointerId);
            } catch {
                /* ignore */
            }
        }
        activePointerId = null;
        slider.removeEventListener('pointermove', onPointerMove);
        slider.removeEventListener('pointerup', endPointer);
        slider.removeEventListener('pointercancel', endPointer);
        // Touch/pen often emit a follow-up click (ghost click). Ignore short-window click duplicates.
        suppressClickUntil = nowMs() + 450;
        announcePickerColorNow();
    }

    slider.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        suppressClick = false;
        try {
            slider.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        slider.addEventListener('pointermove', onPointerMove);
        slider.addEventListener('pointerup', endPointer);
        slider.addEventListener('pointercancel', endPointer);
        // If user grabbed the thumb, keep current value until there is actual movement.
        if (!pointerHitsHandle(e.clientX, e.clientY)) {
            const lp = pointerToLogicalPercent(
                slider,
                handle,
                e.clientX,
                currentLogicalPercentForChannel(),
            );
            applyChannelFromPercent(lp);
        }
    });

    slider.addEventListener('click', (e) => {
        if (suppressClick || nowMs() <= suppressClickUntil) {
            suppressClick = false;
            suppressClickUntil = 0;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (pointerHitsHandle(e.clientX, e.clientY)) return;
        if (e.target === handle) return;
        const lp = pointerToLogicalPercent(
            slider,
            handle,
            e.clientX,
            currentLogicalPercentForChannel(),
        );
        applyChannelFromPercent(lp);
    });
}

/**
 * После смены светлая/тёмная в модалке обновляет пипетку, если выбран слой, зависящий от темы по умолчанию.
 */
export function refreshCustomizationPickerAfterThemeChange() {
    const modal = document.getElementById('appCustomizationModal');
    if (!modal || modal.classList.contains('hidden')) return;
    const target = State?.uiModalState?.currentColorTarget || 'elements';
    if (target === 'elements') {
        updateDualThemePreviewStrip();
        return;
    }
    const settings = State?.currentPreviewSettings;
    if (!settings) return;
    setColorPickerStateFromHex(resolveHexForCustomizationTarget(settings, State));
}

export function initColorPicker() {
    const hueSlider = document.getElementById('hue-slider');
    const saturationSlider = document.getElementById('saturation-slider');
    const brightnessSlider = document.getElementById('brightness-slider');
    const colorTargetSelector = document.getElementById('colorTargetSelector');
    if (!hueSlider || !saturationSlider || !brightnessSlider) return;
    if (hueSlider.dataset.colorPickerInited === 'true') return;
    hueSlider.dataset.colorPickerInited = 'true';

    ensureLiveRegion();
    makeSliderDrag('hue-slider', 'hue-handle', 'h');
    makeSliderDrag('saturation-slider', 'saturation-handle', 's');
    makeSliderDrag('brightness-slider', 'brightness-handle', 'l');

    bindSliderKeyboardAndAria('hue-slider', 'h');
    bindSliderKeyboardAndAria('saturation-slider', 's');
    bindSliderKeyboardAndAria('brightness-slider', 'l');
    updateAllSlidersAria();
    bindHexInputAndCopyControls();
    updateHexInputSyncFromPicker();
    updateColorAccessibilityHint();

    if (colorTargetSelector && State) {
        colorTargetSelector.addEventListener('change', (e) => {
            const radio = e.target;
            if (radio.name === 'colorTarget' && radio.value) {
                State.uiModalState = State.uiModalState || {};
                State.uiModalState.currentColorTarget = radio.value;
                const settings = State.currentPreviewSettings || {};
                const hex = resolveHexForCustomizationTarget(settings, State);
                setColorPickerStateFromHex(hex);
            }
        });
    }
}
