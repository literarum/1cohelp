'use strict';

import { State } from '../app/state.js';
import {
    escapeHtml,
    highlightTextInString,
    normalizeBrokenEntities,
    decodeBasicEntitiesOnce,
    linkify,
} from '../utils/html.js';
import { SHABLONY_DOC_ID } from '../constants.js';
import { NotificationService } from '../services/notification.js';
import { createBackgroundPoller, DEFAULT_POLL_INTERVAL_MS } from './background-poller.js';

// ============================================================================
// GOOGLE DOCS INTEGRATION
// ============================================================================

// Local debounce function to avoid import issues
function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Store original data for search
let originalShablonyData = [];
const GOOGLE_DOC_CACHE_PREFIX = 'copilot1co:gdoc-cache:';
const GOOGLE_DOC_REQUEST_TIMEOUT_MS = 12000;
const GOOGLE_DOC_RETRY_DELAYS_MS = [250, 900, 1800];
/** Для фонового цикла: меньше попыток, экспоненциальная пауза внутри цикла (штатный интервал не меняется). */
export const GOOGLE_DOC_BACKGROUND_RETRY_DELAYS_MS = [1500, 4500];
const GOOGLE_DOC_BASE_URL =
    'https://script.google.com/macros/s/AKfycby5ak0hPZF7_YJnhqYD8g1M2Ck6grzq11mpKqPFIWaX9_phJe5H_97cXmnClXKg1Nrl/exec';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ошибка связи с Google Docs со структурированным описанием (слой/тип/статус) для диагностики. */
export class GoogleDocsError extends Error {
    /**
     * @param {string} message
     * @param {{ kind?: string, status?: number|null, attempts?: number, chain?: string, url?: string, durationMs?: number }} [info]
     */
    constructor(message, info = {}) {
        super(message);
        this.name = 'GoogleDocsError';
        this.kind = info.kind || 'unknown';
        this.status = info.status ?? null;
        this.attempts = info.attempts ?? null;
        this.chain = info.chain || '';
        this.url = info.url || '';
        this.durationMs = info.durationMs ?? null;
    }
}

/** Структурированное описание ошибки (errorInfo) из любого исключения. */
export function buildGoogleDocsErrorInfo(error) {
    const message = error?.message || String(error || '');
    let kind = error?.kind;
    if (!kind) {
        if (/нет подключения к интернету/i.test(message)) kind = 'offline';
        else if (/время ожидания|timed out|timeout/i.test(message)) kind = 'timeout';
        else if (/статус\s*\d{3}/i.test(message)) kind = 'http';
        else if (/разбора json/i.test(message)) kind = 'parse';
        else if (/ошибка от сервера/i.test(message)) kind = 'server';
        else if (/формат|не найден в ответе/i.test(message)) kind = 'format';
        else if (isLikelyTransientNetworkError(message)) kind = 'network';
        else kind = 'unknown';
    }
    let status = error?.status ?? null;
    if (status == null) {
        const m = /статус\s*(\d{3})/i.exec(message);
        if (m) status = Number(m[1]);
    }
    return {
        service: 'google-docs',
        kind,
        status,
        attempts: error?.attempts ?? null,
        chain: error?.chain || '',
        url: error?.url || '',
        durationMs: error?.durationMs ?? null,
    };
}

function isLikelyTransientNetworkError(message) {
    if (!message) return false;
    return /fetch|failed|network|socket|err_|timed out|aborted|connection|internet|сеть|интернет/i.test(
        String(message),
    );
}

function normalizeNetworkError(errorLike) {
    if (!errorLike) return 'Сеть недоступна';
    const raw = errorLike.message || String(errorLike);
    const msg = String(raw);
    return isLikelyTransientNetworkError(msg)
        ? 'Не удалось загрузить документ. Проверьте подключение к интернету и повторите попытку.'
        : msg;
}

async function requestJsonViaFetch(requestUrl, timeoutMs) {
    let timeoutId = null;
    const timeoutError = new Promise((_, reject) => {
        timeoutId = setTimeout(
            () =>
                reject(
                    new GoogleDocsError('Превышено время ожидания загрузки документа.', {
                        kind: 'timeout',
                    }),
                ),
            timeoutMs,
        );
    });
    let response;
    try {
        response = await Promise.race([fetch(requestUrl), timeoutError]);
    } catch (err) {
        if (err instanceof GoogleDocsError) throw err;
        throw new GoogleDocsError(err?.message || String(err), { kind: 'network' });
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
    if (!response?.ok) {
        throw new GoogleDocsError(`Ошибка загрузки: статус ${response?.status ?? 'unknown'}`, {
            kind: 'http',
            status: response?.status ?? null,
        });
    }
    try {
        return await response.json();
    } catch (err) {
        throw new GoogleDocsError(`Ошибка разбора JSON: ${err?.message || String(err)}`, {
            kind: 'parse',
        });
    }
}

function requestJsonViaXhr(requestUrl, timeoutMs) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', requestUrl, true);
        xhr.timeout = timeoutMs;
        xhr.responseType = 'text';

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(
                    new GoogleDocsError(`Ошибка загрузки: статус ${xhr.status}`, {
                        kind: 'http',
                        status: xhr.status,
                    }),
                );
                return;
            }
            try {
                resolve(JSON.parse(xhr.responseText || '[]'));
            } catch (error) {
                reject(
                    new GoogleDocsError(`Ошибка разбора JSON: ${error.message || String(error)}`, {
                        kind: 'parse',
                    }),
                );
            }
        };
        xhr.onerror = () =>
            reject(new GoogleDocsError('Ошибка сети при загрузке документа.', { kind: 'network' }));
        xhr.ontimeout = () =>
            reject(
                new GoogleDocsError('Превышено время ожидания загрузки документа.', {
                    kind: 'timeout',
                }),
            );
        xhr.onabort = () =>
            reject(new GoogleDocsError('Запрос загрузки документа был прерван.', { kind: 'network' }));
        xhr.send();
    });
}

/** После полного провала сети повторные запросы в течение окна не отправляем (иначе ~10 запросов на каждую загрузку/вкладку). */
const GOOGLE_DOC_NEGATIVE_CACHE_MS = 30000;
let googleDocNetworkFailedAt = 0;

function sanitizeUrlForReport(requestUrl) {
    try {
        const u = new URL(requestUrl);
        return `${u.origin}${u.pathname}`;
    } catch {
        return '';
    }
}

async function requestGoogleDocJson(
    requestUrl,
    { force = false, retryDelays = GOOGLE_DOC_RETRY_DELAYS_MS } = {},
) {
    if (!force && googleDocNetworkFailedAt && Date.now() - googleDocNetworkFailedAt < GOOGLE_DOC_NEGATIVE_CACHE_MS) {
        throw new GoogleDocsError(
            'Сеть недоступна: повторный запрос отложен (недавний сбой). Нажмите «Повторить».',
            { kind: 'network', url: sanitizeUrlForReport(requestUrl) },
        );
    }
    const errors = [];
    const startedAt = Date.now();
    let attempts = 0;
    let lastFetchError = null;

    for (let attempt = 0; attempt < retryDelays.length + 1; attempt++) {
        attempts += 1;
        try {
            const json = await requestJsonViaFetch(requestUrl, GOOGLE_DOC_REQUEST_TIMEOUT_MS);
            googleDocNetworkFailedAt = 0;
            return json;
        } catch (error) {
            lastFetchError = error;
            errors.push(`fetch:${error?.message || String(error)}`);
            // HTTP-ответ получен — повторять бессмысленно (кроме 5xx/429)
            const st = error?.status;
            if (error?.kind === 'http' && !(st >= 500 || st === 429)) break;
            const hasMoreAttempts = attempt < retryDelays.length;
            if (!hasMoreAttempts) break;
            // экспоненциальная пауза внутри цикла (+ небольшой джиттер)
            await sleep(retryDelays[attempt] + Math.floor(Math.random() * 120));
        }
    }

    // XHR — запасной транспорт только при сетевых сбоях (HTTP-ответ уже получен fetch-ем)
    let finalError = lastFetchError;
    if (!lastFetchError || lastFetchError.kind === 'network' || lastFetchError.kind === 'timeout') {
        attempts += 1;
        try {
            const json = await requestJsonViaXhr(requestUrl, GOOGLE_DOC_REQUEST_TIMEOUT_MS);
            googleDocNetworkFailedAt = 0;
            return json;
        } catch (error) {
            finalError = lastFetchError || error;
            errors.push(`xhr:${error?.message || String(error)}`);
        }
    }
    if (!finalError || finalError.kind === 'network' || finalError.kind === 'timeout') {
        googleDocNetworkFailedAt = Date.now();
    }
    const chain = errors.map((e) => e.replace(/\s+/g, ' ').trim()).join(' | ');
    throw new GoogleDocsError(`${normalizeNetworkError(finalError)} [chain=${chain}]`, {
        kind: finalError?.kind || 'network',
        status: finalError?.status ?? null,
        attempts,
        chain,
        url: sanitizeUrlForReport(requestUrl),
        durationMs: Date.now() - startedAt,
    });
}

function getGoogleDocCacheKey(docId) {
    return `${GOOGLE_DOC_CACHE_PREFIX}${docId}`;
}

function saveGoogleDocCache(docId, data) {
    if (!docId || !Array.isArray(data) || data.length === 0) return;
    try {
        localStorage.setItem(
            getGoogleDocCacheKey(docId),
            JSON.stringify({
                ts: Date.now(),
                data,
            }),
        );
    } catch (error) {
        console.warn('[google-docs] Не удалось сохранить кэш документа:', error);
    }
}

function loadGoogleDocCacheEntry(docId) {
    if (!docId) return null;
    try {
        const raw = localStorage.getItem(getGoogleDocCacheKey(docId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const data = Array.isArray(parsed?.data) ? parsed.data : [];
        if (data.length === 0) return null;
        return { data, ts: Number(parsed?.ts) || null };
    } catch (error) {
        console.warn('[google-docs] Не удалось прочитать кэш документа:', error);
        return null;
    }
}

// Getter functions for search module
export function getOriginalShablonyData() {
    return originalShablonyData;
}

// Section configurations
const GOOGLE_DOC_SECTIONS = [
    {
        id: 'shablony',
        docId: '1YIAViw2kOVh4UzLw8VjNns0PHD29lHLr_QaQs3jCGX4',
        title: 'Шаблоны',
    },
];

/**
 * Start timestamp updater interval
 */
export function startTimestampUpdater() {
    if (State.timestampUpdateInterval) {
        console.log('Таймер обновления временных меток уже запущен.');
        return;
    }

    console.log("Запуск таймера обновления временных меток для кнопок 'Обновить'.");
    State.timestampUpdateInterval = setInterval(updateRefreshButtonTimestamps, 60000);
}

/**
 * Update refresh button timestamps
 */
export function updateRefreshButtonTimestamps() {
    updateConnectionChip();
    GOOGLE_DOC_SECTIONS.forEach((section) => {
        const refreshButton = document.getElementById(`force-refresh-${section.id}-btn`);
        if (!refreshButton) return;

        const timestampSpan = refreshButton.querySelector('.update-timestamp');
        if (!timestampSpan) return;

        const lastUpdateTime = State.googleDocTimestamps?.get(section.docId);
        if (lastUpdateTime) {
            const minutesAgo = Math.floor((Date.now() - lastUpdateTime) / 60000);
            if (minutesAgo < 1) {
                timestampSpan.textContent = '(только что)';
            } else if (minutesAgo === 1) {
                timestampSpan.textContent = `(1 минуту назад)`;
            } else if (minutesAgo < 5) {
                timestampSpan.textContent = `(${minutesAgo} минуты назад)`;
            } else {
                timestampSpan.textContent = `(${minutesAgo} минут назад)`;
            }
        } else {
            timestampSpan.textContent = '';
        }
    });
}

/**
 * Fetch Google Docs data
 */
export async function fetchGoogleDocs(docIds, force = false, options = {}) {
    if (!Array.isArray(docIds) || docIds.length === 0) {
        console.error(
            'КРИТИЧЕСКАЯ ОШИБКА: В функцию fetchGoogleDocs не передан массив ID документов.',
        );
        return [];
    }

    const BASE_URL = GOOGLE_DOC_BASE_URL;
    const params = new URLSearchParams();
    params.append('docIds', docIds.join(','));
    params.append('v', new Date().getTime());
    if (force) {
        params.append('nocache', 'true');
    }

    const requestUrl = `${BASE_URL}?${params.toString()}`;
    console.debug('[fetchGoogleDocs] URL для запроса:', requestUrl);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        console.debug('[fetchGoogleDocs] Офлайн: navigator.onLine === false');
        throw new GoogleDocsError('Нет подключения к интернету. Включите сеть и повторите попытку.', {
            kind: 'offline',
            url: sanitizeUrlForReport(requestUrl),
        });
    }

    try {
        const results = await requestGoogleDocJson(requestUrl, {
            force,
            retryDelays: options.retryDelays || GOOGLE_DOC_RETRY_DELAYS_MS,
        });
        console.log(
            '[fetchGoogleDocs] Получен ответ от API:',
            results,
            'Тип:',
            typeof results,
            'Является массивом:',
            Array.isArray(results),
        );
        if (results && results.error) {
            throw new GoogleDocsError(`Ошибка от сервера: ${results.message}`, { kind: 'server' });
        }

        // API может возвращать массив результатов напрямую: [{ status: 'success', content: { type: 'paragraphs', data: [...] } }, ...]
        if (Array.isArray(results)) {
            console.log('[fetchGoogleDocs] Обработка массива результатов, длина:', results.length);
            return results.map((item, index) => {
                // Извлекаем данные: приоритет item.content.data, затем item.data, затем item.content (если это массив)
                let data = [];
                if (item.content && item.content.data && Array.isArray(item.content.data)) {
                    data = item.content.data;
                } else if (item.data && Array.isArray(item.data)) {
                    data = item.data;
                } else if (item.content && Array.isArray(item.content)) {
                    data = item.content;
                } else if (Array.isArray(item)) {
                    data = item;
                }
                const result = {
                    docId: docIds[index] || docIds[0],
                    status: item.status || 'success',
                    content: item.content || { type: 'paragraphs', data: [] },
                    message: item.message,
                    data: data,
                    error: item.status === 'error' ? item.message || 'Ошибка загрузки' : null,
                    errorInfo:
                        item.status === 'error'
                            ? { service: 'google-docs', kind: 'server' }
                            : undefined,
                };
                console.log(
                    `[fetchGoogleDocs] Обработан элемент ${index}:`,
                    result,
                    'Извлечённые данные:',
                    data,
                );
                return result;
            });
        }

        // API возвращает объект с полем content (массив результатов)
        // Каждый результат имеет: { status: 'success', content: { type: 'paragraphs', data: [...] }, message: ... }
        if (results && results.content && Array.isArray(results.content)) {
            return results.content.map((item, index) => {
                // Извлекаем данные: приоритет item.content.data, затем item.data, затем item.content (если это массив)
                let data = [];
                if (item.content && item.content.data && Array.isArray(item.content.data)) {
                    data = item.content.data;
                } else if (item.data && Array.isArray(item.data)) {
                    data = item.data;
                } else if (item.content && Array.isArray(item.content)) {
                    data = item.content;
                } else if (Array.isArray(item)) {
                    data = item;
                }
                return {
                    docId: docIds[index] || docIds[0],
                    status: item.status || 'success',
                    content: item.content || { type: 'paragraphs', data: [] },
                    message: item.message,
                    data: data,
                    error: item.status === 'error' ? item.message || 'Ошибка загрузки' : null,
                };
            });
        }

        // Fallback: если структура другая, пытаемся извлечь данные
        if (results && typeof results === 'object' && !Array.isArray(results)) {
            return docIds.map((docId) => {
                const docData = results[docId];
                if (!docData) {
                    return { docId, data: [], error: 'Документ не найден в ответе' };
                }
                if (docData.error) {
                    return { docId, data: [], error: docData.error };
                }
                const data = Array.isArray(docData)
                    ? docData
                    : docData.content?.data ||
                      docData.data ||
                      docData.content ||
                      docData.paragraphs ||
                      [];
                return { docId, data: Array.isArray(data) ? data : [], error: null };
            });
        }

        console.error('Неожиданный формат ответа от API:', results);
        return docIds.map((id) => ({
            docId: id,
            data: [],
            error: 'Неверный формат ответа',
            errorInfo: { service: 'google-docs', kind: 'format' },
        }));
    } catch (error) {
        const message = error?.message || String(error);
        const isNetworkError = /интернет|сеть|fetch|failed|network|socket|err_/i.test(message);
        if (isNetworkError) {
            console.warn(`Ошибка при загрузке документов: ${message}`);
        } else {
            console.error(`Ошибка при загрузке документов: ${message}`);
        }
        const errorInfo = buildGoogleDocsErrorInfo(error);
        return docIds.map((id) => ({ docId: id, data: [], error: error.message, errorInfo }));
    }
}

/**
 * Render Google Doc content
 */
export function renderGoogleDocContent(results, container, parentContainerId) {
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    if (!results || results.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'p-4 text-center text-gray-500';
        emptyMsg.textContent = 'Данные не загружены.';
        container.appendChild(emptyMsg);
        return;
    }

    results.forEach((result) => {
        if (result.error) {
            const errorDiv = document.createElement('div');
            errorDiv.className =
                'p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded';
            const rawError = String(result.error);
            // Технический «chain=fetch:… | xhr:…» пользователю не показываем (он остаётся в консоли).
            errorDiv.textContent = /интернет|сеть|fetch|failed|network|socket|err_|chain=/i.test(rawError)
                ? 'Документ недоступен: нет связи с сервером. Проверьте подключение к интернету и откройте раздел ещё раз.'
                : `Ошибка загрузки: ${rawError.replace(/\s*\[chain=.*\]\s*$/, '')}`;
            fragment.appendChild(errorDiv);
            return;
        }

        if (parentContainerId === 'doc-content-shablony') {
            console.log('[renderGoogleDocContent] Рендеринг документа "Шаблоны".');
            // Извлекаем данные: result.data или result.content.data
            const rawData = result.data || result.content?.data || [];
            if (!Array.isArray(rawData) || rawData.length === 0) {
                console.warn(
                    '[renderGoogleDocContent] Шаблоны: данные пусты или неверный формат.',
                    result,
                );
                container.innerHTML =
                    '<p class="p-4 text-center text-gray-500">Шаблоны не найдены.</p>';
                return;
            }
            const flatData = normalizeShablonyData(rawData);
            originalShablonyData = flatData;
            if (result.docId) {
                saveGoogleDocCache(result.docId, flatData);
            }
            renderStyledParagraphs(container, flatData);
            return;
        }

        // Default rendering
        renderParagraphs(container, result.data);
    });

    if (fragment.childNodes.length > 0) {
        container.appendChild(fragment);
    }
}

function resolveGoogleDocStatusElement(parentContainerId) {
    if (!parentContainerId || !parentContainerId.startsWith('doc-content-')) return null;
    const sectionId = parentContainerId.replace('doc-content-', '');
    return document.getElementById(`doc-status-${sectionId}`);
}

function updateGoogleDocStatusMessage(parentContainerId, status) {
    const statusEl = resolveGoogleDocStatusElement(parentContainerId);
    if (!statusEl) return;

    if (!status || !status.visible) {
        statusEl.className = 'hidden';
        statusEl.innerHTML = '';
        return;
    }

    statusEl.className =
        'mb-3 px-3 py-2 rounded-md border text-sm bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200';
    statusEl.innerHTML = `<i class="fas fa-database mr-1"></i>${escapeHtml(status.message)}`;
}

/**
 * Render paragraphs simply
 */
function renderParagraphs(container, data) {
    if (!data || data.length === 0) {
        container.innerHTML = '<p>Содержимое не найдено.</p>';
        return;
    }
    container.innerHTML = data.map((p) => `<div>${linkify(p)}</div>`).join('');
}

/**
 * Нормализует данные Шаблонов к плоскому массиву строк параграфов.
 * Если API возвращает блоки вида { heading/title, paragraphs/content }, преобразует в строки
 * с маркерами ⏩/➧/▸, чтобы renderStyledParagraphs выводил и заголовки, и содержимое.
 * @param {Array<string|Object>} rawData - result.data из API
 * @returns {Array<string>}
 */
export function normalizeShablonyData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) return rawData;
    const first = rawData[0];
    if (typeof first === 'string') return rawData;

    const markers = ['', '⏩ ', '➧ ', '▸ '];

    if (first && typeof first === 'object' && !Array.isArray(first)) {
        const out = [];
        const headingKeyHints = [
            'heading',
            'title',
            'name',
            'template',
            'заголовок',
            'название',
            'шаблон',
            'тема',
        ];

        for (const block of rawData) {
            let title = block.heading ?? block.title ?? '';
            let paras = block.paragraphs ?? block.content ?? block.body;

            // Поддержка табличного формата из Google Apps Script:
            // [{ "Название": "...", "Текст": "...", ... }, ...]
            if (!title && !paras && block && typeof block === 'object' && !Array.isArray(block)) {
                const entries = Object.entries(block).filter(([, value]) => {
                    const normalized = value == null ? '' : String(value).trim();
                    return normalized.length > 0;
                });

                if (entries.length > 0) {
                    const headingEntry = entries.find(([key]) =>
                        headingKeyHints.some((hint) => key.toLowerCase().includes(hint)),
                    );
                    if (headingEntry) {
                        title = String(headingEntry[1]).trim();
                        paras = entries
                            .filter(([key]) => key !== headingEntry[0])
                            .map(([key, value]) => `${key}: ${String(value).trim()}`);
                    } else {
                        title = String(entries[0][1]).trim();
                        paras = entries
                            .slice(1)
                            .map(([key, value]) => `${key}: ${String(value).trim()}`);
                    }
                }
            }

            const level = Math.min(Math.max(block.level ?? 1, 1), 3);
            const marker = markers[level] || '⏩ ';
            if (title) out.push(marker + String(title).trim());
            if (Array.isArray(paras)) {
                paras.forEach((p) => {
                    const s = String(p).trim();
                    if (s) out.push(s);
                });
            } else if (typeof paras === 'string' && paras.trim()) {
                out.push(paras.trim());
            }
        }
        return out;
    }

    if (first && typeof first === 'object' && 'text' in first) {
        const out = [];
        for (const item of rawData) {
            const t = item.text != null ? String(item.text).trim() : '';
            if (!t) continue;
            const type = (item.type || '').toLowerCase();
            if (type === 'heading' || type === 'title') {
                const level = Math.min(Math.max(item.level ?? 1, 1), 3);
                out.push((markers[level] || '⏩ ') + t);
            } else {
                out.push(t);
            }
        }
        return out;
    }

    const fallback = [];
    for (const item of rawData) {
        if (typeof item === 'string') {
            fallback.push(item);
        } else if (item && typeof item === 'object') {
            const t = item.text ?? item.title ?? item.heading ?? item.content ?? item.body;
            if (t != null) {
                const s =
                    typeof t === 'string'
                        ? t
                        : Array.isArray(t)
                          ? t.map(String).join('\n')
                          : String(t);
                if (s.trim()) fallback.push(s.trim());
            }
        }
    }
    return fallback.length ? fallback : rawData;
}

/**
 * Parse Shablony content into blocks (для поиска)
 */
export function parseShablonyContent(data) {
    if (!Array.isArray(data)) return [];

    const blocks = [];
    let currentBlock = null;

    const getHeaderLevel = (text) => {
        if (text.startsWith('⏩')) return 1;
        if (text.startsWith('➧')) return 2;
        if (text.startsWith('▸')) return 3;
        return 0;
    };

    data.forEach((p) => {
        const trimmedP = normalizeBrokenEntities(p).trim();
        if (trimmedP === '') return;

        const level = getHeaderLevel(trimmedP);

        if (level > 0) {
            if (currentBlock) {
                currentBlock.content = currentBlock.content.trim();
                blocks.push(currentBlock);
            }
            currentBlock = {
                title: trimmedP.slice(1).trim(),
                content: '',
                level: level,
                originalIndex: blocks.length,
            };
        } else if (currentBlock) {
            currentBlock.content += trimmedP + '\n';
        }
    });

    if (currentBlock) {
        currentBlock.content = currentBlock.content.trim();
        blocks.push(currentBlock);
    }

    if (blocks.length === 0) {
        const fallbackParagraphs = data
            .map((p) => normalizeBrokenEntities(String(p)).trim())
            .filter(Boolean);
        if (fallbackParagraphs.length > 0) {
            return [
                {
                    title: 'Шаблоны',
                    content: fallbackParagraphs.join('\n'),
                    level: 1,
                    originalIndex: 0,
                },
            ];
        }
    }

    return blocks;
}

/**
 * Восстанавливает плоский массив строк параграфов из разобранных блоков (для рендера после фильтрации).
 * @param {Array<{title: string, content: string, level?: number}>} blocks
 * @returns {Array<string>}
 */
function flattenShablonyBlocksToLines(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return [];
    const markers = ['', '⏩ ', '➧ ', '▸ '];
    const out = [];
    for (const block of blocks) {
        const level = Math.min(Math.max(block.level ?? 2, 1), 3);
        const marker = markers[level] || '➧ ';
        const title = (block.title || '').trim();
        if (title) out.push(marker + title);
        const content = block.content || '';
        for (const line of content.split('\n')) {
            const t = normalizeBrokenEntities(String(line)).trim();
            if (t) out.push(t);
        }
    }
    return out;
}

/**
 * Фильтрует шаблоны по запросу, сохраняя целостность блоков (строки разных шаблонов не смешиваются).
 * Построчный фильтр без учёта блоков ломал DOM: тело без заголовка присоединялось к предыдущему блоку.
 * @param {Array<string>} flatData
 * @param {string} query
 * @returns {Array<string>}
 */
export function filterShablonyDataByQuery(flatData, query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return flatData;
    if (!Array.isArray(flatData) || flatData.length === 0) return flatData;

    const blocks = parseShablonyContent(flatData);
    const matching = blocks.filter((block) => {
        const title = (block.title || '').toLowerCase();
        const body = (block.content || '').toLowerCase();
        return title.includes(q) || body.includes(q);
    });
    return flattenShablonyBlocksToLines(matching);
}

export const __googleDocsInternals = {
    normalizeShablonyData,
    filterShablonyDataByQuery,
    flattenShablonyBlocksToLines,
};

/**
 * Render styled paragraphs for Shablony (из старого проекта)
 */
function renderStyledParagraphs(container, data, searchQuery = '') {
    if (!container) {
        console.error('renderStyledParagraphs: Передан невалидный контейнер.');
        return;
    }

    const highlight = (text) => {
        if (!text || typeof text !== 'string') return '';
        text = normalizeBrokenEntities(text);
        if (!searchQuery) {
            return linkify ? linkify(decodeBasicEntitiesOnce(text)) : escapeHtml(text);
        }
        const highlighted = highlightTextInString
            ? highlightTextInString(text, searchQuery)
                  .replace(/<mark[^>]*>/g, '##MARK_START##')
                  .replace(/<\/mark>/g, '##MARK_END##')
            : text;
        const linked = linkify
            ? linkify(decodeBasicEntitiesOnce(highlighted))
            : escapeHtml(highlighted);
        return linked
            .replace(/##MARK_START##/g, '<mark class="search-term-highlight">')
            .replace(/##MARK_END##/g, '</mark>');
    };

    if (!data || data.length === 0) {
        if (searchQuery) {
            container.innerHTML = `<p class="text-gray-500">По запросу "${escapeHtml(searchQuery)}" ничего не найдено.</p>`;
        } else {
            container.innerHTML = '<p class="text-gray-500">Шаблоны не найдены.</p>';
        }
        return;
    }

    // Защитный контур визуализации: контент шаблонов не должен "пропадать"
    // из-за внешних тем/кастомных CSS-переопределений.
    container.style.color = 'var(--color-text-primary, #e5e7eb)';
    container.style.minHeight = '18rem';

    const fragment = document.createDocumentFragment();
    const normalizedData = (() => {
        const hasHeaders = data.some(
            (line) =>
                typeof line === 'string' &&
                (line.trim().startsWith('⏩') ||
                    line.trim().startsWith('➧') ||
                    line.trim().startsWith('▸')),
        );
        if (hasHeaders) return data;
        const plain = data.map((line) => (line == null ? '' : String(line).trim())).filter(Boolean);
        if (!plain.length) return data;
        return ['➧ Шаблоны', ...plain];
    })();
    let currentBlockWrapper = null;
    let blockIndex = -1;

    const createBlockWrapper = (index, level) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'shablony-block p-3 rounded-lg';
        wrapper.dataset.blockIndex = index;

        if (level === 2) {
            wrapper.classList.add(
                'transition-colors',
                'duration-200',
                'hover:bg-gray-100',
                'dark:hover:bg-gray-800/50',
                'copyable-block',
                'group',
            );
            wrapper.title = 'Нажмите, чтобы скопировать содержимое шаблона в буфер обмена';
            wrapper.style.cursor = 'pointer';
        }

        return wrapper;
    };

    normalizedData.forEach((p) => {
        const trimmedP = normalizeBrokenEntities(p).trim();
        if (trimmedP === '') return;

        let level = 0;
        if (trimmedP.startsWith('⏩')) level = 1;
        else if (trimmedP.startsWith('➧')) level = 2;
        else if (trimmedP.startsWith('▸')) level = 3;

        if (level > 0) {
            blockIndex++;
            currentBlockWrapper = createBlockWrapper(blockIndex, level);

            const headerTag = `h${level + 1}`;
            const header = document.createElement(headerTag);

            const classMap = {
                h2: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mt-6 mb-4 pb-2 border-gray-300 dark:border-gray-600 text-center',
                h3: 'text-xl font-bold text-gray-800 dark:text-gray-200 mt-5 mb-3',
                h4: 'text-lg font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2',
            };

            header.className = classMap[headerTag];
            header.innerHTML = highlight(trimmedP.slice(1).trim());
            header.style.color = 'var(--color-text-primary, #e5e7eb)';
            currentBlockWrapper.appendChild(header);
            fragment.appendChild(currentBlockWrapper);
        } else if (currentBlockWrapper) {
            if (
                trimmedP.startsWith('•') ||
                trimmedP.startsWith('* ') ||
                trimmedP.startsWith('- ')
            ) {
                let list = currentBlockWrapper.querySelector('ul');
                if (!list) {
                    list = document.createElement('ul');
                    list.className = 'list-disc list-inside space-y-1 mb-2 pl-4';
                    currentBlockWrapper.appendChild(list);
                }
                const li = document.createElement('li');
                li.innerHTML = highlight(trimmedP.slice(1).trim());
                li.style.color = 'var(--color-text-primary, #e5e7eb)';
                list.appendChild(li);
            } else {
                const pElem = document.createElement('p');
                pElem.className = 'mb-2';
                // Сначала экранирование/подсветка, затем *жирный* (иначе <strong> экранировался бы как текст)
                pElem.innerHTML = highlight(trimmedP).replace(/\*(.*?)\*/g, '<strong>$1</strong>');
                pElem.style.color = 'var(--color-text-primary, #e5e7eb)';
                currentBlockWrapper.appendChild(pElem);
            }
        }
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    const createSeparator = () => {
        const separator = document.createElement('div');
        separator.className = 'w-full h-px bg-gray-200 dark:bg-gray-700 my-4';
        return separator;
    };

    const blocksToSeparate = container.querySelectorAll('.shablony-block');
    blocksToSeparate.forEach((block, index) => {
        if (index < blocksToSeparate.length - 1) {
            block.after(createSeparator());
        }
    });
}

/**
 * Handle shablony search
 */
export function handleShablonySearch() {
    const searchInput = document.getElementById('shablony-search-input');
    const clearBtn = document.getElementById('shablony-search-clear-btn');
    const container = document.getElementById('doc-content-shablony');

    if (!searchInput || !container) return;

    const query = searchInput.value.trim().toLowerCase();

    if (clearBtn) {
        clearBtn.classList.toggle('hidden', query.length === 0);
    }

    if (!query) {
        renderStyledParagraphs(container, originalShablonyData);
        return;
    }

    const filteredData = filterShablonyDataByQuery(originalShablonyData, query);
    renderStyledParagraphs(container, filteredData, query);
}

// ============================================================================
// СВЯЗЬ С GOOGLE DOCS: состояние, залипающее уведомление, синхронизация, фоновый опрос
// ============================================================================

const GDOCS_LAST_SUCCESS_KEY = 'copilot1co:gdocs-last-success';
export const GDOCS_ERROR_NOTIFICATION_ID = 'gdocs-connection-error';
export const GOOGLE_DOCS_POLL_INTERVAL_MS = DEFAULT_POLL_INTERVAL_MS;

function readLastSuccess() {
    try {
        return Number(localStorage.getItem(GDOCS_LAST_SUCCESS_KEY)) || 0;
    } catch {
        return 0;
    }
}
function writeLastSuccess(ts) {
    try {
        localStorage.setItem(GDOCS_LAST_SUCCESS_KEY, String(ts));
    } catch {
        /* localStorage недоступен — не критично */
    }
}

const gdocsConnection = {
    /** unknown | syncing | ok | error */
    status: 'unknown',
    lastSuccessAt: readLastSuccess(),
    lastAttemptAt: 0,
    lastError: null,
    lastErrorMessage: '',
    lastReason: '',
    consecutiveFailures: 0,
    usingCache: false,
};
const gdocsListeners = new Set();
let gdocsErrorDismissedByUser = false;
let gdocsPoller = null;
let gdocsSyncInFlight = null;
let lastRenderedSignature = '';

export function getGoogleDocsConnectionState() {
    return { ...gdocsConnection, poller: gdocsPoller ? gdocsPoller.getState() : null };
}
export function subscribeGoogleDocsConnection(fn) {
    gdocsListeners.add(fn);
    return () => gdocsListeners.delete(fn);
}
function emitConnection() {
    updateConnectionChip();
    for (const fn of gdocsListeners) {
        try {
            fn(getGoogleDocsConnectionState());
        } catch {
            /* слушатели не должны ломать синхронизацию */
        }
    }
}

function formatClock(ts) {
    try {
        return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function describeErrorShort(info) {
    switch (info?.kind) {
        case 'offline':
            return 'Нет подключения к интернету.';
        case 'timeout':
            return 'Сервер Google не ответил вовремя.';
        case 'http':
            return `Сервер Google вернул ошибку${info.status ? ` HTTP ${info.status}` : ''}.`;
        case 'parse':
            return 'Сервер вернул данные в неожиданном формате.';
        case 'server':
            return 'Скрипт Google Docs сообщил об ошибке.';
        case 'format':
            return 'Ответ сервера имеет неожиданную структуру.';
        default:
            return 'Сервер Google недоступен (возможно, заблокирован сетью).';
    }
}

/** Залипающая карточка об ошибке связи: без таймера, с кнопками «Повторить» и «Диагностика». */
function showConnectionErrorCard(info, rawMessage, { forceShow }) {
    const NS = NotificationService;
    if (!NS) return;
    const exists = NS.has(GDOCS_ERROR_NOTIFICATION_ID);
    if (!exists && gdocsErrorDismissedByUser && !forceShow) return;
    if (forceShow) gdocsErrorDismissedByUser = false;
    const last = gdocsConnection.lastSuccessAt;
    const cacheNote = loadGoogleDocCacheEntry(SHABLONY_DOC_ID)
        ? ' Раздел «Шаблоны» показывает сохранённую копию.'
        : '';
    const message =
        `${describeErrorShort(info)}${cacheNote} ` +
        (last
            ? `Последнее обновление: ${formatClock(last)}. `
            : 'Успешных обновлений в этом профиле ещё не было. ') +
        'Приложение повторит попытку автоматически (раз в 5 минут и сразу при появлении сети).';
    NS.show({
        id: GDOCS_ERROR_NOTIFICATION_ID,
        type: 'error',
        title: 'Нет связи с Google Docs',
        message,
        sticky: true,
        dedupe: false,
        isDismissible: true,
        onDismiss: () => {
            gdocsErrorDismissedByUser = true;
        },
        actions: [
            {
                id: 'gdocs-retry',
                label: 'Повторить',
                icon: 'fa-sync-alt',
                onClick: () => {
                    syncGoogleDocsNow({ reason: 'manual', force: true, interactive: true }).catch(
                        () => {},
                    );
                },
            },
        ],
        diagnostics: {
            title: 'Google Docs / Шаблоны',
            message: rawMessage,
            layer: 'external',
            system: 'external',
            source: 'google-docs',
            errorInfo: info,
            details: {
                lastSuccessAt: last ? new Date(last).toISOString() : 'никогда',
                consecutiveFailures: gdocsConnection.consecutiveFailures,
                trigger: gdocsConnection.lastReason,
            },
        },
    });
}

function recordSyncFailure(error, { reason, usingCache }) {
    const info = buildGoogleDocsErrorInfo(error);
    const raw = error?.message || String(error);
    const wasOk = gdocsConnection.status !== 'error';
    gdocsConnection.status = 'error';
    gdocsConnection.lastError = info;
    gdocsConnection.lastErrorMessage = raw;
    gdocsConnection.lastReason = reason;
    gdocsConnection.lastAttemptAt = Date.now();
    gdocsConnection.consecutiveFailures += 1;
    gdocsConnection.usingCache = Boolean(usingCache);
    const forceShow = reason !== 'interval' && !String(reason).startsWith('catchup');
    // Фоновые повторы не «воскрешают» карточку, закрытую пользователем, но обновляют видимую
    showConnectionErrorCard(info, raw, { forceShow: forceShow || wasOk });
    emitConnection();
}

function recordSyncSuccess({ reason, usingCache = false }) {
    const wasError = gdocsConnection.status === 'error';
    gdocsConnection.status = 'ok';
    gdocsConnection.lastError = null;
    gdocsConnection.lastErrorMessage = '';
    gdocsConnection.lastReason = reason;
    gdocsConnection.lastAttemptAt = Date.now();
    gdocsConnection.consecutiveFailures = 0;
    gdocsConnection.usingCache = usingCache;
    gdocsConnection.lastSuccessAt = Date.now();
    writeLastSuccess(gdocsConnection.lastSuccessAt);
    gdocsErrorDismissedByUser = false;
    NotificationService?.dismiss(GDOCS_ERROR_NOTIFICATION_ID);
    if (wasError) {
        NotificationService?.show({
            id: 'gdocs-connection-restored',
            type: 'success',
            message: 'Связь с Google Docs восстановлена, данные обновлены.',
            duration: 3500,
        });
    }
    // ручной/стартовый успех сдвигает штатный срок; плановые циклы расписание уже учли сами
    if (reason !== 'interval' && !String(reason).startsWith('catchup')) gdocsPoller?.markRun(true);
    emitConnection();
}

function updateConnectionChip() {
    const chip = document.getElementById('gdocs-connection-chip');
    if (!chip) return;
    const c = gdocsConnection;
    let text;
    let state;
    if (c.status === 'syncing') {
        text = 'Синхронизация…';
        state = 'syncing';
    } else if (c.status === 'error') {
        text = 'Нет связи с Google Docs';
        state = 'error';
    } else if (c.status === 'ok') {
        const mins = Math.floor((Date.now() - c.lastSuccessAt) / 60000);
        text = mins < 1 ? 'Google Docs: обновлено только что' : `Google Docs: обновлено ${mins} мин назад`;
        state = 'ok';
    } else {
        text = 'Google Docs: ожидание';
        state = 'unknown';
    }
    chip.dataset.state = state;
    const label = chip.querySelector('.gdocs-chip__text');
    if (label) label.textContent = text;
    chip.title =
        state === 'error'
            ? 'Нажмите, чтобы открыть диагностику связи'
            : 'Автообновление: раз в 5 минут (при открытой вкладке и наличии сети)';
}

/**
 * Зонды связности для самодиагностики: локальный сервер, внешний хост, реальный запрос к скрипту.
 */
export async function runGoogleDocsConnectivityProbes({ withEndpoint = false } = {}) {
    const timed = async (label, fn, ms = 6000) => {
        const t0 = performance.now();
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const tid = setTimeout(() => ctl?.abort(), ms);
        try {
            await fn(ctl?.signal);
            return { label, ok: true, ms: performance.now() - t0 };
        } catch (err) {
            return {
                label,
                ok: false,
                ms: performance.now() - t0,
                error: err?.name === 'AbortError' ? 'таймаут' : err?.message || String(err),
            };
        } finally {
            clearTimeout(tid);
        }
    };
    const sameOrigin = await timed('Локальный сервер приложения', (signal) =>
        fetch(`${location.origin}${location.pathname}`, {
            method: 'HEAD',
            cache: 'no-store',
            signal,
        }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
        }),
    );
    const external = await timed('Хост script.google.com', (signal) =>
        fetch('https://script.google.com/', { mode: 'no-cors', cache: 'no-store', signal }),
    );
    const probes = { sameOrigin, external };
    if (withEndpoint) {
        probes.endpoint = await timed(
            'Запрос к скрипту Google Docs',
            () =>
                requestGoogleDocJson(
                    `${GOOGLE_DOC_BASE_URL}?docIds=${encodeURIComponent(SHABLONY_DOC_ID)}&v=${Date.now()}`,
                    { force: true, retryDelays: [] },
                ),
            15000,
        );
    }
    return probes;
}

function updateShablonySearchIndex(docId, results) {
    if (typeof window.updateSearchIndex !== 'function') return Promise.resolve();
    if (docId !== SHABLONY_DOC_ID) return Promise.resolve();
    try {
        const rawData = results[0]?.data || results[0]?.content?.data || [];
        const normalized = normalizeShablonyData(rawData).map((line) => String(line));
        const blocks = parseShablonyContent(normalized);
        return Promise.resolve(window.updateSearchIndex('shablony', docId, blocks, 'update')).catch(
            (indexError) => console.error('Ошибка индексации для shablony:', indexError),
        );
    } catch (indexError) {
        console.error('Ошибка индексации для shablony:', indexError);
        return Promise.resolve();
    }
}

function dataSignature(results) {
    try {
        const raw = results?.[0]?.data || results?.[0]?.content?.data || [];
        const str = JSON.stringify(raw);
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return `${str.length}:${h}`;
    } catch {
        return String(Date.now());
    }
}

function setRefreshButtonBusy(busy) {
    const btn = document.getElementById('force-refresh-shablony-btn');
    if (!btn) return;
    btn.disabled = busy;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    const icon = btn.querySelector('i');
    if (icon) icon.classList.toggle('fa-spin', busy);
}

/**
 * Единый конвейер синхронизации «Шаблонов» (ручной, стартовый, фоновый, диагностика).
 * Single-flight: параллельные вызовы присоединяются к текущему запросу.
 * @param {{ reason?: string, force?: boolean, interactive?: boolean, docId?: string, containerId?: string }} [opts]
 * @returns {Promise<{ ok: boolean, changed?: boolean, error?: object, errorInfo?: object, usingCache?: boolean }>}
 */
export function syncGoogleDocsNow(opts = {}) {
    if (gdocsSyncInFlight) return gdocsSyncInFlight;
    const reason = opts.reason || 'manual';
    const docId = opts.docId || SHABLONY_DOC_ID;
    const containerId = opts.containerId || 'doc-content-shablony';
    const force = opts.force !== false;
    const background = reason === 'interval' || String(reason).startsWith('catchup');

    gdocsSyncInFlight = (async () => {
        const prevStatus = gdocsConnection.status;
        gdocsConnection.status = 'syncing';
        gdocsConnection.lastReason = reason;
        emitConnection();
        setRefreshButtonBusy(true);
        try {
            let results;
            let thrown = null;
            try {
                results = await fetchGoogleDocs([docId], force, {
                    retryDelays: background
                        ? GOOGLE_DOC_BACKGROUND_RETRY_DELAYS_MS
                        : GOOGLE_DOC_RETRY_DELAYS_MS,
                });
            } catch (err) {
                thrown = err;
            }
            const hasData =
                Array.isArray(results) &&
                results.some((item) => {
                    const arr = item?.data || item?.content?.data;
                    return Array.isArray(arr) && arr.length > 0 && !item.error;
                });

            if (thrown || !hasData) {
                const errItem = Array.isArray(results) ? results.find((r) => r?.error) : null;
                let error = thrown;
                if (!error) {
                    error = new GoogleDocsError(errItem?.error || 'Документ не содержит данных', {
                        kind: errItem?.errorInfo?.kind || 'format',
                        status: errItem?.errorInfo?.status ?? null,
                        attempts: errItem?.errorInfo?.attempts ?? null,
                        chain: errItem?.errorInfo?.chain || '',
                        url: errItem?.errorInfo?.url || '',
                    });
                }
                // Пустой, но успешный ответ — не сбой связи
                if (!thrown && !errItem && Array.isArray(results)) {
                    gdocsConnection.status = prevStatus === 'syncing' ? 'ok' : prevStatus;
                    recordSyncSuccess({ reason });
                    return { ok: true, changed: false, empty: true };
                }
                const cached = loadGoogleDocCacheEntry(docId);
                recordSyncFailure(error, { reason, usingCache: Boolean(cached) });
                return {
                    ok: false,
                    error,
                    errorInfo: buildGoogleDocsErrorInfo(error),
                    usingCache: Boolean(cached),
                };
            }

            // Успех: перерисовываем только при изменении контента (без мерцания и сброса прокрутки)
            const sig = dataSignature(results);
            const container = document.getElementById(containerId);
            const hasBlocks = Boolean(container?.querySelector('.shablony-block'));
            const changed = sig !== lastRenderedSignature || (container && !hasBlocks);
            State.googleDocTimestamps = State.googleDocTimestamps || new Map();
            State.googleDocTimestamps.set(docId, Date.now());
            if (changed) {
                lastRenderedSignature = sig;
                const scroller = container;
                const prevScroll = scroller ? scroller.scrollTop : 0;
                if (container) {
                    updateGoogleDocStatusMessage(containerId, { visible: false, message: '' });
                    renderGoogleDocContent(results, container, containerId);
                    if (scroller) scroller.scrollTop = prevScroll;
                    const inp = document.getElementById('shablony-search-input');
                    if (inp?.value?.trim()) handleShablonySearch();
                } else {
                    const raw = results[0]?.data || results[0]?.content?.data || [];
                    originalShablonyData = normalizeShablonyData(raw);
                    saveGoogleDocCache(docId, originalShablonyData);
                }
                await updateShablonySearchIndex(docId, results);
                if (background && prevStatus !== 'unknown') {
                    NotificationService?.show({
                        id: 'gdocs-content-updated',
                        type: 'info',
                        message: 'Шаблоны обновлены из Google Docs.',
                        duration: 3500,
                    });
                }
            } else if (container) {
                updateGoogleDocStatusMessage(containerId, { visible: false, message: '' });
            }
            updateRefreshButtonTimestamps();
            recordSyncSuccess({ reason });
            return { ok: true, changed: Boolean(changed) };
        } finally {
            setRefreshButtonBusy(false);
            gdocsSyncInFlight = null;
        }
    })();
    return gdocsSyncInFlight;
}

/** Проверка связи для самодиагностики: реальная попытка + зонды; обновляет карточку об ошибке. */
export async function checkGoogleDocsConnection() {
    const res = await syncGoogleDocsNow({ reason: 'diagnostics', force: true });
    const probes = res.ok ? null : await runGoogleDocsConnectivityProbes();
    return { ...res, probes, state: getGoogleDocsConnectionState() };
}

/** Запускает фоновый опрос (раз в 5 минут); идемпотентно. */
export function startGoogleDocsBackgroundSync() {
    if (gdocsPoller) return gdocsPoller;
    gdocsPoller = createBackgroundPoller({
        intervalMs: GOOGLE_DOCS_POLL_INTERVAL_MS,
        task: ({ reason }) => syncGoogleDocsNow({ reason, force: true }),
    });
    gdocsPoller.start();
    if (typeof window !== 'undefined') window.__gdocsPoller = gdocsPoller;
    return gdocsPoller;
}

export function getGoogleDocsPollerState() {
    return gdocsPoller ? gdocsPoller.getState() : null;
}

/**
 * Load and render Google Doc (первичная загрузка и ручное обновление; с индикатором и HUD)
 */
export async function loadAndRenderGoogleDoc(docId, targetContainerId, force = false) {
    const docContainer = document.getElementById(targetContainerId);
    if (!docContainer) {
        console.error(`КРИТИЧЕСКАЯ ОШИБКА: HTML-элемент #${targetContainerId} не найден.`);
        return;
    }
    const hasRendered = Boolean(docContainer.querySelector('.shablony-block'));
    if (!hasRendered) {
        docContainer.innerHTML =
            '<div class="text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Загрузка данных из Google-дока...</div>';
    }

    const hudId = `gdoc-${targetContainerId}`;
    const humanLabel = targetContainerId === 'doc-content-shablony' ? 'Шаблоны' : 'Документ';
    const hud = window.BackgroundStatusHUD;
    const hudOk = hud && typeof hud.startTask === 'function';
    if (hudOk) {
        hud.startTask(hudId, humanLabel, { weight: 0.4, total: 4 });
        hud.updateTask(hudId, 1, 4);
    }

    const reason = force ? 'manual' : 'startup';
    let outcome;
    try {
        outcome = await syncGoogleDocsNow({ reason, force, docId, containerId: targetContainerId });
    } catch (error) {
        outcome = { ok: false, error };
    }

    if (outcome.ok) {
        if (hudOk) hud.updateTask(hudId, 4, 4);
        if (hudOk) hud.finishTask(hudId, true);
        return;
    }

    // Ошибка: показываем кэш, если он есть, иначе — блок ошибки с «Повторить» и «Диагностика»
    const error = outcome.error;
    const message = error instanceof Error ? error.message : String(error);
    const isNetwork = /сеть|интернет|fetch|Failed|network|ERR_/i.test(message);
    if (isNetwork) {
        console.warn(`Документ ${targetContainerId} не загружен (нет сети):`, message);
    } else {
        console.warn(`Документ ${targetContainerId} не загружен:`, message);
    }
    const cachedEntry = loadGoogleDocCacheEntry(docId);
    if (cachedEntry?.data?.length) {
        const ageMin = cachedEntry.ts
            ? Math.max(1, Math.floor((Date.now() - cachedEntry.ts) / 60000))
            : null;
        updateGoogleDocStatusMessage(targetContainerId, {
            visible: true,
            message: ageMin
                ? `Показаны сохранённые данные (обновлены ~${ageMin} мин назад): нет связи с Google Docs.`
                : 'Показаны сохранённые данные из последней успешной загрузки: нет связи с Google Docs.',
        });
        if (!docContainer.querySelector('.shablony-block')) {
            const cachedResults = [
                {
                    docId,
                    status: 'cached',
                    content: { type: 'paragraphs', data: cachedEntry.data },
                    data: cachedEntry.data,
                    error: null,
                },
            ];
            renderGoogleDocContent(cachedResults, docContainer, targetContainerId);
            lastRenderedSignature = dataSignature(cachedResults);
            await updateShablonySearchIndex(docId, cachedResults);
        }
    } else {
        updateGoogleDocStatusMessage(targetContainerId, { visible: false, message: '' });
        const userMessage = isNetwork
            ? 'Не удалось загрузить документ. Проверьте подключение к интернету.'
            : message.replace(/\s*\[chain=.*\]\s*$/, '');
        docContainer.innerHTML =
            '<div class="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded gdocs-error-block">' +
            '<p>' +
            escapeHtml(userMessage) +
            '</p>' +
            '<div class="flex flex-wrap gap-2 mt-2">' +
            '<button type="button" class="px-3 py-1 rounded bg-red-200 dark:bg-red-800 hover:bg-red-300 dark:hover:bg-red-700" data-retry-doc="' +
            escapeHtml(docId) +
            '" data-retry-target="' +
            escapeHtml(targetContainerId) +
            '">Повторить</button>' +
            '<button type="button" class="px-3 py-1 rounded bg-red-200 dark:bg-red-800 hover:bg-red-300 dark:hover:bg-red-700" data-gdocs-diagnose="1"><i class="fas fa-stethoscope mr-1" aria-hidden="true"></i>Диагностика</button>' +
            '</div></div>';
        docContainer.querySelector('[data-retry-doc]')?.addEventListener('click', function () {
            const doc = this.getAttribute('data-retry-doc');
            const target = this.getAttribute('data-retry-target');
            if (doc && target) loadAndRenderGoogleDoc(doc, target, true);
        });
        docContainer.querySelector('[data-gdocs-diagnose]')?.addEventListener('click', () => {
            openGoogleDocsDiagnostics();
        });
    }
    if (hudOk) hud.finishTask(hudId, false);
}

/** Открывает режим диагностики с контекстом последней ошибки связи с Google Docs. */
export function openGoogleDocsDiagnostics() {
    const c = gdocsConnection;
    const ctx = {
        source: 'google-docs',
        type: 'error',
        title: 'Google Docs / Шаблоны',
        message: c.lastErrorMessage || 'Состояние связи: ' + c.status,
        layer: 'external',
        system: 'external',
        errorInfo: c.lastError || { service: 'google-docs', kind: 'unknown' },
        details: { lastSuccessAt: c.lastSuccessAt ? new Date(c.lastSuccessAt).toISOString() : 'никогда' },
        ts: Date.now(),
    };
    const open = window.CopilotDiagnostics?.openForIssue || window.openDiagnosticsForIssue;
    if (typeof open === 'function') open(ctx);
    else NotificationService.diagnosticsHandler?.(ctx);
}

/**
 * Initialize Google Doc sections
 */
export function initGoogleDocSections() {
    const appContent = document.getElementById('appContent');
    if (!appContent) {
        console.error(
            'КРИТИЧЕСКАЯ ОШИБКА (initGoogleDocSections): контейнер #appContent не найден.',
        );
        return;
    }

    let mainContentArea = appContent.querySelector(':scope > main[data-app-main="true"]');
    if (!mainContentArea) {
        const directMain = appContent.querySelector(':scope > main');
        if (directMain) {
            mainContentArea = directMain;
            mainContentArea.dataset.appMain = 'true';
        }
    }
    if (!mainContentArea) {
        console.debug(
            '[initGoogleDocSections] Тег <main> внутри #appContent не найден, создаю динамически.',
        );
        mainContentArea = document.createElement('main');
        mainContentArea.dataset.appMain = 'true';
        mainContentArea.className = 'flex-grow p-4 overflow-y-auto custom-scrollbar';
        const staticHeaderWrapper = appContent.querySelector('#staticHeaderWrapper');
        if (staticHeaderWrapper) {
            appContent.insertBefore(mainContentArea, staticHeaderWrapper.nextSibling);
        } else {
            appContent.appendChild(mainContentArea);
        }
        const tabContents = Array.from(appContent.children).filter((node) =>
            node.classList?.contains('tab-content'),
        );
        tabContents.forEach((content) => mainContentArea.appendChild(content));
    }

    const debouncedShablonySearch =
        typeof debounce === 'function' ? debounce(handleShablonySearch, 300) : handleShablonySearch;

    GOOGLE_DOC_SECTIONS.forEach((section) => {
        const existingSection = document.getElementById(`${section.id}Content`);
        if (existingSection && existingSection.parentElement !== mainContentArea) {
            // Self-heal: секция могла попасть во вложенный/скрытый <main> (например, модалки).
            mainContentArea.appendChild(existingSection);
        }

        if (!existingSection) {
            const tabContentDiv = document.createElement('div');
            tabContentDiv.id = `${section.id}Content`;
            tabContentDiv.className = 'tab-content hidden';
            tabContentDiv.innerHTML = `
                <div class="p-4 bg-gray-100 dark:bg-gray-800 min-h-[60vh] flex flex-col">
                    <div class="flex-shrink-0 flex flex-wrap gap-y-2 justify-between items-center mb-4">
                         <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-200">${section.title}</h2>
                         <div class="flex items-center gap-2 flex-wrap">
                             <button type="button" id="gdocs-connection-chip" class="gdocs-chip" data-state="unknown" aria-live="polite">
                                 <span class="gdocs-chip__dot" aria-hidden="true"></span><span class="gdocs-chip__text">Google Docs: ожидание</span>
                             </button>
                             <button id="force-refresh-${section.id}-btn" class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors" title="Принудительно обновить данные с сервера">
                                 <i class="fas fa-sync-alt mr-2"></i>Обновить<span class="update-timestamp ml-1"></span>
                             </button>
                         </div>
                    </div>
                    <div class="relative mb-4 flex-shrink-0">
                        <input type="text" id="${section.id}-search-input" placeholder="Поиск по разделу..." class="w-full pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100">
                        <button id="${section.id}-search-clear-btn" class="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-white-700 hidden" title="Очистить поиск">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="doc-status-${section.id}" class="hidden"></div>
                    <div id="doc-content-${section.id}" class="overflow-y-auto bg-white dark:bg-gray-900 rounded-lg shadow p-4 custom-scrollbar min-h-[28rem]">
                        Загрузка данных из Google-дока...
                    </div>
                </div>
            `;
            mainContentArea.appendChild(tabContentDiv);

            document.getElementById('gdocs-connection-chip')?.addEventListener('click', () => {
                if (gdocsConnection.status === 'error') openGoogleDocsDiagnostics();
                else syncGoogleDocsNow({ reason: 'manual', force: true, interactive: true }).catch(() => {});
            });
            updateConnectionChip();

            const refreshButton = document.getElementById(`force-refresh-${section.id}-btn`);
            if (refreshButton) {
                refreshButton.addEventListener('click', () => {
                    console.log(
                        `Нажата кнопка принудительного обновления для раздела '${section.id}'. Запрос свежих данных...`,
                    );
                    loadAndRenderGoogleDoc(section.docId, `doc-content-${section.id}`, true);
                });
            }

            const searchInput = document.getElementById(`${section.id}-search-input`);
            const clearBtn = document.getElementById(`${section.id}-search-clear-btn`);

            if (searchInput) {
                searchInput.addEventListener('input', debouncedShablonySearch);
            }
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    handleShablonySearch();
                });
            }

            if (section.id === 'shablony') {
                const docContainer = document.getElementById(`doc-content-${section.id}`);
                if (docContainer && typeof window.copyToClipboard === 'function') {
                    docContainer.addEventListener('click', (event) => {
                        const block = event.target.closest('.shablony-block');
                        if (!block) return;

                        if (event.target.closest('a')) {
                            return;
                        }

                        const textToCopy = block.innerText;
                        if (textToCopy) {
                            window.copyToClipboard(textToCopy, 'Содержимое шаблона скопировано!');
                        }
                    });
                }
                if (docContainer) {
                    docContainer.style.color = 'var(--color-text-primary, #e5e7eb)';
                    docContainer.style.minHeight = '18rem';
                    docContainer.style.display = 'block';
                    docContainer.style.visibility = 'visible';
                }
            }

            console.log(`Инициирую начальную загрузку для раздела '${section.id}'.`);
            loadAndRenderGoogleDoc(section.docId, `doc-content-${section.id}`, false).catch((err) =>
                console.error(`Ошибка при начальной загрузке ${section.id}:`, err),
            );
        }
    });

    startTimestampUpdater();
    startGoogleDocsBackgroundSync();
    console.log(
        '[initGoogleDocSections] Функция завершена, загрузка инициирована, таймер запущен.',
    );
}

// Export for window access (backward compatibility)
if (typeof window !== 'undefined') {
    window.initGoogleDocSections = initGoogleDocSections;
    window.loadAndRenderGoogleDoc = loadAndRenderGoogleDoc;
    window.renderGoogleDocContent = renderGoogleDocContent;
    window.fetchGoogleDocs = fetchGoogleDocs;
    window.handleShablonySearch = handleShablonySearch;
    window.syncGoogleDocsNow = syncGoogleDocsNow;
    window.checkGoogleDocsConnection = checkGoogleDocsConnection;
    window.getGoogleDocsConnectionState = getGoogleDocsConnectionState;
    window.parseShablonyContent = parseShablonyContent;
}
