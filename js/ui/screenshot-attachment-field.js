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
