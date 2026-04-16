'use strict';

/**
 * Раздельный debounce для поля заметок клиента: тяжёлое автосохранение и быстрая проверка ИНН по ЧС.
 * См. initClientDataSystem — «жаба» не должна ждать IndexedDB+индекс.
 */

/** Автосохранение: IndexedDB, read-after-write, история, поисковый индекс. */
export const CLIENT_NOTES_SAVE_DEBOUNCE_MS = 750;

/** Проверка последней строки на ИНН из чёрного списка (уведомления «жаба»). */
export const CLIENT_NOTES_BLACKLIST_DEBOUNCE_MS = 280;

/**
 * @param {typeof import('../utils/helpers.js').debounce} debounceFn
 * @param {{ value: string }} clientNotesEl
 * @param {string} logPrefix
 * @param {() => Promise<void>} saveClientData
 * @param {(text: string) => Promise<void>} checkForBlacklistedInn
 * @returns {() => void} обработчик input (без debounce сам по себе — внутри два debounced вызова)
 */
export function buildClientNotesInputCompositeHandler(
    debounceFn,
    clientNotesEl,
    logPrefix,
    saveClientData,
    checkForBlacklistedInn,
) {
    const debouncedSave = debounceFn(async () => {
        try {
            console.log(`${logPrefix} Debounce автосохранения сработал.`);
            await saveClientData();
        } catch (error) {
            console.error(`${logPrefix} Ошибка внутри debounced save:`, error);
        }
    }, CLIENT_NOTES_SAVE_DEBOUNCE_MS);

    const debouncedBlacklist = debounceFn(async () => {
        try {
            const currentText = clientNotesEl.value;
            console.log(`${logPrefix} Debounce проверки ИНН (чёрный список) сработал.`);
            await checkForBlacklistedInn(currentText);
        } catch (error) {
            console.error(`${logPrefix} Ошибка внутри debounced blacklist check:`, error);
        }
    }, CLIENT_NOTES_BLACKLIST_DEBOUNCE_MS);

    return () => {
        debouncedSave();
        debouncedBlacklist();
    };
}
