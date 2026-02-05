'use strict';

import { State } from '../app/state.js';
import { escapeHtml, highlightTextInString, normalizeBrokenEntities } from '../utils/html.js';
import { NotificationService } from '../services/notification.js';

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
let originalTelefonyData = [];
let originalShablonyData = [];

// Getter functions for search module
export function getOriginalTelefonyData() {
    return originalTelefonyData;
}

export function getOriginalShablonyData() {
    return originalShablonyData;
}

// Section configurations
const GOOGLE_DOC_SECTIONS = [
    {
        id: 'telefony',
        docId: '1lDCKpFcBIB4gRCI7_Ppsepy140YWdFtziut67xr6GTw',
        title: 'Телефоны',
    },
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

    const API_BASE_URL =
        'https://script.google.com/macros/s/AKfycby5ak0hPZF7_YJnhqYD8g1M2Ck6grzq11mpKqPFIWaX9_phJe5H_97cXmnClXKg1Nrl/exec';
    const docIdsParam = docIds.join(',');
    const cacheBuster = force ? `&v=${Date.now()}` : `&v=${Date.now()}`;
    const url = `${API_BASE_URL}?docIds=${docIdsParam}${cacheBuster}`;

    console.log(`URL для запроса: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const rawData = await response.json();
        const results = [];

        if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
            for (const docId of docIds) {
                if (rawData[docId]) {
                    const docData = rawData[docId];
                    if (docData.error) {
                        console.error(`Ошибка загрузки документа ${docId}: ${docData.error}`);
                        results.push({ docId, data: [], error: docData.error });
                    } else if (Array.isArray(docData)) {
                        results.push({ docId, data: docData, error: null });
                    } else if (docData.content && Array.isArray(docData.content)) {
                        results.push({ docId, data: docData.content, error: null });
                    } else {
                        results.push({ docId, data: [], error: 'Неизвестный формат данных' });
                    }
                } else {
                    results.push({ docId, data: [], error: 'Документ не найден в ответе' });
                }
            }
        } else if (Array.isArray(rawData) && docIds.length === 1) {
            results.push({ docId: docIds[0], data: rawData, error: null });
        } else {
            console.error('Неожиданный формат ответа от API:', rawData);
            docIds.forEach((id) => results.push({ docId: id, data: [], error: 'Неверный формат' }));
        }

        return results;
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

        if (parentContainerId === 'doc-content-telefony') {
            console.log(
                '[renderGoogleDocContent CORRECTED] Обнаружен особый случай: рендеринг таблицы телефонов. Используется специальный парсер.',
            );
            originalTelefonyData = result.data;
            renderPhoneDirectoryTable(container, result.data);
            return;
        }

        if (parentContainerId === 'doc-content-shablony') {
            console.log(
                '[renderGoogleDocContent CORRECTED] Обнаружен особый случай: рендеринг документа "Шаблоны". Используется парсер стилизованных параграфов.',
            );
            const parsedBlocks = parseShablonyContent(result.data);
            originalShablonyData = parsedBlocks;
            renderShablonyBlocks(container, parsedBlocks);
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
 * Render phone directory table
 */
export function renderPhoneDirectoryTable(container, data, options = {}) {
    const LOG_PREFIX = '[Phone Table Parser v7 ROBUST-STYLING-WITH-INDEX]';
    console.log(`%c${LOG_PREFIX} Запуск функции рендеринга.`, 'color: blue; font-weight: bold;');

    const { scale = 1.0, fontScale = 1.0, searchQuery = '' } = options;
    const highlight = (text) => {
        if (!text || typeof text !== 'string') return '';
        if (!searchQuery) return escapeHtml(text);
        if (typeof highlightTextInString === 'function') {
            return highlightTextInString(text, searchQuery);
        }
        return escapeHtml(text);
    };

    if (!container || typeof container.appendChild !== 'function') {
        console.error(`${LOG_PREFIX} КРИТИЧЕСКАЯ ОШИБКА: Передан невалидный контейнер.`);
        return;
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
        if (searchQuery) {
            container.innerHTML = `<p class="p-4 text-center text-gray-500">По запросу "${escapeHtml(
                searchQuery,
            )}" ничего не найдено.</p>`;
        } else {
            container.innerHTML =
                '<p class="p-4 text-center text-gray-500">Данные отсутствуют.</p>';
        }
        return;
    }

    const headers = Object.keys(
        data.find(
            (item) => typeof item === 'object' && item !== null && Object.keys(item).length > 0,
        ) || {},
    );

    if (headers.length === 0) {
        console.error(`${LOG_PREFIX} ОШИБКА: Не удалось определить заголовки.`);
        container.innerHTML = '<p class="p-4 text-center text-red-500">Ошибка формата данных.</p>';
        return;
    }

    // Build table HTML
    const tableHtml = `
        <table class="w-full border-collapse text-sm">
            <thead class="bg-gray-100 dark:bg-gray-700 sticky top-0">
                <tr>
                    ${headers.map((h) => `<th class="px-3 py-2 text-left font-semibold border-b dark:border-gray-600">${escapeHtml(h)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${data
                    .map(
                        (row, idx) => `
                    <tr class="${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'} hover:bg-blue-50 dark:hover:bg-gray-700">
                        ${headers.map((h) => `<td class="px-3 py-2 border-b dark:border-gray-600">${highlight(String(row[h] || ''))}</td>`).join('')}
                    </tr>
                `,
                    )
                    .join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = tableHtml;
}

/**
 * Parse Shablony content into blocks
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
 * Render Shablony blocks
 */
function renderShablonyBlocks(container, blocks, searchQuery = '') {
    if (!blocks || blocks.length === 0) {
        if (searchQuery) {
            container.innerHTML = `<p class="p-4 text-center text-gray-500">По запросу "${escapeHtml(searchQuery)}" ничего не найдено.</p>`;
        } else {
            container.innerHTML = '<p class="p-4 text-center text-gray-500">Шаблоны не найдены.</p>';
        }
        return;
    }

    const fragment = document.createDocumentFragment();

    blocks.forEach((block) => {
        const div = document.createElement('div');
        div.className = `shablony-block copyable-block level-${block.level} mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors`;
        div.dataset.originalIndex = block.originalIndex;

        const titleClass = block.level === 1 
            ? 'text-lg font-bold text-primary' 
            : block.level === 2 
            ? 'text-base font-semibold text-gray-700 dark:text-gray-300' 
            : 'text-sm font-medium text-gray-600 dark:text-gray-400';

        const titleHtml = searchQuery 
            ? highlightTextInString(block.title, searchQuery) 
            : escapeHtml(block.title);
        
        const contentHtml = searchQuery 
            ? highlightTextInString(block.content, searchQuery) 
            : escapeHtml(block.content);

        div.innerHTML = `
            <div class="${titleClass} mb-2">${titleHtml}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">${contentHtml}</div>
        `;

        fragment.appendChild(div);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

/**
 * Handle telefony search
 */
export function handleTelefonySearch() {
    const searchInput = document.getElementById('telefony-search-input');
    const clearBtn = document.getElementById('telefony-search-clear-btn');
    const container = document.getElementById('doc-content-telefony');

    if (!searchInput || !container) return;

    const query = searchInput.value.trim().toLowerCase();
    
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', query.length === 0);
    }

    if (!query) {
        renderPhoneDirectoryTable(container, originalTelefonyData);
        return;
    }

    const filteredData = originalTelefonyData.filter((row) => {
        return Object.values(row).some((value) => 
            String(value).toLowerCase().includes(query)
        );
    });

    renderPhoneDirectoryTable(container, filteredData, { searchQuery: query });
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
        renderShablonyBlocks(container, originalShablonyData);
        return;
    }

    const filteredBlocks = originalShablonyData.filter((block) => {
        return block.title.toLowerCase().includes(query) || 
               block.content.toLowerCase().includes(query);
    });

    renderShablonyBlocks(container, filteredBlocks, query);
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
        targetContainerId === 'doc-content-telefony'
            ? 'Телефоны'
            : targetContainerId === 'doc-content-shablony'
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
                `[ИНДЕКСАЦИЯ] Запуск updateSearchIndex для ${sectionId} (ID: ${docId}) по сырым данным.`,
            );
            try {
                const rawData = results[0]?.data || [];
                await window.updateSearchIndex(sectionId, docId, rawData, 'add');
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

    const debouncedTelefonySearch = typeof debounce === 'function' 
        ? debounce(handleTelefonySearch, 300) 
        : handleTelefonySearch;
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
            const searchHandler = section.id === 'telefony' 
                ? debouncedTelefonySearch 
                : debouncedShablonySearch;

            if (searchInput) {
                searchInput.addEventListener('input', searchHandler);
            }
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    if (section.id === 'telefony') handleTelefonySearch();
                    else handleShablonySearch();
                });
            }

            if (section.id === 'shablony') {
                const docContainer = document.getElementById(`doc-content-${section.id}`);
                if (docContainer && typeof window.copyToClipboard === 'function') {
                    docContainer.addEventListener('click', (event) => {
                        const block = event.target.closest('.shablony-block.copyable-block');
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
    window.handleTelefonySearch = handleTelefonySearch;
    window.handleShablonySearch = handleShablonySearch;
    window.parseShablonyContent = parseShablonyContent;
    window.renderPhoneDirectoryTable = renderPhoneDirectoryTable;
}
