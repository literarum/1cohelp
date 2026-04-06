'use strict';

import {
    CURRENT_SCHEMA_VERSION,
    USER_PREFERENCES_KEY,
    RECENTLY_DELETED_STORE_NAME,
} from '../constants.js';
import { inferSystemFromTitle } from './health-report-format.js';
import { REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER } from '../config/revocation-sources.js';
import { REVOCATION_API_BASE_URL } from '../config.js';
import { probeHelperAvailability } from './revocation-helper-probe.js';
import { runSearchAndIndexHealthTests } from './search-health-tests.js';
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

let deps = {};
/** Счётчик циклов watchdog (interval) для периодического второго контура целостности данных */
let watchdogDataIntegrityCycleCount = 0;
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
        const ok = await runWithTimeoutFn(
            depsBag.exportAllData({ dryRunForHealth: true, isForcedBackupMode: true }),
            EXPORT_DRY_RUN_TIMEOUT_MS,
        );
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

export function setBackgroundHealthTestsDependencies(nextDeps) {
    deps = { ...nextDeps };
}

function nowLabel() {
    return new Date().toLocaleString('ru-RU');
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

            // Watchdog 3: доступность Yandex Cloud Functions (проверка сертификатов по списку отзыва)
            const yandexApiBase =
                typeof REVOCATION_API_BASE_URL === 'string'
                    ? REVOCATION_API_BASE_URL.trim().replace(/\/$/, '')
                    : '';
            if (yandexApiBase && yandexApiBase.includes('yandexcloud')) {
                try {
                    const ok = await runWithTimeout(
                        probeHelperAvailability(yandexApiBase, { path: '/api/health' }),
                        5000,
                    );
                    addCheck(
                        ok ? 'info' : 'warn',
                        'Watchdog / Yandex Cloud Functions',
                        ok
                            ? 'Доступен.'
                            : 'Недоступен. Проверка сертификатов по списку отзыва может не работать.',
                    );
                } catch (err) {
                    addCheck(
                        'warn',
                        'Watchdog / Yandex Cloud Functions',
                        `Недоступен: ${err.message}.`,
                    );
                }
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

            // Обновляем диагностику, добавляя watchdog-результаты к уже собранным.
            if (hud?.setDiagnostics) {
                const notReplacedByWatchdogCycle = (entry) =>
                    !entry.title.startsWith('Watchdog / ') &&
                    !entry.title.startsWith('Целостность данных /');
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
            }
            const hasErrors = cycleChecks.some((entry) => entry.level === 'error');
            const hasWarnings = cycleChecks.some((entry) => entry.level === 'warn');
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

                updateHud(20);

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

                updateHud(40);

                // Тест 3: индексация и поиск (расширенный набор проверок)
                await runSearchAndIndexHealthTests(deps, report, runWithTimeout);
                updateHud(50);

                // Тест 3.1: цепочка экспорта (импорт/слияние читают тот же JSON — критический контур)
                await runExportPipelineDryRunCheck(deps, report, runWithTimeout);
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
                        report('warn', 'clientData', 'Запись current отсутствует.');
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
                // Тест 5.5: компонента проверки отзыва (CRL Helper)
                if (!REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
                    // Облачный API: проверяем /api/health (Yandex Cloud Functions и др.)
                    try {
                        const apiBase =
                            typeof REVOCATION_API_BASE_URL === 'string'
                                ? REVOCATION_API_BASE_URL.trim().replace(/\/$/, '')
                                : '';
                        if (apiBase) {
                            const ok = await runWithTimeout(
                                probeHelperAvailability(apiBase, { path: '/api/health' }),
                                5000,
                            );
                            if (ok) {
                                report(
                                    'info',
                                    'API проверки отзыва',
                                    'Облачный API проверки сертификатов доступен.',
                                );
                            } else {
                                report(
                                    'warn',
                                    'API проверки отзыва',
                                    'Облачный API недоступен. Проверка сертификатов может не работать.',
                                );
                            }
                            if (apiBase.includes('yandexcloud')) {
                                report(
                                    ok ? 'info' : 'warn',
                                    'Yandex Cloud Functions',
                                    ok
                                        ? 'Доступен. Проверка сертификатов по списку отзыва работает.'
                                        : 'Недоступен. Проверка сертификатов по списку отзыва может не работать.',
                                );
                            }
                        } else {
                            report('info', 'API проверки отзыва', 'URL API не настроен.');
                        }
                    } catch (err) {
                        report('warn', 'API проверки отзыва', err.message);
                        if (
                            typeof REVOCATION_API_BASE_URL === 'string' &&
                            REVOCATION_API_BASE_URL.includes('yandexcloud')
                        ) {
                            report(
                                'warn',
                                'Yandex Cloud Functions',
                                `Недоступен: ${err.message}. Проверка по списку отзыва может не работать.`,
                            );
                        }
                    }
                } else if (REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER) {
                    try {
                        const avail = window.__revocationHelperAvailable;
                        if (avail === true) {
                            report(
                                'info',
                                'Компонента проверки отзыва',
                                'Локальная компонента доступна.',
                            );
                        } else if (avail === false) {
                            report(
                                'info',
                                'Компонента проверки отзыва',
                                'Компонента не запущена. Нажмите «Установить» в разделе проверки сертификата.',
                            );
                        } else {
                            report('info', 'Компонента проверки отзыва', 'Проверка в процессе.');
                        }
                    } catch (err) {
                        report('warn', 'Компонента проверки отзыва', err.message);
                    }
                }

                // Тест 6: надежность UI настроек
                try {
                    const uiSettings = await runWithTimeout(
                        deps.getFromIndexedDB?.('preferences', 'uiSettings'),
                        5000,
                    );
                    if (!uiSettings) {
                        report(
                            'warn',
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
                updateHud(100);
                // Задача watchdog-first: HUD не показывает completion до завершения первого цикла
                hud?.startTask?.('watchdog-first', 'Watchdog', { weight: 0.1, total: 100 });
                finishHud(
                    results.errors.length === 0 && getRuntimeHubIssueCount() === 0,
                );

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

            // Тест 3.1: цепочка экспорта (без записи файла)
            await runExportPipelineDryRunCheck(deps, report, runWithTimeout);

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
                            probeHelperAvailability(apiBase, { path: '/api/health' }),
                            5000,
                        );
                        report(
                            ok ? 'info' : 'warn',
                            'API проверки отзыва',
                            ok ? 'Облачный API доступен.' : 'Облачный API недоступен.',
                        );
                        if (apiBase.includes('yandexcloud')) {
                            report(
                                ok ? 'info' : 'warn',
                                'Yandex Cloud Functions',
                                ok
                                    ? 'Доступен. Проверка сертификатов по списку отзыва работает.'
                                    : 'Недоступен. Проверка по списку отзыва может не работать.',
                            );
                        }
                    } else {
                        report('info', 'API проверки отзыва', 'URL API не настроен.');
                    }
                } catch (err) {
                    report('warn', 'API проверки отзыва', err.message);
                    if (
                        typeof REVOCATION_API_BASE_URL === 'string' &&
                        REVOCATION_API_BASE_URL.includes('yandexcloud')
                    ) {
                        report(
                            'warn',
                            'Yandex Cloud Functions',
                            `Недоступен: ${err.message}. Проверка по списку отзыва может не работать.`,
                        );
                    }
                }
            } else {
                try {
                    const avail = window.__revocationHelperAvailable;
                    report(
                        'info',
                        'Компонента проверки отзыва',
                        avail === true
                            ? 'Локальная компонента доступна.'
                            : avail === false
                              ? 'Компонента не запущена.'
                              : 'Проверка в процессе.',
                    );
                } catch (err) {
                    report('warn', 'Компонента проверки отзыва', err.message);
                }
            }

            // Тест 6: UI настройки
            try {
                const uiSettings = await runWithTimeout(
                    deps.getFromIndexedDB?.('preferences', 'uiSettings'),
                    5000,
                );
                if (!uiSettings) {
                    report('warn', 'UI настройки', 'Сохранённые uiSettings отсутствуют.');
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
