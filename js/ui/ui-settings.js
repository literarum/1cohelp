'use strict';

/**
 * Модуль применения UI настроек
 * Вынесено из script.js
 */

import { getFromIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;
let DEFAULT_UI_SETTINGS = null;
let tabsConfig = null;
let defaultPanelOrder = null;
let defaultPanelVisibility = null;
let applyPreviewSettings = null;
let showNotification = null;
let loadUserPreferences = null;
let applyPanelOrderAndVisibility = null;
let ensureTabPresent = null;
let setupTabsOverflow = null;
let updateVisibleTabs = null;

export function setUISettingsDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.DEFAULT_UI_SETTINGS !== undefined) DEFAULT_UI_SETTINGS = deps.DEFAULT_UI_SETTINGS;
    if (deps.tabsConfig !== undefined) tabsConfig = deps.tabsConfig;
    if (deps.defaultPanelOrder !== undefined) defaultPanelOrder = deps.defaultPanelOrder;
    if (deps.defaultPanelVisibility !== undefined) defaultPanelVisibility = deps.defaultPanelVisibility;
    if (deps.applyPreviewSettings !== undefined) applyPreviewSettings = deps.applyPreviewSettings;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.loadUserPreferences !== undefined) loadUserPreferences = deps.loadUserPreferences;
    if (deps.applyPanelOrderAndVisibility !== undefined) applyPanelOrderAndVisibility = deps.applyPanelOrderAndVisibility;
    if (deps.ensureTabPresent !== undefined) ensureTabPresent = deps.ensureTabPresent;
    if (deps.setupTabsOverflow !== undefined) setupTabsOverflow = deps.setupTabsOverflow;
    if (deps.updateVisibleTabs !== undefined) updateVisibleTabs = deps.updateVisibleTabs;
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Применяет глобальные UI настройки (обычно при старте приложения)
 */
export async function applyUISettings() {
    console.log(
        'applyUISettings: Применение глобальных UI настроек (обычно при старте приложения)...',
    );

    let settingsToApply = { ...DEFAULT_UI_SETTINGS };
    const currentPanelIds = tabsConfig.map((t) => t.id);
    const knownPanelIds = new Set(currentPanelIds);

    const actualDefaultPanelOrder =
        typeof defaultPanelOrder !== 'undefined' &&
        Array.isArray(defaultPanelOrder) &&
        defaultPanelOrder.length > 0
            ? defaultPanelOrder
            : currentPanelIds;

    const actualDefaultPanelVisibility =
        typeof defaultPanelVisibility !== 'undefined' &&
        Array.isArray(defaultPanelVisibility) &&
        defaultPanelVisibility.length === actualDefaultPanelOrder.length
            ? defaultPanelVisibility
            : currentPanelIds.map((id) => !(id === 'sedoTypes' || id === 'blacklistedClients'));

    if (
        !DEFAULT_UI_SETTINGS.panelOrder ||
        DEFAULT_UI_SETTINGS.panelOrder.length !== actualDefaultPanelOrder.length
    ) {
        DEFAULT_UI_SETTINGS.panelOrder = [...actualDefaultPanelOrder];
    }
    if (
        !DEFAULT_UI_SETTINGS.panelVisibility ||
        DEFAULT_UI_SETTINGS.panelVisibility.length !== actualDefaultPanelVisibility.length
    ) {
        DEFAULT_UI_SETTINGS.panelVisibility = [...actualDefaultPanelVisibility];
    }
    settingsToApply.panelOrder = [...actualDefaultPanelOrder];
    settingsToApply.panelVisibility = [...actualDefaultPanelVisibility];

    if (!State.db) {
        console.warn(
            'applyUISettings: База данных недоступна. Применяются настройки по умолчанию.',
        );
    } else {
        try {
            const loadedSettings = await getFromIndexedDB('preferences', 'uiSettings');
            if (loadedSettings && typeof loadedSettings === 'object') {
                console.log(
                    'applyUISettings: Настройки UI загружены из БД. Слияние и корректировка...',
                );
                settingsToApply = { ...DEFAULT_UI_SETTINGS, ...loadedSettings, id: 'uiSettings' };
                let savedOrder = settingsToApply.panelOrder || [];
                let savedVisibility = settingsToApply.panelVisibility || [];
                if (!Array.isArray(savedOrder) || savedOrder.length === 0)
                    savedOrder = [...actualDefaultPanelOrder];
                if (
                    !Array.isArray(savedVisibility) ||
                    savedVisibility.length !== savedOrder.length
                ) {
                    savedVisibility = savedOrder.map((id) => {
                        const defaultIndex = actualDefaultPanelOrder.indexOf(id);
                        return defaultIndex !== -1
                            ? actualDefaultPanelVisibility[defaultIndex]
                            : id !== 'sedoTypes';
                    });
                }
                let effectiveOrder = [];
                let effectiveVisibility = [];
                const processedIds = new Set();
                savedOrder.forEach((panelId, index) => {
                    if (knownPanelIds.has(panelId)) {
                        effectiveOrder.push(panelId);
                        effectiveVisibility.push(
                            typeof savedVisibility[index] === 'boolean'
                                ? savedVisibility[index]
                                : panelId !== 'sedoTypes',
                        );
                        processedIds.add(panelId);
                    } else {
                        console.warn(
                            `applyUISettings (DB Load): Сохраненный ID панели "${panelId}" больше не существует. Игнорируется.`,
                        );
                    }
                });
                currentPanelIds.forEach((panelId) => {
                    if (!processedIds.has(panelId)) {
                        console.log(
                            `applyUISettings (DB Load): Добавление новой панели "${panelId}" в порядок/видимость.`,
                        );
                        effectiveOrder.push(panelId);
                        effectiveVisibility.push(panelId !== 'sedoTypes');
                    }
                });
                settingsToApply.panelOrder = effectiveOrder;
                settingsToApply.panelVisibility = effectiveVisibility;
                console.log('applyUISettings: Слияние и корректировка настроек из БД завершены.');
            } else {
                console.log(
                    'applyUISettings: Нет сохраненных настроек UI в БД или формат неверный. Используются настройки по умолчанию (с актуальным порядком/видимостью).',
                );
            }
        } catch (error) {
            console.error(
                'applyUISettings: Ошибка при загрузке настроек UI из БД, используются настройки по умолчанию:',
                error,
            );
        }
    }

    if (typeof State.originalUISettings !== 'object' || Object.keys(State.originalUISettings).length === 0) {
        State.originalUISettings = JSON.parse(JSON.stringify(settingsToApply));
        console.log('applyUISettings: State.originalUISettings инициализированы.');
    }
    State.currentPreviewSettings = JSON.parse(JSON.stringify(settingsToApply));
    console.log('applyUISettings: State.currentPreviewSettings синхронизированы.');

    try {
        if (typeof applyPreviewSettings !== 'function') {
            console.error(
                'applyUISettings: Функция applyPreviewSettings не найдена! Невозможно применить настройки.',
            );
            throw new Error('Функция applyPreviewSettings не определена.');
        }
        await applyPreviewSettings(settingsToApply);
        console.log(
            'applyUISettings: Глобальные настройки UI применены:',
            JSON.parse(JSON.stringify(settingsToApply)),
        );
        return Promise.resolve(true);
    } catch (applyError) {
        console.error(
            'applyUISettings: КРИТИЧЕСКАЯ ОШИБКА при вызове applyPreviewSettings:',
            applyError,
        );
        if (typeof applyPreviewSettings === 'function' && typeof DEFAULT_UI_SETTINGS === 'object') {
            try {
                await applyPreviewSettings(DEFAULT_UI_SETTINGS);
                console.warn(
                    'applyUISettings: Применены АБСОЛЮТНЫЕ ДЕФОЛТЫ из-за ошибки применения загруженных/скорректированных настроек.',
                );
            } catch (emergencyError) {
                console.error(
                    'applyUISettings: КРИТИЧЕСКАЯ ОШИБКА даже при применении АБСОЛЮТНЫХ ДЕФОЛТОВ:',
                    emergencyError,
                );
            }
        }
        if (typeof showNotification === 'function') {
            showNotification(
                'Критическая ошибка применения настроек интерфейса. Сброшено к базовым.',
                'error',
            );
        }
        return Promise.reject(applyError);
    }
}

/**
 * Применяет начальные UI настройки (обычно при старте приложения)
 */
export async function applyInitialUISettings() {
    console.log('applyInitialUISettings V2: Применение начальных UI настроек (единая логика)...');

    if (typeof State.userPreferences !== 'object' || Object.keys(State.userPreferences).length === 0) {
        console.error(
            'applyInitialUISettings: State.userPreferences не инициализирован! Это не должно происходить.',
        );
        if (typeof loadUserPreferences === 'function') {
            await loadUserPreferences();
        }
    }

    State.originalUISettings = JSON.parse(JSON.stringify(State.userPreferences));
    State.currentPreviewSettings = JSON.parse(JSON.stringify(State.userPreferences));
    console.log(
        'applyInitialUISettings: originalUISettings и State.currentPreviewSettings инициализированы.',
    );

    try {
        if (typeof applyPreviewSettings !== 'function') {
            throw new Error('Функция applyPreviewSettings не определена.');
        }
        await applyPreviewSettings(State.userPreferences);
        try {
            const order =
                Array.isArray(State.userPreferences?.panelOrder) && State.userPreferences.panelOrder.length
                    ? [...State.userPreferences.panelOrder]
                    : Array.isArray(defaultPanelOrder) && defaultPanelOrder.length
                    ? [...defaultPanelOrder]
                    : Array.isArray(tabsConfig)
                    ? tabsConfig.map((t) => t.id)
                    : [];
            const visArr =
                Array.isArray(State.userPreferences?.panelVisibility) &&
                State.userPreferences.panelVisibility.length === order.length
                    ? [...State.userPreferences.panelVisibility]
                    : order.map((id) => id !== 'sedoTypes');
            if (typeof applyPanelOrderAndVisibility === 'function') {
                applyPanelOrderAndVisibility(order, visArr);
            } else {
                console.warn('applyPanelOrderAndVisibility not found; tabs order restore skipped.');
            }
            const visMap = order.reduce((m, id, i) => ((m[id] = !!visArr[i]), m), {});
            if (typeof ensureTabPresent === 'function') {
                ensureTabPresent('shablony', visMap.shablony !== false);
            }
            if (typeof setupTabsOverflow === 'function') setupTabsOverflow();
            if (typeof updateVisibleTabs === 'function') updateVisibleTabs();
        } catch (e) {
            console.warn(
                'applyInitialUISettings: не удалось досоздать вкладку Шаблоны:',
                e,
            );
        }
        console.log('applyInitialUISettings: Начальные UI настройки успешно применены.');
    } catch (applyError) {
        console.error(
            'applyInitialUISettings: КРИТИЧЕСКАЯ ОШИБКА при применении настроек:',
            applyError,
        );
        try {
            if (typeof applyPreviewSettings === 'function') {
                await applyPreviewSettings(DEFAULT_UI_SETTINGS);
            }
        } catch (emergencyError) {
            console.error(
                'applyInitialUISettings: КРИТИЧЕСКАЯ ОШИБКА даже при применении АБСОЛЮТНЫХ ДЕФОЛТОВ:',
                emergencyError,
            );
        }
        if (typeof showNotification === 'function') {
            showNotification('Критическая ошибка применения настроек интерфейса.', 'error');
        }
    }
}
