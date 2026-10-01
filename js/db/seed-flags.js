'use strict';

/**
 * Флаги «стартовые данные уже созданы».
 *
 * Зачем: пустое хранилище само по себе не означает «первый запуск». Пользователь мог сам удалить
 * все закладки/ссылки, либо восстановить резервную копию, где их нет. Без флага стартовый набор
 * пересоздавался бы при каждой загрузке и возвращал бы удалённое.
 *
 * Флаги лежат в `preferences` (id = 'seedFlags'), поэтому входят в экспорт/импорт резервной копии.
 */

import { getFromIndexedDB, saveToIndexedDB } from './indexeddb.js';

export const SEED_FLAGS_ID = 'seedFlags';

/** @type {Readonly<Record<string, string>>} */
export const SEED_FLAG = Object.freeze({
    BOOKMARK_FOLDERS: 'bookmarkFolders',
    BOOKMARKS: 'bookmarks',
    CIB_LINKS: 'cibLinks',
});

/**
 * @param {string} name
 * @returns {Promise<boolean>}
 */
export async function hasSeedFlag(name) {
    try {
        const record = await getFromIndexedDB('preferences', SEED_FLAGS_ID);
        return Boolean(record && record.flags && record.flags[name] === true);
    } catch (error) {
        console.warn('[seed-flags] Не удалось прочитать флаг', name, error);
        return false;
    }
}

/**
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function setSeedFlag(name) {
    try {
        const record = (await getFromIndexedDB('preferences', SEED_FLAGS_ID)) || {
            id: SEED_FLAGS_ID,
            flags: {},
        };
        if (record.flags && record.flags[name] === true) return;
        await saveToIndexedDB('preferences', {
            ...record,
            id: SEED_FLAGS_ID,
            flags: { ...(record.flags || {}), [name]: true },
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.warn('[seed-flags] Не удалось записать флаг', name, error);
    }
}

/**
 * Решение «создавать ли стартовые данные» + самовосстановление флага для существующих пользователей.
 * @param {string} name — SEED_FLAG.*
 * @param {number} currentCount — сколько записей сейчас в хранилище
 * @returns {Promise<boolean>} true — хранилище пусто и стартовый набор ещё не создавался
 */
export async function shouldSeedDefaults(name, currentCount) {
    if (currentCount > 0) {
        // Данные уже есть (старые пользователи, импорт): фиксируем, что «первый запуск» позади.
        await setSeedFlag(name);
        return false;
    }
    return !(await hasSeedFlag(name));
}
