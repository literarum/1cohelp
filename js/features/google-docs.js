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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
            () => reject(new Error('Превышено время ожидания загрузки документа.')),
            timeoutMs,
        );
    });
    const response = await Promise.race([fetch(requestUrl), timeoutError]);
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
    if (!response?.ok) {
        throw new Error(`Ошибка загрузки: статус ${response?.status ?? 'unknown'}`);
    }
    return await response.json();
}

function requestJsonViaXhr(requestUrl, timeoutMs) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', requestUrl, true);
        xhr.timeout = timeoutMs;
        xhr.responseType = 'text';

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(`Ошибка загрузки: статус ${xhr.status}`));
                return;
            }
            try {
                resolve(JSON.parse(xhr.responseText || '[]'));
            } catch (error) {
                reject(new Error(`Ошибка разбора JSON: ${error.message || String(error)}`));
            }
        };
        xhr.onerror = () => reject(new Error('Ошибка сети при загрузке документа.'));
        xhr.ontimeout = () => reject(new Error('Превышено время ожидания загрузки документа.'));
        xhr.onabort = () => reject(new Error('Запрос загрузки документа был прерван.'));
        xhr.send();
    });
}

async function requestGoogleDocJson(requestUrl) {
    const errors = [];

    for (let attempt = 0; attempt < GOOGLE_DOC_RETRY_DELAYS_MS.length + 1; attempt++) {
        try {
            return await requestJsonViaFetch(requestUrl, GOOGLE_DOC_REQUEST_TIMEOUT_MS);
        } catch (error) {
            errors.push(`fetch:${error?.message || String(error)}`);
            const hasMoreAttempts = attempt < GOOGLE_DOC_RETRY_DELAYS_MS.length;
            if (!hasMoreAttempts) break;
            await sleep(GOOGLE_DOC_RETRY_DELAYS_MS[attempt]);
        }
    }

    try {
        return await requestJsonViaXhr(requestUrl, GOOGLE_DOC_REQUEST_TIMEOUT_MS);
    } catch (error) {
        errors.push(`xhr:${error?.message || String(error)}`);
        throw new Error(
            `${normalizeNetworkError(error)} [chain=${errors
                .map((e) => e.replace(/\s+/g, ' ').trim())
                .join(' | ')}]`,
        );
    }
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
export async function fetchGoogleDocs(docIds, force = false) {
    if (!Array.isArray(docIds) || docIds.length === 0) {
        console.error(
            'КРИТИЧЕСКАЯ ОШИБКА: В функцию fetchGoogleDocs не передан массив ID документов.',
        );
        return [];
    }

    const BASE_URL =
        'https://script.google.com/macros/s/AKfycby5ak0hPZF7_YJnhqYD8g1M2Ck6grzq11mpKqPFIWaX9_phJe5H_97cXmnClXKg1Nrl/exec';
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
        throw new Error('Нет подключения к интернету. Включите сеть и повторите попытку.');
    }

    try {
        const results = await requestGoogleDocJson(requestUrl);
        console.log(
            '[fetchGoogleDocs] Получен ответ от API:',
            results,
            'Тип:',
            typeof results,
            'Является массивом:',
            Array.isArray(results),
        );
        if (results.error) {
            throw new Error(`Ошибка от сервера: ${results.message}`);
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
        return docIds.map((id) => ({ docId: id, data: [], error: 'Неверный формат ответа' }));
    } catch (error) {
        const message = error?.message || String(error);
        const isNetworkError = /интернет|сеть|fetch|failed|network|socket|err_/i.test(message);
        if (isNetworkError) {
            console.warn(`Ошибка при загрузке документов: ${message}`);
        } else {
            console.error(`Ошибка при загрузке документов: ${message}`);
        }
        return docIds.map((id) => ({ docId: id, data: [], error: error.message }));
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
            errorDiv.className = 'p-4 bg-red-100 text-red-700 rounded';
            errorDiv.textContent = `Ошибка загрузки: ${result.error}`;
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
                pElem.innerHTML = highlight(trimmedP.replace(/\*(.*?)\*/g, '<strong>$1</strong>'));
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

/**
 * Load and render Google Doc
 */
export async function loadAndRenderGoogleDoc(docId, targetContainerId, force = false) {
    const docContainer = document.getElementById(targetContainerId);
    if (!docContainer) {
        console.error(`КРИТИЧЕСКАЯ ОШИБКА: HTML-элемент #${targetContainerId} не найден.`);
        return;
    }

    docContainer.innerHTML =
        '<div class="text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Загрузка данных из Google-дока...</div>';
    console.log(
        `[ШАГ 1] Инициализация... Запрос для ID: ${docId}. Принудительное обновление: ${force}`,
    );

    const hudId = `gdoc-${targetContainerId}`;
    const humanLabel = targetContainerId === 'doc-content-shablony' ? 'Шаблоны' : 'Документ';

    let hudTaskStarted = false;
    if (window.BackgroundStatusHUD && typeof window.BackgroundStatusHUD.startTask === 'function') {
        window.BackgroundStatusHUD.startTask(hudId, humanLabel, { weight: 0.4, total: 4 });
        window.BackgroundStatusHUD.updateTask(hudId, 0, 4);
        hudTaskStarted = true;
    }

    try {
        let results = await fetchGoogleDocs([docId], force);
        let statusMessage = { visible: false, message: '' };
        const hasUsableData = Array.isArray(results)
            ? results.some((item) => {
                  const arr = item?.data || item?.content?.data;
                  return Array.isArray(arr) && arr.length > 0;
              })
            : false;
        const allHaveErrors =
            Array.isArray(results) &&
            results.length > 0 &&
            results.every((item) => Boolean(item?.error));

        if (!hasUsableData && allHaveErrors) {
            const cachedEntry = loadGoogleDocCacheEntry(docId);
            const cachedData = cachedEntry?.data || [];
            if (cachedData.length > 0) {
                console.warn(
                    `[google-docs] Использую кэш для документа ${docId} из-за сетевой ошибки.`,
                );
                const cacheAgeMinutes =
                    cachedEntry?.ts && Number.isFinite(cachedEntry.ts)
                        ? Math.max(1, Math.floor((Date.now() - cachedEntry.ts) / 60000))
                        : null;
                statusMessage = {
                    visible: true,
                    message: cacheAgeMinutes
                        ? `Показаны кэшированные данные (обновлены ~${cacheAgeMinutes} мин назад).`
                        : 'Показаны кэшированные данные из последней успешной загрузки.',
                };
                results = [
                    {
                        docId,
                        status: 'cached',
                        content: { type: 'paragraphs', data: cachedData },
                        data: cachedData,
                        error: null,
                        message: 'Показаны кэшированные данные из последней успешной загрузки.',
                    },
                ];
            }
        }

        if (
            window.BackgroundStatusHUD &&
            typeof window.BackgroundStatusHUD.updateTask === 'function'
        ) {
            window.BackgroundStatusHUD.updateTask(hudId, 2, 4);
        }

        // Update timestamp
        if (!State.googleDocTimestamps) {
            State.googleDocTimestamps = new Map();
        }
        State.googleDocTimestamps.set(docId, Date.now());

        updateGoogleDocStatusMessage(targetContainerId, statusMessage);
        renderGoogleDocContent(results, docContainer, targetContainerId);

        if (targetContainerId === 'doc-content-shablony') {
            queueMicrotask(() => {
                const inp = document.getElementById('shablony-search-input');
                if (inp?.value?.trim()) {
                    handleShablonySearch();
                }
            });
        }

        if (
            window.BackgroundStatusHUD &&
            typeof window.BackgroundStatusHUD.updateTask === 'function'
        ) {
            window.BackgroundStatusHUD.updateTask(hudId, 4, 4);
        }

        console.log(
            `УСПЕХ: Содержимое Google Doc (ID: ${docId}) отображено в #${targetContainerId}.`,
        );

        // Update search index if available
        if (typeof window.updateSearchIndex === 'function') {
            const sectionId = targetContainerId.replace('doc-content-', '');
            console.log(`[ИНДЕКСАЦИЯ] Запуск updateSearchIndex для ${sectionId} (ID: ${docId}).`);
            try {
                if (docId === SHABLONY_DOC_ID && sectionId === 'shablony') {
                    const rawData = results[0]?.data || results[0]?.content?.data || [];
                    const normalized = normalizeShablonyData(rawData).map((line) => String(line));
                    const blocks = parseShablonyContent(normalized);
                    await window.updateSearchIndex('shablony', docId, blocks, 'update');
                }
            } catch (indexError) {
                console.error(`Ошибка индексации для ${sectionId}:`, indexError);
            }
        }

        // Завершаем задачу после успешной загрузки
        if (
            hudTaskStarted &&
            window.BackgroundStatusHUD &&
            typeof window.BackgroundStatusHUD.finishTask === 'function'
        ) {
            window.BackgroundStatusHUD.finishTask(hudId, true);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ОШИБКА ЗАГРУЗКИ для ${targetContainerId}:`, error);
        const isNetwork = /сеть|интернет|fetch|Failed|network|ERR_/i.test(message);
        const userMessage = isNetwork
            ? 'Не удалось загрузить документ. Проверьте подключение к интернету.'
            : message;
        updateGoogleDocStatusMessage(targetContainerId, { visible: false, message: '' });
        docContainer.innerHTML =
            '<div class="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">' +
            '<p>' +
            escapeHtml(userMessage) +
            '</p>' +
            '<button type="button" class="mt-2 px-3 py-1 rounded bg-red-200 dark:bg-red-800 hover:bg-red-300 dark:hover:bg-red-700" data-retry-doc="' +
            escapeHtml(docId) +
            '" data-retry-target="' +
            escapeHtml(targetContainerId) +
            '">Повторить</button>' +
            '</div>';
        docContainer.querySelector('[data-retry-doc]')?.addEventListener('click', function () {
            const doc = this.getAttribute('data-retry-doc');
            const target = this.getAttribute('data-retry-target');
            if (doc && target) loadAndRenderGoogleDoc(doc, target, true);
        });

        // Завершаем задачу при ошибке
        if (
            hudTaskStarted &&
            window.BackgroundStatusHUD &&
            typeof window.BackgroundStatusHUD.finishTask === 'function'
        ) {
            window.BackgroundStatusHUD.finishTask(hudId, false);
        }
    }
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
                         <div class="flex items-center gap-2">
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
    window.parseShablonyContent = parseShablonyContent;
}
