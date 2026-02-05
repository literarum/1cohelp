'use strict';

/**
 * Компонент «Внешние ресурсы».
 * Пока делегирует в глобальные функции из script.js.
 * При миграции сюда перенести: loadExtLinks, createExtLinkElement, initExternalLinksSystem.
 */

export function initExternalLinksSystem() {
    if (typeof window.initExternalLinksSystem === 'function') {
        return window.initExternalLinksSystem();
    }
    console.warn('[ext-links.js] initExternalLinksSystem не определена в window.');
}

export async function loadExtLinks() {
    if (typeof window.loadExtLinks === 'function') {
        return window.loadExtLinks();
    }
    console.warn('[ext-links.js] loadExtLinks не определена в window.');
}

export function createExtLinkElement(link, categoryMap = {}, viewMode = 'cards') {
    if (typeof window.createExtLinkElement === 'function') {
        return window.createExtLinkElement(link, categoryMap, viewMode);
    }
    console.warn('[ext-links.js] createExtLinkElement не определена в window.');
    return null;
}
