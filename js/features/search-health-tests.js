'use strict';

/**
 * Проверки здоровья системы индексации и поиска.
 * Используется фоновой диагностикой и ручным прогоном (runManualFullDiagnostic).
 */

import { tokenizeNormalized } from './search-normalize.js';

const SEARCH_INDEX_STATUS_KEY = 'searchIndexStatus';
const INDEX_SAMPLE_SIZE = 5;
const SEARCH_TEST_QUERIES = ['алгоритм', '1с', 'поиск'];
const HEALTH_TIMEOUT_MS = 5000;

/**
 * Проверяет структуру одной записи индекса (word, refs).
 * @param {object} entry — запись из store searchIndex
 * @returns {{ ok: boolean, message?: string }}
 */
function validateIndexEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return { ok: false, message: 'Запись не объект' };
    }
    if (typeof entry.word !== 'string' || entry.word.trim() === '') {
        return { ok: false, message: 'Нет поля word или оно пустое' };
    }
    if (!Array.isArray(entry.refs)) {
        return { ok: false, message: 'refs не массив' };
    }
    for (let i = 0; i < Math.min(entry.refs.length, 3); i++) {
        const ref = entry.refs[i];
        if (!ref || typeof ref !== 'object') {
            return { ok: false, message: `ref[${i}] не объект` };
        }
        if (ref.store == null) return { ok: false, message: `ref[${i}].store отсутствует` };
        if (ref.id == null) return { ok: false, message: `ref[${i}].id отсутствует` };
    }
    return { ok: true };
}

/**
 * Запускает набор проверок индексации и поиска.
 * @param {object} deps — зависимости: getFromIndexedDB, performDBOperation, getGlobalSearchResults (опционально)
 * @param {function(string, string, string)} report — report(level, title, message), level: 'info'|'warn'|'error'
 * @param {function(Promise, number)} runWithTimeout — runWithTimeout(promise, ms)
 */
export async function runSearchAndIndexHealthTests(deps, report, runWithTimeout) {
    const timeout = runWithTimeout ? (p) => runWithTimeout(p, HEALTH_TIMEOUT_MS) : (p) => p;

    if (!deps.getFromIndexedDB || !deps.performDBOperation) {
        report(
            'warn',
            'Поиск / индексация',
            'Нет доступа к IndexedDB (getFromIndexedDB или performDBOperation).',
        );
        return;
    }

    // 1) Статус индекса (preferences.searchIndexStatus)
    try {
        const status = await timeout(deps.getFromIndexedDB('preferences', SEARCH_INDEX_STATUS_KEY));
        if (!status) {
            report(
                'warn',
                'Поиск: статус индекса',
                'Запись searchIndexStatus не найдена. Индекс может быть не построен.',
            );
        } else {
            const built = status.built === true;
            const version = status.version != null ? status.version : '—';
            const err = status.error ? String(status.error) : null;
            if (err) {
                report(
                    'error',
                    'Поиск: статус индекса',
                    `Ошибка при последнем построении: ${err}.`,
                );
            } else if (!built) {
                report(
                    'warn',
                    'Поиск: статус индекса',
                    `Индекс не помечен как построенный (version: ${version}).`,
                );
            } else {
                report('info', 'Поиск: статус индекса', `Построен, version: ${version}.`);
            }
        }
    } catch (err) {
        report('error', 'Поиск: статус индекса', err.message || String(err));
    }

    // 2) Количество записей в searchIndex
    try {
        const count = await timeout(
            deps.performDBOperation('searchIndex', 'readonly', (store) => store.count()),
        );
        if (count === 0) {
            report('warn', 'Поиск: индекс', 'В хранилище searchIndex 0 записей.');
        } else {
            report('info', 'Поиск: индекс', `Записей в индексе: ${count}.`);
        }
    } catch (err) {
        report('error', 'Поиск: индекс', err.message || String(err));
        return;
    }

    // 3) Структура записей (выборка по курсору)
    try {
        const samples = await timeout(
            deps.performDBOperation('searchIndex', 'readonly', (store) => {
                return new Promise((resolve, reject) => {
                    const result = [];
                    const request = store.openCursor();
                    request.onsuccess = () => {
                        const cursor = request.result;
                        if (cursor && result.length < INDEX_SAMPLE_SIZE) {
                            result.push(cursor.value);
                            cursor.continue();
                        } else {
                            resolve(result);
                        }
                    };
                    request.onerror = () => reject(request.error);
                });
            }),
        );
        if (samples.length === 0) {
            report('info', 'Поиск: структура индекса', 'Нет записей для проверки структуры.');
        } else {
            let allValid = true;
            for (const entry of samples) {
                const v = validateIndexEntry(entry);
                if (!v.ok) {
                    report(
                        'warn',
                        'Поиск: структура индекса',
                        v.message || 'Неверная структура записи.',
                    );
                    allValid = false;
                    break;
                }
            }
            if (allValid) {
                report(
                    'info',
                    'Поиск: структура индекса',
                    `Проверено записей: ${samples.length}, структура корректна.`,
                );
            }
        }
    } catch (err) {
        report('error', 'Поиск: структура индекса', err.message || String(err));
    }

    // 4) Выполнение поиска (getGlobalSearchResults)
    if (typeof deps.getGlobalSearchResults === 'function') {
        try {
            const query = SEARCH_TEST_QUERIES[0];
            const results = await timeout(deps.getGlobalSearchResults(query));
            if (!Array.isArray(results)) {
                report('error', 'Поиск: выполнение', 'getGlobalSearchResults вернул не массив.');
            } else {
                report(
                    'info',
                    'Поиск: выполнение',
                    `Запрос «${query}» — получено результатов: ${results.length}.`,
                );
            }
        } catch (err) {
            report('error', 'Поиск: выполнение', err.message || String(err));
        }
    } else {
        report(
            'info',
            'Поиск: выполнение',
            'getGlobalSearchResults не передан, проверка пропущена.',
        );
    }

    // 5) Токенизация (tokenizeNormalized)
    try {
        const tokens = tokenizeNormalized('тест');
        if (!Array.isArray(tokens)) {
            report('warn', 'Поиск: токенизация', 'tokenizeNormalized вернул не массив.');
        } else if (tokens.length === 0) {
            report(
                'warn',
                'Поиск: токенизация',
                'tokenizeNormalized("тест") вернул пустой массив.',
            );
        } else {
            report('info', 'Поиск: токенизация', 'tokenizeNormalized работает.');
        }
    } catch (err) {
        report('error', 'Поиск: токенизация', err.message || String(err));
    }
}
