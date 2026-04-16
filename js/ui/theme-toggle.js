'use strict';

let deps = {
    State: null,
    DEFAULT_UI_SETTINGS: null,
    setTheme: null,
    showNotification: null,
    saveUserPreferences: null,
    getSettingsFromModal: null,
    deepEqual: null,
};

export function setThemeToggleDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggle');
    themeToggleBtn?.addEventListener('click', async () => {
        const currentAppTheme =
            document.documentElement.dataset.theme ||
            deps.State?.userPreferences?.theme ||
            deps.DEFAULT_UI_SETTINGS?.themeMode;
        let nextTheme;

        if (currentAppTheme === 'dark') {
            nextTheme = 'light';
        } else if (currentAppTheme === 'light') {
            nextTheme = 'auto';
        } else {
            nextTheme = 'dark';
        }

        if (typeof deps.setTheme !== 'function') {
            console.error('Функция setTheme не найдена!');
            deps.showNotification?.('Ошибка: Не удалось применить тему.', 'error');
            return;
        }
        deps.setTheme(nextTheme);

        if (!deps.State?.userPreferences) {
            deps.showNotification?.('Тема применена. Настройки сохранятся после загрузки.', 'info');
            return;
        }

        let prefsSaved = false;
        if (typeof deps.saveUserPreferences === 'function') {
            prefsSaved = await deps.saveUserPreferences();
        } else {
            console.error('Функция saveUserPreferences не найдена!');
            deps.showNotification?.(
                'Ошибка: Не удалось сохранить настройки пользователя.',
                'error',
            );
            if (typeof deps.setTheme === 'function') deps.setTheme(currentAppTheme);
            return;
        }

        if (prefsSaved) {
            const customizeUIModal = document.getElementById('customizeUIModal');
            const customizationModal = document.getElementById('appCustomizationModal');
            const settingsModalOpen =
                customizeUIModal && !customizeUIModal.classList.contains('hidden');
            if (settingsModalOpen) {
                const modalWithTheme = customizationModal || customizeUIModal;
                const nextThemeRadio = modalWithTheme?.querySelector(
                    `input[name="themeMode"][value="${nextTheme}"]`,
                );
                if (nextThemeRadio) {
                    nextThemeRadio.checked = true;
                }

                if (typeof deps.State.currentPreviewSettings === 'object') {
                    deps.State.currentPreviewSettings.themeMode = nextTheme;
                }
                if (typeof deps.State.originalUISettings === 'object') {
                    deps.State.originalUISettings.themeMode = nextTheme;
                }

                if (
                    typeof deps.getSettingsFromModal === 'function' &&
                    typeof deps.deepEqual === 'function'
                ) {
                    deps.State.isUISettingsDirty = !deps.deepEqual(
                        deps.State.originalUISettings,
                        deps.getSettingsFromModal(),
                    );
                }
            }
        } else {
            deps.showNotification?.('Ошибка сохранения темы', 'error');
            if (typeof deps.setTheme === 'function') {
                deps.setTheme(currentAppTheme);
            }
        }
    });
}
