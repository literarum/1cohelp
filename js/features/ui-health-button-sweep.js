'use strict';

/**
 * Третий/четвёртый контур по кнопкам: обход вкладок, пассивные проверки (a11y-имя, геометрия),
 * безопасный синтетический клик (один раз на id) + мониторинг runtime hub.
 */

import { getRuntimeHubIssueCount } from './runtime-issue-hub.js';
import { shouldSkipHealthInteractiveGeometry } from './ui-health-surface-registry.js';

export const HEALTH_BUTTON_SWEEP_TAB_IDS = Object.freeze([
    'main',
    'program',
    'links',
    'extLinks',
    'skzi',
    'lk1c',
    'webReg',
    'reglaments',
    'bookmarks',
    'clientAnalytics',
    'training',
    'sedoTypes',
    'blacklistedClients',
    'fnsCert',
    'xmlAnalyzer',
    'favorites',
    'reminders',
]);

const SLEEP_AFTER_TAB_MS = 280;

const AUTOSLICK_DENY_IDS = new Set([
    'exportDataBtn',
    'importDataBtn',
    'mergeDataBtn',
    'forceReloadBtn',
    'importFileInput',
    'backgroundImageInput',
    'clientAnalyticsFileInput',
    'clientAnalyticsImportInput',
    'dbMergeFileInput',
    'fnsCertFileInput',
    'xmlAnalyzerDataInput',
    'confirmAndClearDataBtn',
    'clearAllDataBtn',
    'clearClientDataBtn',
    'exportBeforeClearBtn',
    'deleteAlgorithmBtn',
    'saveAlgorithmBtn',
    'saveNewAlgorithmBtn',
    'cancelEditBtn',
    'cancelAddBtn',
    'addStepBtn',
    'addNewStepBtn',
    'editAlgorithmBtn',
    'startStepExecutionBtn',
    'saveCibLinkBtn',
    'saveUISettingsBtn',
    'resetUiBtn',
    'dbMergeStartBtn',
    'dbMergeCancelBtn',
    'dbMergeSelectFileBtn',
    'xmlAnalyzerAnalyzeBtn',
    'xmlAnalyzerLoadFileBtn',
    'xmlAnalyzerExportZipBtn',
    'fnsCertResetBtn',
    'reminderFormSubmitBtn',
    'engineeringCockpitUnlockBtn',
    'engineeringCockpitClearLogsBtn',
    'engineeringCockpitExportLogsBtn',
    'engineeringCockpitExportDiagnosticBtn',
    'openClientNotesWindowBtn',
    'openClientNotesPopupBtn',
    'clientDataUndoBtn',
    'clientDataRedoBtn',
    'unsavedConfirmLeaveBtn',
    'okHotkeysModalBtn',
    'runManualHealthCheckBtn',
    'openCommandPaletteBtn',
    'customizeUIBtn',
    'showHotkeysBtn',
    'openRecentlyDeletedBtn',
    'openAppCustomizationModalBtn',
    'restartOnboardingTourBtn',
    'showFavoritesHeaderBtn',
    'showRemindersHeaderBtn',
    'moreTabsBtn',
    'closeModalBtn',
    'closeEditModalBtn',
    'closeAddModalBtn',
    'reminderModalCloseBtn',
    'engineeringCockpitCloseBtn',
]);

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isHealthAutoclickDeniedByPattern(id) {
    if (!id) return true;
    if (AUTOSLICK_DENY_IDS.has(id)) return true;
    if (/Tab$/.test(id)) return true;
    const p = id.toLowerCase();
    if (
        /\b(export|import|merge|delete|clear|confirm|save|remove|reset|reload|submit|analyze|apply|upload|download)\b/.test(
            p,
        )
    ) {
        return true;
    }
    if (/window|popup|fileinput|dropzone|password|closemodal|close.*btn|fullscreen/i.test(id)) {
        return true;
    }
    return false;
}

/**
 * @param {Element} el
 * @returns {string}
 */
export function computeAccessibleName(el) {
    if (!(el instanceof HTMLElement)) return '';
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
        const parts = lb
            .split(/\s+/)
            .map((sid) => document.getElementById(sid)?.textContent?.trim() || '')
            .filter(Boolean);
        if (parts.length) return parts.join(' ').trim();
    }
    if (el.title && el.title.trim()) return el.title.trim();
    const tc = el.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (tc.length) return tc.length > 120 ? `${tc.slice(0, 120)}…` : tc;
    return '';
}

/**
 * @param {ParentNode} root
 * @returns {HTMLElement[]}
 */
function collectClickableWithIds(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    const sel = [
        'button[id]',
        '[role="button"][id]',
        'a[id][href]',
        'input[type="button"][id]',
        'input[type="submit"][id]',
    ].join(',');
    return [...root.querySelectorAll(sel)].filter((n) => n instanceof HTMLElement && n.id);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {object} deps
 * @param {function(string, boolean=): Promise<void>} deps.setActiveTab
 * @param {{ currentSection?: string } | null} [deps.State]
 * @param {function(...args): void} report
 * @param {function(Promise, number): Promise} [runWithTimeout]
 * @param {{ syntheticClicks?: boolean, tabSweepMode?: 'full'|'background' }} [options]
 *   - syntheticClicks === true: явное включение el.click() по политике (по умолчанию выключено — безопасный фон).
 *   - tabSweepMode === 'background': без setActiveTab, только chrome и текущая вкладка (не дергаем модалки/предупреждения переключением разделов).
 */
export async function runFullButtonHealthSweep(deps, report, runWithTimeout, options = {}) {
    const syntheticClicks = options.syntheticClicks === true;
    const navigateAllTabs = options.tabSweepMode !== 'background';
    const r = (level, title, message, extra = {}) =>
        report(level, title, message, { system: 'ui_surface', ...extra });

    if (typeof document === 'undefined') {
        r('warn', 'Поверхность UI / кнопки', 'document недоступен.');
        return;
    }

    const app = document.getElementById('appContent');
    if (!app || app.classList.contains('hidden')) {
        r('warn', 'Поверхность UI / кнопки', '#appContent скрыт — зонд кнопок пропущен.');
        return;
    }

    if (navigateAllTabs && typeof deps.setActiveTab !== 'function') {
        r(
            'warn',
            'Поверхность UI / кнопки',
            'setActiveTab не передан в зависимостях health — полный обход вкладок отключён.',
        );
        return;
    }

    const runB = (promise, ms) =>
        typeof runWithTimeout === 'function' ? runWithTimeout(promise, ms) : promise;

    const initialTab =
        (deps.State && typeof deps.State.currentSection === 'string' && deps.State.currentSection) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('lastActiveTabCopilot1CO')) ||
        'main';

    /** @type {string[]} */
    const nameWarnings = [];
    /** @type {string[]} */
    const layoutWarnings = [];
    let passiveTargets = 0;
    let clickedOk = 0;
    let clickSkippedPolicy = 0;
    let clickFailed = 0;
    /** @type {string[]} */
    const clickFailSamples = [];

    /** @type {Set<string>} */
    const clickedOnce = new Set();

    /**
     * @param {HTMLElement} el
     * @param {string} context
     */
    const passiveScan = (el, context) => {
        const id = el.id;
        passiveTargets += 1;
        if (!computeAccessibleName(el)) {
            nameWarnings.push(`${id} (${context})`);
        }
        if (shouldSkipHealthInteractiveGeometry(el, document)) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        if (w < 2 || h < 2) {
            layoutWarnings.push(`${id}(${Math.round(w)}×${Math.round(h)}) [${context}]`);
        }
    };

    /**
     * @param {HTMLElement} el
     */
    const tryAutoclickOnce = (el) => {
        const id = el.id;
        if (clickedOnce.has(id)) return;
        if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
            clickSkippedPolicy += 1;
            return;
        }
        if (el.dataset?.healthNoAutoclick === 'true') {
            clickSkippedPolicy += 1;
            return;
        }
        if (isHealthAutoclickDeniedByPattern(id)) {
            clickSkippedPolicy += 1;
            return;
        }
        if (!(el instanceof HTMLButtonElement) && el.getAttribute('role') !== 'button') {
            clickSkippedPolicy += 1;
            return;
        }
        if (shouldSkipHealthInteractiveGeometry(el, document)) {
            clickSkippedPolicy += 1;
            return;
        }

        clickedOnce.add(id);
        const before = getRuntimeHubIssueCount();
        try {
            el.click();
        } catch (err) {
            clickFailed += 1;
            if (clickFailSamples.length < 12) {
                clickFailSamples.push(`${id}: ${err?.message || err}`);
            }
            return;
        }
        const after = getRuntimeHubIssueCount();
        if (after > before) {
            clickFailed += 1;
            if (clickFailSamples.length < 12) {
                clickFailSamples.push(`${id}: runtime hub +${after - before}`);
            }
        } else {
            clickedOk += 1;
        }
    };

    const sweepChrome = () => {
        const chromeRoots = [
            document.getElementById('staticHeaderWrapper'),
            document.getElementById('scrollNavButtons'),
        ].filter(Boolean);
        for (const root of chromeRoots) {
            for (const el of collectClickableWithIds(root)) {
                passiveScan(el, 'chrome');
                if (syntheticClicks) tryAutoclickOnce(el);
            }
        }
    };

    /**
     * @param {string} tabId
     * @returns {HTMLElement | null}
     */
    const resolveTabContentRoot = (tabId) => {
        const contentId = `${tabId}Content`;
        return (
            document.getElementById(contentId) ||
            (tabId === 'training' ? document.getElementById('trainingMount') : null)
        );
    };

    try {
        if (!navigateAllTabs) {
            r(
                'info',
                'Поверхность UI / кнопки (режим)',
                'Фоновый зонд: без переключения вкладок — только шапка/навигация и контент текущей вкладки.',
            );
            sweepChrome();
            const tabRoot = resolveTabContentRoot(initialTab);
            if (tabRoot) {
                for (const el of collectClickableWithIds(tabRoot)) {
                    passiveScan(el, initialTab);
                    if (syntheticClicks) tryAutoclickOnce(el);
                }
            } else {
                r(
                    'warn',
                    'Поверхность UI / кнопки',
                    `Не найден контейнер контента для вкладки «${initialTab}» — пассивный зонд вкладки пропущен.`,
                );
            }
        } else {
            let chromeSweepDone = false;
            for (const tabId of HEALTH_BUTTON_SWEEP_TAB_IDS) {
                const contentId = `${tabId}Content`;
                const content = document.getElementById(contentId);
                if (!content && tabId !== 'favorites' && tabId !== 'reminders') {
                    continue;
                }

                try {
                    await runB(Promise.resolve(deps.setActiveTab(tabId, true)), 20000);
                } catch (err) {
                    r('warn', `Поверхность UI / кнопки / вкладка ${tabId}`, err?.message || String(err));
                    continue;
                }
                await sleep(SLEEP_AFTER_TAB_MS);

                if (!chromeSweepDone) {
                    sweepChrome();
                    chromeSweepDone = true;
                }

                const tabRoot = resolveTabContentRoot(tabId);
                if (tabRoot) {
                    for (const el of collectClickableWithIds(tabRoot)) {
                        passiveScan(el, tabId);
                        if (syntheticClicks) tryAutoclickOnce(el);
                    }
                }
            }
        }

        r(
            'info',
            'Поверхность UI / кнопки (инвентаризация)',
            syntheticClicks
                ? `Пассивных срабатываний: ${passiveTargets}; безопасных кликов (уникальных id): ${clickedOk}; пропущено политикой/disabled/скрыто: ${clickSkippedPolicy}; сбоев клика/hub: ${clickFailed}.`
                : `Пассивных срабатываний: ${passiveTargets}; активный зонд отключён (без программных кликов — не открывается системный диалог выбора файла).`,
        );

        if (nameWarnings.length) {
            const s = nameWarnings.slice(0, 20).join('; ');
            const more = nameWarnings.length > 20 ? ` … (+${nameWarnings.length - 20})` : '';
            r(
                'warn',
                'Поверхность UI / кнопки (a11y имя)',
                `Нет доступного имени: ${s}${more}`,
            );
        }

        if (layoutWarnings.length) {
            const s = layoutWarnings.slice(0, 16).join('; ');
            const more = layoutWarnings.length > 16 ? ` … (+${layoutWarnings.length - 16})` : '';
            r(
                'warn',
                'Поверхность UI / кнопки (геометрия)',
                `Подозрительный размер при активной вкладке: ${s}${more}`,
            );
        }

        if (syntheticClicks && clickFailSamples.length) {
            r(
                'error',
                'Поверхность UI / кнопки (активный зонд)',
                `Сбои: ${clickFailSamples.join(' | ')}`,
            );
        }
    } finally {
        if (navigateAllTabs && typeof deps.setActiveTab === 'function') {
            try {
                await runB(Promise.resolve(deps.setActiveTab(initialTab, true)), 15000);
                await sleep(SLEEP_AFTER_TAB_MS);
            } catch {
                /* best effort */
            }
        }
    }
}
