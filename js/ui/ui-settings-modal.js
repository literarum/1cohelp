'use strict';

/**
 * Модуль работы с модальным окном настроек UI
 * Вынесено из script.js
 */

let State = null;
let DEFAULT_UI_SETTINGS = null;
let tabsConfig = null;
let defaultPanelOrder = null;
let defaultPanelVisibility = null;
let showNotification = null;
let deleteFromIndexedDB = null;
let removeCustomBackgroundImage = null;
let applyPreviewSettings = null;
let setColorPickerStateFromHex = null;
let handleModalVisibilityToggleRef = null;

export function setUISettingsModalDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.DEFAULT_UI_SETTINGS !== undefined) DEFAULT_UI_SETTINGS = deps.DEFAULT_UI_SETTINGS;
    if (deps.tabsConfig !== undefined) tabsConfig = deps.tabsConfig;
    if (deps.defaultPanelOrder !== undefined) defaultPanelOrder = deps.defaultPanelOrder;
    if (deps.defaultPanelVisibility !== undefined) defaultPanelVisibility = deps.defaultPanelVisibility;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.deleteFromIndexedDB !== undefined) deleteFromIndexedDB = deps.deleteFromIndexedDB;
    if (deps.removeCustomBackgroundImage !== undefined) removeCustomBackgroundImage = deps.removeCustomBackgroundImage;
    if (deps.applyPreviewSettings !== undefined) applyPreviewSettings = deps.applyPreviewSettings;
    if (deps.setColorPickerStateFromHex !== undefined) setColorPickerStateFromHex = deps.setColorPickerStateFromHex;
    if (deps.handleModalVisibilityToggle !== undefined) handleModalVisibilityToggleRef = deps.handleModalVisibilityToggle;
}

/**
 * Создает элемент панели для сортировки
 */
export function createPanelItemElement(id, name, isVisible = true) {
    const item = document.createElement('div');
    item.className =
        'panel-item flex items-center p-2 bg-gray-100 dark:bg-gray-700 rounded cursor-move mb-2';
    item.setAttribute('data-section', id);
    const eyeClass = isVisible ? 'fa-eye' : 'fa-eye-slash';
    const titleText = isVisible ? 'Скрыть раздел' : 'Показать раздел';
    item.innerHTML = `
                                <i class="fas fa-grip-lines mr-2 text-gray-400"></i>
                                <span class="flex-grow">${name}</span>
                                <div class="ml-auto flex items-center flex-shrink-0">
                                    <button class="toggle-visibility p-1 text-gray-500 hover:text-primary mr-1" title="${titleText}">
                                        <i class="fas ${eyeClass}"></i>
                                    </button>
                                </div>`;
    return item;
}

/**
 * Заполняет элементы модального окна настроек UI
 */
export function populateModalControls(settings) {
    const modal = document.getElementById('customizeUIModal');
    if (!modal) return;

    if (typeof settings !== 'object' || settings === null) {
        settings = { ...DEFAULT_UI_SETTINGS, themeMode: State.userPreferences.theme };
    }

    const layoutRadio = modal.querySelector(
        `input[name="mainLayout"][value="${settings.mainLayout || 'horizontal'}"]`,
    );
    if (layoutRadio) layoutRadio.checked = true;

    const themeRadio = modal.querySelector(
        `input[name="themeMode"][value="${settings.theme || settings.themeMode || 'auto'}"]`,
    );
    if (themeRadio) themeRadio.checked = true;

    const showBlacklistWarningToggle = modal.querySelector('#toggleBlacklistWarning');
    if (showBlacklistWarningToggle) {
        showBlacklistWarningToggle.checked = settings.showBlacklistUsageWarning ?? false;
    }

    const disableForcedBackupToggle = modal.querySelector('#disableForcedBackupOnImportToggle');
    if (disableForcedBackupToggle) {
        disableForcedBackupToggle.checked = settings.disableForcedBackupOnImport ?? false;
    }

    const fontSizeLabel = modal.querySelector('#fontSizeLabel');
    if (fontSizeLabel) fontSizeLabel.textContent = (settings.fontSize ?? 100) + '%';

    const borderRadiusSlider = modal.querySelector('#borderRadiusSlider');
    if (borderRadiusSlider) borderRadiusSlider.value = settings.borderRadius ?? 8;

    const densitySlider = modal.querySelector('#densitySlider');
    if (densitySlider) densitySlider.value = settings.contentDensity ?? 3;

    const panelSortContainer = document.getElementById('panelSortContainer');
    if (panelSortContainer) {
        panelSortContainer.innerHTML = '';
        const idToConfigMap = tabsConfig.reduce((map, tab) => ((map[tab.id] = tab), map), {});

        const order = settings.panelOrder || defaultPanelOrder;
        const visibility = settings.panelVisibility || (defaultPanelVisibility || order.map(() => true));

        order.forEach((panelId, index) => {
            const config = idToConfigMap[panelId];
            if (config) {
                const isVisible = visibility[index] ?? true;
                const panelItem = createPanelItemElement(config.id, config.name, isVisible);
                panelSortContainer.appendChild(panelItem);
            }
        });

        panelSortContainer.querySelectorAll('.toggle-visibility').forEach((button) => {
            button.addEventListener('click', handleModalVisibilityToggle);
        });
    }
}

/**
 * Переключает видимость панели в модальном окне настроек
 */
export function handleModalVisibilityToggle(event) {
    const button = event.currentTarget;
    const icon = button.querySelector('i');
    if (!icon) return;

    const isCurrentlyVisible = icon.classList.contains('fa-eye');
    const shouldBeHidden = isCurrentlyVisible;

    icon.classList.toggle('fa-eye', !shouldBeHidden);
    icon.classList.toggle('fa-eye-slash', shouldBeHidden);
    button.setAttribute('title', shouldBeHidden ? 'Показать раздел' : 'Скрыть раздел');

    updatePreviewSettingsFromModal();
    if (State && State.currentPreviewSettings) {
        if (typeof applyPreviewSettings === 'function') {
            applyPreviewSettings(State.currentPreviewSettings);
        }
        State.isUISettingsDirty = true;
    }
}

/**
 * Получает настройки из модального окна
 */
export function getSettingsFromModal() {
    const modal = document.getElementById('customizeUIModal');
    if (!modal) return null;

    const showBlacklistWarningToggle = modal.querySelector('#toggleBlacklistWarning');
    const disableForcedBackupToggle = modal.querySelector('#disableForcedBackupOnImportToggle');

    const primaryColor = State.currentPreviewSettings.primaryColor || DEFAULT_UI_SETTINGS.primaryColor;
    const backgroundColor = State.currentPreviewSettings.backgroundColor;
    const isBackgroundCustom = State.currentPreviewSettings.isBackgroundCustom || false;
    const customTextColor = State.currentPreviewSettings.customTextColor;
    const isTextCustom = State.currentPreviewSettings.isTextCustom || false;

    const panelItems = Array.from(modal.querySelectorAll('#panelSortContainer .panel-item'));
    const panelOrder = panelItems.map((item) => item.getAttribute('data-section'));
    const panelVisibility = panelItems.map(
        (item) => item.querySelector('.toggle-visibility i')?.classList.contains('fa-eye') ?? true,
    );

    return {
        mainLayout: modal.querySelector('input[name="mainLayout"]:checked')?.value || 'horizontal',
        theme: modal.querySelector('input[name="themeMode"]:checked')?.value || 'auto',
        primaryColor: primaryColor,
        backgroundColor: backgroundColor,
        isBackgroundCustom: isBackgroundCustom,
        customTextColor: customTextColor,
        isTextCustom: isTextCustom,
        fontSize: parseInt(modal.querySelector('#fontSizeLabel')?.textContent) || 100,
        borderRadius: parseInt(modal.querySelector('#borderRadiusSlider')?.value) || 8,
        contentDensity: parseInt(modal.querySelector('#densitySlider')?.value) || 3,
        panelOrder: panelOrder,
        panelVisibility: panelVisibility,
        showBlacklistUsageWarning: showBlacklistWarningToggle
            ? showBlacklistWarningToggle.checked
            : false,
        disableForcedBackupOnImport: disableForcedBackupToggle
            ? disableForcedBackupToggle.checked
            : false,
    };
}

/**
 * Обновляет превью настроек из модального окна
 */
export function updatePreviewSettingsFromModal() {
    const settings = getSettingsFromModal();
    if (settings && State) {
        State.currentPreviewSettings = { ...settings };
        console.log('Updated State.currentPreviewSettings from modal:', State.currentPreviewSettings);
    }
}

/**
 * Сбрасывает настройки UI в модальном окне
 */
export async function resetUISettingsInModal() {
    console.log('Resetting UI settings in modal preview...');

    State.currentPreviewSettings = JSON.parse(JSON.stringify(DEFAULT_UI_SETTINGS));
    State.currentPreviewSettings.id = 'uiSettings';
    State.currentPreviewSettings.isBackgroundCustom = false;
    delete State.currentPreviewSettings.backgroundColor;
    State.currentPreviewSettings.isTextCustom = false;
    delete State.currentPreviewSettings.customTextColor;

    document.body.classList.remove('custom-background-active');

    try {
        if (typeof deleteFromIndexedDB === 'function') {
            await deleteFromIndexedDB('preferences', 'customBackgroundImage');
        }
        if (typeof removeCustomBackgroundImage === 'function') {
            removeCustomBackgroundImage();
        }
    } catch (err) {
        console.error('Не удалось удалить фон при сбросе настроек:', err);
    }

    State.isUISettingsDirty = true;

    try {
        populateModalControls(State.currentPreviewSettings);

        State.uiModalState.currentColorTarget = 'elements';

        const colorTargetSelector = document.getElementById('colorTargetSelector');
        const elementsRadio = colorTargetSelector?.querySelector('input[value="elements"]');
        if (elementsRadio) elementsRadio.checked = true;

        if (typeof setColorPickerStateFromHex === 'function') {
            setColorPickerStateFromHex(State.currentPreviewSettings.primaryColor);
        }

        if (typeof applyPreviewSettings === 'function') {
            await applyPreviewSettings(State.currentPreviewSettings);
        }
        console.log('UI settings reset preview applied.');
        if (typeof showNotification === 'function') {
            showNotification(
                "Настройки сброшены для предпросмотра. Нажмите 'Сохранить', чтобы применить.",
                'info',
            );
        }
        return true;
    } catch (error) {
        console.error('Error resetting UI settings preview:', error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка при сбросе настроек для предпросмотра', 'error');
        }
        State.currentPreviewSettings = JSON.parse(JSON.stringify(State.originalUISettings));
        State.isUISettingsDirty = false;
        populateModalControls(State.currentPreviewSettings);
        if (typeof applyPreviewSettings === 'function') {
            await applyPreviewSettings(State.currentPreviewSettings);
        }
        return false;
    }
}
