'use strict';

/**
 * Модуль работы с пользовательскими настройками
 * Вынесено из script.js
 */

import { THEME_DEFAULTS, isPanelVisibleByDefault } from '../config.js';
import { ONBOARDING_AUTO_OFFER_STORAGE_KEY, USER_PREFERENCES_KEY } from '../constants.js';
import { getFromIndexedDB, saveToIndexedDB, deleteFromIndexedDB } from '../db/indexeddb.js';

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;
let DEFAULT_UI_SETTINGS = null;
let defaultPanelOrder = null;
let tabsConfig = null;
let showNotification = null;

export function setUserPreferencesDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.DEFAULT_UI_SETTINGS !== undefined) DEFAULT_UI_SETTINGS = deps.DEFAULT_UI_SETTINGS;
    if (deps.defaultPanelOrder !== undefined) defaultPanelOrder = deps.defaultPanelOrder;
    if (deps.tabsConfig !== undefined) tabsConfig = deps.tabsConfig;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
}

/**
 * Исчерпан ли одноразовый автопоказ онбординга (миграция + признаки «уже пользовался приложением»).
 * @param {Record<string, unknown>} prefs
 * @param {Record<string, unknown>} defaults
 */
function inferOnboardingAutoPromptConsumed(prefs, defaults) {
    if (!prefs || typeof prefs !== 'object') return false;
    if (prefs.onboardingTourCompleted === true) return true;
    if (prefs.onboardingTourAutoPromptConsumed === true) return true;
    try {
        if (
            typeof localStorage !== 'undefined' &&
            localStorage.getItem(ONBOARDING_AUTO_OFFER_STORAGE_KEY) === '1'
        ) {
            return true;
        }
    } catch {
        /* ignore */
    }
    const ext = prefs.employeeExtension != null ? String(prefs.employeeExtension).trim() : '';
    if (ext.length > 0) return true;
    if (prefs.welcomeTextShownInitially === true) return true;
    if (prefs.disableForcedBackupOnImport === true) return true;
    if (prefs.staticHeader === true) return true;
    if (prefs.showBlacklistUsageWarning === false) return true;
    if (typeof prefs.fontSize === 'number' && prefs.fontSize !== (defaults.fontSize ?? 80)) {
        return true;
    }
    if (prefs.theme && defaults.theme && prefs.theme !== defaults.theme) return true;
    if (prefs.mainLayout && defaults.mainLayout && prefs.mainLayout !== defaults.mainLayout) {
        return true;
    }
    return false;
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Загружает пользовательские настройки из IndexedDB с миграцией старых данных
 */
export async function loadUserPreferences() {
    const LOG_PREFIX = '[loadUserPreferences V2 - Unified]';
    console.log(`${LOG_PREFIX} Запуск единой функции загрузки и миграции настроек.`);

    if (!DEFAULT_UI_SETTINGS) {
        console.error(
            `${LOG_PREFIX} DEFAULT_UI_SETTINGS не установлен! Используются значения по умолчанию.`,
        );
        DEFAULT_UI_SETTINGS = {
            themeMode: 'dark',
            primaryColor: THEME_DEFAULTS.primary,
            fontSize: 80,
            borderRadius: 2,
            contentDensity: 3,
            mainLayout: 'horizontal',
        };
    }

    if (!defaultPanelOrder || !Array.isArray(defaultPanelOrder)) {
        console.error(
            `${LOG_PREFIX} defaultPanelOrder не установлен или не является массивом! Используются значения по умолчанию.`,
        );
        if (!tabsConfig || !Array.isArray(tabsConfig)) {
            console.error(
                `${LOG_PREFIX} tabsConfig также не установлен! Используются жестко заданные значения.`,
            );
            defaultPanelOrder = [
                'main',
                'program',
                'links',
                'extLinks',
                'skzi',
                'lk1c',
                'webReg',
                'reglaments',
                'bookmarks',
                'shablony',
            ];
        } else {
            defaultPanelOrder = tabsConfig.map((t) => t.id);
        }
    }

    const defaultPreferences = {
        theme: DEFAULT_UI_SETTINGS.themeMode || 'dark',
        primaryColor: DEFAULT_UI_SETTINGS.primaryColor || THEME_DEFAULTS.primary,
        fontSize: DEFAULT_UI_SETTINGS.fontSize || 80,
        borderRadius: DEFAULT_UI_SETTINGS.borderRadius || 2,
        contentDensity: DEFAULT_UI_SETTINGS.contentDensity || 3,
        mainLayout: DEFAULT_UI_SETTINGS.mainLayout || 'horizontal',
        panelOrder: [...defaultPanelOrder],
        panelVisibility: defaultPanelOrder.map((id) => isPanelVisibleByDefault(id)),
        showBlacklistUsageWarning: true,
        disableForcedBackupOnImport: false,
        staticHeader: false,
        welcomeTextShownInitially: false,
        onboardingTourCompleted: false,
        /** Автопоказ тура при старте уже использован (или отклонён) — не предлагать снова */
        onboardingTourAutoPromptConsumed: false,
        /** Напоминания о резервном копировании (тост каждые 3 ч). false — отключено. */
        backupReminderEnabled: true,
        /** Праздничное оформление «день рождения» (конфетти, рамка, мягкое свечение кнопок) */
        birthdayModeEnabled: true,
        clientNotesFontSize: 100,
        employeeExtension: '',
        textareaHeights: {},
    };

    if (!State || !State.db) {
        console.warn(
            `${LOG_PREFIX} State или база данных не инициализирована. Используются дефолтные State.userPreferences.`,
        );
        if (State) {
            State.userPreferences = { ...defaultPreferences };
        }
        return;
    }

    try {
        let finalSettings;
        const savedPrefsContainer = await getFromIndexedDB('preferences', USER_PREFERENCES_KEY);

        if (savedPrefsContainer && typeof savedPrefsContainer.data === 'object') {
            console.log(
                `${LOG_PREFIX} Найдены настройки в основном хранилище ('${USER_PREFERENCES_KEY}').`,
            );
            finalSettings = { ...defaultPreferences, ...savedPrefsContainer.data };
        } else {
            console.log(
                `${LOG_PREFIX} Настройки в основном хранилище не найдены. Попытка миграции со старых ключей...`,
            );
            finalSettings = { ...defaultPreferences };

            const legacyUiSettings = await getFromIndexedDB('preferences', 'uiSettings');
            const legacyExtension = await getFromIndexedDB('preferences', 'employeeExtension');

            let migrated = false;
            if (legacyUiSettings && typeof legacyUiSettings === 'object') {
                console.log(
                    `${LOG_PREFIX} Найдены устаревшие настройки UI ('uiSettings'). Миграция...`,
                );
                delete legacyUiSettings.id;
                delete legacyUiSettings.themeMode;
                delete legacyUiSettings.showBlacklistUsageWarning;
                delete legacyUiSettings.disableForcedBackupOnImport;
                finalSettings = { ...finalSettings, ...legacyUiSettings };
                migrated = true;
            }
            if (legacyExtension && typeof legacyExtension.value === 'string') {
                console.log(
                    `${LOG_PREFIX} Найден устаревший добавочный номер ('${legacyExtension.value}'). Миграция...`,
                );
                finalSettings.employeeExtension = legacyExtension.value;
                migrated = true;
            }

            if (migrated) {
                console.log(`${LOG_PREFIX} Миграция завершена. Удаление устаревших ключей...`);
                await deleteFromIndexedDB('preferences', 'uiSettings').catch((e) =>
                    console.warn("Не удалось удалить 'uiSettings'", e),
                );
                await deleteFromIndexedDB('preferences', 'employeeExtension').catch((e) =>
                    console.warn("Не удалось удалить 'employeeExtension'", e),
                );
                console.log(`${LOG_PREFIX} Устаревшие ключи удалены.`);
            }
        }

        // Вычисляем currentPanelIds с проверкой на null/undefined
        const currentPanelIds =
            tabsConfig && Array.isArray(tabsConfig)
                ? tabsConfig.map((t) => t.id)
                : Array.isArray(defaultPanelOrder)
                  ? defaultPanelOrder
                  : [];
        const knownPanelIds = new Set(currentPanelIds);
        const actualDefaultPanelVisibility = currentPanelIds.map((id) =>
            isPanelVisibleByDefault(id),
        );

        let savedOrder = finalSettings.panelOrder || [];
        let savedVisibility = finalSettings.panelVisibility || [];

        let effectiveOrder = [];
        let effectiveVisibility = [];
        const processedIds = new Set();

        savedOrder.forEach((panelId, index) => {
            if (knownPanelIds.has(panelId)) {
                effectiveOrder.push(panelId);
                effectiveVisibility.push(
                    typeof savedVisibility[index] === 'boolean' ? savedVisibility[index] : true,
                );
                processedIds.add(panelId);
            }
        });

        currentPanelIds.forEach((panelId, index) => {
            if (!processedIds.has(panelId)) {
                effectiveOrder.push(panelId);
                const defaultVisibility =
                    index < actualDefaultPanelVisibility.length
                        ? actualDefaultPanelVisibility[index]
                        : isPanelVisibleByDefault(panelId);
                effectiveVisibility.push(defaultVisibility);
                console.log(
                    `${LOG_PREFIX} Добавлена новая панель "${panelId}" с видимостью по умолчанию.`,
                );
            }
        });

        finalSettings.panelOrder = effectiveOrder;
        finalSettings.panelVisibility = effectiveVisibility;

        finalSettings.onboardingTourAutoPromptConsumed = inferOnboardingAutoPromptConsumed(
            finalSettings,
            defaultPreferences,
        );
        if (finalSettings.onboardingTourAutoPromptConsumed) {
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(ONBOARDING_AUTO_OFFER_STORAGE_KEY, '1');
                }
            } catch {
                /* ignore */
            }
        }

        State.userPreferences = { ...finalSettings };
        // Вызываем saveUserPreferences напрямую из модуля
        await saveUserPreferences();

        console.log(
            `${LOG_PREFIX} Загрузка и синхронизация пользовательских настроек завершена. Итоговые userPreferences:`,
            State.userPreferences,
        );
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при загрузке/миграции настроек:`, error);
        if (State) {
            State.userPreferences = { ...defaultPreferences };
        }
    }
}

/**
 * Сохраняет пользовательские настройки в IndexedDB
 */
export async function saveUserPreferences() {
    const LOG_PREFIX = '[saveUserPreferences V2 - Unified]';
    if (!State || !State.db) {
        console.error(
            `${LOG_PREFIX} State или база данных не инициализирована. Настройки не могут быть сохранены.`,
        );
        if (typeof showNotification === 'function') {
            showNotification('Ошибка: Не удалось сохранить настройки (БД недоступна).', 'error');
        }
        return false;
    }
    try {
        const fields = [
            'theme',
            'primaryColor',
            'fontSize',
            'borderRadius',
            'contentDensity',
            'mainLayout',
            'panelOrder',
            'panelVisibility',
            'showBlacklistUsageWarning',
            'disableForcedBackupOnImport',
            'staticHeader',
            'welcomeTextShownInitially',
            'onboardingTourCompleted',
            'onboardingTourAutoPromptConsumed',
            'backupReminderEnabled',
            'birthdayModeEnabled',
            'clientNotesFontSize',
            'employeeExtension',
            'textareaHeights',
        ];
        const booleanPreferenceFields = new Set([
            'showBlacklistUsageWarning',
            'disableForcedBackupOnImport',
            'staticHeader',
            'welcomeTextShownInitially',
            'onboardingTourCompleted',
            'onboardingTourAutoPromptConsumed',
            'birthdayModeEnabled',
        ]);
        fields.forEach((field) => {
            if (typeof State.userPreferences[field] === 'undefined') {
                console.warn(
                    `${LOG_PREFIX} Поле '${field}' отсутствует в State.userPreferences. Устанавливается пустая строка или false.`,
                );
                if (field === 'textareaHeights') {
                    State.userPreferences[field] = {};
                } else if (field === 'backupReminderEnabled') {
                    State.userPreferences[field] = true;
                } else if (booleanPreferenceFields.has(field)) {
                    State.userPreferences[field] = false;
                } else {
                    State.userPreferences[field] = '';
                }
            }
        });

        const dataToSave = {
            id: USER_PREFERENCES_KEY,
            data: State.userPreferences,
        };
        await saveToIndexedDB('preferences', dataToSave);
        console.log(`${LOG_PREFIX} Единые настройки успешно сохранены в IndexedDB:`, dataToSave);
        return true;
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при сохранении настроек в IndexedDB:`, error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка при сохранении настроек.', 'error');
        }
        return false;
    }
}
