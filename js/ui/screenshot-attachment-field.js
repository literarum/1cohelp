'use strict';

/**
 * Единые классы для блока «Скриншоты» в формах редактирования (закладки, шаги алгоритма).
 * Селекторы для обработчиков (.add-bookmark-screenshot-btn, #bookmarkScreenshotThumbnailsContainer,
 * .add-screenshot-btn, #screenshotThumbnailsContainer) сохранены без изменений.
 */

export const SCREENSHOT_EDIT_FIELD = {
    /**
     * Единая карточка блока «Скриншоты» (как визуальный блок в форме закладки — рамка, фон, скругление).
     * Раньше в шагах алгоритма был только border-t — из‑за фона шага это почти не отличалось от остального текста.
     */
    wrapperCard:
        'app-screenshot-field rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/50 p-3 shadow-sm',
    label: 'block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300',
    hint: 'app-screenshot-field__hint text-xs text-gray-500 dark:text-gray-400 mb-2',
    /** Область миниатюр и вставки из буфера */
    dropzone:
        'app-screenshot-field__dropzone flex flex-wrap gap-2 mb-2 min-h-[3rem] p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/30',
    actions: 'app-screenshot-field__actions flex items-center gap-3',
    addBtnBookmark:
        'add-bookmark-screenshot-btn app-screenshot-field__add-btn px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition',
    addBtnStep:
        'add-screenshot-btn app-screenshot-field__add-btn px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition',
};

/**
 * Поведение поля «Скриншоты» — такое же, как у поля PDF: пустая область целиком кликабельна
 * (открывает выбор файлов), принимает перетаскивание изображений; вставка из буфера (Ctrl/Cmd+V)
 * остаётся в обработчиках формы (screenshots.js). Делегирование на document — работает для форм,
 * которые создаются динамически (закладка, шаг алгоритма).
 */
const ZONE_SEL = '.app-screenshot-field__dropzone';

function fieldOf(zone) {
    return zone && zone.closest ? zone.closest('.app-screenshot-field') : null;
}

function openPicker(zone) {
    const field = fieldOf(zone);
    const btn = field && field.querySelector('.app-screenshot-field__add-btn');
    if (btn && !btn.disabled) btn.click();
}

function hasImageFiles(dt) {
    if (!dt) return false;
    if (dt.items && dt.items.length) {
        return Array.from(dt.items).some((i) => i.kind === 'file' && /^image\//.test(i.type));
    }
    return Array.from(dt.files || []).some((f) => /^image\//.test(f.type));
}

export function initScreenshotFieldBehavior() {
    if (typeof document === 'undefined' || document.__screenshotFieldBound) return;
    document.__screenshotFieldBound = true;

    document.addEventListener('click', (e) => {
        const zone = e.target && e.target.closest ? e.target.closest(ZONE_SEL) : null;
        // клик по самой пустой области (не по миниатюре и не по её кнопкам)
        if (zone && e.target === zone) openPicker(zone);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const zone = e.target && e.target.matches && e.target.matches(ZONE_SEL) ? e.target : null;
        if (zone) {
            e.preventDefault();
            openPicker(zone);
        }
    });

    let depth = 0;
    const clear = () => {
        depth = 0;
        document.querySelectorAll(`${ZONE_SEL}.is-dragover`).forEach((z) => z.classList.remove('is-dragover'));
    };
    document.addEventListener('dragenter', (e) => {
        const zone = e.target && e.target.closest ? e.target.closest(ZONE_SEL) : null;
        if (!zone || !hasImageFiles(e.dataTransfer)) return;
        e.preventDefault();
        depth++;
        zone.classList.add('is-dragover');
    });
    document.addEventListener('dragover', (e) => {
        const zone = e.target && e.target.closest ? e.target.closest(ZONE_SEL) : null;
        if (!zone || !hasImageFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('dragleave', (e) => {
        const zone = e.target && e.target.closest ? e.target.closest(ZONE_SEL) : null;
        if (!zone) return;
        depth = Math.max(0, depth - 1);
        if (depth === 0) zone.classList.remove('is-dragover');
    });
    document.addEventListener('drop', (e) => {
        const zone = e.target && e.target.closest ? e.target.closest(ZONE_SEL) : null;
        if (!zone) return;
        e.preventDefault();
        const field = fieldOf(zone);
        const input = field && field.querySelector('input[type="file"]');
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter((f) =>
            /^image\//.test(f.type),
        );
        clear();
        if (!input || !files.length) return;
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

initScreenshotFieldBehavior();
