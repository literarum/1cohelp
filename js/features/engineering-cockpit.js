'use strict';

import {
    ingestRuntimeHubIssue,
    setRuntimeHubCockpitMirror,
    clearRuntimeHubBuffer,
    getRuntimeHubFaultEntries,
    getRuntimeHubBufferMeta,
} from './runtime-issue-hub.js';
import { mergeHubAndCockpitFaultRows } from './error-stream-merge.js';
import {
    buildCopilotDiagnosticBundle,
    diagnosticBundleToJsonString,
    suggestDiagnosticFilename,
} from './diagnostic-bundle.js';
import { getVisibleModals, getTopmostModal } from '../ui/modals-manager.js';
import {
    runManualHealthDiagnosticFromCockpit,
    buildManualDiagnosticFailureReport,
} from './engineering-cockpit-manual-health.js';
import { getPwaCockpitBlock } from '../app/pwa-register.js';
import {
    buildCockpitLoggingCrosscheck,
    filterCockpitLogEntries,
    formatCockpitLogText,
    isValidCockpitLogFilterLevel,
} from './engineering-cockpit-logging.js';
import { bindEngineeringCockpitScrollNav } from './engineering-cockpit-scroll-nav.js';

const ENGINEERING_PASSWORD = '05213587';
const LOG_BUFFER_LIMIT = 1500;
const MANUAL_DIAGNOSTIC_BTN_DEFAULT_HTML =
    '<i class="fas fa-stethoscope mr-1" aria-hidden="true"></i>Ручной прогон';

function pickNative(methodName) {
    if (typeof window !== 'undefined') {
        const mapped = window[`__ENGINEERING_NATIVE_${methodName.toUpperCase()}__`];
        if (typeof mapped === 'function') return mapped;
    }
    return typeof console[methodName] === 'function' ? console[methodName].bind(console) : () => {};
}

const nativeConsole = {
    log: pickNative('log'),
    info: pickNative('info'),
    warn: pickNative('warn'),
    error: pickNative('error'),
    debug: pickNative('debug'),
};

const state = {
    initialized: false,
    unlocked: false,
    logs: [],
    errors: [],
    dbSummary: [],
    currentTab: 'overview',
    /** @type {string} */
    logFilter: 'all',
    /** Монотонный номер записи в буфере (устойчивый к обрезке хвоста при переполнении). */
    nextLogSeq: 0,
};

let deps = {
    State: null,
    storeConfigs: null,
    getAllFromIndexedDB: null,
    getFromIndexedDB: null,
    showNotification: null,
    /** Регистрирует window.showHealthReportModal (как после onload); вызывать до ручного прогона при гонке инициализации. */
    initUISettingsModalHandlers: null,
};

let refs = null;

/** @type {{ requestUpdate: () => void, detach: () => void } | null} */
let cockpitScrollNavUi = null;

function nowIso() {
    return new Date().toISOString();
}

function safeSerialize(value, maxLen = 900) {
    try {
        if (typeof value === 'string')
            return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
        const json = JSON.stringify(value, null, 2);
        if (!json) return String(value);
        return json.length > maxLen ? `${json.slice(0, maxLen)}…` : json;
    } catch {
        return String(value);
    }
}

/** Сериализация аргументов console / объектов ошибок без потери DOM-событий и Error */
function cockpitSerialize(value, maxLen = 900) {
    if (value == null) return String(value);
    if (typeof value === 'string')
        return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
    if (value instanceof Error) {
        const s = value.stack || value.message || String(value);
        return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
    }
    if (typeof Event !== 'undefined' && value instanceof Event) {
        const t = value.target;
        const bits = [`type=${value.type || '?'}`];
        if (t instanceof Element) {
            bits.push(`target=<${t.tagName.toLowerCase()}${t.id ? `#${t.id}` : ''}>`);
            if (t instanceof HTMLImageElement) {
                const src = (t.currentSrc || t.src || '').trim();
                if (src) bits.push(`src=${src.length > 500 ? `${src.slice(0, 500)}…` : src}`);
            }
        }
        if (typeof value.message === 'string' && value.message) bits.push(`message=${value.message}`);
        const s = bits.join(' ');
        return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
    }
    return safeSerialize(value, maxLen);
}

function pushBounded(arr, item) {
    arr.push(item);
    if (arr.length > LOG_BUFFER_LIMIT) {
        arr.splice(0, arr.length - LOG_BUFFER_LIMIT);
    }
}

function allocateLogSeq() {
    state.nextLogSeq += 1;
    return state.nextLogSeq;
}

function addLog(level, args) {
    pushBounded(state.logs, {
        seq: allocateLogSeq(),
        ts: nowIso(),
        level,
        args: Array.from(args).map((arg) => cockpitSerialize(arg, 2400)),
    });
}

function buildRuntimeErrorMessage(errorLike) {
    if (errorLike instanceof Error)
        return errorLike.stack || errorLike.message || String(errorLike);
    if (typeof errorLike === 'string') return errorLike;
    if (typeof Event !== 'undefined' && errorLike instanceof Event) return cockpitSerialize(errorLike, 4000);
    return errorLike?.stack || errorLike?.message || safeSerialize(errorLike, 4000);
}

function pushCockpitRuntimeError(source, errorLike, extra = null) {
    const message = buildRuntimeErrorMessage(errorLike);
    pushBounded(state.errors, {
        ts: nowIso(),
        source,
        message,
        extra,
    });
}

function addRuntimeError(source, errorLike, extra = null) {
    try {
        ingestRuntimeHubIssue(source, errorLike, extra, { mirror: true });
    } catch {
        pushCockpitRuntimeError(source, errorLike, extra);
    }
}

function installConsoleInterceptors() {
    if (console.__engineeringCockpitInstalled) return;

    const patchMethod = (method, nativeMethod) => {
        const forward =
            typeof nativeMethod === 'function' ? nativeMethod : nativeConsole.log;
        console[method] = (...args) => {
            addLog(method, args);
            if (method === 'error') {
                const text = args.map((a) => cockpitSerialize(a, 3500)).join('\n');
                addRuntimeError('console.error', text || '(пустой вызов console.error)');
            }
            forward(...args);
        };
    };

    patchMethod('log', nativeConsole.log);
    patchMethod('info', nativeConsole.info);
    patchMethod('warn', nativeConsole.warn);
    patchMethod('error', nativeConsole.error);
    patchMethod('debug', nativeConsole.debug);

    console.__engineeringCockpitInstalled = true;
}

function importBootDiagnostics() {
    if (typeof window === 'undefined') return;

    const bootLogs = Array.isArray(window.__ENGINEERING_BOOTLOGS__)
        ? window.__ENGINEERING_BOOTLOGS__
        : [];
    const bootErrors = Array.isArray(window.__ENGINEERING_BOOTERRORS__)
        ? window.__ENGINEERING_BOOTERRORS__
        : [];

    bootLogs.forEach((entry) => {
        const args = Array.isArray(entry.args) ? entry.args : [entry.args];
        pushBounded(state.logs, {
            seq: allocateLogSeq(),
            ts: entry.ts || nowIso(),
            level: entry.level || 'boot',
            args: args.map((arg) => safeSerialize(arg)),
        });
    });

    bootErrors.forEach((entry) => {
        addRuntimeError(entry.source || 'bootstrap.error', safeSerialize(entry.args));
    });

    window.__ENGINEERING_BOOTLOGS__ = [];
    window.__ENGINEERING_BOOTERRORS__ = [];
}

function getDbStoreNames() {
    if (deps.State?.db?.objectStoreNames) {
        return Array.from(deps.State.db.objectStoreNames);
    }
    if (Array.isArray(deps.storeConfigs)) {
        return deps.storeConfigs.map((s) => s.name);
    }
    return [];
}

async function refreshDbSummary() {
    const storeNames = getDbStoreNames();
    const rows = [];

    for (const storeName of storeNames) {
        const row = { store: storeName, count: null, status: 'ok' };
        if (typeof deps.getAllFromIndexedDB === 'function') {
            try {
                const items = await deps.getAllFromIndexedDB(storeName);
                row.count = Array.isArray(items) ? items.length : 0;
            } catch (error) {
                row.status = 'error';
                row.count = null;
                row.error = error?.message || String(error);
            }
        } else {
            row.status = 'unavailable';
            row.error = 'getAllFromIndexedDB dependency missing';
        }
        rows.push(row);
    }

    state.dbSummary = rows;
}

function getSystemOverview() {
    const memory = performance?.memory
        ? {
              usedJSHeapSize: performance.memory.usedJSHeapSize,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
              jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          }
        : 'memory API unavailable';

    return {
        timestamp: nowIso(),
        app: {
            url: window.location.href,
            userAgent: navigator.userAgent,
            language: navigator.language,
            online: navigator.onLine,
            viewport: { width: window.innerWidth, height: window.innerHeight },
        },
        runtime: {
            logsBuffered: state.logs.length,
            runtimeErrorsBuffered: state.errors.length,
            currentTab: state.currentTab,
            unlocked: state.unlocked,
        },
        logging: buildCockpitLoggingCrosscheck(
            state.logs,
            getRuntimeHubBufferMeta(),
            LOG_BUFFER_LIMIT,
        ),
        performance: {
            timeOrigin: performance.timeOrigin,
            now: performance.now(),
            memory,
        },
    };
}

function getStateSnapshot() {
    if (!deps.State) return { message: 'State dependency is unavailable' };

    const snapshot = {
        keys: Object.keys(deps.State),
        currentSection: deps.State.currentSection,
        isLoading: deps.State.isLoading,
        userPreferences: deps.State.userPreferences || null,
        dbAvailable: Boolean(deps.State.db),
    };
    return snapshot;
}

function buildMergedErrorsText() {
    return mergeHubAndCockpitFaultRows(getRuntimeHubFaultEntries(2000), state.errors);
}

async function renderActiveTab() {
    if (!refs) return;

    const overviewData = getSystemOverview();
    try {
        overviewData.pwa = await getPwaCockpitBlock();
    } catch (err) {
        overviewData.pwa = { error: err?.message || String(err) };
    }
    refs.overview.textContent = safeSerialize(overviewData, 200000);

    const filterLevel = isValidCockpitLogFilterLevel(state.logFilter)
        ? state.logFilter
        : 'all';
    const filteredLogs = filterCockpitLogEntries(state.logs, filterLevel);
    if (refs.logMeta) {
        refs.logMeta.textContent =
            state.logs.length === 0
                ? 'Буфер пуст'
                : `Показано: ${filteredLogs.length} из ${state.logs.length} · фильтр: ${filterLevel}`;
    }
    if (!state.logs.length) {
        refs.logs.textContent = 'Логи пока отсутствуют.';
    } else if (!filteredLogs.length) {
        refs.logs.textContent =
            'Нет записей для выбранного уровня. Смените фильтр или выберите «Все уровни».';
    } else {
        refs.logs.textContent = formatCockpitLogText(filteredLogs);
    }

    refs.errors.textContent = buildMergedErrorsText();

    refs.db.textContent = state.dbSummary.length
        ? state.dbSummary
              .map((row) =>
                  row.status === 'ok'
                      ? `${row.store}: count=${row.count}`
                      : `${row.store}: ${row.status}${row.error ? ` (${row.error})` : ''}`,
              )
              .join('\n')
        : 'Сводка БД пока не собрана.';

    refs.state.textContent = safeSerialize(getStateSnapshot(), 200000);
    cockpitScrollNavUi?.requestUpdate?.();
}

function activateTab(tabId) {
    state.currentTab = tabId;
    refs.tabButtons.forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.cockpitTab === tabId);
    });
    refs.tabSections.forEach((section) => {
        section.classList.toggle('is-active', section.dataset.cockpitTab === tabId);
    });
    void renderActiveTab();
}

async function refreshCockpitData() {
    await refreshDbSummary();
    await renderActiveTab();
}

function closeEngineeringCockpit() {
    if (!refs) return;
    refs.modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
}

async function tryUnlock() {
    if (!refs) return;
    const password = refs.passwordInput.value.trim();
    if (password !== ENGINEERING_PASSWORD) {
        refs.authMessage.textContent = 'Неверный пароль доступа.';
        addRuntimeError('engineering.auth', 'invalid password');
        return;
    }

    state.unlocked = true;
    refs.auth.classList.add('hidden');
    refs.workspace.classList.remove('hidden');
    refs.shell?.classList.remove('engineering-cockpit-shell--compact');
    refs.passwordInput.value = '';
    refs.authMessage.textContent = '';
    await refreshCockpitData();
}

function bindUi() {
    const modal = document.getElementById('engineeringCockpitModal');
    refs = {
        modal,
        shell: modal?.querySelector('.engineering-cockpit-shell'),
        closeBtn: document.getElementById('engineeringCockpitCloseBtn'),
        auth: document.getElementById('engineeringCockpitAuth'),
        workspace: document.getElementById('engineeringCockpitWorkspace'),
        passwordInput: document.getElementById('engineeringCockpitPasswordInput'),
        unlockBtn: document.getElementById('engineeringCockpitUnlockBtn'),
        authMessage: document.getElementById('engineeringCockpitAuthMessage'),
        refreshBtn: document.getElementById('engineeringCockpitRefreshBtn'),
        runManualDiagnosticBtn: document.getElementById(
            'engineeringCockpitRunManualDiagnosticBtn',
        ),
        clearLogsBtn: document.getElementById('engineeringCockpitClearLogsBtn'),
        copySnapshotBtn: document.getElementById('engineeringCockpitCopySnapshotBtn'),
        exportDiagnosticBtn: document.getElementById('engineeringCockpitExportDiagnosticBtn'),
        tabButtons: Array.from(
            document.querySelectorAll('[data-cockpit-tab].engineering-cockpit-tab-btn'),
        ),
        tabSections: Array.from(
            document.querySelectorAll('.engineering-cockpit-tab[data-cockpit-tab]'),
        ),
        overview: document.getElementById('engineeringCockpitOverview'),
        logs: document.getElementById('engineeringCockpitLogs'),
        logLevelFilter: document.getElementById('engineeringCockpitLogLevelFilter'),
        logMeta: document.getElementById('engineeringCockpitLogMeta'),
        logsScrollEndBtn: document.getElementById('engineeringCockpitLogsScrollEndBtn'),
        exportLogsBtn: document.getElementById('engineeringCockpitExportLogsBtn'),
        errors: document.getElementById('engineeringCockpitErrors'),
        db: document.getElementById('engineeringCockpitDb'),
        state: document.getElementById('engineeringCockpitState'),
        cockpitContent: modal?.querySelector('.engineering-cockpit-content'),
        scrollNav: document.getElementById('engineeringCockpitScrollNav'),
        scrollNavUp: document.getElementById('engineeringCockpitScrollUpBtn'),
        scrollNavDown: document.getElementById('engineeringCockpitScrollDownBtn'),
    };

    if (!refs.modal || !refs.closeBtn || !refs.unlockBtn || !refs.passwordInput) return false;

    refs.closeBtn.addEventListener('click', closeEngineeringCockpit);
    /* Закрытие кокпита только по кнопке закрытия и Esc — не по клику на оверлей. */
    const onCockpitDocumentEscape = (event) => {
        if (event.key !== 'Escape') return;
        if (!refs.modal || refs.modal.classList.contains('hidden')) return;
        const visible = getVisibleModals();
        const top = getTopmostModal(visible);
        if (!top || top.id !== refs.modal.id) return;
        event.preventDefault();
        event.stopPropagation();
        closeEngineeringCockpit();
    };
    document.addEventListener('keydown', onCockpitDocumentEscape, true);

    refs.unlockBtn.addEventListener('click', () => {
        void tryUnlock();
    });
    refs.passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void tryUnlock();
        }
    });

    if (refs.logLevelFilter) {
        refs.logLevelFilter.value = state.logFilter;
        refs.logLevelFilter.addEventListener('change', () => {
            const v = refs.logLevelFilter.value;
            state.logFilter = isValidCockpitLogFilterLevel(v) ? v : 'all';
            void renderActiveTab();
        });
    }

    refs.logsScrollEndBtn?.addEventListener('click', () => {
        const wrap = refs.modal?.querySelector('.engineering-cockpit-content');
        if (wrap) {
            wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' });
        }
    });

    refs.exportLogsBtn?.addEventListener('click', () => {
        const filterLevel = isValidCockpitLogFilterLevel(state.logFilter)
            ? state.logFilter
            : 'all';
        const filteredLogs = filterCockpitLogEntries(state.logs, filterLevel);
        const body = formatCockpitLogText(filteredLogs);
        const header = `Copilot 1СО — машинное отделение · логи\nфильтр: ${filterLevel}\nсформировано: ${nowIso()}\n---\n`;
        const text = filteredLogs.length ? header + body : header + '(пусто)';
        try {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `copilot-cockpit-logs-${filterLevel}-${Date.now()}.txt`;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            deps.showNotification?.('Файл логов сохранён.', 'success');
        } catch (err) {
            nativeConsole.error('[engineering-cockpit] log export failed', err);
            deps.showNotification?.('Не удалось сохранить логи.', 'error');
        }
    });

    refs.refreshBtn?.addEventListener('click', () => {
        void refreshCockpitData();
    });

    refs.runManualDiagnosticBtn?.addEventListener('click', () => {
        void (async () => {
            const btn = refs.runManualDiagnosticBtn;
            if (!btn || btn.disabled) return;
            btn.disabled = true;
            btn.innerHTML =
                '<i class="fas fa-spinner fa-spin mr-1" aria-hidden="true"></i>Прогон...';
            try {
                if (
                    typeof window !== 'undefined' &&
                    typeof window.showHealthReportModal !== 'function' &&
                    typeof deps.initUISettingsModalHandlers === 'function'
                ) {
                    deps.initUISettingsModalHandlers();
                }
                await runManualHealthDiagnosticFromCockpit();
                await refreshCockpitData();
            } catch (err) {
                nativeConsole.error('[engineering-cockpit] manual diagnostic failed', err);
                if (
                    typeof window !== 'undefined' &&
                    typeof window.showHealthReportModal === 'function'
                ) {
                    window.showHealthReportModal(buildManualDiagnosticFailureReport(err));
                } else {
                    deps.showNotification?.(
                        `Диагностика недоступна: ${err?.message || err}`,
                        'error',
                    );
                }
            } finally {
                btn.disabled = false;
                btn.innerHTML = MANUAL_DIAGNOSTIC_BTN_DEFAULT_HTML;
            }
        })();
    });

    refs.clearLogsBtn?.addEventListener('click', () => {
        state.logs = [];
        state.errors = [];
        clearRuntimeHubBuffer();
        if (typeof window !== 'undefined' && window.BackgroundStatusHUD?.touchRuntimeIssues) {
            try {
                window.BackgroundStatusHUD.touchRuntimeIssues();
            } catch {
                /* ignore */
            }
        }
        void renderActiveTab();
    });
    refs.copySnapshotBtn?.addEventListener('click', async () => {
        const overview = getSystemOverview();
        try {
            overview.pwa = await getPwaCockpitBlock();
        } catch (err) {
            overview.pwa = { error: err?.message || String(err) };
        }
        const snapshot = {
            overview,
            state: getStateSnapshot(),
            db: state.dbSummary,
            errorsMerged: buildMergedErrorsText(),
            errorsCockpit: state.errors.slice(-200),
            errorsHub: getRuntimeHubFaultEntries(200),
            logs: state.logs.slice(-500),
        };
        const text = safeSerialize(snapshot, 400000);
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                deps.showNotification?.(
                    'Engineering snapshot скопирован в буфер обмена.',
                    'success',
                );
            } else {
                throw new Error('Clipboard API unavailable');
            }
        } catch {
            deps.showNotification?.('Не удалось скопировать snapshot.', 'error');
        }
    });

    refs.exportDiagnosticBtn?.addEventListener('click', () => {
        void (async () => {
            try {
                const hud = window.BackgroundStatusHUD;
                const bundle = await buildCopilotDiagnosticBundle({
                    getFromIndexedDB: deps.getFromIndexedDB,
                    getLogs: () => state.logs.slice(-1500),
                    getCockpitErrors: () => state.errors.slice(),
                    getHubFaultEntries: () => getRuntimeHubFaultEntries(2000),
                    getSystemOverview: getSystemOverview,
                    getStateSnapshot: getStateSnapshot,
                    getDbSummary: () => state.dbSummary,
                    getHudDiagnostics: () =>
                        typeof hud?.getDiagnosticsSnapshot === 'function'
                            ? hud.getDiagnosticsSnapshot()
                            : null,
                    getWatchdog: () =>
                        typeof hud?.getWatchdogSnapshot === 'function'
                            ? hud.getWatchdogSnapshot()
                            : null,
                });
                const json = diagnosticBundleToJsonString(bundle);
                const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = suggestDiagnosticFilename();
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                deps.showNotification?.('Пакет диагностики сохранён в файл.', 'success');
            } catch (err) {
                nativeConsole.error('[engineering-cockpit] diagnostic export failed', err);
                deps.showNotification?.(
                    `Не удалось сформировать пакет: ${err?.message || err}`,
                    'error',
                );
            }
        })();
    });

    document.querySelectorAll('[data-cockpit-copy]').forEach((btn) => {
        if (btn.dataset.cockpitCopyWired === '1') return;
        btn.dataset.cockpitCopyWired = '1';
        btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-cockpit-copy');
            const el = targetId ? document.getElementById(targetId) : null;
            const text = el?.textContent ?? '';
            if (!text.trim()) {
                deps.showNotification?.('Нечего копировать.', 'info');
                return;
            }
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    deps.showNotification?.('Содержимое раздела скопировано.', 'success');
                } else {
                    throw new Error('Clipboard API unavailable');
                }
            } catch {
                deps.showNotification?.('Не удалось скопировать.', 'error');
            }
        });
    });

    refs.tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => activateTab(btn.dataset.cockpitTab || 'overview'));
    });

    cockpitScrollNavUi?.detach();
    if (refs.cockpitContent && refs.scrollNav && refs.scrollNavUp && refs.scrollNavDown) {
        cockpitScrollNavUi = bindEngineeringCockpitScrollNav({
            modal: refs.modal,
            workspace: refs.workspace,
            contentWrap: refs.cockpitContent,
            container: refs.scrollNav,
            upBtn: refs.scrollNavUp,
            downBtn: refs.scrollNavDown,
        });
    } else {
        cockpitScrollNavUi = null;
    }

    return true;
}

export function setEngineeringCockpitDependencies(newDeps) {
    deps = { ...deps, ...newDeps };
}

export function openEngineeringCockpit() {
    if (!refs) return;

    refs.modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    if (!state.unlocked) {
        refs.shell?.classList.add('engineering-cockpit-shell--compact');
        refs.auth.classList.remove('hidden');
        refs.workspace.classList.add('hidden');
        refs.passwordInput.focus();
        return;
    }
    refs.shell?.classList.remove('engineering-cockpit-shell--compact');
    refs.auth.classList.add('hidden');
    refs.workspace.classList.remove('hidden');
    activateTab(state.currentTab);
    void refreshCockpitData();
    requestAnimationFrame(() => cockpitScrollNavUi?.requestUpdate?.());
}

export function initEngineeringCockpit() {
    if (state.initialized) return;
    installConsoleInterceptors();
    importBootDiagnostics();
    if (!bindUi()) {
        nativeConsole.error('[engineering-cockpit] Required DOM elements not found.');
        return;
    }
    window.openEngineeringCockpit = openEngineeringCockpit;
    state.initialized = true;
    setRuntimeHubCockpitMirror((source, errorLike, extra) => {
        pushCockpitRuntimeError(source, errorLike, extra);
    });
    addLog('info', ['Engineering cockpit initialized']);
}
