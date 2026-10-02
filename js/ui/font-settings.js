'use strict';

/**
 * Настройка шрифтов приложения: семейство интерфейса и моноширинное, размер, межстрочный интервал.
 * Только системные стеки (нет внешней сети). Значения валидируются при чтении; хранение — localStorage
 * (не зависит от IndexedDB, поэтому применяется сразу при старте и переживает сбои БД).
 * Аварийный сброс: добавьте к адресу ?resetFonts=1 (или ?resetUi=1).
 */

export const FONT_STORAGE_KEY = 'copilot.fonts.v1';

export const UI_FONTS = [
    { id: 'default', label: 'По умолчанию (системный)', stack: '' },
    { id: 'segoe', label: 'Segoe UI / Roboto', stack: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
    { id: 'system', label: 'Системный интерфейс (system-ui)', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
    { id: 'verdana', label: 'Verdana — крупный и чёткий', stack: "Verdana, Geneva, 'DejaVu Sans', sans-serif" },
    { id: 'tahoma', label: 'Tahoma — компактный', stack: "Tahoma, 'Segoe UI', Geneva, sans-serif" },
    { id: 'trebuchet', label: 'Trebuchet MS — дружелюбный', stack: "'Trebuchet MS', 'Segoe UI', Helvetica, sans-serif" },
    { id: 'arial', label: 'Arial / Helvetica', stack: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
    { id: 'georgia', label: 'Georgia — с засечками', stack: "Georgia, 'Times New Roman', serif" },
    { id: 'mono', label: 'Моноширинный (весь интерфейс)', stack: "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace" },
];

export const MONO_FONTS = [
    { id: 'default', label: 'По умолчанию', stack: '' },
    { id: 'consolas', label: 'Consolas / Cascadia', stack: "Consolas, 'Cascadia Mono', 'Courier New', monospace" },
    { id: 'menlo', label: 'Menlo / SF Mono', stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
    { id: 'courier', label: 'Courier New', stack: "'Courier New', Courier, monospace" },
];

export const FONT_DEFAULTS = Object.freeze({ ui: 'default', mono: 'default', scale: 100, line: 100 });

const clamp = (n, lo, hi, d) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;
};

/** Приводит произвольный объект к допустимым настройкам (повреждённые значения → значения по умолчанию). */
export function sanitizeFontSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        ui: UI_FONTS.some((f) => f.id === r.ui) ? r.ui : 'default',
        mono: MONO_FONTS.some((f) => f.id === r.mono) ? r.mono : 'default',
        scale: clamp(r.scale, 85, 130, 100),
        line: clamp(r.line, 90, 150, 100),
    };
}

export function loadFontSettings() {
    try {
        const raw = window.localStorage.getItem(FONT_STORAGE_KEY);
        return sanitizeFontSettings(raw ? JSON.parse(raw) : null);
    } catch {
        return { ...FONT_DEFAULTS };
    }
}

export function saveFontSettings(s) {
    try {
        window.localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(sanitizeFontSettings(s)));
    } catch {
        /* хранилище недоступно — настройки действуют до перезагрузки */
    }
}

export function applyFontSettings(settings) {
    const s = sanitizeFontSettings(settings);
    const root = document.documentElement;
    const ui = UI_FONTS.find((f) => f.id === s.ui);
    const mono = MONO_FONTS.find((f) => f.id === s.mono);
    if (ui && ui.stack) root.style.setProperty('--app-font-ui', ui.stack);
    else root.style.removeProperty('--app-font-ui');
    if (mono && mono.stack) root.style.setProperty('--font-mono', mono.stack);
    else root.style.removeProperty('--font-mono');
    root.style.setProperty('--app-font-scale', String(s.scale / 100));
    root.style.setProperty('--app-line-scale', String(s.line / 100));
    root.classList.toggle('app-font-custom', Boolean(ui && ui.stack) || s.scale !== 100 || s.line !== 100);
}

function buildSection(state, onChange) {
    const sec = document.createElement('section');
    sec.className = 'app-customization-section font-settings-section';
    sec.setAttribute('aria-labelledby', 'acm-fonts-heading');
    const opts = (list, cur) =>
        list.map((f) => `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.label}</option>`).join('');
    sec.innerHTML = `
        <h3 id="acm-fonts-heading" class="app-customization-section-title ac-title">Шрифты</h3>
        <p class="app-customization-section-hint ac-hint">Применяется сразу и сохраняется в этом браузере. Только системные шрифты — работает офлайн.</p>
        <div class="fs-grid">
            <label class="fs-field"><span>Шрифт интерфейса</span><select data-fs="ui">${opts(UI_FONTS, state.ui)}</select></label>
            <label class="fs-field"><span>Моноширинный (код, логи)</span><select data-fs="mono">${opts(MONO_FONTS, state.mono)}</select></label>
            <label class="fs-field"><span>Размер текста: <b data-fs-out="scale">${state.scale}%</b></span><input type="range" min="85" max="130" step="5" value="${state.scale}" data-fs="scale"></label>
            <label class="fs-field"><span>Межстрочный интервал: <b data-fs-out="line">${state.line}%</b></span><input type="range" min="90" max="150" step="5" value="${state.line}" data-fs="line"></label>
        </div>
        <div class="fs-preview" aria-live="polite">
            <div class="fs-preview-title">Образец текста</div>
            <p>Съешь ещё этих мягких французских булок, да выпей чаю. 0123456789</p>
            <code>INN 7707083893 · КПП 770701 · &lt;Файл&gt;…&lt;/Файл&gt;</code>
        </div>
        <button type="button" class="fs-reset" data-fs-reset>Сбросить шрифты</button>`;
    sec.addEventListener('input', (e) => {
        const key = e.target.getAttribute && e.target.getAttribute('data-fs');
        if (!key) return;
        const next = { ...state };
        next[key] = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
        Object.assign(state, sanitizeFontSettings(next));
        const out = sec.querySelector(`[data-fs-out="${key}"]`);
        if (out) out.textContent = state[key] + '%';
        onChange(state);
    });
    sec.querySelector('[data-fs-reset]').addEventListener('click', () => {
        Object.assign(state, FONT_DEFAULTS);
        sec.querySelectorAll('[data-fs]').forEach((el) => {
            el.value = state[el.getAttribute('data-fs')];
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        ['scale', 'line'].forEach((k) => {
            const out = sec.querySelector(`[data-fs-out="${k}"]`);
            if (out) out.textContent = state[k] + '%';
        });
        onChange(state);
    });
    return sec;
}

function findMountTarget() {
    return (
        document.querySelector('#appCustomizationModal [data-ac-mount="fonts"]') ||
        document.querySelector('#appCustomizationModal .app-customization-stack')
    );
}

function mountSection(state) {
    const target = findMountTarget();
    if (!target) return false;
    if (target.querySelector('.font-settings-section')) return true;
    const sec = buildSection(state, (s) => {
        applyFontSettings(s);
        saveFontSettings(s);
    });
    target.appendChild(sec);
    return true;
}

/**
 * Перестроить секцию шрифтов по сохранённым значениям (после «Отменить изменения», пресета, сброса).
 * @returns {boolean}
 */
export function remountFontSettings() {
    const target = findMountTarget();
    if (!target) return false;
    target.querySelectorAll('.font-settings-section').forEach((n) => n.remove());
    return mountSection(loadFontSettings());
}

export function initFontSettings() {
    try {
        const q = new URLSearchParams(window.location.search);
        if (q.get('resetFonts') === '1' || q.get('resetUi') === '1') {
            window.localStorage.removeItem(FONT_STORAGE_KEY);
        }
    } catch {
        /* ignore */
    }
    const state = loadFontSettings();
    applyFontSettings(state);
    const tryMount = () => mountSection(state);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryMount, { once: true });
    } else if (!tryMount()) {
        setTimeout(tryMount, 1500);
    }
}
