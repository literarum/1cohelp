'use strict';

let deps = {
    getFromIndexedDB: null,
    applyCustomBackgroundImage: null,
    setupBackgroundImageControls: null,
    showNotification: null,
};

let isInitialized = false;

export function setUICustomizationDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export async function initUICustomization() {
    if (isInitialized) return;
    isInitialized = true;

    if (typeof deps.setupBackgroundImageControls === 'function') {
        deps.setupBackgroundImageControls();
    }

    if (typeof deps.getFromIndexedDB !== 'function') {
        console.warn('[UICustomization] getFromIndexedDB не задан, пропускаем загрузку фона.');
        return;
    }

    try {
        const record = await deps.getFromIndexedDB('preferences', 'customBackgroundImage');
        const dataUrl = record?.value;
        if (dataUrl && typeof dataUrl === 'string') {
            if (typeof deps.applyCustomBackgroundImage === 'function') {
                deps.applyCustomBackgroundImage(dataUrl);
            }
        }
    } catch (error) {
        console.error('[UICustomization] Ошибка загрузки фонового изображения:', error);
        if (typeof deps.showNotification === 'function') {
            deps.showNotification('Не удалось загрузить пользовательский фон.', 'error');
        }
    }
}
