'use strict';

/**
 * Компонент «Типы СЭДО».
 * Пока делегирует в глобальные функции из script.js.
 * При миграции сюда перенести: initSedoTypesSystem, loadSedoData, renderSedoTypesContent и др.
 */

export function initSedoTypesSystem() {
    if (typeof window.initSedoTypesSystem === 'function') {
        return window.initSedoTypesSystem();
    }
    console.warn('[sedo.js] initSedoTypesSystem не определена в window.');
}

export async function loadSedoData() {
    if (typeof window.loadSedoData === 'function') {
        return window.loadSedoData();
    }
    console.warn('[sedo.js] loadSedoData не определена в window.');
}
