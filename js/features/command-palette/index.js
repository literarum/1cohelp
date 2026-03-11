'use strict';

/**
 * Глобальная палитра команд (Ctrl+K / Cmd+K).
 * Единая точка входа: поиск по алгоритмам, XML‑отчётам, ошибкам, глобальный поиск по индексу и глобальные действия.
 */

import { runSearch, runSearchWithGlobal } from './search.js';
import { handleSearchResultClick } from '../search.js';
import * as ui from './ui.js';
import { getRecentIds, addRecentId, reorderByRecent } from './recent.js';

let setActiveTab = null;
let showAlgorithmDetail = null;
let algorithms = null;

export function setCommandPaletteDependencies(deps) {
    if (deps.setActiveTab !== undefined) setActiveTab = deps.setActiveTab;
    if (deps.showAlgorithmDetail !== undefined) showAlgorithmDetail = deps.showAlgorithmDetail;
    if (deps.algorithms !== undefined) algorithms = deps.algorithms;
}

function selectResult(result) {
    if (!result || !result.payload) return;
    if (result.id) addRecentId(result.id);
    closeCommandPalette();

    if (result.payload.fullResult) {
        handleSearchResultClick(result.payload.fullResult);
        return;
    }

    if (result.type === 'algorithm' && result.payload.algorithm && result.payload.section) {
        if (typeof setActiveTab === 'function') setActiveTab(result.payload.section);
        setTimeout(() => {
            if (typeof showAlgorithmDetail === 'function') {
                showAlgorithmDetail(result.payload.algorithm, result.payload.section);
            }
        }, 100);
        return;
    }

    if (result.type === 'action' && result.payload.action) {
        const action = result.payload.action;
        if (action === 'openSettings') {
            document.getElementById('customizeUIBtn')?.click();
        } else if (action === 'openHotkeys') {
            document.getElementById('showHotkeysBtn')?.click();
        } else if (action === 'runHealthDiagnostic') {
            if (typeof window.runManualFullDiagnostic === 'function' && typeof window.showHealthReportModal === 'function') {
                window.runManualFullDiagnostic()
                    .then((report) => window.showHealthReportModal(report))
                    .catch((err) => {
                        window.showHealthReportModal({
                            errors: [{ title: 'Ошибка', message: err?.message || String(err) }],
                            warnings: [],
                            checks: [],
                            startedAt: new Date().toLocaleString('ru-RU'),
                            finishedAt: new Date().toLocaleString('ru-RU'),
                            success: false,
                            error: err?.message || String(err),
                        });
                    });
            }
        } else if (action === 'exportDatabase') {
            document.getElementById('exportDataBtn')?.click();
        } else if (action === 'importDatabase') {
            document.getElementById('importDataBtn')?.click();
        } else if (action === 'toggleTheme') {
            document.getElementById('themeToggle')?.click();
        } else if (action === 'forceReload') {
            document.getElementById('forceReloadBtn')?.click();
        } else if (action === 'openFavorites') {
            document.getElementById('showFavoritesHeaderBtn')?.click();
        } else if (action === 'openClientNotesWindow') {
            document.getElementById('openClientNotesWindowBtn')?.click();
        } else if (action === 'openClientNotesPopup') {
            document.getElementById('openClientNotesPopupBtn')?.click();
        } else if (action === 'addBookmark') {
            document.getElementById('addBookmarkBtn')?.click();
        } else if (action === 'addReglament') {
            document.getElementById('addReglamentBtn')?.click();
        } else if (action === 'addCibLink') {
            document.getElementById('addLinkBtn')?.click();
        } else if (action === 'addExtLink') {
            document.getElementById('addExtLinkBtn')?.click();
        } else if (action === 'clearClientData') {
            document.getElementById('clearClientDataBtn')?.click();
        } else if (action === 'exportClientDataToTxt') {
            if (typeof window.exportClientDataToTxt === 'function') {
                window.exportClientDataToTxt();
            } else {
                document.getElementById('exportTextBtn')?.click();
            }
        } else if (action === 'timerToggle') {
            document.getElementById('timerToggleButton')?.click();
        } else if (action === 'timerReset') {
            document.getElementById('timerResetButton')?.click();
        } else if (action === 'showNoInnModal') {
            if (typeof window.showNoInnModal === 'function') {
                window.showNoInnModal();
            } else {
                document.getElementById('noInnLink')?.click();
            }
        }
        return;
    }

    if (result.payload.tabId && typeof setActiveTab === 'function') {
        setActiveTab(result.payload.tabId);
    }
}

let keydownHandler = null;
let inputHandler = null;

export function openCommandPalette() {
    ui.setUiCallbacks({ selectResult, onClose: closeCommandPalette });
    const modal = ui.getOrCreateModal();
    modal.classList.remove('hidden');
    const inputEl = ui.getInputEl();
    if (inputEl) {
        inputEl.value = '';
        if (inputHandler) inputEl.removeEventListener('input', inputHandler);
        inputHandler = () => {
            const q = inputEl.value;
            const syncResults = runSearch(q, algorithms);
            ui.renderResults(reorderByRecent(syncResults, getRecentIds()));
            if (!q.trim()) return;
            runSearchWithGlobal(q, algorithms).then((merged) => {
                if (inputEl.value.trim() === q.trim()) {
                    ui.renderResults(reorderByRecent(merged, getRecentIds()));
                }
            });
        };
        inputEl.addEventListener('input', inputHandler);
    }
    const initialResults = runSearch('', algorithms);
    ui.renderResults(reorderByRecent(initialResults, getRecentIds()));
    keydownHandler = (e) => ui.onKeydown(e);
    document.addEventListener('keydown', keydownHandler, true);
    requestAnimationFrame(() => inputEl?.focus());
}

export function closeCommandPalette() {
    ui.hide();
    if (keydownHandler) {
        document.removeEventListener('keydown', keydownHandler, true);
        keydownHandler = null;
    }
}

export function initCommandPalette() {
    ui.setUiCallbacks({ selectResult, onClose: closeCommandPalette });
    ui.getOrCreateModal();
    const btn = document.getElementById('openCommandPaletteBtn');
    if (btn && !btn.dataset.commandPaletteBound) {
        btn.addEventListener('click', openCommandPalette);
        btn.dataset.commandPaletteBound = 'true';
    }
    console.log('[command-palette] Палитра команд инициализирована (Ctrl+K / Cmd+K).');
}
