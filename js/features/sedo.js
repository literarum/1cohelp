'use strict';

import { SEDO_CONFIG_KEY } from '../constants.js';
import { State } from '../app/state.js';
import { NotificationService } from '../services/notification.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import { escapeHtml, highlightTextInString } from '../utils/html.js';

// ============================================================================
// SEDO TYPES SYSTEM
// ============================================================================

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

// Default SEDO data
export const DEFAULT_SEDO_DATA = {
    id: SEDO_CONFIG_KEY,
    articleLinks: ['https://track.astral.ru/support/pages/viewpage.action?pageId=11404156'],
    tables: [
        {
            title: 'Входящие сообщения СЭДО: Сообщения по проактивному назначению пособий и прямым выплатам',
            columns: ['Код', 'Сообщение в спецификации СЭДО (код, название)', 'Где увидеть в 1С'],
            codeField: 'code',
            items: [
                { code: '10', name: 'Извещение ПВСО', in1C: 'Документ Извещение СЭДО СФР (Кадры – Пособия – Извещения СЭДО СФР)' },
                { code: '11', name: 'Результат подтверждения прочтения сообщения', in1C: 'Регистр Входящие сообщения СЭДО СФР (бывш. ФСС)' },
                { code: '87', name: 'Результат регистрации сведений о застрахованном лице', in1C: 'Регистр Входящие сообщения СЭДО СФР (бывш. ФСС)' },
            ],
        },
        {
            title: 'Исходящие сообщения СЭДО: По проактивному назначению пособий и прямым выплатам',
            columns: ['Код', 'Сообщение'],
            codeField: 'code',
            items: [
                { code: '1', name: 'Пособие по временной нетрудоспособности' },
                { code: '2', name: 'Пособие по беременности и родам' },
                { code: '4', name: 'Единовременное пособие при рождении ребенка' },
                { code: '5', name: 'Ежемесячное пособие по уходу за ребенком' },
                { code: '6', name: 'Пособия по временной нетрудоспособности в связи с несчастным случаем на производстве или профессиональным заболеванием' },
            ],
        },
    ],
};

// State variables
let currentSedoData = JSON.parse(JSON.stringify(DEFAULT_SEDO_DATA));
let originalSedoDataBeforeEdit = JSON.parse(JSON.stringify(DEFAULT_SEDO_DATA));
let isSedoEditing = false;

/**
 * Initialize SEDO types system
 */
export function initSedoTypesSystem() {
    injectSedoEditStyles();

    loadSedoData()
        .then((data) => {
            currentSedoData = data;
            renderSedoTypesContent(currentSedoData, false, '');
        })
        .catch((error) => {
            console.error('Критическая ошибка при загрузке данных СЭДО:', error);
            showNotification('Не удалось загрузить данные для раздела СЭДО.', 'error');
        });

    console.log('Система типов сообщений СЭДО инициализирована (v2, инкапсулированная логика кнопок).');
}

/**
 * Toggle SEDO edit mode
 */
export function toggleSedoEditMode(isEditing) {
    console.log(`[toggleSedoEditMode V.Fixed] Переключение режима редактирования на: ${isEditing}`);
    isSedoEditing = isEditing;

    if (isEditing) {
        originalSedoDataBeforeEdit = JSON.parse(JSON.stringify(currentSedoData));
        console.log('[toggleSedoEditMode V.Fixed] Состояние originalSedoDataBeforeEdit обновлено перед редактированием.');
    }

    renderSedoTypesContent(currentSedoData, isEditing);
    console.log(`[toggleSedoEditMode V.Fixed] renderSedoTypesContent вызвана с isEditing=${isEditing}`);
}

/**
 * Render SEDO types content
 */
export function renderSedoTypesContent(data, isEditing, searchQuery = '') {
    const SEDO_TAB_PANEL_ID = 'sedoTypesContent';
    const SEDO_RENDER_TARGET_ID = 'sedoTypesRenderContainer';
    const sedoTabPanel = document.getElementById(SEDO_TAB_PANEL_ID);

    if (!sedoTabPanel) {
        console.log(`[SedoRender V.Fixed] Панель вкладки #${SEDO_TAB_PANEL_ID} не найдена. Рендеринг пропущен.`);
        return;
    }

    sedoTabPanel.innerHTML = '';
    let mainContentContainer = document.createElement('div');
    mainContentContainer.id = SEDO_RENDER_TARGET_ID;
    sedoTabPanel.appendChild(mainContentContainer);
    sedoTabPanel.dataset.isEditing = String(isEditing);

    if (!data) {
        console.error(`[SedoRender V.Fixed] Ошибка: в функцию переданы невалидные данные (data is ${data}).`);
        mainContentContainer.innerHTML = '<p class="text-red-500 text-center p-4">Ошибка загрузки данных для отображения.</p>';
        return;
    }

    mainContentContainer.className = 'bg-white dark:bg-slate-800 p-4 md:p-6 rounded-lg shadow-lg flex flex-col h-full';
    mainContentContainer.classList.toggle('sedo-is-editing', isEditing);

    console.log(`[SedoRender V.Fixed] Начало полного рендеринга. Режим редактирования: ${isEditing}.`);

    // Create header
    const headerContainer = document.createElement('div');
    headerContainer.className = 'flex flex-wrap gap-y-2 justify-between items-center mb-4 flex-shrink-0';
    
    const titleHeader = document.createElement('h2');
    titleHeader.className = 'text-2xl font-bold text-gray-800 dark:text-gray-200';
    titleHeader.textContent = 'Типы сообщений СЭДО';
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'flex items-center gap-2';

    // Create buttons based on editing mode
    if (isEditing) {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors';
        saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Сохранить';
        saveBtn.addEventListener('click', saveSedoChanges);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'px-3 py-1.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors';
        cancelBtn.innerHTML = '<i class="fas fa-times mr-1"></i>Отмена';
        cancelBtn.addEventListener('click', () => {
            currentSedoData = JSON.parse(JSON.stringify(originalSedoDataBeforeEdit));
            toggleSedoEditMode(false);
        });

        buttonsContainer.appendChild(saveBtn);
        buttonsContainer.appendChild(cancelBtn);
    } else {
        const editBtn = document.createElement('button');
        editBtn.className = 'px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors';
        editBtn.innerHTML = '<i class="fas fa-edit mr-1"></i>Редактировать';
        editBtn.addEventListener('click', () => toggleSedoEditMode(true));
        buttonsContainer.appendChild(editBtn);
    }

    headerContainer.appendChild(titleHeader);
    headerContainer.appendChild(buttonsContainer);
    mainContentContainer.appendChild(headerContainer);

    // Create search input (only in view mode)
    if (!isEditing) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'relative mb-4 flex-shrink-0';
        searchContainer.innerHTML = `
            <input type="text" id="sedoSearchInput" placeholder="Поиск по разделу СЭДО..." 
                   class="w-full pl-4 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100">
            <button id="clearSedoSearchBtn" class="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-white-700 hidden" title="Очистить поиск">
                <i class="fas fa-times"></i>
            </button>
        `;
        mainContentContainer.appendChild(searchContainer);

        const searchInput = searchContainer.querySelector('#sedoSearchInput');
        const clearBtn = searchContainer.querySelector('#clearSedoSearchBtn');
        
        if (searchInput) {
            searchInput.value = searchQuery || '';
            searchInput.addEventListener('input', handleSedoSearch);
        }
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', !searchQuery);
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                handleSedoSearch();
            });
        }
    }

    // Create content container
    const contentContainer = document.createElement('div');
    contentContainer.id = 'sedoTypesInfoContainer';
    contentContainer.className = 'flex-grow overflow-y-auto custom-scrollbar';
    mainContentContainer.appendChild(contentContainer);

    // Render the actual content
    _renderSedoContentInner(contentContainer, data, isEditing, searchQuery);
}

/**
 * Save SEDO changes
 */
export async function saveSedoChanges() {
    console.log('[SedoSave V4] Начало сохранения изменений СЭДО...');

    const sedoTabPanel = document.getElementById('sedoTypesContent');
    if (!sedoTabPanel) {
        showNotification('Ошибка: панель СЭДО не найдена.', 'error');
        return;
    }

    // Collect article links
    const articleLinksTextarea = sedoTabPanel.querySelector('#sedoArticleLinksEditInput');
    if (articleLinksTextarea) {
        const lines = articleLinksTextarea.value.split('\n').filter((line) => line.trim());
        currentSedoData.articleLinks = lines.map((line) => {
            const parts = line.split('|');
            if (parts.length > 1) {
                return { url: parts[0].trim(), text: parts.slice(1).join('|').trim() };
            }
            const trimmed = parts[0].trim();
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                return { url: trimmed };
            }
            return { text: trimmed };
        });
    }

    // Collect table data
    const tableContainers = sedoTabPanel.querySelectorAll('.sedo-table-container');
    tableContainers.forEach((tableContainer) => {
        const tableIndex = parseInt(tableContainer.dataset.tableIndex, 10);
        if (isNaN(tableIndex) || !currentSedoData.tables[tableIndex]) return;

        // Get table title
        const titleInput = tableContainer.querySelector(`input[data-table-index="${tableIndex}"][data-field="title"]`);
        if (titleInput) {
            currentSedoData.tables[tableIndex].title = titleInput.value.trim();
        }

        // Get table rows
        const rows = tableContainer.querySelectorAll('tbody tr');
        const newItems = [];
        rows.forEach((row) => {
            const cells = row.querySelectorAll('td[contenteditable="true"]');
            if (cells.length > 0) {
                const item = {};
                const columns = currentSedoData.tables[tableIndex].columns || [];
                const fields = ['code', 'name', 'in1C'];
                cells.forEach((cell, idx) => {
                    const fieldName = fields[idx] || `field${idx}`;
                    item[fieldName] = cell.textContent.trim();
                });
                if (Object.values(item).some((v) => v)) {
                    newItems.push(item);
                }
            }
        });
        currentSedoData.tables[tableIndex].items = newItems;
    });

    // Save to IndexedDB
    try {
        currentSedoData.id = SEDO_CONFIG_KEY;
        await saveToIndexedDB('preferences', currentSedoData);
        console.log('[SedoSave V4] Данные СЭДО успешно сохранены в IndexedDB.');
        showNotification('Данные СЭДО успешно сохранены!', 'success');

        // Update search index if available
        if (typeof window.updateSearchIndex === 'function') {
            try {
                await window.updateSearchIndex('preferences', SEDO_CONFIG_KEY, currentSedoData, 'update');
                console.log('[SedoSave V4] Поисковый индекс для СЭДО успешно обновлен.');
            } catch (indexError) {
                console.error('[SedoSave V4] Ошибка обновления поискового индекса:', indexError);
            }
        }

        toggleSedoEditMode(false);
    } catch (error) {
        console.error('[SedoSave V4] Ошибка сохранения данных СЭДО:', error);
        showNotification('Ошибка сохранения данных СЭДО.', 'error');
    }
}

/**
 * Load SEDO data from IndexedDB
 */
export async function loadSedoData() {
    const currentDefault = JSON.parse(JSON.stringify(DEFAULT_SEDO_DATA));
    let dataToOperateWith;

    try {
        const loadedData = await getFromIndexedDB('preferences', SEDO_CONFIG_KEY);
        
        if (loadedData && typeof loadedData === 'object' && loadedData.tables) {
            console.log('Данные СЭДО загружены из IndexedDB.');
            dataToOperateWith = loadedData;
        } else {
            console.log('Данные СЭДО не найдены в IndexedDB. Используются данные по умолчанию.');
            dataToOperateWith = currentDefault;
        }
    } catch (error) {
        console.error('Ошибка загрузки данных СЭДО:', error);
        dataToOperateWith = currentDefault;
    }

    return dataToOperateWith;
}

/**
 * Filter SEDO data by search query
 */
export function filterSedoData(query) {
    if (!query || query.trim() === '') {
        return currentSedoData;
    }

    const lowerQuery = query.toLowerCase().trim();
    const filteredData = JSON.parse(JSON.stringify(currentSedoData));

    // Filter article links
    if (filteredData.articleLinks) {
        filteredData.articleLinks = filteredData.articleLinks.filter((item) => {
            if (typeof item === 'string') {
                return item.toLowerCase().includes(lowerQuery);
            }
            return (
                (item.url && item.url.toLowerCase().includes(lowerQuery)) ||
                (item.text && item.text.toLowerCase().includes(lowerQuery))
            );
        });
    }

    // Filter tables
    if (filteredData.tables) {
        filteredData.tables = filteredData.tables
            .map((table) => {
                const filteredTable = { ...table };
                if (table.items) {
                    filteredTable.items = table.items.filter((item) => {
                        return Object.values(item).some(
                            (value) => value && String(value).toLowerCase().includes(lowerQuery)
                        );
                    });
                }
                return filteredTable;
            })
            .filter((table) => {
                // Keep table if title matches or has filtered items
                const titleMatches = table.title && table.title.toLowerCase().includes(lowerQuery);
                const hasItems = table.items && table.items.length > 0;
                return titleMatches || hasItems;
            });
    }

    return filteredData;
}

/**
 * Handle SEDO search
 */
export function handleSedoSearch() {
    const searchInput = document.getElementById('sedoSearchInput');
    const clearBtn = document.getElementById('clearSedoSearchBtn');
    const infoContainer = document.getElementById('sedoTypesInfoContainer');

    if (!searchInput || !infoContainer) return;

    const query = searchInput.value.trim();
    
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', query.length === 0);
    }

    const filteredData = filterSedoData(query);
    _renderSedoContentInner(infoContainer, filteredData, isSedoEditing, query);
}

/**
 * Internal render function for SEDO content
 */
function _renderSedoContentInner(container, data, isEditing, searchQuery) {
    if (!container || !data) {
        console.error('_renderSedoContentInner: Не передан контейнер или данные.');
        return;
    }
    
    container.innerHTML = '';
    
    const highlight = (text) => {
        if (!searchQuery || isEditing || !text) return escapeHtml(String(text));
        return highlightTextInString(String(text), searchQuery);
    };

    // Render article links section
    const linksSectionContainer = document.createElement('div');
    linksSectionContainer.className = 'mb-6';
    
    const linksTitleHeader = document.createElement('div');
    linksTitleHeader.className = 'flex items-center justify-between mb-2';
    
    const linksTitleStatic = document.createElement('h3');
    linksTitleStatic.className = 'text-lg font-semibold text-gray-900 dark:text-gray-100';
    linksTitleStatic.textContent = 'Полезные ссылки и информация по СЭДО';
    linksTitleHeader.appendChild(linksTitleStatic);
    linksSectionContainer.appendChild(linksTitleHeader);

    const articles = data && Array.isArray(data.articleLinks) ? data.articleLinks : [];
    const linksDisplayArea = document.createElement('div');
    linksDisplayArea.className = 'bg-white dark:bg-gray-700 p-3 rounded-lg shadow mb-3';

    if (isEditing) {
        const textarea = document.createElement('textarea');
        textarea.id = 'sedoArticleLinksEditInput';
        textarea.className = 'w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700/80 focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-gray-100 min-h-[100px] text-sm';
        textarea.placeholder = 'Каждая ссылка с новой строки. Для добавления описания используйте | (вертикальная черта) после URL.';
        textarea.value = articles
            .map((item) => {
                if (typeof item === 'string') return item;
                return item.url ? `${item.url}${item.text ? `|${item.text}` : ''}` : item.text;
            })
            .join('\n');
        linksDisplayArea.appendChild(textarea);
    } else {
        if (articles.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'space-y-2';
            articles.forEach((item) => {
                if (!item) return;
                const li = document.createElement('li');
                li.className = 'text-gray-700 dark:text-gray-300 break-words list-disc list-inside ml-5';
                
                const itemUrl = typeof item === 'string' ? item : item.url;
                const itemText = typeof item === 'object' ? item.text : null;
                
                if (itemUrl) {
                    const a = document.createElement('a');
                    a.href = itemUrl;
                    a.innerHTML = highlight(itemUrl);
                    a.className = 'text-primary hover:underline break-all';
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    li.appendChild(a);
                    if (itemText) {
                        const descSpan = document.createElement('span');
                        descSpan.className = 'ml-2 text-sm text-gray-500 dark:text-gray-400 italic';
                        descSpan.innerHTML = `— ${highlight(itemText)}`;
                        li.appendChild(descSpan);
                    }
                } else if (itemText) {
                    li.innerHTML = highlight(itemText);
                }
                ul.appendChild(li);
            });
            linksDisplayArea.appendChild(ul);
        } else {
            linksDisplayArea.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">Ссылок или дополнительной информации не добавлено.</p>';
        }
    }
    
    linksSectionContainer.appendChild(linksDisplayArea);
    container.appendChild(linksSectionContainer);

    // Render tables
    if (data.tables && Array.isArray(data.tables)) {
        if (data.tables.length === 0 && searchQuery && !isEditing) {
            const noResultsEl = document.createElement('p');
            noResultsEl.className = 'text-center text-gray-500 dark:text-gray-400 py-4';
            noResultsEl.textContent = `По запросу "${searchQuery}" в таблицах ничего не найдено.`;
            container.appendChild(noResultsEl);
            return;
        }

        data.tables.forEach((tableData, tableIndex) => {
            const tableContainerDiv = document.createElement('div');
            tableContainerDiv.className = 'sedo-table-container mb-6';
            tableContainerDiv.dataset.tableIndex = tableIndex;

            // Table title
            const titleHeaderDiv = document.createElement('div');
            titleHeaderDiv.className = 'flex items-center justify-between mb-2';
            
            if (isEditing) {
                const titleInput = document.createElement('input');
                titleInput.type = 'text';
                titleInput.className = 'flex-grow text-lg font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-b border-primary focus:outline-none';
                titleInput.value = tableData.title || '';
                titleInput.dataset.tableIndex = tableIndex;
                titleInput.dataset.field = 'title';
                titleHeaderDiv.appendChild(titleInput);
            } else {
                const titleEl = document.createElement('h3');
                titleEl.className = 'text-lg font-semibold text-gray-900 dark:text-gray-100';
                titleEl.innerHTML = highlight(tableData.title || 'Без названия');
                titleHeaderDiv.appendChild(titleEl);
            }
            
            tableContainerDiv.appendChild(titleHeaderDiv);

            // Table wrapper
            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700';

            if (!tableData.items || tableData.items.length === 0) {
                tableWrapper.innerHTML = '<p class="p-4 text-center text-gray-500 dark:text-gray-400">Нет данных в таблице.</p>';
            } else {
                const table = document.createElement('table');
                table.className = 'w-full text-sm';

                // Table header
                const thead = document.createElement('thead');
                thead.className = 'bg-gray-100 dark:bg-gray-700';
                const headerRow = document.createElement('tr');
                const columns = tableData.columns || Object.keys(tableData.items[0] || {});
                columns.forEach((col) => {
                    const th = document.createElement('th');
                    th.className = 'px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 border-b dark:border-gray-600';
                    th.textContent = col;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);

                // Table body
                const tbody = document.createElement('tbody');
                const fields = ['code', 'name', 'in1C'];
                tableData.items.forEach((item, rowIndex) => {
                    const row = document.createElement('tr');
                    row.className = rowIndex % 2 === 0 
                        ? 'bg-white dark:bg-gray-800' 
                        : 'bg-gray-50 dark:bg-gray-750';
                    row.classList.add('hover:bg-blue-50', 'dark:hover:bg-gray-700');

                    fields.forEach((field, colIndex) => {
                        if (colIndex >= columns.length) return;
                        const td = document.createElement('td');
                        td.className = 'px-4 py-2 border-b dark:border-gray-600';
                        const cellValue = item[field] || '';

                        if (isEditing) {
                            td.contentEditable = 'true';
                            td.className += ' editing-cell focus:outline-none focus:bg-yellow-100 dark:focus:bg-yellow-900/50 focus:ring-1 focus:ring-primary rounded';
                            td.textContent = String(cellValue);
                        } else {
                            td.innerHTML = highlight(String(cellValue));
                        }
                        row.appendChild(td);
                    });
                    tbody.appendChild(row);
                });
                table.appendChild(tbody);
                tableWrapper.appendChild(table);
            }
            
            tableContainerDiv.appendChild(tableWrapper);
            container.appendChild(tableContainerDiv);
        });
    }
}

/**
 * Inject SEDO edit styles
 */
function injectSedoEditStyles() {
    if (document.getElementById('sedo-edit-styles')) return;

    const style = document.createElement('style');
    style.id = 'sedo-edit-styles';
    style.textContent = `
        .sedo-is-editing .editing-cell {
            min-width: 100px;
        }
        .sedo-is-editing .editing-cell:focus {
            background-color: rgba(255, 255, 0, 0.2);
        }
        .dark .sedo-is-editing .editing-cell:focus {
            background-color: rgba(255, 200, 0, 0.15);
        }
    `;
    document.head.appendChild(style);
    console.log('Стили для режима редактирования СЭДО успешно добавлены.');
}

/**
 * Highlight and scroll to SEDO item
 */
export async function highlightAndScrollSedoItem(tableIndex, rowIndex, fieldToHighlight, highlightTerm) {
    const sedoTabPanel = document.getElementById('sedoTypesContent');
    if (!sedoTabPanel) {
        console.error('highlightAndScrollSedoItem: Панель СЭДО не найдена.');
        return;
    }

    // Find the table
    const tableContainer = sedoTabPanel.querySelector(`.sedo-table-container[data-table-index="${tableIndex}"]`);
    if (!tableContainer) {
        console.error(`highlightAndScrollSedoItem: Таблица с индексом ${tableIndex} не найдена.`);
        showNotification('Не удалось найти таблицу СЭДО.', 'error');
        return;
    }

    // Find the row
    const rows = tableContainer.querySelectorAll('tbody tr');
    if (rowIndex >= rows.length) {
        console.error(`highlightAndScrollSedoItem: Строка с индексом ${rowIndex} не найдена.`);
        showNotification('Не удалось найти строку в таблице СЭДО.', 'error');
        return;
    }

    const targetRow = rows[rowIndex];
    
    // Scroll to element
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight temporarily
    targetRow.classList.add('bg-yellow-200', 'dark:bg-yellow-800');
    setTimeout(() => {
        targetRow.classList.remove('bg-yellow-200', 'dark:bg-yellow-800');
    }, 3000);
}

// Export for window access (backward compatibility)
if (typeof window !== 'undefined') {
    window.initSedoTypesSystem = initSedoTypesSystem;
    window.toggleSedoEditMode = toggleSedoEditMode;
    window.renderSedoTypesContent = renderSedoTypesContent;
    window.saveSedoChanges = saveSedoChanges;
    window.loadSedoData = loadSedoData;
    window.filterSedoData = filterSedoData;
    window.handleSedoSearch = handleSedoSearch;
    window.highlightAndScrollSedoItem = highlightAndScrollSedoItem;
    window.DEFAULT_SEDO_DATA = DEFAULT_SEDO_DATA;
}
