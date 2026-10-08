'use strict';

/**
 * Палитра цветов папок закладок и категорий внешних ссылок.
 * Хранится либо id из палитры (обратная совместимость: gray, red, … rose),
 * либо произвольный цвет в формате #rrggbb. Отрисовка — через CSS-переменную --fc
 * (классы .folder-chip / .folder-dot / .fc-swatch в css/components/polish-v15.css),
 * поэтому динамические значения не требуют новых утилит Tailwind.
 */

export const FOLDER_PALETTE = [
    { id: 'gray', label: 'Серый', hex: '#6b7280' },
    { id: 'slate', label: 'Сланец', hex: '#475569' },
    { id: 'stone', label: 'Камень', hex: '#78716c' },
    { id: 'brown', label: 'Коричневый', hex: '#92400e' },
    { id: 'red', label: 'Красный', hex: '#dc2626' },
    { id: 'rose', label: 'Розовый', hex: '#f43f5e' },
    { id: 'pink', label: 'Пурпурно-розовый', hex: '#db2777' },
    { id: 'fuchsia', label: 'Фуксия', hex: '#c026d3' },
    { id: 'purple', label: 'Фиолетовый', hex: '#9333ea' },
    { id: 'violet', label: 'Лиловый', hex: '#7c3aed' },
    { id: 'indigo', label: 'Индиго', hex: '#4f46e5' },
    { id: 'blue', label: 'Синий', hex: '#2563eb' },
    { id: 'sky', label: 'Небесный', hex: '#0ea5e9' },
    { id: 'cyan', label: 'Бирюзово-голубой', hex: '#06b6d4' },
    { id: 'teal', label: 'Бирюзовый', hex: '#14b8a6' },
    { id: 'emerald', label: 'Изумрудный', hex: '#10b981' },
    { id: 'green', label: 'Зелёный', hex: '#22c55e' },
    { id: 'lime', label: 'Лаймовый', hex: '#84cc16' },
    { id: 'yellow', label: 'Жёлтый', hex: '#eab308' },
    { id: 'amber', label: 'Янтарный', hex: '#f59e0b' },
    { id: 'orange', label: 'Оранжевый', hex: '#f97316' },
    { id: 'coral', label: 'Коралловый', hex: '#fb7185' },
    { id: 'mint', label: 'Мятный', hex: '#5eead4' },
    { id: 'navy', label: 'Тёмно-синий', hex: '#1e3a8a' },
];

const BY_ID = Object.fromEntries(FOLDER_PALETTE.map((c) => [c.id, c]));
const HEX_RE = /^#[0-9a-f]{6}$/;
export const DEFAULT_FOLDER_COLOR = 'blue';

/** Порядок «от красного к зелёному» и далее — для сортировки папок по цвету */
export const FOLDER_COLOR_SORT_ORDER = [
    'red', 'coral', 'rose', 'pink', 'fuchsia', 'purple', 'violet', 'indigo', 'navy', 'blue', 'sky', 'cyan',
    'teal', 'mint', 'emerald', 'green', 'lime', 'yellow', 'amber', 'orange', 'brown', 'stone', 'slate', 'gray',
];

/** Нормализация: id палитры, #rrggbb или 'gray' по умолчанию (учитывает старые значения вида bg-red-500). */
export function normalizeFolderColor(value) {
    if (!value) return 'gray';
    const raw = String(value).trim().toLowerCase();
    if (HEX_RE.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/.test(raw)) return '#' + raw.slice(1).replace(/./g, (c) => c + c);
    const cleaned = raw
        .replace(/^bg-/, '')
        .replace(/\/.+$/, '')
        .replace(/-(50|100|200|300|400|500|600|700|800|900|950)$/, '');
    return BY_ID[cleaned] ? cleaned : 'gray';
}

export function folderColorHex(value) {
    const key = normalizeFolderColor(value);
    return HEX_RE.test(key) ? key : BY_ID[key].hex;
}

/** Атрибут style для чипа/точки: безопасен — hex проходит строгую проверку. */
export function folderColorStyle(value) {
    return `--fc:${folderColorHex(value)}`;
}

export function folderColorLabel(value) {
    const key = normalizeFolderColor(value);
    return HEX_RE.test(key) ? `Свой цвет ${key.toUpperCase()}` : BY_ID[key].label;
}

export function folderColorSortIndex(value) {
    const key = normalizeFolderColor(value);
    if (HEX_RE.test(key)) {
        // пользовательские цвета — по ближайшему оттенку (hue) после палитры не группируем, ставим перед серым
        return FOLDER_COLOR_SORT_ORDER.length - 1.5;
    }
    const idx = FOLDER_COLOR_SORT_ORDER.indexOf(key);
    return idx >= 0 ? idx : FOLDER_COLOR_SORT_ORDER.length;
}

/**
 * HTML выбора цвета: сетка сwatch-радиокнопок + «свой цвет» (input type=color).
 * Радио с name=<name> остаётся источником значения (querySelector(`input[name="…"]:checked`)).
 */
export function renderFolderColorPicker(name, selected = DEFAULT_FOLDER_COLOR) {
    const sel = normalizeFolderColor(selected);
    const isCustom = HEX_RE.test(sel);
    const swatches = FOLDER_PALETTE.map(
        (c) => `<label class="fc-swatch" style="--fc:${c.hex}" title="${c.label}">
            <input type="radio" name="${name}" value="${c.id}"${!isCustom && sel === c.id ? ' checked' : ''} aria-label="${c.label}">
            <span class="fc-swatch__dot" aria-hidden="true"></span>
        </label>`,
    ).join('');
    const customHex = isCustom ? sel : '#8b5cf6';
    return `<div class="fc-picker" data-fc-picker role="radiogroup" aria-label="Цвет">
        ${swatches}
        <label class="fc-swatch fc-swatch--custom" style="--fc:${customHex}" title="Свой цвет — выберите любой оттенок">
            <input type="radio" name="${name}" value="${customHex}" data-fc-custom-radio${isCustom ? ' checked' : ''} aria-label="Свой цвет">
            <span class="fc-swatch__dot" aria-hidden="true"><i class="fas fa-eye-dropper"></i></span>
            <input type="color" value="${customHex}" data-fc-custom-input class="fc-swatch__color" aria-label="Выбрать свой цвет" tabindex="-1">
        </label>
    </div>`;
}

/** Программно выбрать цвет в пикере формы (редактирование папки/категории). */
export function setFolderColorInPicker(root, name, value) {
    if (!root) return;
    const key = normalizeFolderColor(value || DEFAULT_FOLDER_COLOR);
    if (HEX_RE.test(key)) {
        const radio = root.querySelector('[data-fc-custom-radio]');
        const input = root.querySelector('[data-fc-custom-input]');
        if (radio && input) {
            input.value = key;
            radio.value = key;
            radio.checked = true;
            const sw = radio.closest('.fc-swatch');
            if (sw) sw.style.setProperty('--fc', key);
        }
        return;
    }
    const radio = root.querySelector(`input[name="${name}"][value="${key}"]`);
    if (radio) radio.checked = true;
}

/** Делегированная привязка: изменение <input type=color> обновляет значение «своего» радио. */
export function initFolderColorPickers() {
    if (typeof document === 'undefined' || document.__fcBound) return;
    document.__fcBound = true;
    document.addEventListener('input', (e) => {
        const inp = e.target;
        if (!inp || !inp.matches || !inp.matches('[data-fc-custom-input]')) return;
        const sw = inp.closest('.fc-swatch');
        const radio = sw && sw.querySelector('[data-fc-custom-radio]');
        if (!radio) return;
        const hex = normalizeFolderColor(inp.value);
        radio.value = hex;
        radio.checked = true;
        sw.style.setProperty('--fc', hex);
    });
}

initFolderColorPickers();
