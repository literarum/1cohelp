'use strict';

let deps = {
    State: null,
    loadUISettings: null,
    populateModalControls: null,
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
    showUnsavedConfirmModal: null,
    setupExtensionFieldListeners: null,
    loadEmployeeExtension: null,
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
                if (typeof deps.setColorPickerStateFromHex === 'function') {
                    const hex =
                        deps.State?.currentPreviewSettings?.primaryColor ||
                        deps.State?.userPreferences?.primaryColor;
                    deps.setColorPickerStateFromHex(hex || '#9933FF');
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
            }
        });
        customizeUIBtn.dataset.settingsListenerAttached = 'true';
        console.log('[UISettingsModal] Обработчик открытия модального окна настроек установлен.');
    }

    if (customizeUIModal && !customizeUIModal.dataset.settingsInnerListenersAttached) {
        const closeModal = () => {
            if (typeof deps.closeAnimatedModal === 'function') {
                deps.closeAnimatedModal(customizeUIModal);
            }
            document.body.classList.remove('modal-open');
        };

        const requestClose = async () => {
            if (
                deps.State?.isUISettingsDirty &&
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
        const decreaseFontBtn = document.getElementById('decreaseFontBtn');
        const increaseFontBtn = document.getElementById('increaseFontBtn');
        const resetFontBtn = document.getElementById('resetFontBtn');
        const fontSizeLabel = customizeUIModal.querySelector('#fontSizeLabel');
        const borderRadiusSlider = customizeUIModal.querySelector('#borderRadiusSlider');
        const densitySlider = customizeUIModal.querySelector('#densitySlider');

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
                if (typeof deps.resetUISettingsInModal === 'function') {
                    await deps.resetUISettingsInModal();
                }
            });
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
            const body = modal.querySelector('#healthReportModalBody');
            if (!body) return;
            const esc = escapeHtml;
            const buildSectionList = (items, itemIcon) => {
                if (!items?.length) return '';
                return items
                    .map(
                        (i) =>
                            `<li class="health-report-item">
                                <span class="health-report-item-icon">${itemIcon}</span>
                                <div>
                                    <div class="health-report-item-title">${esc(i.title)}</div>
                                    <div class="health-report-item-message">${esc(i.message)}</div>
                                </div>
                            </li>`,
                    )
                    .join('');
            };
            const summaryClass = report.success ? 'health-report-summary-ok' : 'health-report-summary-fail';
            const summaryIcon = report.success
                ? '<i class="fas fa-check-circle" aria-hidden="true"></i>'
                : '<i class="fas fa-exclamation-circle" aria-hidden="true"></i>';
            const statusText = report.success ? 'Система в норме' : 'Обнаружены проблемы';
            const metaParts = [];
            if (report.startedAt) metaParts.push(`Начало: ${esc(report.startedAt)}`);
            if (report.finishedAt) metaParts.push(`Окончание: ${esc(report.finishedAt)}`);
            const summaryMeta = metaParts.length ? metaParts.join(' · ') : '';

            const errorsList = buildSectionList(report.errors, '<i class="fas fa-times-circle text-red-500 dark:text-red-400" aria-hidden="true"></i>');
            const warningsList = buildSectionList(report.warnings, '<i class="fas fa-exclamation-triangle text-amber-500 dark:text-amber-400" aria-hidden="true"></i>');
            const checksList = buildSectionList(report.checks, '<i class="fas fa-check text-primary" aria-hidden="true"></i>');

            body.innerHTML = `
                    <div class="health-report-summary ${summaryClass}">
                        <div class="health-report-summary-icon">${summaryIcon}</div>
                        <div class="health-report-summary-text">
                            <h3>${esc(statusText)}</h3>
                            ${summaryMeta ? `<div class="health-report-summary-meta">${summaryMeta}</div>` : ''}
                        </div>
                    </div>
                    <div class="health-report-section health-report-section-errors">
                        <div class="health-report-section-header health-report-section-errors">
                            <span class="health-report-section-icon"><i class="fas fa-exclamation-circle" aria-hidden="true"></i></span>
                            <span>Ошибки (${report.errors?.length ?? 0})</span>
                        </div>
                        ${report.errors?.length
                            ? `<ul class="health-report-section-list">${errorsList}</ul>`
                            : `<div class="health-report-empty">Ошибок не обнаружено.</div>`}
                    </div>
                    <div class="health-report-section health-report-section-warnings">
                        <div class="health-report-section-header health-report-section-warnings">
                            <span class="health-report-section-icon"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i></span>
                            <span>Предупреждения (${report.warnings?.length ?? 0})</span>
                        </div>
                        ${report.warnings?.length
                            ? `<ul class="health-report-section-list">${warningsList}</ul>`
                            : `<div class="health-report-empty">Предупреждений нет.</div>`}
                    </div>
                    <div class="health-report-section health-report-section-checks">
                        <div class="health-report-section-header health-report-section-checks">
                            <span class="health-report-section-icon"><i class="fas fa-clipboard-check" aria-hidden="true"></i></span>
                            <span>Проверки (${report.checks?.length ?? 0}) — слои, хранилища, надёжность данных</span>
                        </div>
                        ${report.checks?.length
                            ? `<ul class="health-report-section-list">${checksList}</ul>`
                            : `<div class="health-report-empty">Список проверок пуст.</div>`}
                    </div>
            `;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }

        const healthReportModalClose = document.getElementById('healthReportModalClose');
        const healthReportModal = document.getElementById('healthReportModal');
        if (healthReportModalClose && healthReportModal) {
            healthReportModalClose.addEventListener('click', () => {
                healthReportModal.classList.add('hidden');
                healthReportModal.style.display = 'none';
            });
            healthReportModal.addEventListener('click', (e) => {
                if (e.target === healthReportModal) {
                    healthReportModal.classList.add('hidden');
                    healthReportModal.style.display = 'none';
                }
            });
        }

        customizeUIModal.addEventListener('change', (e) => {
            if (e.target.matches('input[name="themeMode"], input[name="staticHeader"]')) {
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

        const toggleManualHealthRun = customizeUIModal.querySelector('#toggleManualHealthRun');
        const runManualHealthCheckBtn = document.getElementById('runManualHealthCheckBtn');
        if (runManualHealthCheckBtn) {
            const updateManualRunButtonState = () => {
                const enabled = !toggleManualHealthRun || toggleManualHealthRun.checked;
                runManualHealthCheckBtn.disabled = !enabled;
            };
            if (toggleManualHealthRun) {
                toggleManualHealthRun.addEventListener('change', updateManualRunButtonState);
                updateManualRunButtonState();
            }
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
                    runManualHealthCheckBtn.disabled = !toggleManualHealthRun?.checked;
                    runManualHealthCheckBtn.innerHTML =
                        '<i class="fas fa-stethoscope mr-2"></i>Запустить полную проверку';
                }
            });
        }

        customizeUIModal.dataset.settingsInnerListenersAttached = 'true';
        console.log(
            '[UISettingsModal] Обработчики элементов модального окна настроек установлены.',
        );
    }
}
