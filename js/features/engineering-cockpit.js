'use strict';

const ENGINEERING_PASSWORD = '05213587';
const LOG_BUFFER_LIMIT = 1500;

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
};

const state = {
    initialized: false,
    unlocked: false,
    logs: [],
    errors: [],
    dbSummary: [],
    currentTab: 'overview',
};

let deps = {
    State: null,
    storeConfigs: null,
    getAllFromIndexedDB: null,
    showNotification: null,
};

let refs = null;

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

function pushBounded(arr, item) {
    arr.push(item);
    if (arr.length > LOG_BUFFER_LIMIT) {
        arr.splice(0, arr.length - LOG_BUFFER_LIMIT);
    }
}

function addLog(level, args) {
    pushBounded(state.logs, {
        ts: nowIso(),
        level,
        args: Array.from(args).map((arg) => safeSerialize(arg)),
    });
}

function addRuntimeError(source, errorLike, extra = null) {
    const message =
        errorLike?.stack ||
        errorLike?.message ||
        (typeof errorLike === 'string' ? errorLike : safeSerialize(errorLike));
    pushBounded(state.errors, {
        ts: nowIso(),
        source,
        message,
        extra,
    });
}

function installConsoleInterceptors() {
    if (console.__engineeringCockpitInstalled) return;

    const patchMethod = (method, nativeMethod) => {
        console[method] = (...args) => {
            addLog(method, args);
            if (method === 'error') {
                addRuntimeError('console.error', safeSerialize(args, 4000));
                nativeMethod(...args);
                return;
            }
            // Для log/info/warn оставляем тишину в обычной консоли,
            // но полностью дублируем в машинное отделение.
        };
    };

    patchMethod('log', nativeConsole.log);
    patchMethod('info', nativeConsole.info);
    patchMethod('warn', nativeConsole.warn);
    patchMethod('error', nativeConsole.error);

    window.addEventListener('error', (event) => {
        addRuntimeError('window.error', event.error || event.message, {
            file: event.filename,
            line: event.lineno,
            col: event.colno,
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        addRuntimeError('window.unhandledrejection', event.reason);
    });

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

function renderActiveTab() {
    if (!refs) return;

    const overviewData = getSystemOverview();
    refs.overview.textContent = safeSerialize(overviewData, 200000);

    refs.logs.textContent = state.logs.length
        ? state.logs
              .map(
                  (entry) => `[${entry.ts}] [${entry.level.toUpperCase()}] ${entry.args.join(' ')}`,
              )
              .join('\n')
        : 'Логи пока отсутствуют.';

    refs.errors.textContent = state.errors.length
        ? state.errors
              .map((entry) =>
                  [
                      `[${entry.ts}] [${entry.source}]`,
                      entry.message,
                      entry.extra ? `extra: ${safeSerialize(entry.extra, 2000)}` : null,
                  ]
                      .filter(Boolean)
                      .join('\n'),
              )
              .join('\n\n')
        : 'Ошибки runtime не зафиксированы.';

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
}

function activateTab(tabId) {
    state.currentTab = tabId;
    refs.tabButtons.forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.cockpitTab === tabId);
    });
    refs.tabSections.forEach((section) => {
        section.classList.toggle('is-active', section.dataset.cockpitTab === tabId);
    });
    renderActiveTab();
}

async function refreshCockpitData() {
    await refreshDbSummary();
    renderActiveTab();
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
        clearLogsBtn: document.getElementById('engineeringCockpitClearLogsBtn'),
        copySnapshotBtn: document.getElementById('engineeringCockpitCopySnapshotBtn'),
        tabButtons: Array.from(
            document.querySelectorAll('[data-cockpit-tab].engineering-cockpit-tab-btn'),
        ),
        tabSections: Array.from(
            document.querySelectorAll('.engineering-cockpit-tab[data-cockpit-tab]'),
        ),
        overview: document.getElementById('engineeringCockpitOverview'),
        logs: document.getElementById('engineeringCockpitLogs'),
        errors: document.getElementById('engineeringCockpitErrors'),
        db: document.getElementById('engineeringCockpitDb'),
        state: document.getElementById('engineeringCockpitState'),
    };

    if (!refs.modal || !refs.closeBtn || !refs.unlockBtn || !refs.passwordInput) return false;

    refs.closeBtn.addEventListener('click', closeEngineeringCockpit);
    refs.modal.addEventListener('click', (event) => {
        if (event.target === refs.modal) closeEngineeringCockpit();
    });

    refs.unlockBtn.addEventListener('click', () => {
        void tryUnlock();
    });
    refs.passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void tryUnlock();
        }
    });

    refs.refreshBtn?.addEventListener('click', () => {
        void refreshCockpitData();
    });
    refs.clearLogsBtn?.addEventListener('click', () => {
        state.logs = [];
        state.errors = [];
        renderActiveTab();
    });
    refs.copySnapshotBtn?.addEventListener('click', async () => {
        const snapshot = {
            overview: getSystemOverview(),
            state: getStateSnapshot(),
            db: state.dbSummary,
            errors: state.errors.slice(-200),
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

    refs.tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => activateTab(btn.dataset.cockpitTab || 'overview'));
    });

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
    addLog('info', ['Engineering cockpit initialized']);
}
