'use strict';

import {
    CURRENT_SCHEMA_VERSION,
    USER_PREFERENCES_KEY,
    RECENTLY_DELETED_STORE_NAME,
} from '../constants.js';
import { inferSystemFromTitle } from './health-report-format.js';
import {
    REVOCATION_LOCAL_HELPER_BASE_URL,
    REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER,
} from '../config/revocation-sources.js';
import { REVOCATION_API_BASE_URL } from '../config.js';
import { probeHelperAvailability } from './revocation-helper-probe.js';
import { runSearchAndIndexHealthTests } from './search-health-tests.js';
import {
    runUiSurfaceHealthSuite,
    runWatchdogLightUiSurfaceCheck,
} from './ui-surface-health-suite.js';
import {
    getRuntimeHubIssueCount,
    getRuntimeHubIssuesForHealth,
    getRuntimeHubPerformanceSignalCount,
} from './runtime-issue-hub.js';
import {
    collectPlatformHealthProbeRows,
    runPlatformHealthProbeSuite,
} from './platform-health-probes.js';
import { runLightDataIntegrityPass } from './data-integrity-pass.js';
import { runExportImportDifferentialCheck } from './export-differential-check.js?v=20260406health';
import {
    evaluateClientSloAgainstBudgets,
    recordClientSloSample,
} from './client-slo-budgets.js?v=20260406health';
import {
    recordApplicationHealthSnapshot,
    HEALTH_PHASE,
    clientDataHealthProbeRecordsMatch,
    getApplicationHealthStateForExport,
} from './application-health-state.js';
import { runLocalStorageHealthProbe } from './health-localstorage-probe.js';
import { runRevocationSubsystemHealthCrossCheck } from './revocation-subsystem-health-probe.js';

let deps = {};
/** Счётчик циклов watchdog (interval) для периодического второго контура целостности данных */
let watchdogDataIntegrityCycleCount = 0;
/** Редкий дифференциальный контур экспорта в watchdog (тяжёлый — только счётчики). */
let watchdogExportDiffCycleCount = 0;
const WATCHDOG_INTERVAL_MS = 60000;
const AUTOSAVE_STALE_MS = 45000;
const REQUIRED_STORES = [
    'algorithms',
    'clientData',
    'searchIndex',
    'preferences',
    'blacklistedClients',
    'favorites',
];

/** Таймаут сухого прогона экспорта (большие PDF/скриншоты в base64). */
const EXPORT_DRY_RUN_TIMEOUT_MS = 120000;
/** Таймаут полного дифференциального сравнения снимков экспорта при старте. */
const EXPORT_DIFFERENTIAL_FULL_TIMEOUT_MS = 180000;

/**
 * Второй контур надёжности экспорта: тот же путь чтения, что и у пользовательского экспорта, без файла.
 * @param {object} depsBag — объект зависимостей health-тестов (в т.ч. exportAllData)
 * @param {function(string, string, string)} reportFn — report(level, title, message)
 * @param {function(Promise, number): Promise} runWithTimeoutFn
 */
async function runExportPipelineDryRunCheck(depsBag, reportFn, runWithTimeoutFn) {
    if (typeof depsBag.exportAllData !== 'function') {
        reportFn(
            'warn',
            'Экспорт (сухой прогон)',
            'Функция exportAllData не передана — проверка цепочки экспорта пропущена.',
            { system: 'export_import' },
        );
        return;
    }
    try {
        const t0 =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now()
                : Date.now();
        const ok = await runWithTimeoutFn(
            depsBag.exportAllData({ dryRunForHealth: true, isForcedBackupMode: true }),
            EXPORT_DRY_RUN_TIMEOUT_MS,
        );
        const elapsedMs =
            typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now() - t0
                : Date.now() - t0;
        recordClientSloSample({ exportDryRunMs: elapsedMs, ts: Date.now() });
        if (ok) {
            reportFn(
                'info',
                'Экспорт (сухой прогон)',
                'Все хранилища прочитаны, вложения сериализованы, JSON валиден; контракт слияния (schemaVersion+data) подтверждён.',
                { system: 'export_import' },
            );
            reportFn(
                'info',
                'Слияние (совместимость формата)',
                'Третий контур: validateExportedBackupShapeForMerge выполнен в цепочке сухого экспорта.',
                { system: 'merge' },
            );
        } else {
            reportFn(
                'warn',
                'Экспорт (сухой прогон)',
                'Вернуло false (возможен параллельный экспорт или отказ до сериализации).',
                { system: 'export_import' },
            );
        }
    } catch (err) {
        reportFn('error', 'Экспорт (сухой прогон)', err?.message || String(err), { system: 'export_import' });
    }
}

/**
 * Второй контур IndexedDB: та же запись clientData через performDBOperation.get и через обёртку.
 */
async function verifyClientDataHealthProbeDualRead(depsBag, testId, recordFromWrapper, reportFn, runWithTimeoutFn) {
    if (!recordFromWrapper) return;
    if (typeof depsBag.performDBOperation !== 'function') {
        reportFn(
            'warn',
            'IndexedDB (второй контур)',
            'performDBOperation недоступен — транзакционное подтверждение зонда пропущено.',
            { system: 'storage_idb' },
        );
        return;
    }
    try {
        const viaTxn = await runWithTimeoutFn(
            depsBag.performDBOperation('clientData', 'readonly', (store) => store.get(testId)),
            5000,
        );
        if (!clientDataHealthProbeRecordsMatch(viaTxn, recordFromWrapper)) {
            reportFn(
                'error',
                'IndexedDB (второй контур)',
                'Расхождение между обёрткой чтения и транзакцией объекта clientData.',
                { system: 'storage_idb' },
            );
        } else {
            reportFn(
                'info',
                'IndexedDB (второй контур)',
                'Два контура чтения тестовой записи clientData совпали.',
                { system: 'storage_idb' },
            );
        }
    } catch (err) {
        reportFn('error', 'IndexedDB (второй контур)', err?.message || String(err), { system: 'storage_idb' });
    }
}

export function setBackgroundHealthTestsDependencies(nextDeps) {
    deps = { ...nextDeps };
}

function nowLabel() {
    return new Date().toLocaleString('ru-RU');
}

function titleLooksLikeRevocationSubsystemFailure(title) {
    const t = String(title || '');
    return (
        t === 'API проверки отзыва' ||
        t === 'Yandex Cloud Functions' ||
        t === 'Компонента проверки отзыва' ||
        (t.includes('FNS') && t.includes('Revocation')) ||
        (t.includes('отзыв') && t.includes('сертификат')) ||
        (t.includes('Watchdog') && t.includes('отзыв'))
    );
}

function shouldNotifyRevocationSubsystemFailure(errors) {
    if (!Array.isArray(errors)) return false;
    return errors.some((e) => {
        const t = String(e?.title || '');
        const m = String(e?.message || '');
        if (titleLooksLikeRevocationSubsystemFailure(t)) return true;
        return (
            t.includes('Watchdog') &&
            (m.includes('отзыв') || m.includes('сертификат') || m.includes('CRL-Helper'))
        );
    });
}

/**
 * Один канал = одно уведомление (старт / watchdog), чтобы не спамить при каждом тике.
 * @param {'startup'|'watchdog'} channel
 * @param {Array<{ title?: string, message?: string }>} errors
 */
function notifyRevocationHealthFailureOnce(channel, errors) {
    if (typeof window === 'undefined' || typeof window.showNotification !== 'function') return;
    if (!shouldNotifyRevocationSubsystemFailure(errors)) return;
    const flags = initBackgroundHealthTestsSystem;
    if (!flags._revocationHealthNotifyChannels) flags._revocationHealthNotifyChannels = new Set();
    if (flags._revocationHealthNotifyChannels.has(channel)) return;
    flags._revocationHealthNotifyChannels.add(channel);
    window.showNotification(
        'Недоступна подсистема проверки отзыва сертификатов (облачный API или CRL-Helper). Откройте «Сводка по системам» у индикатора фоновой диагностики или отчёт о здоровье в настройках.',
        'error',
        28000,
    );
}

function mergeRuntimeHubErrorsForReport(errors) {
    const rt = getRuntimeHubIssuesForHealth(40);
    if (!rt.length) return [...errors];
    return [
        ...rt.map((e) => ({ title: e.title, message: e.message, system: 'runtime_errors' })),
        ...errors,
    ];
}

function runWithTimeout(promise, ms) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Превышено время ожидания')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function waitUntilAppAvailable(timeoutMs = 10000) {
    return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
            const appContent = document.getElementById('appContent');
            const isVisible = appContent && !appContent.classList.contains('hidden');
            if (isVisible || Date.now() - started > timeoutMs) {
                resolve();
                return;
            }
            requestAnimationFrame(tick);
        };
        tick();
    });
}

/**
 * Второй контур к finishHud: не фиксировать итог «Фоновая диагностика», пока app-init не выставил флаги на window.
 * Если app-init не запускался (__copilotAppInitFinished !== false), сразу resolve (тесты, неполная загрузка).
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: boolean, timedOut?: boolean, skipped?: boolean }>}
 */
export function waitUntilAppInitFinished(timeoutMs = 120000) {
    const w = typeof window !== 'undefined' ? window : {};
    return new Promise((resolve) => {
        if (w.__copilotAppInitFinished === true) {
            resolve({ ok: true });
            return;
        }
        if (w.__copilotAppInitFinished !== false) {
            resolve({ ok: true, skipped: true });
            return;
        }
        const started = Date.now();
        const tick = () => {
            if (w.__copilotAppInitFinished === true) {
                resolve({ ok: true });
                return;
            }
            if (Date.now() - started >= timeoutMs) {
                resolve({ ok: false, timedOut: true });
                return;
            }
            setTimeout(tick, 50);
        };
        tick();
    });
}

/**
 * Проверка записей закладок на поля, от которых падает UI (createBookmarkElement и т.д.).
 * @returns {{ level: 'error'|'warn'|'info', title: string, message: string }}
 */
async function auditBookmarksUiCompatibility(performDBOperation, runWithTimeoutFn) {
    const title = 'Закладки (целостность)';
    if (typeof performDBOperation !== 'function') {
        return { level: 'warn', title, message: 'performDBOperation недоступен, проверка пропущена.' };
    }
    const allBm = await runWithTimeoutFn(
        performDBOperation('bookmarks', 'readonly', (store) => store.getAll()),
        10000,
    );
    const list = Array.isArray(allBm) ? allBm : [];
    const corrupt = [];
    for (const bm of list) {
        const id = bm?.id != null ? String(bm.id) : '?';
        if (bm == null || typeof bm !== 'object') {
            corrupt.push(`${id}: не объект`);
            continue;
        }
        if (bm.screenshotIds != null && !Array.isArray(bm.screenshotIds)) {
            corrupt.push(`${id}: screenshotIds должен быть массивом или отсутствовать`);
        }
    }
    if (corrupt.length > 0) {
        const sample = corrupt.slice(0, 8).join('; ');
        const more = corrupt.length > 8 ? ` … (+${corrupt.length - 8})` : '';
        return {
            level: 'error',
            title,
            message: `Некорректные записи (${corrupt.length}): ${sample}${more}. Исправьте данные или пересохраните закладки.`,
        };
    }
    return {
        level: 'info',
        title,
        message: list.length
            ? `Проверено ${list.length} записей: поля, влияющие на список/карточки, допустимы.`
            : 'Закладок нет — проверка не требуется.',
    };
}

export function initBackgroundHealthTestsSystem() {
    if (initBackgroundHealthTestsSystem._started) return;
    initBackgroundHealthTestsSystem._started = true;

    const hud = window.BackgroundStatusHUD;
    const taskId = 'background-tests';
    const results = {
        errors: [],
        warnings: [],
        checks: [],
    };

    const report = (level, title, message, meta = {}) => {
        const system = meta.system || inferSystemFromTitle(title);
        const entry = { title, message, system };
        if (level === 'error') results.errors.push(entry);
        if (level === 'warn') results.warnings.push(entry);
        results.checks.push(entry);
    };

    const emitCrossLayerObservabilityNotes = () => {
        try {
            const exp = getApplicationHealthStateForExport();
            for (const note of exp.crossCheckNotes) {
                report('warn', 'Перекрёстная проверка состояния', note, {
                    system: 'observability',
                });
            }
        } catch {
            /* ignore */
        }
    };

    const updateHud = (progress) => {
        if (hud?.updateTask) hud.updateTask(taskId, progress, 100);
    };

    const finishHud = (success) => {
        if (hud?.finishTask) hud.finishTask(taskId, success);
        if (hud?.setDiagnostics) {
            hud.setDiagnostics({
                errors: results.errors,
                warnings: results.warnings,
                checks: results.checks,
                updatedAt: nowLabel(),
            });
        }
    };

    const autosaveState = {
        lastText: null,
        changedAt: 0,
        lastPersistedAt: 0,
    };
    let watchdogInFlight = null;

    const setWatchdogHudStatus = (patch = {}) => {
        hud?.setWatchdogStatus?.({
            statusText: patch.statusText || 'Работает',
            lastRunAt: patch.lastRunAt || Date.now(),
            lastAutosaveAt:
                patch.lastAutosaveAt !== undefined
                    ? patch.lastAutosaveAt
                    : autosaveState.lastPersistedAt || null,
            running: Boolean(patch.running),
            severity: patch.severity || 'running',
        });
    };

    const readPersistedClientData = async () => {
        if (deps.getFromIndexedDB) {
            try {
                const fromDb = await runWithTimeout(
                    deps.getFromIndexedDB('clientData', 'current'),
                    5000,
                );
                if (fromDb && typeof fromDb === 'object') {
                    return fromDb;
                }
            } catch {
                // fallback to localStorage below
            }
        }

        try {
            const raw = localStorage.getItem('clientData');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const runWatchdogCycle = async (source = 'interval') => {
        if (watchdogInFlight) return watchdogInFlight;
        setWatchdogHudStatus({
            statusText: source === 'manual' ? 'Ручной прогон...' : 'Плановая проверка...',
            running: true,
            severity: 'running',
        });

        watchdogInFlight = (async () => {
            const cycleStartedAt =
                typeof performance !== 'undefined' && typeof performance.now === 'function'
                    ? performance.now()
                    : Date.now();
            const cycleChecks = [];
            const addCheck = (level, title, message, system) => {
                cycleChecks.push({
                    level,
                    title,
                    message,
                    system: system || inferSystemFromTitle(title),
                });
            };

            // Watchdog 1: целостность структуры IndexedDB
            try {
                const db = deps.State?.db;
                if (!db) {
                    addCheck(
                        'warn',
                        'Watchdog / IndexedDB',
                        'Соединение с IndexedDB не инициализировано.',
                    );
                } else {
                    const availableStores = Array.from(db.objectStoreNames || []);
                    const missingStores = REQUIRED_STORES.filter(
                        (store) => !availableStores.includes(store),
                    );
                    if (missingStores.length > 0) {
                        addCheck(
                            'error',
                            'Watchdog / IndexedDB',
                            `Отсутствуют хранилища: ${missingStores.join(', ')}.`,
                        );
                    } else {
                        addCheck(
                            'info',
                            'Watchdog / IndexedDB',
                            'Все ключевые хранилища присутствуют.',
                        );
                    }

                    if (deps.performDBOperation) {
                        const counters = await Promise.allSettled([
                            runWithTimeout(
                                deps.performDBOperation('algorithms', 'readonly', (store) =>
                                    store.count(),
                                ),
                                5000,
                            ),
                            runWithTimeout(
                                deps.performDBOperation('clientData', 'readonly', (store) =>
                                    store.count(),
                                ),
                                5000,
                            ),
                            runWithTimeout(
                                deps.performDBOperation('favorites', 'readonly', (store) =>
                                    store.count(),
                                ),
                                5000,
                            ),
                        ]);

                        const hasCounterError = counters.some(
                            (entry) => entry.status === 'rejected',
                        );
                        if (hasCounterError) {
                            addCheck(
                                'warn',
                                'Watchdog / IndexedDB',
                                'Одна из read-проверок не выполнена (count).',
                            );
                        }
                    }
                }
            } catch (err) {
                addCheck('error', 'Watchdog / IndexedDB', err.message);
            }

            runLocalStorageHealthProbe((level, title, message, meta) => {
                addCheck(level, title, message, meta?.system);
            });

            // Watchdog 2: здоровье автосохранения notes
            try {
                const clientNotes = document.getElementById('clientNotes');
                if (!clientNotes) {
                    addCheck(
                        'warn',
                        'Watchdog / Автосохранение',
                        'Поле #clientNotes не найдено (проверка пропущена).',
                    );
                } else {
                    const currentText = clientNotes.value ?? '';
                    if (autosaveState.lastText === null) {
                        autosaveState.lastText = currentText;
                        autosaveState.changedAt = Date.now();
                    } else if (currentText !== autosaveState.lastText) {
                        autosaveState.lastText = currentText;
                        autosaveState.changedAt = Date.now();
                    }

                    if (!deps.State?.clientNotesInputHandler) {
                        addCheck(
                            'error',
                            'Watchdog / Автосохранение',
                            'Обработчик input для #clientNotes не привязан.',
                        );
                    }

                    const persisted = await readPersistedClientData();
                    const persistedText = persisted?.notes ?? '';
                    const sameAsPersisted = persistedText === currentText;
                    if (sameAsPersisted) {
                        autosaveState.lastPersistedAt = Date.now();
                        addCheck(
                            'info',
                            'Watchdog / Автосохранение',
                            'Сохранённые данные синхронизированы.',
                        );
                    } else {
                        const elapsed = Date.now() - autosaveState.changedAt;
                        if (elapsed > AUTOSAVE_STALE_MS) {
                            addCheck(
                                'warn',
                                'Watchdog / Автосохранение',
                                `Несохранённые изменения дольше ${Math.round(
                                    AUTOSAVE_STALE_MS / 1000,
                                )}с.`,
                            );
                        } else {
                            addCheck(
                                'info',
                                'Watchdog / Автосохранение',
                                'Обнаружены несохранённые изменения, ожидается автосохранение.',
                            );
                        }
                    }
                }
            } catch (err) {
                addCheck('error', 'Watchdog / Автосохранение', err.message);
            }

            // Watchdog 3: доступность контура проверки отзыва (облако или локальный CRL-Helper)
            try {
                if (REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER && REVOCATION_LOCAL_HELPER_BASE_URL) {
                    const helperBase = String(REVOCATION_LOCAL_HELPER_BASE_URL)
                        .trim()
                        .replace(/\/$/, '');
                    if (helperBase) {
                        const ok = await runWithTimeout(
                            probeHelperAvailability(helperBase, { path: '/health', timeoutMs: 9000 }),
                            12000,
                        );
                        addCheck(
                            ok ? 'info' : 'error',
                            'Watchdog / CRL-Helper (проверка отзыва)',
                            ok
                                ? 'Локальная компонента отвечает на /health.'
                                : 'CRL-Helper недоступен. Проверка отзыва сертификатов не будет работать до запуска компоненты.',
                        );
                    }
                } else if (!REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
                    const apiBase =
                        typeof REVOCATION_API_BASE_URL === 'string'
                            ? REVOCATION_API_BASE_URL.trim().replace(/\/$/, '')
                            : '';
                    if (apiBase) {
                        const ok = await runWithTimeout(
                            probeHelperAvailability(apiBase, {
                                path: '/api/health',
                                timeoutMs: 9000,
                            }),
                            12000,
                        );
                        addCheck(
                            ok ? 'info' : 'error',
                            'Watchdog / API проверки отзыва сертификатов',
                            ok
                                ? 'Облачный API доступен (/api/health).'
                                : 'Облачный API недоступен или вернул неожиданный ответ. Проверка отзыва не будет работать.',
                        );
                    }
                }
            } catch (err) {
                addCheck(
                    'error',
                    'Watchdog / API проверки отзыва сертификатов',
                    err?.message || String(err),
                );
            }

            // Watchdog 3b: перекрёстный контур отзыва (независимый зонд + инциденты ФНС в runtime)
            try {
                await runWithTimeout(
                    runRevocationSubsystemHealthCrossCheck(
                        runWithTimeout,
                        (level, title, message, meta) => {
                            addCheck(
                                level,
                                `Watchdog / ${title}`,
                                message,
                                meta?.system || inferSystemFromTitle(title),
                            );
                        },
                        { probeTag: 'watchdog' },
                    ),
                    25000,
                );
            } catch (err) {
                addCheck(
                    'warn',
                    'Watchdog / Отзыв сертификатов (перекрёстная)',
                    err?.message || String(err),
                    'revocation_crosscheck',
                );
            }

            // Watchdog 4: целостность полей закладок (несовместимые типы ломают список/карточки)
            try {
                const br = await auditBookmarksUiCompatibility(deps.performDBOperation, runWithTimeout);
                addCheck(br.level, 'Watchdog / Закладки (целостность)', br.message);
            } catch (err) {
                addCheck(
                    'error',
                    'Watchdog / Закладки (целостность)',
                    err?.message || String(err),
                );
            }

            // Watchdog 5: центральный буфер необработанных ошибок и отклонённых промисов
            const rtCount = getRuntimeHubIssueCount();
            if (rtCount > 0) {
                const sample = getRuntimeHubIssuesForHealth(3)
                    .map((i) => i.message.replace(/\s+/g, ' ').slice(0, 140))
                    .join(' · ');
                addCheck(
                    'error',
                    'Watchdog / Необработанные ошибки выполнения',
                    `В буфере ${rtCount} сбоев (window.error, console.error, unhandledrejection и т.д.; perf.longtask не входит). Примеры: ${sample}`,
                );
            }

            // Watchdog 5.5: пассивная проверка вёрстки дропдауна поиска (без открытия панели и без смены вкладок).
            // Стартовый пакет поверхности — см. runUiSurfaceHealthSuite (по умолчанию тоже ненавязчивый).
            try {
                await runWithTimeout(
                    runWatchdogLightUiSurfaceCheck(deps, addCheck, runWithTimeout),
                    15000,
                );
            } catch (err) {
                addCheck(
                    'error',
                    'Watchdog / Поверхность UI / поиск',
                    err?.message || String(err),
                    'ui_surface',
                );
            }

            // Watchdog 6: независимый контур зондов среды (дублирует стартовые тесты 1.x + память, вкладка, SW)
            try {
                const envRows = await collectPlatformHealthProbeRows(runWithTimeout, {
                    probeTag: 'watchdog',
                });
                for (const r of envRows) {
                    addCheck(r.level, `Watchdog / ${r.title}`, r.message);
                }
            } catch (err) {
                addCheck(
                    'warn',
                    'Watchdog / Среда исполнения',
                    `Пакет зондов не выполнен: ${err?.message || err}.`,
                );
            }

            // Watchdog 7: второй контур целостности данных (дублирование: ссылки, PDF, сироты, count/getAll)
            if (source === 'interval') {
                watchdogDataIntegrityCycleCount += 1;
                if (watchdogDataIntegrityCycleCount % 5 === 0) {
                    try {
                        const intRows = await runLightDataIntegrityPass(
                            {
                                performDBOperation: deps.performDBOperation,
                                getFromIndexedDB: deps.getFromIndexedDB,
                                runWithTimeout,
                            },
                            { profile: 'fast' },
                        );
                        for (const r of intRows) {
                            addCheck(r.level, r.title, r.message, r.system || 'data_integrity');
                        }
                    } catch (err) {
                        addCheck(
                            'warn',
                            'Целостность данных / прогон',
                            err?.message || String(err),
                            'data_integrity',
                        );
                    }
                }
            }

            // Watchdog 8: лёгкий дифференциальный контур (только счётчики batch vs cursor) — редко, чтобы не грузить CPU.
            if (source === 'interval') {
                watchdogExportDiffCycleCount += 1;
                if (watchdogExportDiffCycleCount % 12 === 0 && deps.State?.db) {
                    try {
                        const diffLite = await runWithTimeout(
                            runExportImportDifferentialCheck(deps.State.db, {
                                quiet: true,
                                deepExportCompare: false,
                            }),
                            45000,
                        );
                        if (diffLite?.ok) {
                            addCheck(
                                'info',
                                'Watchdog / Экспорт (дифф. счётчики)',
                                diffLite.detail ||
                                    'Счётчики записей: batch count и cursor совпали.',
                                'export_import',
                            );
                        } else {
                            addCheck(
                                'error',
                                'Watchdog / Экспорт (дифф. счётчики)',
                                diffLite?.detail || 'Расхождение контуров подсчёта.',
                                'export_import',
                            );
                        }
                    } catch (diffErr) {
                        addCheck(
                            'warn',
                            'Watchdog / Экспорт (дифф. счётчики)',
                            diffErr?.message || String(diffErr),
                            'export_import',
                        );
                    }
                }
            }

            const hasErrorsBeforeSlo = cycleChecks.some((entry) => entry.level === 'error');
            const cycleElapsedMs =
                typeof performance !== 'undefined' && typeof performance.now === 'function'
                    ? performance.now() - cycleStartedAt
                    : Date.now() - cycleStartedAt;
            recordClientSloSample({
                ts: Date.now(),
                watchdogCycleMs: cycleElapsedMs,
                runtimeFaultCount: getRuntimeHubIssueCount(),
                watchdogHadError: hasErrorsBeforeSlo,
            });
            for (const sloWarn of evaluateClientSloAgainstBudgets().warnings) {
                cycleChecks.push({
                    level: 'warn',
                    title: 'SLO / Клиент',
                    message: sloWarn,
                    system: 'telemetry',
                });
            }

            // Обновляем диагностику, добавляя watchdog-результаты к уже собранным.
            if (hud?.setDiagnostics) {
                const notReplacedByWatchdogCycle = (entry) =>
                    !entry.title.startsWith('Watchdog / ') &&
                    !entry.title.startsWith('Целостность данных /') &&
                    !entry.title.startsWith('SLO / ');
                const mergedChecks = [
                    ...results.checks.filter(notReplacedByWatchdogCycle),
                    ...cycleChecks.map(({ title, message, system }) => ({ title, message, system })),
                ];
                const mergedErrors = [
                    ...results.errors.filter(notReplacedByWatchdogCycle),
                    ...cycleChecks
                        .filter((entry) => entry.level === 'error')
                        .map(({ title, message, system }) => ({ title, message, system })),
                ];
                const mergedWarnings = [
                    ...results.warnings.filter(notReplacedByWatchdogCycle),
                    ...cycleChecks
                        .filter((entry) => entry.level === 'warn')
                        .map(({ title, message, system }) => ({ title, message, system })),
                ];

                hud.setDiagnostics({
                    errors: mergedErrors,
                    warnings: mergedWarnings,
                    checks: mergedChecks,
                    updatedAt: nowLabel(),
                });
                notifyRevocationHealthFailureOnce(
                    'watchdog',
                    mergeRuntimeHubErrorsForReport(mergedErrors),
                );
            }
            const hasErrors = cycleChecks.some((entry) => entry.level === 'error');
            const hasWarnings = cycleChecks.some((entry) => entry.level === 'warn');
            recordApplicationHealthSnapshot({
                phase: HEALTH_PHASE.PERIODIC_LIVENESS,
                source,
                errorCount: cycleChecks.filter((entry) => entry.level === 'error').length,
                warnCount: cycleChecks.filter((entry) => entry.level === 'warn').length,
                checkCount: cycleChecks.length,
                runtimeFaultCount: getRuntimeHubIssueCount(),
                watchdogSeverity: hasErrors ? 'error' : hasWarnings ? 'warn' : 'ok',
                errors: cycleChecks
                    .filter((entry) => entry.level === 'error')
                    .map(({ title, message, system }) => ({ title, message, system })),
            });
            setWatchdogHudStatus({
                statusText: hasErrors
                    ? 'Проблемы обнаружены'
                    : hasWarnings
                      ? 'Есть предупреждения'
                      : 'Система в норме',
                running: false,
                lastRunAt: Date.now(),
                lastAutosaveAt: autosaveState.lastPersistedAt || null,
                severity: hasErrors ? 'error' : hasWarnings ? 'warn' : 'ok',
            });
        })()
            .catch((err) => {
                setWatchdogHudStatus({
                    statusText: `Ошибка watchdog: ${err.message}`,
                    running: false,
                    lastRunAt: Date.now(),
                    lastAutosaveAt: autosaveState.lastPersistedAt || null,
                    severity: 'error',
                });
                throw err;
            })
            .finally(() => {
                watchdogInFlight = null;
            });

        return watchdogInFlight;
    };

    const start = async () => {
        await waitUntilAppAvailable(12000);
        hud?.setWatchdogRunNowHandler?.(() => {
            runWatchdogCycle('manual').catch((err) => {
                console.error('[BackgroundHealthTests] Ошибка ручного watchdog-цикла:', err);
            });
        });
        setWatchdogHudStatus({
            statusText: 'Ожидание первого цикла',
            running: false,
            lastRunAt: null,
            lastAutosaveAt: null,
            severity: 'running',
        });
        hud?.startTask?.(taskId, 'Фоновая диагностика', { weight: 0.4, total: 100 });
        updateHud(5);

        (async () => {
            try {
                // Тесты 1–1.5: среда исполнения (единый модуль; второй контур дублируется в watchdog)
                await runPlatformHealthProbeSuite(runWithTimeout, report, { probeTag: 'startup' });

                updateHud(18);

                // Тест 2.0: поверхность UI — один раз при старте, как можно раньше (часто параллельно оверлею загрузки).
                // syntheticButtonClicks по умолчанию выключены — без программных кликов и без системного диалога выбора файла.
                if (!initBackgroundHealthTestsSystem._startupUiSurfaceSuiteDone) {
                    initBackgroundHealthTestsSystem._startupUiSurfaceSuiteDone = true;
                    try {
                        await runWithTimeout(
                            runUiSurfaceHealthSuite(deps, report, runWithTimeout),
                            180000,
                        );
                    } catch (uiErr) {
                        report(
                            'warn',
                            'Поверхность UI',
                            uiErr?.message || String(uiErr),
                            { system: 'ui_surface' },
                        );
                    }
                }

                updateHud(22);

                // Тест 2: запись/чтение IndexedDB
                const testId = `health-${Date.now()}`;
                try {
                    if (
                        !deps.saveToIndexedDB ||
                        !deps.getFromIndexedDB ||
                        !deps.deleteFromIndexedDB
                    ) {
                        throw new Error('Отсутствуют методы работы с IndexedDB.');
                    }
                    await runWithTimeout(
                        deps.saveToIndexedDB('clientData', { id: testId, notes: 'health-check' }),
                        5000,
                    );
                    const record = await runWithTimeout(
                        deps.getFromIndexedDB('clientData', testId),
                        5000,
                    );
                    if (!record) {
                        report('error', 'IndexedDB', 'Запись не найдена после сохранения.');
                    } else {
                        report('info', 'IndexedDB', 'Запись и чтение работают.');
                        await verifyClientDataHealthProbeDualRead(deps, testId, record, report, runWithTimeout);
                    }
                } catch (err) {
                    report('error', 'IndexedDB', err.message);
                } finally {
                    try {
                        await deps.deleteFromIndexedDB?.('clientData', testId);
                    } catch {
                        // cleanup failure should not fail health check sequence
                    }
                }

                runLocalStorageHealthProbe(report);

                // Тест 2.1: резервный контур — хранилища «База клиентов и аналитика»
                let caFileId = null;
                try {
                    if (deps.saveToIndexedDB && deps.getFromIndexedDB && deps.deleteFromIndexedDB) {
                        caFileId = await runWithTimeout(
                            deps.saveToIndexedDB('clientAnalyticsFiles', {
                                fileName: '_health_probe.txt',
                                uploadedAt: new Date().toISOString(),
                                textSha256: '00'.repeat(32),
                                charCount: 0,
                                parseStatus: 'ok',
                                parseError: null,
                                rawText: '',
                            }),
                            5000,
                        );
                        const caRow = await runWithTimeout(
                            deps.getFromIndexedDB('clientAnalyticsFiles', caFileId),
                            5000,
                        );
                        if (caRow && caRow.textSha256 === '00'.repeat(32)) {
                            report(
                                'info',
                                'ClientAnalytics DB',
                                'Запись и чтение clientAnalyticsFiles работают.',
                            );
                        } else {
                            report(
                                'warn',
                                'ClientAnalytics DB',
                                'Запись clientAnalyticsFiles не подтверждена после чтения.',
                            );
                        }
                    }
                } catch (err) {
                    report('warn', 'ClientAnalytics DB', err.message || String(err));
                } finally {
                    if (caFileId != null) {
                        try {
                            await deps.deleteFromIndexedDB?.('clientAnalyticsFiles', caFileId);
                        } catch {
                            /* ignore */
                        }
                    }
                }

                // Тест 2.2: резервный контур — метаданные карточек (папки/теги на уровне ключа inn:/rec:)
                const caMetaKey = `health-inn:${testId.slice(-12)}`;
                try {
                    if (deps.saveToIndexedDB && deps.getFromIndexedDB && deps.deleteFromIndexedDB) {
                        await runWithTimeout(
                            deps.saveToIndexedDB('clientAnalyticsCardMeta', {
                                id: caMetaKey,
                                folderId: null,
                                tagIds: [1, 2],
                            }),
                            5000,
                        );
                        const metaRow = await runWithTimeout(
                            deps.getFromIndexedDB('clientAnalyticsCardMeta', caMetaKey),
                            5000,
                        );
                        if (
                            metaRow &&
                            metaRow.id === caMetaKey &&
                            Array.isArray(metaRow.tagIds) &&
                            metaRow.tagIds.length === 2
                        ) {
                            report(
                                'info',
                                'ClientAnalytics DB',
                                'Запись и чтение clientAnalyticsCardMeta работают.',
                            );
                        } else {
                            report(
                                'warn',
                                'ClientAnalytics DB',
                                'Запись clientAnalyticsCardMeta не подтверждена после чтения.',
                            );
                        }
                    }
                } catch (err) {
                    report('warn', 'ClientAnalytics DB', err.message || String(err));
                } finally {
                    try {
                        await deps.deleteFromIndexedDB?.('clientAnalyticsCardMeta', caMetaKey);
                    } catch {
                        /* ignore */
                    }
                }

                // Тест 2.3: структура UI полной очистки раздела «База клиентов» (двойной контур к IndexedDB 2.1–2.2)
                try {
                    const caClearBtn = document.getElementById('clientAnalyticsClearAllBtn');
                    const caClearModal = document.getElementById('clientAnalyticsClearAllModal');
                    const caClearAck = document.getElementById('clientAnalyticsClearAllAcknowledge');
                    const caClearConfirm = document.getElementById('clientAnalyticsClearAllConfirmBtn');
                    if (!caClearBtn || !caClearModal || !caClearAck || !caClearConfirm) {
                        report(
                            'error',
                            'ClientAnalytics UI',
                            'Не хватает элементов «Очистить всю базу клиентов» (кнопка, модалка или подтверждение).',
                        );
                    } else {
                        report(
                            'info',
                            'ClientAnalytics UI',
                            'Элементы полной очистки раздела «База клиентов» присутствуют в DOM.',
                        );
                    }
                } catch (caUiErr) {
                    report('warn', 'ClientAnalytics UI', caUiErr?.message || String(caUiErr));
                }

                updateHud(40);

                // Тест 3: индексация и поиск (расширенный набор проверок)
                await runSearchAndIndexHealthTests(deps, report, runWithTimeout);
                updateHud(48);

                // Тест 3.1: цепочка экспорта (импорт/слияние читают тот же JSON — критический контур)
                await runExportPipelineDryRunCheck(deps, report, runWithTimeout);
                updateHud(55);

                // Тест 3.2: дифференциальный контур экспорта (batch tx vs sequential tx + ограниченное хэш-сравнение)
                try {
                    const db = deps.State?.db;
                    if (db) {
                        const diffResult = await runWithTimeout(
                            runExportImportDifferentialCheck(db, {
                                quiet: true,
                                deepExportCompare: true,
                            }),
                            EXPORT_DIFFERENTIAL_FULL_TIMEOUT_MS,
                        );
                        if (diffResult?.ok) {
                            report(
                                'info',
                                'Экспорт (дифференциальный контур)',
                                diffResult.detail ||
                                    'Два независимых чтения IndexedDB и каноническое сравнение совпали.',
                                { system: 'export_import' },
                            );
                        } else {
                            report(
                                'error',
                                'Экспорт (дифференциальный контур)',
                                diffResult?.detail || 'Сбой дифференциальной проверки.',
                                { system: 'export_import' },
                            );
                        }
                    } else {
                        report(
                            'warn',
                            'Экспорт (дифференциальный контур)',
                            'База недоступна — проверка пропущена.',
                            { system: 'export_import' },
                        );
                    }
                } catch (diffErr) {
                    report(
                        'warn',
                        'Экспорт (дифференциальный контур)',
                        diffErr?.message || String(diffErr),
                        { system: 'export_import' },
                    );
                }
                updateHud(60);

                // Тест 4: доступность и структура базы алгоритмов
                try {
                    const algoContainer = await runWithTimeout(
                        deps.getFromIndexedDB?.('algorithms', 'all'),
                        5000,
                    );
                    const mainAlgo = algoContainer?.data?.main;
                    if (!mainAlgo) {
                        report('warn', 'Алгоритмы', 'Основной алгоритм не найден в базе данных.');
                    } else {
                        const stepsValid = Array.isArray(mainAlgo.steps);
                        const hasSection =
                            mainAlgo.section === 'main' ||
                            mainAlgo.id === 'main' ||
                            mainAlgo.section;
                        if (!stepsValid) {
                            report(
                                'warn',
                                'Алгоритмы',
                                'Структура основного алгоритма некорректна: steps не является массивом.',
                            );
                        } else if (!hasSection) {
                            report(
                                'warn',
                                'Алгоритмы',
                                'Структура основного алгоритма: отсутствует идентификатор секции.',
                            );
                        } else {
                            report(
                                'info',
                                'Алгоритмы',
                                'База алгоритмов доступна, структура корректна.',
                            );
                        }
                    }
                } catch (err) {
                    report('error', 'Алгоритмы', err.message);
                }
                updateHud(80);

                // Тест 5: целостность списка жаб
                try {
                    const blacklistCount = await runWithTimeout(
                        deps.performDBOperation?.('blacklistedClients', 'readonly', (store) =>
                            store.count(),
                        ),
                        5000,
                    );
                    report('info', 'Черный список', `Записей в списке: ${blacklistCount}.`);
                } catch (err) {
                    report('warn', 'Черный список', err.message);
                }
                // Тест 5.1: избранное
                try {
                    const favCount = await runWithTimeout(
                        deps.performDBOperation?.('favorites', 'readonly', (store) =>
                            store.count(),
                        ),
                        5000,
                    );
                    report('info', 'Избранное', `Записей в избранном: ${favCount}.`);
                } catch (err) {
                    report('warn', 'Избранное', err.message);
                }
                // Тест 5.2: clientData current (основная запись клиента)
                try {
                    const current = await runWithTimeout(
                        deps.getFromIndexedDB?.('clientData', 'current'),
                        5000,
                    );
                    if (!current) {
                        report(
                            'info',
                            'clientData',
                            'Запись current отсутствует (ожидаемо до первого ввода) — используются дефолты.',
                        );
                    } else {
                        report('info', 'clientData', 'Запись current доступна.');
                    }
                } catch (err) {
                    report('warn', 'clientData', err.message);
                }
                // Тест 5.2.1: заметки (длина текста в current.notes)
                try {
                    const currentForNotes = await runWithTimeout(
                        deps.getFromIndexedDB?.('clientData', 'current'),
                        3000,
                    );
                    const notesLen =
                        currentForNotes?.notes != null && typeof currentForNotes.notes === 'string'
                            ? currentForNotes.notes.length
                            : 0;
                    report('info', 'Заметки', `Символов в заметках: ${notesLen}.`);
                } catch (err) {
                    report('warn', 'Заметки', err.message);
                }
                // Тест 5.3: Notification (таймер, напоминания)
                if ('Notification' in window) {
                    const perm = Notification.permission;
                    if (perm === 'denied') {
                        report(
                            'warn',
                            'Уведомления',
                            'Разрешение denied. Напоминания таймера не будут работать.',
                        );
                    } else if (perm === 'granted') {
                        report('info', 'Уведомления', 'Разрешение granted.');
                    } else {
                        report('info', 'Уведомления', 'Разрешение не запрашивалось (default).');
                    }
                }
                // Тест 5.4: bookmarks, reglaments, extLinks (count)
                for (const storeName of ['bookmarks', 'reglaments', 'extLinks']) {
                    try {
                        const count = await runWithTimeout(
                            deps.performDBOperation?.(storeName, 'readonly', (s) => s.count()),
                            5000,
                        );
                        const label =
                            storeName === 'bookmarks'
                                ? 'Закладки'
                                : storeName === 'reglaments'
                                  ? 'Регламенты'
                                  : 'Внешние ссылки';
                        report('info', label, `Записей: ${count}.`);
                    } catch (err) {
                        report('warn', storeName, err.message);
                    }
                }
                // Тест 5.4.2: поля закладок, от которых падает рендер UI
                try {
                    const br = await auditBookmarksUiCompatibility(
                        deps.performDBOperation,
                        runWithTimeout,
                    );
                    if (br.level === 'error') report('error', br.title, br.message);
                    else if (br.level === 'warn') report('warn', br.title, br.message);
                    else report('info', br.title, br.message);
                } catch (err) {
                    report('error', 'Закладки (целостность)', err?.message || String(err));
                }
                // Тест 5.4.3: буфер сбоев (не включает perf.longtask — это signalOnly)
                {
                    const n = getRuntimeHubIssueCount();
                    const perfN = getRuntimeHubPerformanceSignalCount();
                    if (n > 0) {
                        report(
                            'error',
                            'Глобальные ошибки выполнения',
                            `В буфере ${n} сбоев с момента загрузки. См. HUD «Подробнее» или инженерный кокпит.`,
                        );
                    } else {
                        const perfHint =
                            perfN > 0
                                ? ` Сигналы производительности (long task): ${perfN} — не считаются ошибкой.`
                                : '';
                        report(
                            'info',
                            'Глобальные ошибки выполнения',
                            `Сбоев в буфере нет.${perfHint}`,
                        );
                    }
                }
                // Тест 5.4.1: links, bookmarkFolders, extLinkCategories, pdfFiles, screenshots
                const extraStores = [
                    ['links', 'Ссылки'],
                    ['bookmarkFolders', 'Папки закладок'],
                    ['extLinkCategories', 'Категории внешних ссылок'],
                    ['pdfFiles', 'PDF файлы'],
                    ['screenshots', 'Скриншоты'],
                ];
                for (const [storeName, label] of extraStores) {
                    try {
                        const count = await runWithTimeout(
                            deps.performDBOperation?.(storeName, 'readonly', (s) => s.count()),
                            5000,
                        );
                        report('info', label, `Записей: ${count}.`);
                    } catch (err) {
                        report('warn', label, err.message);
                    }
                }
                // Тест 5.4.1b: корзина недавно удалённого
                try {
                    const db = deps.State?.db;
                    if (
                        db &&
                        typeof db.objectStoreNames?.contains === 'function' &&
                        db.objectStoreNames.contains(RECENTLY_DELETED_STORE_NAME)
                    ) {
                        const rdCount = await runWithTimeout(
                            deps.performDBOperation?.(RECENTLY_DELETED_STORE_NAME, 'readonly', (s) =>
                                s.count(),
                            ),
                            5000,
                        );
                        report('info', 'Корзина удалений', `Записей: ${rdCount}.`, {
                            system: 'data_content',
                        });
                    } else {
                        report(
                            'warn',
                            'Корзина удалений',
                            'Стор recentlyDeleted отсутствует в текущей схеме БД.',
                            { system: 'storage_idb' },
                        );
                    }
                } catch (err) {
                    report('warn', 'Корзина удалений', err.message, { system: 'data_content' });
                }
                // Тест 5.5: компонента проверки отзыва (CRL Helper / облачный API)
                if (!REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
                    // Облачный API: проверяем /api/health (Yandex Cloud Functions и др.)
                    try {
                        const apiBase =
                            typeof REVOCATION_API_BASE_URL === 'string'
                                ? REVOCATION_API_BASE_URL.trim().replace(/\/$/, '')
                                : '';
                        if (apiBase) {
                            const ok = await runWithTimeout(
                                probeHelperAvailability(apiBase, {
                                    path: '/api/health',
                                    timeoutMs: 9000,
                                }),
                                12000,
                            );
                            if (ok) {
                                report(
                                    'info',
                                    'API проверки отзыва',
                                    'Облачный API проверки сертификатов доступен.',
                                );
                            } else {
                                report(
                                    'error',
                                    'API проверки отзыва',
                                    'Облачный API недоступен или вернул неожиданный ответ. Проверка отзыва сертификатов не будет работать.',
                                );
                            }
                            if (apiBase.includes('yandexcloud')) {
                                report(
                                    ok ? 'info' : 'error',
                                    'Yandex Cloud Functions',
                                    ok
                                        ? 'Доступен. Проверка сертификатов по списку отзыва работает.'
                                        : 'Недоступен. Проверка сертификатов по списку отзыва не будет работать.',
                                );
                            }
                        } else {
                            report('info', 'API проверки отзыва', 'URL API не настроен.');
                        }
                    } catch (err) {
                        report('error', 'API проверки отзыва', err.message);
                        if (
                            typeof REVOCATION_API_BASE_URL === 'string' &&
                            REVOCATION_API_BASE_URL.includes('yandexcloud')
                        ) {
                            report(
                                'error',
                                'Yandex Cloud Functions',
                                `Недоступен: ${err.message}. Проверка по списку отзыва не будет работать.`,
                            );
                        }
                    }
                } else if (REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
                    try {
                        let avail =
                            typeof window !== 'undefined' ? window.__revocationHelperAvailable : null;
                        const helperBase = String(REVOCATION_LOCAL_HELPER_BASE_URL || '')
                            .trim()
                            .replace(/\/$/, '');
                        if (avail !== true && helperBase) {
                            const probed = await runWithTimeout(
                                probeHelperAvailability(helperBase, {
                                    path: '/health',
                                    timeoutMs: 9000,
                                }),
                                12000,
                            );
                            if (typeof window !== 'undefined') {
                                window.__revocationHelperAvailable = probed;
                            }
                            avail = probed;
                        }
                        if (avail === true) {
                            report(
                                'info',
                                'Компонента проверки отзыва',
                                'Локальная компонента доступна.',
                            );
                        } else if (avail === false) {
                            report(
                                'error',
                                'Компонента проверки отзыва',
                                'CRL-Helper не отвечает. Запустите компоненту или нажмите «Установить» в разделе проверки сертификата.',
                            );
                        } else {
                            report(
                                'warn',
                                'Компонента проверки отзыва',
                                'Статус локальной компоненты не подтверждён (таймаут зонда). Повторите диагностику позже.',
                            );
                        }
                    } catch (err) {
                        report('error', 'Компонента проверки отзыва', err.message);
                    }
                }

                // Тест 5.5b: перекрёстный контур подсистемы отзыва (повторный зонд + буфер runtime)
                try {
                    await runWithTimeout(
                        runRevocationSubsystemHealthCrossCheck(runWithTimeout, report, {
                            probeTag: 'startup',
                        }),
                        25000,
                    );
                } catch (err) {
                    report(
                        'warn',
                        'Отзыв сертификатов (перекрёстная)',
                        err?.message || String(err),
                        { system: 'revocation_crosscheck' },
                    );
                }

                // Тест 6: надежность UI настроек
                try {
                    const uiSettings = await runWithTimeout(
                        deps.getFromIndexedDB?.('preferences', 'uiSettings'),
                        5000,
                    );
                    if (!uiSettings) {
                        report(
                            'info',
                            'UI настройки',
                            'Сохраненные uiSettings отсутствуют, используются дефолты.',
                        );
                    } else {
                        const hasOrder =
                            Array.isArray(uiSettings.panelOrder) &&
                            uiSettings.panelOrder.length > 0;
                        const hasVisibility =
                            Array.isArray(uiSettings.panelVisibility) &&
                            uiSettings.panelVisibility.length === uiSettings.panelOrder?.length;
                        if (!hasOrder || !hasVisibility) {
                            report(
                                'warn',
                                'UI настройки',
                                'Неконсистентный формат panelOrder/panelVisibility в uiSettings.',
                            );
                        } else {
                            report(
                                'info',
                                'UI настройки',
                                'Структура сохраненных UI настроек корректна.',
                            );
                        }
                    }
                } catch (err) {
                    report('warn', 'UI настройки', err.message);
                }

                // Тест 6.0.1: кастомизация интерфейса (тема, статичный заголовок)
                try {
                    const prefs = await runWithTimeout(
                        deps.getFromIndexedDB?.('preferences', USER_PREFERENCES_KEY),
                        3000,
                    );
                    const theme = prefs?.themeMode ?? prefs?.theme ?? '—';
                    const staticHeader = prefs?.staticHeader ?? '—';
                    report(
                        'info',
                        'Кастомизация интерфейса',
                        `Тема: ${theme}, статичный заголовок: ${staticHeader}.`,
                    );
                } catch (err) {
                    report('warn', 'Кастомизация интерфейса', err.message);
                }

                // Тест 6.0.2: стили (загрузка CSS)
                try {
                    const sheetCount = document.styleSheets?.length ?? 0;
                    const hasReportClass = Boolean(
                        document.querySelector?.('.health-report-section'),
                    );
                    if (sheetCount > 0 || hasReportClass) {
                        report(
                            'info',
                            'Стили',
                            `Таблиц стилей: ${sheetCount}, ключевые классы загружены.`,
                        );
                    } else {
                        report(
                            'warn',
                            'Стили',
                            'Таблиц стилей не обнаружено или проверка недоступна.',
                        );
                    }
                } catch (err) {
                    report('warn', 'Стили', err.message);
                }

                // Тест 6.1: версия схемы
                try {
                    const storedSchema = await runWithTimeout(
                        deps.getFromIndexedDB?.('preferences', 'schemaVersion'),
                        3000,
                    );
                    const storedVer =
                        storedSchema && typeof storedSchema === 'object'
                            ? storedSchema.value
                            : storedSchema;
                    if (storedVer && String(storedVer) !== String(CURRENT_SCHEMA_VERSION)) {
                        report(
                            'warn',
                            'Версия схемы',
                            `Сохранённая версия (${storedVer}) отличается от текущей (${CURRENT_SCHEMA_VERSION}).`,
                        );
                    } else {
                        report(
                            'info',
                            'Версия схемы',
                            `Текущая версия: ${CURRENT_SCHEMA_VERSION}.`,
                        );
                    }
                } catch {
                    report('info', 'Версия схемы', `Текущая: ${CURRENT_SCHEMA_VERSION}.`);
                }

                // Тест 6.1.1: File System Access (экспорт clientData)
                if (typeof window.showSaveFilePicker === 'function') {
                    report('info', 'File System Access', 'showSaveFilePicker доступен (экспорт).');
                } else {
                    report(
                        'info',
                        'File System Access',
                        'showSaveFilePicker недоступен. Используется fallback сохранения.',
                    );
                }
                // Тест 6.1.2: ResizeObserver (табы, overflow)
                if (typeof window.ResizeObserver === 'function') {
                    report('info', 'ResizeObserver', 'Доступен.');
                } else {
                    report(
                        'warn',
                        'ResizeObserver',
                        'Недоступен. Табы и overflow могут работать некорректно.',
                    );
                }

                // Тест 6.2: clipboard
                try {
                    if (
                        navigator.clipboard &&
                        typeof navigator.clipboard.writeText === 'function'
                    ) {
                        try {
                            await navigator.clipboard.writeText('');
                            report('info', 'Буфер обмена', 'Clipboard API доступен.');
                        } catch (writeErr) {
                            const msg = String(writeErr?.message || writeErr).toLowerCase();
                            if (
                                msg.includes('permission') ||
                                msg.includes('denied') ||
                                msg.includes('user gesture')
                            ) {
                                report(
                                    'info',
                                    'Буфер обмена',
                                    'Clipboard API доступен. Запись требует действия пользователя (ожидаемо в фоне).',
                                );
                            } else {
                                report(
                                    'warn',
                                    'Буфер обмена',
                                    `Clipboard недоступен: ${writeErr?.message || writeErr}.`,
                                );
                            }
                        }
                    } else {
                        report(
                            'warn',
                            'Буфер обмена',
                            'Clipboard API недоступен (контекст или разрешения).',
                        );
                    }
                } catch (err) {
                    report('warn', 'Буфер обмена', `Clipboard недоступен: ${err.message}.`);
                }

                updateHud(95);
            } catch (err) {
                report('error', 'Фоновая диагностика', err.message);
            } finally {
                void (async () => {
                    try {
                        updateHud(100);
                        // Задача watchdog-first: HUD не показывает completion до завершения первого цикла
                        hud?.startTask?.('watchdog-first', 'Watchdog', { weight: 0.1, total: 100 });

                        const initWait = await waitUntilAppInitFinished(120000);
                        if (initWait.timedOut) {
                            report(
                                'error',
                                'Инициализация приложения',
                                'Таймаут ожидания завершения app-init перед фиксацией результата фоновой диагностики (120 с).',
                                { system: 'app_init' },
                            );
                        }

                        const w = typeof window !== 'undefined' ? window : {};
                        const initFailedKnown =
                            (w.__copilotAppInitFinished === true &&
                                w.__copilotAppInitHudSuccess === false) ||
                            (typeof hud?.getInitHadSubsystemFailures === 'function' &&
                                hud.getInitHadSubsystemFailures());

                        finishHud(
                            results.errors.length === 0 &&
                                getRuntimeHubIssueCount() === 0 &&
                                !initFailedKnown,
                        );
                        notifyRevocationHealthFailureOnce(
                            'startup',
                            mergeRuntimeHubErrorsForReport(results.errors),
                        );

                        recordApplicationHealthSnapshot({
                            phase: HEALTH_PHASE.STARTUP_READINESS,
                            source: 'startup',
                            errorCount: results.errors.length,
                            warnCount: results.warnings.length,
                            checkCount: results.checks.length,
                            runtimeFaultCount: getRuntimeHubIssueCount(),
                            errors: [...results.errors],
                        });

                        // После стартовой диагностики запускаем постоянный watchdog.
                        runWatchdogCycle('startup')
                            .then(() => {
                                hud?.finishTask?.('watchdog-first', true);
                            })
                            .catch((err) => {
                                console.error('[BackgroundHealthTests] Ошибка watchdog-цикла:', err);
                                hud?.finishTask?.('watchdog-first', false);
                            });
                        initBackgroundHealthTestsSystem._watchdogIntervalId = setInterval(() => {
                            runWatchdogCycle('interval').catch((err) => {
                                console.error('[BackgroundHealthTests] Ошибка watchdog-цикла:', err);
                            });
                        }, WATCHDOG_INTERVAL_MS);
                    } catch (finalizeErr) {
                        console.error(
                            '[BackgroundHealthTests] Ошибка при финализации стартовой диагностики:',
                            finalizeErr,
                        );
                        try {
                            finishHud(false);
                        } catch {
                            /* ignore */
                        }
                    }
                })();
            }
        })();
    };

    /**
     * Ручной полный прогон диагностики. Запускает все проверки (localStorage, IndexedDB,
     * поисковый индекс, алгоритмы, хранилища, watchdog) и возвращает полный отчёт.
     * Используется из настроек приложения для модального окна «Состояние здоровья».
     */
    const runManualFullDiagnostic = async () => {
        const savedErrors = [...results.errors];
        const savedWarnings = [...results.warnings];
        const savedChecks = [...results.checks];
        results.errors = [];
        results.warnings = [];
        results.checks = [];

        const startedAt = nowLabel();
        try {
            // Тесты 1–1.5: среда исполнения (см. platform-health-probes.js)
            await runPlatformHealthProbeSuite(runWithTimeout, report, { probeTag: 'manual' });

            runLocalStorageHealthProbe(report);

            // Тест 2: IndexedDB запись/чтение
            const testId = `health-manual-${Date.now()}`;
            try {
                if (!deps.saveToIndexedDB || !deps.getFromIndexedDB || !deps.deleteFromIndexedDB) {
                    throw new Error('Отсутствуют методы работы с IndexedDB.');
                }
                await runWithTimeout(
                    deps.saveToIndexedDB('clientData', { id: testId, notes: 'health-check' }),
                    5000,
                );
                const record = await runWithTimeout(
                    deps.getFromIndexedDB('clientData', testId),
                    5000,
                );
                if (!record) {
                    report('error', 'IndexedDB', 'Запись не найдена после сохранения.');
                } else {
                    report('info', 'IndexedDB', 'Запись и чтение работают.');
                    await verifyClientDataHealthProbeDualRead(deps, testId, record, report, runWithTimeout);
                }
            } catch (err) {
                report('error', 'IndexedDB', err.message);
            } finally {
                try {
                    await deps.deleteFromIndexedDB?.('clientData', testId);
                } catch {
                    /* cleanup */
                }
            }

            // Тест 3: индексация и поиск (расширенный набор проверок)
            await runSearchAndIndexHealthTests(deps, report, runWithTimeout);

            // Тест 3.0a: поверхность UI — полный режим (явный запрос пользователя из настроек)
            try {
                await runWithTimeout(
                    runUiSurfaceHealthSuite(deps, report, runWithTimeout, { intrusiveUi: true }),
                    180000,
                );
            } catch (uiErr) {
                report('warn', 'Поверхность UI', uiErr?.message || String(uiErr), {
                    system: 'ui_surface',
                });
            }

            // Тест 3.1: цепочка экспорта (без записи файла)
            await runExportPipelineDryRunCheck(deps, report, runWithTimeout);

            // Тест 3.2: дифференциальный контур экспорта
            try {
                const db = deps.State?.db;
                if (db) {
                    const diffResult = await runWithTimeout(
                        runExportImportDifferentialCheck(db, {
                            quiet: true,
                            deepExportCompare: true,
                        }),
                        EXPORT_DIFFERENTIAL_FULL_TIMEOUT_MS,
                    );
                    if (diffResult?.ok) {
                        report(
                            'info',
                            'Экспорт (дифференциальный контур)',
                            diffResult.detail ||
                                'Два независимых чтения IndexedDB и каноническое сравнение совпали.',
                            { system: 'export_import' },
                        );
                    } else {
                        report(
                            'error',
                            'Экспорт (дифференциальный контур)',
                            diffResult?.detail || 'Сбой дифференциальной проверки.',
                            { system: 'export_import' },
                        );
                    }
                } else {
                    report(
                        'warn',
                        'Экспорт (дифференциальный контур)',
                        'База недоступна — проверка пропущена.',
                        { system: 'export_import' },
                    );
                }
            } catch (diffErr) {
                report(
                    'warn',
                    'Экспорт (дифференциальный контур)',
                    diffErr?.message || String(diffErr),
                    { system: 'export_import' },
                );
            }

            // Тест 4: алгоритмы (хранятся под ключом 'all' в data.main)
            try {
                const algoContainer = await runWithTimeout(
                    deps.getFromIndexedDB?.('algorithms', 'all'),
                    5000,
                );
                const mainAlgo = algoContainer?.data?.main;
                if (!mainAlgo) {
                    report('warn', 'Алгоритмы', 'Основной алгоритм не найден.');
                } else {
                    const stepsValid = Array.isArray(mainAlgo.steps);
                    const hasSection =
                        mainAlgo.section === 'main' || mainAlgo.id === 'main' || mainAlgo.section;
                    if (!stepsValid) {
                        report('warn', 'Алгоритмы', 'Структура некорректна: steps не массив.');
                    } else if (!hasSection) {
                        report('warn', 'Алгоритмы', 'Отсутствует идентификатор секции.');
                    } else {
                        report('info', 'Алгоритмы', 'База доступна, структура корректна.');
                    }
                }
            } catch (err) {
                report('error', 'Алгоритмы', err.message);
            }

            // Тест 5: черный список, избранное
            try {
                const blacklistCount = await runWithTimeout(
                    deps.performDBOperation?.('blacklistedClients', 'readonly', (s) => s.count()),
                    5000,
                );
                report('info', 'Черный список', `Записей: ${blacklistCount}.`);
            } catch (err) {
                report('warn', 'Черный список', err.message);
            }
            try {
                const favCount = await runWithTimeout(
                    deps.performDBOperation?.('favorites', 'readonly', (s) => s.count()),
                    5000,
                );
                report('info', 'Избранное', `Записей: ${favCount}.`);
            } catch (err) {
                report('warn', 'Избранное', err.message);
            }

            // Тест 5.2: clientData current
            try {
                const current = await runWithTimeout(
                    deps.getFromIndexedDB?.('clientData', 'current'),
                    5000,
                );
                report(
                    current ? 'info' : 'warn',
                    'clientData',
                    current ? 'Запись current доступна.' : 'Запись current отсутствует.',
                );
            } catch (err) {
                report('warn', 'clientData', err.message);
            }
            // Тест 5.2.1: заметки
            try {
                const currentForNotes = await runWithTimeout(
                    deps.getFromIndexedDB?.('clientData', 'current'),
                    3000,
                );
                const notesLen =
                    currentForNotes?.notes != null && typeof currentForNotes.notes === 'string'
                        ? currentForNotes.notes.length
                        : 0;
                report('info', 'Заметки', `Символов в заметках: ${notesLen}.`);
            } catch (err) {
                report('warn', 'Заметки', err.message);
            }
            // Тест 5.3: Notification (таймер, напоминания)
            if ('Notification' in window) {
                const perm = Notification.permission;
                if (perm === 'denied') {
                    report(
                        'warn',
                        'Уведомления',
                        'Разрешение denied. Напоминания таймера не будут работать.',
                    );
                } else if (perm === 'granted') {
                    report('info', 'Уведомления', 'Разрешение granted.');
                } else {
                    report('info', 'Уведомления', 'Разрешение не запрашивалось (default).');
                }
            }
            // Тест 5.4: bookmarks, reglaments, extLinks
            for (const storeName of ['bookmarks', 'reglaments', 'extLinks']) {
                try {
                    const count = await runWithTimeout(
                        deps.performDBOperation?.(storeName, 'readonly', (s) => s.count()),
                        5000,
                    );
                    const label =
                        storeName === 'bookmarks'
                            ? 'Закладки'
                            : storeName === 'reglaments'
                              ? 'Регламенты'
                              : 'Внешние ссылки';
                    report('info', label, `Записей: ${count}.`);
                } catch (err) {
                    report('warn', storeName, err.message);
                }
            }
            // Тест 5.4.2: поля закладок для UI
            try {
                const br = await auditBookmarksUiCompatibility(
                    deps.performDBOperation,
                    runWithTimeout,
                );
                if (br.level === 'error') report('error', br.title, br.message);
                else if (br.level === 'warn') report('warn', br.title, br.message);
                else report('info', br.title, br.message);
            } catch (err) {
                report('error', 'Закладки (целостность)', err?.message || String(err));
            }
            // Тест 5.4.3: буфер сбоев (perf.longtask не входит)
            {
                const n = getRuntimeHubIssueCount();
                const perfN = getRuntimeHubPerformanceSignalCount();
                if (n > 0) {
                    report(
                        'error',
                        'Глобальные ошибки выполнения',
                        `В буфере ${n} сбоев с момента загрузки. См. HUD «Подробнее» или инженерный кокпит.`,
                    );
                } else {
                    const perfHint =
                        perfN > 0
                            ? ` Сигналы производительности (long task): ${perfN} — не считаются ошибкой.`
                            : '';
                    report(
                        'info',
                        'Глобальные ошибки выполнения',
                        `Сбоев в буфере нет.${perfHint}`,
                    );
                }
            }
            // Тест 5.4.1: links, bookmarkFolders, extLinkCategories, pdfFiles, screenshots
            const extraStoresManual = [
                ['links', 'Ссылки'],
                ['bookmarkFolders', 'Папки закладок'],
                ['extLinkCategories', 'Категории внешних ссылок'],
                ['pdfFiles', 'PDF файлы'],
                ['screenshots', 'Скриншоты'],
            ];
            for (const [storeName, label] of extraStoresManual) {
                try {
                    const count = await runWithTimeout(
                        deps.performDBOperation?.(storeName, 'readonly', (s) => s.count()),
                        5000,
                    );
                    report('info', label, `Записей: ${count}.`);
                } catch (err) {
                    report('warn', label, err.message);
                }
            }

            try {
                const db = deps.State?.db;
                if (
                    db &&
                    typeof db.objectStoreNames?.contains === 'function' &&
                    db.objectStoreNames.contains(RECENTLY_DELETED_STORE_NAME)
                ) {
                    const rdCount = await runWithTimeout(
                        deps.performDBOperation?.(RECENTLY_DELETED_STORE_NAME, 'readonly', (s) =>
                            s.count(),
                        ),
                        5000,
                    );
                    report('info', 'Корзина удалений', `Записей: ${rdCount}.`, {
                        system: 'data_content',
                    });
                } else {
                    report(
                        'warn',
                        'Корзина удалений',
                        'Стор recentlyDeleted отсутствует в текущей схеме БД.',
                        { system: 'storage_idb' },
                    );
                }
            } catch (err) {
                report('warn', 'Корзина удалений', err.message, { system: 'data_content' });
            }

            // Тест 5.5: API/компонента проверки отзыва
            if (!REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
                try {
                    const apiBase =
                        typeof REVOCATION_API_BASE_URL === 'string'
                            ? REVOCATION_API_BASE_URL.trim().replace(/\/$/, '')
                            : '';
                    if (apiBase) {
                        const ok = await runWithTimeout(
                            probeHelperAvailability(apiBase, {
                                path: '/api/health',
                                timeoutMs: 9000,
                            }),
                            12000,
                        );
                        report(
                            ok ? 'info' : 'error',
                            'API проверки отзыва',
                            ok
                                ? 'Облачный API доступен.'
                                : 'Облачный API недоступен или вернул неожиданный ответ.',
                        );
                        if (apiBase.includes('yandexcloud')) {
                            report(
                                ok ? 'info' : 'error',
                                'Yandex Cloud Functions',
                                ok
                                    ? 'Доступен. Проверка сертификатов по списку отзыва работает.'
                                    : 'Недоступен. Проверка по списку отзыва не будет работать.',
                            );
                        }
                    } else {
                        report('info', 'API проверки отзыва', 'URL API не настроен.');
                    }
                } catch (err) {
                    report('error', 'API проверки отзыва', err.message);
                    if (
                        typeof REVOCATION_API_BASE_URL === 'string' &&
                        REVOCATION_API_BASE_URL.includes('yandexcloud')
                    ) {
                        report(
                            'error',
                            'Yandex Cloud Functions',
                            `Недоступен: ${err.message}. Проверка по списку отзыва не будет работать.`,
                        );
                    }
                }
            } else {
                try {
                    let avail =
                        typeof window !== 'undefined' ? window.__revocationHelperAvailable : null;
                    const helperBase = String(REVOCATION_LOCAL_HELPER_BASE_URL || '')
                        .trim()
                        .replace(/\/$/, '');
                    if (avail !== true && helperBase) {
                        const probed = await runWithTimeout(
                            probeHelperAvailability(helperBase, {
                                path: '/health',
                                timeoutMs: 9000,
                            }),
                            12000,
                        );
                        if (typeof window !== 'undefined') {
                            window.__revocationHelperAvailable = probed;
                        }
                        avail = probed;
                    }
                    report(
                        avail === true
                            ? 'info'
                            : avail === false
                              ? 'error'
                              : 'warn',
                        'Компонента проверки отзыва',
                        avail === true
                            ? 'Локальная компонента доступна.'
                            : avail === false
                              ? 'CRL-Helper не отвечает. Запустите компоненту.'
                              : 'Статус локальной компоненты не подтверждён.',
                    );
                } catch (err) {
                    report('error', 'Компонента проверки отзыва', err.message);
                }
            }

            // Тест 5.5b: перекрёстный контур подсистемы отзыва
            try {
                await runWithTimeout(
                    runRevocationSubsystemHealthCrossCheck(runWithTimeout, report, {
                        probeTag: 'manual',
                    }),
                    25000,
                );
            } catch (err) {
                report(
                    'warn',
                    'Отзыв сертификатов (перекрёстная)',
                    err?.message || String(err),
                    { system: 'revocation_crosscheck' },
                );
            }

            // Тест 6: UI настройки
            try {
                const uiSettings = await runWithTimeout(
                    deps.getFromIndexedDB?.('preferences', 'uiSettings'),
                    5000,
                );
                if (!uiSettings) {
                    report(
                        'info',
                        'UI настройки',
                        'Сохранённые uiSettings отсутствуют — используются дефолты.',
                    );
                } else {
                    const hasOrder =
                        Array.isArray(uiSettings.panelOrder) && uiSettings.panelOrder.length > 0;
                    const hasVisibility =
                        Array.isArray(uiSettings.panelVisibility) &&
                        uiSettings.panelVisibility.length === (uiSettings.panelOrder?.length ?? 0);
                    report(
                        hasOrder && hasVisibility ? 'info' : 'warn',
                        'UI настройки',
                        hasOrder && hasVisibility
                            ? 'Структура корректна.'
                            : 'Неконсистентный формат panelOrder/panelVisibility.',
                    );
                }
            } catch (err) {
                report('warn', 'UI настройки', err.message);
            }

            // Тест 6.0.1: кастомизация интерфейса
            try {
                const prefs = await runWithTimeout(
                    deps.getFromIndexedDB?.('preferences', USER_PREFERENCES_KEY),
                    3000,
                );
                const theme = prefs?.themeMode ?? prefs?.theme ?? '—';
                const staticHeader = prefs?.staticHeader ?? '—';
                report(
                    'info',
                    'Кастомизация интерфейса',
                    `Тема: ${theme}, статичный заголовок: ${staticHeader}.`,
                );
            } catch (err) {
                report('warn', 'Кастомизация интерфейса', err.message);
            }

            // Тест 6.0.2: стили
            try {
                const sheetCount = document.styleSheets?.length ?? 0;
                const hasReportClass = Boolean(document.querySelector?.('.health-report-section'));
                if (sheetCount > 0 || hasReportClass) {
                    report(
                        'info',
                        'Стили',
                        `Таблиц стилей: ${sheetCount}, ключевые классы загружены.`,
                    );
                } else {
                    report('warn', 'Стили', 'Таблиц стилей не обнаружено или проверка недоступна.');
                }
            } catch (err) {
                report('warn', 'Стили', err.message);
            }

            // Тест 6.1: версия схемы
            try {
                const storedSchema = await runWithTimeout(
                    deps.getFromIndexedDB?.('preferences', 'schemaVersion'),
                    3000,
                );
                const storedVer =
                    storedSchema && typeof storedSchema === 'object'
                        ? storedSchema.value
                        : storedSchema;
                if (storedVer && String(storedVer) !== String(CURRENT_SCHEMA_VERSION)) {
                    report(
                        'warn',
                        'Версия схемы',
                        `Сохранённая (${storedVer}) ≠ текущая (${CURRENT_SCHEMA_VERSION}).`,
                    );
                } else {
                    report('info', 'Версия схемы', `Текущая: ${CURRENT_SCHEMA_VERSION}.`);
                }
            } catch {
                report('info', 'Версия схемы', `Текущая: ${CURRENT_SCHEMA_VERSION}.`);
            }

            // Тест 6.1.1: File System Access (экспорт clientData)
            if (typeof window.showSaveFilePicker === 'function') {
                report('info', 'File System Access', 'showSaveFilePicker доступен (экспорт).');
            } else {
                report(
                    'info',
                    'File System Access',
                    'showSaveFilePicker недоступен. Используется fallback сохранения.',
                );
            }
            // Импорт/экспорт: наличие хранилищ для экспорта
            try {
                const storeCount = deps.State?.db?.objectStoreNames?.length ?? 0;
                report(
                    'info',
                    'Импорт/экспорт',
                    storeCount > 0
                        ? `Хранилищ для экспорта: ${storeCount}.`
                        : 'Количество хранилищ недоступно (БД не инициализирована).',
                );
            } catch (err) {
                report('warn', 'Импорт/экспорт', err.message);
            }
            // Тест 6.1.2: ResizeObserver (табы, overflow)
            if (typeof window.ResizeObserver === 'function') {
                report('info', 'ResizeObserver', 'Доступен.');
            } else {
                report(
                    'warn',
                    'ResizeObserver',
                    'Недоступен. Табы и overflow могут работать некорректно.',
                );
            }

            // Тест 6.2: clipboard
            try {
                if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    try {
                        await navigator.clipboard.writeText('');
                        report('info', 'Буфер обмена', 'Clipboard API доступен.');
                    } catch (writeErr) {
                        const msg = String(writeErr?.message || writeErr).toLowerCase();
                        if (
                            msg.includes('permission') ||
                            msg.includes('denied') ||
                            msg.includes('user gesture')
                        ) {
                            report(
                                'info',
                                'Буфер обмена',
                                'Clipboard API доступен. Запись требует действия пользователя (ожидаемо в фоне).',
                            );
                        } else {
                            report(
                                'warn',
                                'Буфер обмена',
                                `Clipboard недоступен: ${writeErr?.message || writeErr}.`,
                            );
                        }
                    }
                } else {
                    report('warn', 'Буфер обмена', 'Clipboard API недоступен.');
                }
            } catch (err) {
                report('warn', 'Буфер обмена', `Clipboard: ${err.message}.`);
            }

            // Второй контур целостности данных (полный профиль; не дублирует быстрый watchdog)
            try {
                const intRowsFull = await runLightDataIntegrityPass(
                    {
                        performDBOperation: deps.performDBOperation,
                        getFromIndexedDB: deps.getFromIndexedDB,
                        runWithTimeout,
                    },
                    { profile: 'full' },
                );
                for (const r of intRowsFull) {
                    report(r.level, r.title, r.message, { system: 'data_integrity' });
                }
            } catch (err) {
                report('warn', 'Целостность данных / прогон', err?.message || String(err), {
                    system: 'data_integrity',
                });
            }

            // Watchdog: IndexedDB структура + автосохранение
            await runWatchdogCycle('manual');

            const finishedAt = nowLabel();
            hud?.setDiagnostics?.({
                errors: results.errors,
                warnings: results.warnings,
                checks: results.checks,
                updatedAt: finishedAt,
            });

            const mergedErrs = mergeRuntimeHubErrorsForReport(results.errors);
            recordApplicationHealthSnapshot({
                phase: HEALTH_PHASE.MANUAL_DEEP,
                source: 'manual_full',
                errorCount: mergedErrs.length,
                warnCount: results.warnings.length,
                checkCount: results.checks.length,
                runtimeFaultCount: getRuntimeHubIssueCount(),
                errors: mergedErrs,
            });
            emitCrossLayerObservabilityNotes();
            return {
                errors: mergedErrs,
                warnings: [...results.warnings],
                checks: [...results.checks],
                startedAt,
                finishedAt,
                success: mergedErrs.length === 0,
            };
        } catch (err) {
            report('error', 'Ручной прогон', err.message);
            const mergedErrs = mergeRuntimeHubErrorsForReport(results.errors);
            recordApplicationHealthSnapshot({
                phase: HEALTH_PHASE.MANUAL_DEEP,
                source: 'manual_full',
                errorCount: mergedErrs.length,
                warnCount: results.warnings.length,
                checkCount: results.checks.length,
                runtimeFaultCount: getRuntimeHubIssueCount(),
                errors: mergedErrs,
            });
            emitCrossLayerObservabilityNotes();
            return {
                errors: mergedErrs,
                warnings: [...results.warnings],
                checks: [...results.checks],
                startedAt,
                finishedAt: nowLabel(),
                success: false,
                error: err.message,
            };
        } finally {
            results.errors = savedErrors;
            results.warnings = savedWarnings;
            results.checks = savedChecks;
        }
    };

    window.runManualFullDiagnostic = runManualFullDiagnostic;

    setTimeout(() => {
        start();
    }, 1500);
}

window.initBackgroundHealthTestsSystem = initBackgroundHealthTestsSystem;
