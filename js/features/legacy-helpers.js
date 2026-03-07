'use strict';

import { State } from '../app/state.js';

let deps = {
    checkAndBuildIndex: null,
    getFromIndexedDB: null,
    saveToIndexedDB: null,
    CATEGORY_INFO_KEY: null,
    showNotification: null,
    getAllFromIndex: null,
};

export function setLegacyHelpersDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export async function ensureSearchIndexIsBuilt() {
    console.log('Вызов ensureSearchIndexIsBuilt для проверки и построения поискового индекса.');
    if (!State.db) {
        console.warn(
            'ensureSearchIndexIsBuilt: База данных не инициализирована. Проверка индекса невозможна.',
        );
        return;
    }
    try {
        await deps.checkAndBuildIndex?.();
        console.log(
            'ensureSearchIndexIsBuilt: Проверка и построение индекса завершены (или не требовались).',
        );
    } catch (error) {
        console.error(
            'ensureSearchIndexIsBuilt: Ошибка во время проверки/построения поискового индекса:',
            error,
        );
    }
}

export async function loadCategoryInfo(categoryDisplayInfo) {
    if (!State.db) {
        console.warn('DB not ready, using default categories.');
        return categoryDisplayInfo;
    }
    try {
        const savedInfo = await deps.getFromIndexedDB?.('preferences', deps.CATEGORY_INFO_KEY);
        if (savedInfo && typeof savedInfo.data === 'object') {
            return { ...categoryDisplayInfo, ...savedInfo.data };
        }
    } catch (error) {
        console.error('Error loading reglament category info:', error);
    }
    return categoryDisplayInfo;
}

export async function saveCategoryInfo(categoryDisplayInfo, onUpdated) {
    if (!State.db) {
        console.error('Cannot save category info: DB not ready.');
        deps.showNotification?.(
            'Ошибка сохранения настроек категорий: База данных недоступна',
            'error',
        );
        return false;
    }
    try {
        await deps.saveToIndexedDB?.('preferences', {
            id: deps.CATEGORY_INFO_KEY,
            data: categoryDisplayInfo,
        });
        onUpdated?.();
        console.log('Reglament category info saved successfully.');
        deps.showNotification?.('Настройки категорий регламентов сохранены.', 'success');
        return true;
    } catch (error) {
        console.error('Error saving reglament category info:', error);
        deps.showNotification?.('Ошибка сохранения настроек категорий', 'error');
        return false;
    }
}

export function getRequiredElementsHelper(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return null;
    const result = {};
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) return null;
        result[id] = el;
    }
    return result;
}

export async function getAllFromIndexedDBWhere(storeName, indexName, indexValue) {
    console.log(
        `[getAllFromIndexedDBWhere] Вызов обертки для ${storeName} по индексу ${indexName} = ${indexValue}`,
    );
    try {
        if (typeof deps.getAllFromIndex !== 'function') {
            console.error('getAllFromIndexedDBWhere: Базовая функция getAllFromIndex не найдена!');
            throw new Error('Зависимость getAllFromIndex отсутствует');
        }
        return await deps.getAllFromIndex(storeName, indexName, indexValue);
    } catch (error) {
        console.error(
            `[getAllFromIndexedDBWhere] Ошибка при вызове getAllFromIndex для ${storeName}/${indexName}/${indexValue}:`,
            error,
        );
        throw error;
    }
}

export function getOrCreateModal(modalId, modalClassName, modalHTML, setupCallback) {
    let modal = document.getElementById(modalId);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = modalClassName || '';
    modal.innerHTML = modalHTML || '';
    document.body.appendChild(modal);
    if (typeof setupCallback === 'function') setupCallback(modal);
    return modal;
}
