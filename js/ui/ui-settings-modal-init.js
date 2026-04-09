'use strict';

import {
    buildGroupedHealthListHtml,
    buildHealthSubsystemSummaryHtml,
} from '../features/health-report-format.js';
import { onBackupReminderReEnabled } from '../features/backup-reminder.js';
import { appCustomizationModalConfig } from '../config.js';
import { collapseModalFullscreenIfActive, ensureFullscreenToggleForConfig } from './modals-manager.js';

let deps = {
    State: null,
    loadUISettings: null,
    populateModalControls: null,
    populateCustomizationModalControls: null,
    setColorPickerStateFromHex: null,
    addEscapeHandler: null,
    openAnimatedModal: null,
    closeAnimatedModal: null,
    saveUISettings: null,
    resetUISettingsInModal: null,
    revertUISettingsOnDiscard: null,
    updatePreviewSettingsFromModal: null,
    applyPreviewSettings: null,
    initColorPicker: null,
    refreshCustomizationPickerAfterThemeChange: null,
    showUnsavedConfirmModal: null,
    shouldConfirmBeforeClose: null,
    setupExtensionFieldListeners: null,
    loadEmployeeExtension: null,
    showAppConfirm: null,
    openRecentlyDeletedModal: null,
    startOnboardingTour: null,
};

export function setUISettingsModalInitDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initUISettingsModalHandlers() {
    const customizeUIBtn = document.getElementById('customizeUIBtn');
    const customizeUIModal = document.getElementById('customizeUIModal');

    if (customizeUIBtn && customizeUIModal && !customizeUIBtn.dataset.settingsListenerAttached) {
        customizeUIBtn.addEventListener('click', async () => {
            if (customizeUIModal.classList.contains('hidden')) {
                if (typeof deps.loadUISettings === 'function') await deps.loadUISettings();
                if (typeof deps.loadEmployeeExtension === 'function')
                    await deps.loadEmployeeExtension();
                if (typeof deps.populateModalControls === 'function') {
                    deps.populateModalControls(
                        deps.State?.currentPreviewSettings || deps.State?.userPreferences,
                    );
                }
                if (deps.State) deps.State.isUISettingsDirty = false;
                customizeUIModal.classList.remove('hidden');
                document.body.classList.add('modal-open');
                if (typeof deps.addEscapeHandler === 'function') {
                    deps.addEscapeHandler(customizeUIModal);
                }
                if (typeof deps.openAnimatedModal === 'function') {
                    deps.openAnimatedModal(customizeUIModal);
                }
                const panelSortContainer = document.getElementById('panelSortContainer');
                if (panelSortContainer) {
                    if (panelSortContainer.sortableInstance) {
                        try {
                            panelSortContainer.sortableInstance.destroy();
                        } catch (e) {
                            console.warn('[UISettingsModal] Ошибка при уничтожении Sortable:', e);
                        }
                        panelSortContainer.sortableInstance = null;
                    }
                    const initPanelSortable = (SortableLib) => {
                        if (!SortableLib) return;
                        panelSortContainer.sortableInstance = new SortableLib(panelSortContainer, {
                            animation: 150,
                            handle: '.fa-grip-lines',
                            ghostClass: 'sortable-ghost',
                            chosenClass: 'sortable-chosen',
                            dragClass: 'sortable-drag',
                            onEnd: () => {
                                if (deps.State) deps.State.isUISettingsDirty = true;
                                if (typeof deps.updatePreviewSettingsFromModal === 'function') {
                                    deps.updatePreviewSettingsFromModal();
                                    if (
                                        deps.State &&
                                        typeof deps.applyPreviewSettings === 'function'
                                    ) {
                                        deps.applyPreviewSettings(
                                            deps.State.currentPreviewSettings,
                                        );
                                    }
                                }
                            },
                        });
                    };
                    if (typeof window.Sortable !== 'undefined') {
                        initPanelSortable(window.Sortable);
                    } else if (
                        window.VendorLoader &&
                        typeof window.VendorLoader.waitForSortable === 'function'
                    ) {
                        window.VendorLoader.waitForSortable(initPanelSortable, 5000);
                    }
                }
            }
        });
        customizeUIBtn.dataset.settingsListenerAttached = 'true';
        console.log('[UISettingsModal] Обработчик открытия модального окна настроек установлен.');
    }

    if (customizeUIModal && !customizeUIModal.dataset.settingsInnerListenersAttached) {
        const closeModal = () => {
            const panelSortContainer = document.getElementById('panelSortContainer');
            if (panelSortContainer?.sortableInstance) {
                try {
                    panelSortContainer.sortableInstance.destroy();
                } catch (e) {
                    console.warn(
                        '[UISettingsModal] Ошибка при уничтожении Sortable при закрытии:',
                        e,
                    );
                }
                panelSortContainer.sortableInstance = null;
            }
            if (typeof deps.closeAnimatedModal === 'function') {
                deps.closeAnimatedModal(customizeUIModal);
            }
            document.body.classList.remove('modal-open');
        };

        const requestClose = async () => {
            if (
                typeof deps.shouldConfirmBeforeClose === 'function' &&
                deps.shouldConfirmBeforeClose(customizeUIModal) &&
                typeof deps.showUnsavedConfirmModal === 'function'
            ) {
                const leave = await deps.showUnsavedConfirmModal();
                if (!leave) return;
                if (typeof deps.revertUISettingsOnDiscard === 'function') {
                    await deps.revertUISettingsOnDiscard();
                }
            }
            closeModal();
        };

        const saveUISettingsBtn = document.getElementById('saveUISettingsBtn');
        const cancelUISettingsBtn = document.getElementById('cancelUISettingsBtn');
        const resetUiBtn = document.getElementById('resetUiBtn');
        const closeCustomizeUIModalBtn = document.getElementById('closeCustomizeUIModalBtn');
        const openRecentlyDeletedBtn = document.getElementById('openRecentlyDeletedBtn');
        const restartOnboardingTourBtn = document.getElementById('restartOnboardingTourBtn');
        const openAppCustomizationModalBtn = document.getElementById('openAppCustomizationModalBtn');
        const decreaseFontBtn = document.getElementById('decreaseFontBtn');
        const increaseFontBtn = document.getElementById('increaseFontBtn');
        const resetFontBtn = document.getElementById('resetFontBtn');
        const fontSizeLabel = customizeUIModal.querySelector('#fontSizeLabel');
        const borderRadiusSlider = document.getElementById('borderRadiusSlider');
        const densitySlider = document.getElementById('densitySlider');

        if (saveUISettingsBtn) {
            saveUISettingsBtn.addEventListener('click', async () => {
                if (typeof deps.saveUISettings === 'function') {
                    const ok = await deps.saveUISettings();
                    if (ok) closeModal();
                }
            });
        }
        if (cancelUISettingsBtn)
            cancelUISettingsBtn.addEventListener('click', () => void requestClose());
        if (closeCustomizeUIModalBtn)
            closeCustomizeUIModalBtn.addEventListener('click', () => void requestClose());
        if (resetUiBtn) {
            resetUiBtn.addEventListener('click', async () => {
                const doReset = () => {
                    if (typeof deps.resetUISettingsInModal === 'function') {
                        return deps.resetUISettingsInModal();
                    }
                };
                if (typeof deps.showAppConfirm === 'function') {
                    const confirmed = await deps.showAppConfirm({
                        title: 'Сброс настроек интерфейса',
                        message:
                            'Вы уверены, что хотите сбросить настройки интерфейса (тема, цвет, шрифт, панели) к значениям по умолчанию? Изменения вступят в силу после нажатия «Сохранить».',
                        confirmText: 'Да, сбросить',
                        cancelText: 'Отмена',
                        confirmClass: 'bg-primary hover:bg-secondary text-white',
                    });
                    if (confirmed) await doReset();
                } else {
                    await doReset();
                }
            });
        }
        if (openRecentlyDeletedBtn) {
            openRecentlyDeletedBtn.addEventListener('click', async () => {
                if (typeof deps.openRecentlyDeletedModal === 'function') {
                    await deps.openRecentlyDeletedModal();
                } else if (typeof window.openRecentlyDeletedModal === 'function') {
                    await window.openRecentlyDeletedModal();
                }
            });
        }
        if (restartOnboardingTourBtn) {
            restartOnboardingTourBtn.addEventListener('click', async () => {
                if (typeof deps.startOnboardingTour === 'function') {
                    await deps.startOnboardingTour();
                }
            });
        }

        const appCustomizationModal = document.getElementById('appCustomizationModal');
        const closeAppCustomizationModalBtn = document.getElementById('closeAppCustomizationModalBtn');
        if (openAppCustomizationModalBtn && appCustomizationModal && !openAppCustomizationModalBtn.dataset.customizationListenerAttached) {
            openAppCustomizationModalBtn.addEventListener('click', () => {
                if (appCustomizationModal.classList.contains('hidden')) {
                    ensureFullscreenToggleForConfig(appCustomizationModalConfig);
                    collapseModalFullscreenIfActive(
                        'appCustomizationModal',
                        appCustomizationModalConfig,
                    );
                    if (typeof deps.populateCustomizationModalControls === 'function') {
                        deps.populateCustomizationModalControls(
                            deps.State?.currentPreviewSettings || deps.State?.userPreferences,
                        );
                    }
                    appCustomizationModal.classList.remove('hidden');
                    if (typeof deps.addEscapeHandler === 'function') {
                        deps.addEscapeHandler(appCustomizationModal);
                    }
                    if (typeof deps.openAnimatedModal === 'function') {
                        deps.openAnimatedModal(appCustomizationModal);
                    }
                    if (typeof deps.initColorPicker === 'function') deps.initColorPicker();
                }
            });
            openAppCustomizationModalBtn.dataset.customizationListenerAttached = 'true';
        }
        if (closeAppCustomizationModalBtn && appCustomizationModal) {
            closeAppCustomizationModalBtn.addEventListener('click', () => {
                collapseModalFullscreenIfActive(
                    'appCustomizationModal',
                    appCustomizationModalConfig,
                );
                if (typeof deps.closeAnimatedModal === 'function') {
                    deps.closeAnimatedModal(appCustomizationModal);
                }
                appCustomizationModal.classList.add('hidden');
            });
        }
        if (appCustomizationModal && !appCustomizationModal.dataset.customizationChangeAttached) {
            appCustomizationModal.addEventListener('change', (e) => {
                if (e.target.matches('input[name="themeMode"]')) {
                    if (typeof deps.updatePreviewSettingsFromModal === 'function') {
                        deps.updatePreviewSettingsFromModal();
                        if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                            deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                        }
                        deps.State.isUISettingsDirty = true;
                        if (typeof deps.refreshCustomizationPickerAfterThemeChange === 'function') {
                            deps.refreshCustomizationPickerAfterThemeChange();
                        }
                    }
                }
            });
            appCustomizationModal.dataset.customizationChangeAttached = 'true';
        }

        const FONT_MIN = 80;
        const FONT_MAX = 150;
        const FONT_STEP = 10;
        const updateFontLabelAndPreview = () => {
            if (fontSizeLabel && typeof deps.updatePreviewSettingsFromModal === 'function') {
                deps.updatePreviewSettingsFromModal();
                if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                    deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                }
                deps.State.isUISettingsDirty = true;
            }
        };
        if (decreaseFontBtn && fontSizeLabel) {
            decreaseFontBtn.addEventListener('click', () => {
                const v = Math.max(
                    FONT_MIN,
                    (parseInt(fontSizeLabel.textContent, 10) || 100) - FONT_STEP,
                );
                fontSizeLabel.textContent = v + '%';
                updateFontLabelAndPreview();
            });
        }
        if (increaseFontBtn && fontSizeLabel) {
            increaseFontBtn.addEventListener('click', () => {
                const v = Math.min(
                    FONT_MAX,
                    (parseInt(fontSizeLabel.textContent, 10) || 100) + FONT_STEP,
                );
                fontSizeLabel.textContent = v + '%';
                updateFontLabelAndPreview();
            });
        }
        if (resetFontBtn && fontSizeLabel) {
            resetFontBtn.addEventListener('click', () => {
                fontSizeLabel.textContent = '100%';
                updateFontLabelAndPreview();
            });
        }

        if (borderRadiusSlider) {
            borderRadiusSlider.addEventListener('input', () => {
                if (typeof deps.updatePreviewSettingsFromModal === 'function') {
                    deps.updatePreviewSettingsFromModal();
                    if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                        deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                    }
                    deps.State.isUISettingsDirty = true;
                }
            });
        }
        if (densitySlider) {
            densitySlider.addEventListener('input', () => {
                if (typeof deps.updatePreviewSettingsFromModal === 'function') {
                    deps.updatePreviewSettingsFromModal();
                    if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                        deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                    }
                    deps.State.isUISettingsDirty = true;
                }
            });
        }

        function escapeHtml(str) {
            if (str == null || typeof str !== 'string') return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function showHealthReportModalFallback(report) {
            const modal = document.getElementById('healthReportModal');
            if (!modal) return;
            initHealthReportCollapseToggles();
            const body = modal.querySelector('#healthReportModalBody');
            if (!body) return;
            const esc = escapeHtml;
            const summaryClass = report.success
                ? 'health-report-summary-ok'
                : 'health-report-summary-fail';
            const summaryIcon = report.success
                ? '<i class="fas fa-check-circle" aria-hidden="true"></i>'
                : '<i class="fas fa-exclamation-circle" aria-hidden="true"></i>';
            const statusText = report.success ? 'Система в норме' : 'Обнаружены проблемы';
            const metaParts = [];
            if (report.startedAt) metaParts.push(`Начало: ${esc(report.startedAt)}`);
            if (report.finishedAt) metaParts.push(`Окончание: ${esc(report.finishedAt)}`);
            const summaryMeta = metaParts.length ? metaParts.join(' · ') : '';

            const subsystemSummary = buildHealthSubsystemSummaryHtml(
                report.errors,
                report.warnings,
                report.checks,
                esc,
            );
            const errorsList = buildGroupedHealthListHtml(
                report.errors,
                '<i class="fas fa-times-circle text-red-500 dark:text-red-400" aria-hidden="true"></i>',
                esc,
            );
            const warningsList = buildGroupedHealthListHtml(
                report.warnings,
                '<i class="fas fa-exclamation-triangle text-amber-500 dark:text-amber-400" aria-hidden="true"></i>',
                esc,
            );
            const checksList = buildGroupedHealthListHtml(
                report.checks,
                '<i class="fas fa-check text-primary" aria-hidden="true"></i>',
                esc,
            );

            body.innerHTML = `
                    <div class="health-report-body-scroll">
                        <div class="health-report-summary ${summaryClass}">
                            <div class="health-report-summary-icon">${summaryIcon}</div>
                            <div class="health-report-summary-text">
                                <h3>${esc(statusText)}</h3>
                                ${summaryMeta ? `<div class="health-report-summary-meta">${summaryMeta}</div>` : ''}
                            </div>
                        </div>
                        ${subsystemSummary}
                        <div class="health-report-section health-report-section-errors">
                            <div class="health-report-section-header health-report-section-errors">
                                <span class="health-report-section-icon"><i class="fas fa-exclamation-circle" aria-hidden="true"></i></span>
                                <span>Ошибки (${report.errors?.length ?? 0})</span>
                            </div>
                            ${
                                report.errors?.length
                                    ? errorsList
                                    : `<div class="health-report-empty">Ошибок не обнаружено.</div>`
                            }
                        </div>
                        <div class="health-report-section health-report-section-warnings health-report-section-collapsible is-collapsed">
                            <div class="health-report-section-header health-report-section-warnings">
                                <span class="health-report-section-icon"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i></span>
                                <span>Предупреждения (${report.warnings?.length ?? 0})</span>
                                <button type="button" class="health-report-section-toggle" aria-expanded="false" aria-label="Развернуть раздел" title="Развернуть">&#9654;</button>
                            </div>
                            <div class="health-report-section-body">
                                <div class="health-report-section-body-inner">
                                    ${
                                        report.warnings?.length
                                            ? warningsList
                                            : `<div class="health-report-empty">Предупреждений нет.</div>`
                                    }
                                </div>
                            </div>
                        </div>
                        <div class="health-report-section health-report-section-checks health-report-section-collapsible is-collapsed">
                            <div class="health-report-section-header health-report-section-checks">
                                <span class="health-report-section-icon"><i class="fas fa-clipboard-check" aria-hidden="true"></i></span>
                                <span>Проверки (${report.checks?.length ?? 0}) — по подсистемам (многослойный контур)</span>
                                <button type="button" class="health-report-section-toggle" aria-expanded="false" aria-label="Развернуть раздел" title="Развернуть">&#9654;</button>
                            </div>
                            <div class="health-report-section-body">
                                <div class="health-report-section-body-inner">
                                    ${
                                        report.checks?.length
                                            ? checksList
                                            : `<div class="health-report-empty">Список проверок пуст.</div>`
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
            `;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
        if (typeof window !== 'undefined') {
            window.showHealthReportModal = showHealthReportModalFallback;
        }

        function initHealthReportCollapseToggles() {
            const modal = document.getElementById('healthReportModal');
            if (!modal || modal.dataset.healthReportCollapseInit) return;
            modal.dataset.healthReportCollapseInit = '1';
            modal.addEventListener('click', (e) => {
                const header = e.target.closest(
                    '.health-report-section-collapsible .health-report-section-header',
                );
                if (!header) return;
                e.preventDefault();
                const section = header.closest('.health-report-section-collapsible');
                if (!section) return;
                section.classList.toggle('is-collapsed');
                const expanded = !section.classList.contains('is-collapsed');
                const btn = section.querySelector('.health-report-section-toggle');
                if (btn) {
                    btn.setAttribute('aria-expanded', String(expanded));
                    btn.title = expanded ? 'Свернуть' : 'Развернуть';
                    btn.setAttribute(
                        'aria-label',
                        expanded ? 'Свернуть раздел' : 'Развернуть раздел',
                    );
                    btn.textContent = expanded ? '\u25BC' : '\u25B6';
                }
            });
        }

        const healthReportModalClose = document.getElementById('healthReportModalClose');
        const healthReportModal = document.getElementById('healthReportModal');
        if (healthReportModalClose && healthReportModal) {
            healthReportModalClose.addEventListener('click', () => {
                healthReportModal.classList.add('hidden');
                healthReportModal.style.display = 'none';
            });
            if (!healthReportModal.dataset.escapeAttached) {
                healthReportModal.dataset.escapeAttached = '1';
                document.addEventListener(
                    'keydown',
                    (e) => {
                        if (e.key !== 'Escape') return;
                        if (
                            healthReportModal &&
                            !healthReportModal.classList.contains('hidden') &&
                            healthReportModal.style.display !== 'none'
                        ) {
                            healthReportModal.classList.add('hidden');
                            healthReportModal.style.display = 'none';
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    },
                    true,
                );
            }
        }

        customizeUIModal.addEventListener('change', (e) => {
            if (
                e.target.matches('input[name="staticHeader"]') ||
                e.target.matches('input[name="backupReminderEnabled"]')
            ) {
                if (e.target.matches('input[name="backupReminderEnabled"]') && e.target.checked) {
                    try {
                        onBackupReminderReEnabled();
                    } catch (err) {
                        console.warn('[UISettingsModal] onBackupReminderReEnabled:', err);
                    }
                }
                if (typeof deps.updatePreviewSettingsFromModal === 'function') {
                    deps.updatePreviewSettingsFromModal();
                    if (deps.State && typeof deps.applyPreviewSettings === 'function') {
                        deps.applyPreviewSettings(deps.State.currentPreviewSettings);
                    }
                    deps.State.isUISettingsDirty = true;
                }
            }
        });

        if (typeof deps.initColorPicker === 'function') deps.initColorPicker();
        if (typeof deps.setupExtensionFieldListeners === 'function')
            deps.setupExtensionFieldListeners();

        const runManualHealthCheckBtn = document.getElementById('runManualHealthCheckBtn');
        if (runManualHealthCheckBtn) {
            runManualHealthCheckBtn.addEventListener('click', async () => {
                if (runManualHealthCheckBtn.disabled) return;
                const runManualFullDiagnostic = window.runManualFullDiagnostic;
                if (typeof runManualFullDiagnostic !== 'function') {
                    console.error('[UISettingsModal] runManualFullDiagnostic не найден.');
                    return;
                }
                runManualHealthCheckBtn.disabled = true;
                runManualHealthCheckBtn.innerHTML =
                    '<i class="fas fa-spinner fa-spin mr-2"></i>Проверка...';
                try {
                    const report = await runManualFullDiagnostic();
                    showHealthReportModalFallback(report);
                } catch (err) {
                    console.error('[UISettingsModal] Ошибка ручного прогона:', err);
                    showHealthReportModalFallback({
                        errors: [{ title: 'Ошибка', message: err.message }],
                        warnings: [],
                        checks: [],
                        startedAt: new Date().toLocaleString('ru-RU'),
                        finishedAt: new Date().toLocaleString('ru-RU'),
                        success: false,
                        error: err.message,
                    });
                } finally {
                    runManualHealthCheckBtn.disabled = false;
                    runManualHealthCheckBtn.innerHTML =
                        '<i class="fas fa-stethoscope mr-2"></i>Запустить проверку систем';
                }
            });
        }

        customizeUIModal.dataset.settingsInnerListenersAttached = 'true';
        console.log(
            '[UISettingsModal] Обработчики элементов модального окна настроек установлены.',
        );
    }
}
