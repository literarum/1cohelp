'use strict';

import { State } from '../app/state.js';
import { escapeHtml, highlightTextInString, normalizeBrokenEntities, decodeBasicEntitiesOnce, linkify } from '../utils/html.js';
import { NotificationService } from '../services/notification.js';
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

// Helper function to show notification
function showNotification(message, type = 'success', duration = 5000) {
    if (typeof NotificationService !== 'undefined' && NotificationService.add) {
        NotificationService.add(message, type, { duration });
    } else if (typeof window.showNotification === 'function') {
        window.showNotification(message, type, duration);
    } else {
        console.log(`[Notification] ${type}: ${message}`);
    }
}

// Store original data for search
let originalShablonyData = [];

// Getter functions for search module
export function getOriginalShablonyData() {
    return originalShablonyData;
}

// Section configurations
const GOOGLE_DOC_SECTIONS = [
    { 
        id: 'shablony', 
        docId: '1YIAViw2kOVh4UzLw8VjNns0PHD29lHLr_QaQs3jCGX4', 
        title: 'Шаблоны' 
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
    console.log('URL для запроса:', requestUrl);

    try {
        const response = await fetch(requestUrl);
        if (!response.ok) {
            throw new Error(`Ошибка загрузки: статус ${response.status}`);
        }

        const results = await response.json();
        console.log('[fetchGoogleDocs] Получен ответ от API:', results, 'Тип:', typeof results, 'Является массивом:', Array.isArray(results));
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
                    error: item.status === 'error' ? (item.message || 'Ошибка загрузки') : null,
                };
                console.log(`[fetchGoogleDocs] Обработан элемент ${index}:`, result, 'Извлечённые данные:', data);
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
                    error: item.status === 'error' ? (item.message || 'Ошибка загрузки') : null,
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
                    : docData.content?.data || docData.data || docData.content || docData.paragraphs || [];
                return { docId, data: Array.isArray(data) ? data : [], error: null };
            });
        }

        console.error('Неожиданный формат ответа от API:', results);
        return docIds.map((id) => ({ docId: id, data: [], error: 'Неверный формат ответа' }));
    } catch (error) {
        console.error(`Ошибка при загрузке документов: ${error.message}`);
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
            console.log(
                '[renderGoogleDocContent] Рендеринг документа "Шаблоны".',
            );
            // Извлекаем данные: result.data или result.content.data
            const rawData = result.data || result.content?.data || [];
            if (!Array.isArray(rawData) || rawData.length === 0) {
                console.warn('[renderGoogleDocContent] Шаблоны: данные пусты или неверный формат.', result);
                container.innerHTML = '<p class="p-4 text-center text-gray-500">Шаблоны не найдены.</p>';
                return;
            }
            // Данные уже должны быть массивом строк параграфов
            originalShablonyData = rawData;
            renderStyledParagraphs(container, rawData);
            return;
        }

        // Default rendering
        renderParagraphs(container, result.data);
    });

    if (fragment.childNodes.length > 0) {
        container.appendChild(fragment);
    }
}

/**
 * Render paragraphs simply
 */
function renderParagraphs(container, data) {
    if (!data || data.length === 0) {
        container.innerHTML = '<p>Содержимое не найдено.</p>';
        return;
    }
    container.innerHTML = data.map((p) => `<div>${escapeHtml(p)}</div>`).join('');
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

    return blocks;
}

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
        const linked = linkify ? linkify(decodeBasicEntitiesOnce(highlighted)) : escapeHtml(highlighted);
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

    const fragment = document.createDocumentFragment();
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

    data.forEach((p) => {
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
                list.appendChild(li);
            } else {
                const pElem = document.createElement('p');
                pElem.className = 'mb-2';
                pElem.innerHTML = highlight(trimmedP.replace(/\*(.*?)\*/g, '<strong>$1</strong>'));
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

    const filteredData = originalShablonyData.filter((p) => {
        const text = typeof p === 'string' ? p : String(p);
        return text.toLowerCase().includes(query);
    });

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
    const humanLabel =
        targetContainerId === 'doc-content-shablony'
            ? 'Шаблоны'
            : 'Документ';
    
    let hudTaskStarted = false;
    if (window.BackgroundStatusHUD && typeof window.BackgroundStatusHUD.startTask === 'function') {
        window.BackgroundStatusHUD.startTask(hudId, humanLabel, { weight: 0.4, total: 4 });
        window.BackgroundStatusHUD.updateTask(hudId, 0, 4);
        hudTaskStarted = true;
    }
    
    try {
        const results = await fetchGoogleDocs([docId], force);
        
        if (window.BackgroundStatusHUD && typeof window.BackgroundStatusHUD.updateTask === 'function') {
            window.BackgroundStatusHUD.updateTask(hudId, 2, 4);
        }

        // Update timestamp
        if (!State.googleDocTimestamps) {
            State.googleDocTimestamps = new Map();
        }
        State.googleDocTimestamps.set(docId, Date.now());

        renderGoogleDocContent(results, docContainer, targetContainerId);

        if (window.BackgroundStatusHUD && typeof window.BackgroundStatusHUD.updateTask === 'function') {
            window.BackgroundStatusHUD.updateTask(hudId, 4, 4);
        }

        console.log(
            `УСПЕХ: Содержимое Google Doc (ID: ${docId}) отображено в #${targetContainerId}.`,
        );

        // Update search index if available
        if (typeof window.updateSearchIndex === 'function') {
            const sectionId = targetContainerId.replace('doc-content-', '');
            console.log(
                `[ИНДЕКСАЦИЯ] Запуск updateSearchIndex для ${sectionId} (ID: ${docId}).`,
            );
            try {
                if (docId === SHABLONY_DOC_ID && sectionId === 'shablony') {
                    const rawData = results[0]?.data || results[0]?.content?.data || [];
                    const blocks = parseShablonyContent(rawData);
                    await window.updateSearchIndex('shablony', docId, blocks, 'update');
                }
            } catch (indexError) {
                console.error(`Ошибка индексации для ${sectionId}:`, indexError);
            }
        }
        
        // Завершаем задачу после успешной загрузки
        if (hudTaskStarted && window.BackgroundStatusHUD && typeof window.BackgroundStatusHUD.finishTask === 'function') {
            window.BackgroundStatusHUD.finishTask(hudId, true);
        }
    } catch (error) {
        console.error(`ОШИБКА ЗАГРУЗКИ для ${targetContainerId}:`, error);
        docContainer.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded">Ошибка загрузки: ${error.message}</div>`;
        
        // Завершаем задачу при ошибке
        if (hudTaskStarted && window.BackgroundStatusHUD && typeof window.BackgroundStatusHUD.finishTask === 'function') {
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

    let mainContentArea = appContent.querySelector('main');
    if (!mainContentArea) {
        console.warn(
            'ПРЕДУПРЕЖДЕНИЕ (initGoogleDocSections): Тег <main> внутри #appContent не найден. Создаю его динамически.',
        );
        mainContentArea = document.createElement('main');
        mainContentArea.className = 'flex-grow p-4 overflow-y-auto custom-scrollbar';
        const tabNavContainer = appContent.querySelector('.border-b.border-gray-200');
        if (tabNavContainer && tabNavContainer.nextSibling) {
            tabNavContainer.parentNode.insertBefore(mainContentArea, tabNavContainer.nextSibling);
        } else {
            appContent.appendChild(mainContentArea);
        }
        const tabContents = appContent.querySelectorAll('.tab-content');
        tabContents.forEach((content) => mainContentArea.appendChild(content));
    }

    const debouncedShablonySearch = typeof debounce === 'function' 
        ? debounce(handleShablonySearch, 300) 
        : handleShablonySearch;

    GOOGLE_DOC_SECTIONS.forEach((section) => {
        if (!document.getElementById(`${section.id}Content`)) {
            const tabContentDiv = document.createElement('div');
            tabContentDiv.id = `${section.id}Content`;
            tabContentDiv.className = 'tab-content hidden h-full';
            tabContentDiv.innerHTML = `
                <div class="p-4 bg-gray-100 dark:bg-gray-800 h-full flex flex-col">
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
                    <div id="doc-content-${section.id}" class="flex-grow overflow-y-auto bg-white dark:bg-gray-900 rounded-lg shadow p-4 custom-scrollbar">
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
            }

            console.log(`Инициирую начальную загрузку для раздела '${section.id}'.`);
            loadAndRenderGoogleDoc(section.docId, `doc-content-${section.id}`, false).catch(
                (err) => console.error(`Ошибка при начальной загрузке ${section.id}:`, err),
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
