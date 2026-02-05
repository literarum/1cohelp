'use strict';

/**
 * Модуль системы черного списка (Blacklist System)
 * Содержит логику работы с черным списком клиентов: CRUD операции, проверка ИНН, уведомления
 */

import { State } from '../app/state.js';
import {
    getAllFromIndexedDB,
    getFromIndexedDB,
    saveToIndexedDB,
    deleteFromIndexedDB,
    getAllFromIndex,
    performDBOperation,
} from '../db/indexeddb.js';

// ============================================================================
// ЗАВИСИМОСТИ (устанавливаются через setBlacklistDependencies)
// ============================================================================

let deps = {
    showNotification: null,
    debounce: null,
    escapeHtml: null,
    escapeRegExp: null,
    getVisibleModals: null,
    setActiveTab: null,
    updateSearchIndex: null,
    NotificationService: null,
    XLSX: null,
};

/**
 * Устанавливает зависимости для модуля Blacklist
 * @param {Object} dependencies - Объект с зависимостями
 */
export function setBlacklistDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
    console.log('[Blacklist] Зависимости установлены');
}

// ============================================================================
// DB WRAPPERS
// ============================================================================

/**
 * Добавляет запись в черный список
 */
export async function addBlacklistEntryDB(entry) {
    return await saveToIndexedDB('blacklistedClients', entry);
}

/**
 * Получает запись из черного списка по ID
 */
export async function getBlacklistEntryDB(id) {
    return await getFromIndexedDB('blacklistedClients', id);
}

/**
 * Обновляет запись в черном списке
 */
export async function updateBlacklistEntryDB(entry) {
    return await saveToIndexedDB('blacklistedClients', entry);
}

/**
 * Удаляет запись из черного списка по ID
 */
export async function deleteBlacklistEntryDB(id) {
    return await deleteFromIndexedDB('blacklistedClients', id);
}

/**
 * Получает все записи из черного списка
 */
export async function getAllBlacklistEntriesDB() {
    return await getAllFromIndexedDB('blacklistedClients');
}

/**
 * Получает записи черного списка по ИНН
 */
export async function getBlacklistEntriesByInn(inn) {
    const LOG_PREFIX = '[getBlacklistEntriesByInn]';
    console.log(`${LOG_PREFIX} Запрос к БД для ИНН: ${inn}`);

    if (!State.db) {
        console.warn(`${LOG_PREFIX} База данных недоступна. Возвращаем пустой массив.`);
        return [];
    }
    try {
        const entries = await getAllFromIndex('blacklistedClients', 'inn', inn);
        console.log(
            `${LOG_PREFIX} Результат getAllFromIndex для ИНН ${inn}: найдено ${entries.length} записей.`
        );
        return entries || [];
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при выполнении getAllFromIndex для ИНН ${inn}:`, error);
        return [];
    }
}

// ============================================================================
// ПРОВЕРКА ИНН
// ============================================================================

/**
 * Проверяет, находится ли ИНН в черном списке
 */
export async function isInnBlacklisted(inn) {
    const LOG_PREFIX = '[isInnBlacklisted]';
    console.log(`${LOG_PREFIX} Запрос к БД для ИНН: ${inn}`);

    if (!State.db) {
        console.warn(`${LOG_PREFIX} База данных недоступна. Возвращаем false.`);
        return false;
    }
    try {
        const count = await performDBOperation('blacklistedClients', 'readonly', (store) => {
            const index = store.index('inn');
            return index.count(inn);
        });
        console.log(`${LOG_PREFIX} Результат count() для ИНН ${inn}: ${count}.`);
        return count > 0;
    } catch (error) {
        console.error(
            `${LOG_PREFIX} Ошибка при выполнении performDBOperation для ИНН ${inn}:`,
            error
        );
        return false;
    }
}

/**
 * Проверяет текст на наличие ИНН из черного списка и показывает уведомления
 */
export async function checkForBlacklistedInn(text) {
    const LOG_PREFIX = '[CheckINN_V8_Final_DismissAndReadd]';
    const lastLine = text.trim().split('\n').pop() || '';
    console.log(
        `${LOG_PREFIX} Начало проверки. Анализируется только последняя строка: "${lastLine}"`
    );

    if (!State.db) {
        console.warn(`${LOG_PREFIX} Проверка пропущена: база данных не готова.`);
        return;
    }

    try {
        const innRegex = /\b(\d{10}|\d{12})\b/g;
        const currentInnsList = lastLine.match(innRegex) || [];

        const currentInnCounts = new Map();
        for (const inn of currentInnsList) {
            currentInnCounts.set(inn, (currentInnCounts.get(inn) || 0) + 1);
        }

        const innsToCheckForNotification = new Set();
        for (const [inn, currentCount] of currentInnCounts.entries()) {
            const lastCount = State.lastKnownInnCounts.get(inn) || 0;
            if (currentCount > lastCount) {
                innsToCheckForNotification.add(inn);
            }
        }

        const innsToRemoveNotification = new Set();
        for (const inn of State.lastKnownInnCounts.keys()) {
            if (!currentInnCounts.has(inn)) {
                innsToRemoveNotification.add(inn);
            }
        }

        for (const inn of innsToCheckForNotification) {
            const isBlacklisted = await isInnBlacklisted(inn);
            if (isBlacklisted) {
                const entries = await getBlacklistEntriesByInn(inn);
                if (entries.length > 0) {
                    const entry = entries[0];
                    const level = entry.level || 1;
                    const notificationId =
                        level === 3 ? `hyper-toad-warning-${inn}` : `blacklist-warning-${inn}`;
                    const message =
                        level === 3
                            ? `ОБНАРУЖЕНА ГИПЕРЖАБА (ИНН: ${inn}), ТРЕВОГА! АЛЯРМА!`
                            : `ВНИМАНИЕ, ПО ИНН ${inn} ОБНАРУЖЕНА ЖАБА (Уровень ${level}), БУДЬТЕ ВНИМАТЕЛЬНЫ!`;
                    const type = level === 3 ? 'hyper-alert' : 'error';

                    if (State.activeToadNotifications.has(inn)) {
                        const existingId = State.activeToadNotifications.get(inn);
                        console.log(
                            `${LOG_PREFIX} Повторное срабатывание для ИНН ${inn}. Принудительное скрытие старого уведомления (ID: ${existingId}).`
                        );
                        deps.NotificationService?.dismissImportant(existingId);
                        await new Promise((resolve) => requestAnimationFrame(resolve));
                    }

                    console.log(
                        `%c${LOG_PREFIX} ОБНАРУЖЕНА ЖАБА! Показ/обновление уведомления для ИНН: ${inn}, Уровень: ${level}`,
                        'color: red; font-weight: bold; font-size: 16px;'
                    );

                    deps.NotificationService?.add(message, type, {
                        id: notificationId,
                        important: true,
                        isDismissible: true,
                        autoDismissDelay: level < 3 ? 30000 : 0,
                        onClick: () => {
                            deps.setActiveTab?.('blacklistedClients');
                            const searchInput = document.getElementById('blacklistSearchInput');
                            if (searchInput) {
                                searchInput.value = inn;
                                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        },
                    });
                    State.activeToadNotifications.set(inn, notificationId);
                }
            }
        }

        for (const inn of innsToRemoveNotification) {
            if (State.activeToadNotifications.has(inn)) {
                const notificationId = State.activeToadNotifications.get(inn);
                console.log(
                    `${LOG_PREFIX} ИНН ${inn} удален из текста, скрываем уведомление с ID: ${notificationId}.`
                );
                deps.NotificationService?.dismissImportant(notificationId);
                State.activeToadNotifications.delete(inn);
            }
        }

        State.lastKnownInnCounts = new Map(currentInnCounts);
    } catch (error) {
        console.error(`${LOG_PREFIX} Произошла ошибка во время проверки ИНН:`, error);
        deps.NotificationService?.add('Ошибка при проверке ИНН в черном списке.', 'warning');
    }
}

// ============================================================================
// СОРТИРОВКА И РЕНДЕРИНГ
// ============================================================================

/**
 * Сортирует и рендерит записи черного списка
 */
export function sortAndRenderBlacklist() {
    let entriesToRender = [...State.allBlacklistEntriesCache];

    const query = (document.getElementById('blacklistSearchInput')?.value || '')
        .trim()
        .toLowerCase();
    if (query) {
        entriesToRender = entriesToRender.filter((entry) => {
            const orgNameMatch =
                entry.organizationNameLc && entry.organizationNameLc.includes(query);
            const innMatch = entry.inn && entry.inn.includes(query);
            const phoneMatch = entry.phone && entry.phone.includes(query);
            const notesMatch = entry.notes && entry.notes.toLowerCase().includes(query);
            return orgNameMatch || innMatch || phoneMatch || notesMatch;
        });
    }

    entriesToRender.sort((a, b) => {
        const directionMultiplier = State.currentBlacklistSort.direction === 'desc' ? -1 : 1;

        const levelA = a.level || 1;
        const levelB = b.level || 1;
        const dateA = new Date(a.dateAdded || 0).getTime();
        const dateB = new Date(b.dateAdded || 0).getTime();

        if (State.currentBlacklistSort.criteria === 'level') {
            const levelDifference = levelA - levelB;
            if (levelDifference !== 0) {
                return levelDifference * directionMultiplier;
            }
            return dateB - dateA;
        }

        if (State.currentBlacklistSort.criteria === 'date') {
            const dateDifference = dateA - dateB;
            if (dateDifference !== 0) {
                return dateDifference * directionMultiplier;
            }
            return levelB - levelA;
        }
        return dateB - dateA;
    });

    renderBlacklistTable(entriesToRender);
}

/**
 * Рендерит таблицу черного списка
 */
export function renderBlacklistTable(entries) {
    const container = document.getElementById('blacklistTableContainer');
    if (!container) {
        console.error('renderBlacklistTable: Контейнер #blacklistTableContainer не найден.');
        return;
    }
    container.innerHTML = '';

    if (!entries || entries.length === 0) {
        const query = document.getElementById('blacklistSearchInput')?.value || '';
        if (query.trim()) {
            container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-center py-4">По запросу "${deps.escapeHtml?.(
                query
            ) || query}" ничего не найдено.</p>`;
        } else {
            container.innerHTML =
                '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Черный список пуст.</p>';
        }
        return;
    }

    const table = document.createElement('table');

    table.className = 'w-full divide-y divide-gray-200 dark:divide-gray-600 table-fixed';

    table.innerHTML = `
        <thead class="bg-gray-50 dark:bg-gray-700/50">
            <tr>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[25%]">Организация</th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%]">ИНН</th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%]">Телефон</th>
                <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%]">Уровень</th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%]">Дата доб.</th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Примечание</th>
                <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%]">Действия</th>
            </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        </tbody>
    `;

    const tbody = table.querySelector('tbody');
    const lowerQuery = (document.getElementById('blacklistSearchInput')?.value || '')
        .trim()
        .toLowerCase();

    const highlight = (text) => {
        if (!text || !lowerQuery) return deps.escapeHtml?.(text) || text;
        const regex = new RegExp(`(${deps.escapeRegExp?.(lowerQuery) || lowerQuery})`, 'gi');
        return (deps.escapeHtml?.(text) || text).replace(
            regex,
            '<mark class="bg-yellow-200 dark:bg-yellow-600 rounded-sm px-0.5">$1</mark>'
        );
    };

    entries.forEach((entry) => {
        const tr = document.createElement('tr');
        tr.dataset.entryId = entry.id;
        tr.className =
            'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer';

        const level = entry.level || 1;
        let levelHtml = '',
            levelText = 'Низкий',
            levelColorClass =
                'bg-green-100 text-green-800 dark:bg-green-800/80 dark:text-green-200';
        switch (level) {
            case 2:
                levelText = 'Средний';
                levelColorClass =
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/80 dark:text-yellow-200';
                break;
            case 3:
                levelText = 'Высокий';
                levelColorClass = 'bg-red-100 text-red-800 dark:bg-red-800/80 dark:text-red-200';
                break;
        }
        levelHtml = `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${levelColorClass}" title="Уровень ${level}: ${levelText}">${level}</span>`;

        const dateAddedStr = entry.dateAdded
            ? new Date(entry.dateAdded).toLocaleDateString()
            : 'N/A';

        const escHtml = deps.escapeHtml || ((s) => s);

        tr.innerHTML = `
            <td class="px-4 py-4 text-sm font-medium text-gray-800 dark:text-gray-100">
                <div class="truncate" title="${escHtml(entry.organizationName)}">${highlight(
            entry.organizationName
        )}</div>
            </td>
            <td class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 font-mono">
                <div class="truncate" title="${escHtml(entry.inn || '-')}">${highlight(
            entry.inn || '-'
        )}</div>
            </td>
            <td class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 font-mono">
                <div class="truncate" title="${escHtml(entry.phone || '-')}">${highlight(
            entry.phone || '-'
        )}</div>
            </td>
            <td class="px-4 py-4 text-sm text-center">${levelHtml}</td>
            <td class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">${dateAddedStr}</td>
            <td class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                <div class="truncate" title="${escHtml(entry.notes || '')}">${highlight(
            entry.notes || ''
        )}</div>
            </td>
            <td class="px-4 py-4 text-right text-sm font-medium">
                <button class="text-primary hover:text-secondary p-1" data-action="edit" title="Редактировать"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-800 p-1 ml-2" data-action="delete" title="Удалить"><i class="fas fa-trash"></i></button>
            </td>
        `;

        if (level === 3) {
            tr.classList.add('bg-red-50/50', 'dark:bg-red-900/40');
        } else if (level === 2) {
            tr.classList.add('bg-yellow-50/50', 'dark:bg-yellow-900/30');
        }

        tbody.appendChild(tr);
    });

    container.appendChild(table);
}

// ============================================================================
// ЗАГРУЗКА ДАННЫХ
// ============================================================================

/**
 * Загружает записи черного списка из БД
 */
export async function loadBlacklistedClients() {
    if (!State.db) {
        console.error('loadBlacklistedClients: DB not ready.');
        State.allBlacklistEntriesCache = [];
        sortAndRenderBlacklist();
        return;
    }
    try {
        const entries = await getAllBlacklistEntriesDB();
        State.allBlacklistEntriesCache = entries || [];

        State.allBlacklistEntriesCache.forEach((entry) => {
            if (!entry.dateAdded) {
                entry.dateAdded = entry.dateUpdated || new Date(0).toISOString();
            }
        });

        sortAndRenderBlacklist();
    } catch (error) {
        console.error('Ошибка загрузки черного списка:', error);
        State.allBlacklistEntriesCache = [];
        sortAndRenderBlacklist();
        deps.showNotification?.('Ошибка загрузки черного списка', 'error');
    }
}

/**
 * Обработчик поиска в черном списке
 */
export async function handleBlacklistSearchInput() {
    const searchInput = document.getElementById('blacklistSearchInput');
    const clearSearchBtn = document.getElementById('clearBlacklistSearchBtn');

    if (!searchInput) {
        console.error('handleBlacklistSearchInput: Поле ввода не найдено.');
        return;
    }

    State.currentBlacklistSearchQuery = searchInput.value;

    if (clearSearchBtn) {
        clearSearchBtn.classList.toggle('hidden', State.currentBlacklistSearchQuery.trim().length === 0);
    }

    sortAndRenderBlacklist();
}

// ============================================================================
// ЭКСПОРТ В EXCEL
// ============================================================================

/**
 * Экспортирует черный список в Excel файл
 */
export async function exportBlacklistToExcel() {
    try {
        const XLSX = deps.XLSX || window.XLSX;
        if (typeof XLSX === 'undefined') {
            deps.showNotification?.(
                'Библиотека XLSX не загружена. Проверьте подключение в index.html.',
                'error'
            );
            return;
        }
        const entries = (await getAllBlacklistEntriesDB()) || [];
        if (!entries.length) {
            deps.showNotification?.('Нет данных для экспорта.', 'warning');
            return;
        }

        const levelLabel = (n) => (n === 3 ? 'Высокий' : n === 2 ? 'Средний' : 'Низкий');
        const sanitizeExcelText = (val) => {
            if (val === null || val === undefined) return '';
            const s = String(val);
            return /^[=+\-@]/.test(s) ? "'" + s : s;
        };
        const fmtDate = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '';
            const pad = (x) => String(x).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
                d.getHours()
            )}-${pad(d.getMinutes())}`;
        };

        const grouped = { 1: [], 2: [], 3: [] };
        for (const e of entries) {
            const lvl = [1, 2, 3].includes(e.level) ? e.level : 1;
            grouped[lvl].push({
                Организация: sanitizeExcelText(e.organizationName || ''),
                ИНН: sanitizeExcelText(e.inn || ''),
                Телефон: sanitizeExcelText(e.phone || ''),
                Уровень: levelLabel(lvl),
                'Дата добавления': fmtDate(e.dateAdded || e.dateUpdated),
                Примечание: sanitizeExcelText(e.notes || ''),
            });
        }

        const headers = [
            'Организация',
            'ИНН',
            'Телефон',
            'Уровень',
            'Дата добавления',
            'Примечание',
        ];
        const wb = XLSX.utils.book_new();
        const addSheet = (rows, name) => {
            const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
            const colWidths = headers.map((h) => {
                const maxLen = Math.max(
                    h.length,
                    ...rows.map((r) => (r[h] ? String(r[h]).length : 0))
                );
                return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
            });
            ws['!cols'] = colWidths;
            XLSX.utils.book_append_sheet(wb, ws, name);
        };

        addSheet(grouped[1], 'Низкий (уровень 1)');
        addSheet(grouped[2], 'Средний (уровень 2)');
        addSheet(grouped[3], 'Высокий (уровень 3)');

        const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
        XLSX.writeFile(wb, `Черный_список_жаб_${ts}.xlsx`);
        deps.showNotification?.('Экспорт в Excel выполнен.', 'success');
    } catch (err) {
        console.error('[exportBlacklistToExcel] Ошибка экспорта:', err);
        deps.showNotification?.(
            `Ошибка экспорта в Excel: ${err?.message || 'Неизвестная ошибка'}`,
            'error'
        );
    }
}

// ============================================================================
// CRUD ОПЕРАЦИИ
// ============================================================================

/**
 * Обработчик кликов по действиям в таблице черного списка
 */
export function handleBlacklistActionClick(event) {
    const button = event.target.closest('button[data-action]');
    const tr = event.target.closest('tr[data-entry-id]');

    if (!tr) return;

    const entryId = parseInt(tr.dataset.entryId, 10);
    const action = button ? button.dataset.action : null;

    if (action === 'edit') {
        showBlacklistEntryModal(entryId);
    } else if (action === 'delete') {
        const orgName = tr.querySelector('td:first-child').textContent;
        if (confirm(`Вы уверены, что хотите удалить "${orgName}" из черного списка?`)) {
            deleteBlacklistEntry(entryId);
        }
    } else if (!action) {
        showBlacklistDetailModal(entryId);
    }
}

/**
 * Показывает модальное окно с деталями записи
 */
export async function showBlacklistDetailModal(entryId) {
    const modalId = 'blacklistDetailModal';
    let modal = document.getElementById(modalId);

    const escHtml = deps.escapeHtml || ((s) => s);

    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className =
            'fixed inset-0 bg-black bg-opacity-50 hidden z-60 p-4 flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div class="flex justify-between items-start gap-4">
                        <h2 id="blacklistDetailTitle" class="text-lg font-bold text-gray-900 dark:text-gray-100 break-words min-w-0">Детали записи</h2>
                        <div class="flex-shrink-0">
                            <button class="close-modal-btn p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Закрыть (Esc)"><i class="fas fa-times text-xl"></i></button>
                        </div>
                    </div>
                </div>
                <div id="blacklistDetailContent" class="p-6 overflow-y-auto">
                </div>
                <div class="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 flex justify-end gap-3">
                    <button id="blacklistDetailEditBtn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium">Редактировать</button>
                    <button id="blacklistDetailDeleteBtn" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium">Удалить</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.classList.add('hidden');
            if (deps.getVisibleModals?.().length === 0) document.body.classList.remove('modal-open');
        };

        modal
            .querySelectorAll('.close-modal-btn')
            .forEach((btn) => btn.addEventListener('click', closeModal));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
        });

        modal.querySelector('#blacklistDetailEditBtn').addEventListener('click', () => {
            const currentId = parseInt(modal.dataset.currentId, 10);
            if (currentId) {
                closeModal();
                showBlacklistEntryModal(currentId);
            }
        });

        modal.querySelector('#blacklistDetailDeleteBtn').addEventListener('click', async () => {
            const currentId = parseInt(modal.dataset.currentId, 10);
            const entry = await getBlacklistEntryDB(currentId);
            if (
                entry &&
                confirm(
                    `Вы уверены, что хотите удалить "${entry.organizationName}" из черного списка?`
                )
            ) {
                closeModal();
                deleteBlacklistEntry(currentId);
            }
        });
    }

    const titleEl = modal.querySelector('#blacklistDetailTitle');
    const contentEl = modal.querySelector('#blacklistDetailContent');

    titleEl.textContent = 'Загрузка...';
    contentEl.innerHTML = '<p class="text-center text-gray-500">Загрузка данных...</p>';
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    modal.dataset.currentId = entryId;

    try {
        const entry = await getFromIndexedDB('blacklistedClients', entryId);
        if (!entry) {
            titleEl.textContent = 'Ошибка';
            contentEl.innerHTML = '<p class="text-center text-red-500">Запись не найдена.</p>';
            return;
        }

        titleEl.textContent = entry.organizationName;

        const level = entry.level || 1;
        let levelText = 'Низкий',
            levelColorClass =
                'bg-green-100 text-green-800 dark:bg-green-800/80 dark:text-green-200';
        switch (level) {
            case 2:
                levelText = 'Средний';
                levelColorClass =
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/80 dark:text-yellow-200';
                break;
            case 3:
                levelText = 'Высокий';
                levelColorClass = 'bg-red-100 text-red-800 dark:bg-red-800/80 dark:text-red-200';
                break;
        }

        contentEl.innerHTML = `
            <dl class="space-y-4">
                <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Уровень</dt>
                    <dd class="mt-1"><span class="px-2.5 py-1 text-sm font-semibold ${levelColorClass}">${level} - ${levelText}</span></dd>
                </div>
                <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">ИНН</dt>
                    <dd class="mt-1 text-base text-gray-900 dark:text-gray-200 font-mono">${escHtml(
                        entry.inn || 'Не указан'
                    )}</dd>
                </div>
                 <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Телефон</dt>
                    <dd class="mt-1 text-base text-gray-900 dark:text-gray-200 font-mono">${escHtml(
                        entry.phone || 'Не указан'
                    )}</dd>
                </div>
                <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Примечание</dt>
                    <dd class="mt-1 text-base text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/60 p-3 rounded-md whitespace-pre-wrap">${escHtml(
                        entry.notes || 'Нет'
                    )}</dd>
                </div>
                 <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Дата добавления</dt>
                    <dd class="mt-1 text-base text-gray-900 dark:text-gray-200">${new Date(
                        entry.dateAdded
                    ).toLocaleString()}</dd>
                </div>
            </dl>
        `;
    } catch (error) {
        titleEl.textContent = 'Ошибка';
        contentEl.innerHTML = `<p class="text-center text-red-500">Не удалось загрузить данные: ${error.message}</p>`;
    }
}

/**
 * Показывает модальное окно добавления/редактирования записи
 */
export async function showBlacklistEntryModal(entryId = null) {
    const modalId = 'blacklistEntryModal';
    if (
        State.blacklistEntryModalInstance &&
        State.blacklistEntryModalInstance.modal &&
        State.blacklistEntryModalInstance.modal.id !== modalId
    ) {
        State.blacklistEntryModalInstance = null;
    }

    if (!State.blacklistEntryModalInstance) {
        State.blacklistEntryModalInstance = {};
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className =
            'fixed inset-0 bg-black bg-opacity-50 hidden z-50 p-4 flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
                <form id="blacklistEntryForm">
                    <div class="p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-xl font-bold" id="blacklistEntryModalTitle">Добавить в черный список</h2>
                            <button type="button" class="close-modal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" aria-label="Закрыть"><i class="fas fa-times text-xl"></i></button>
                        </div>
                        <input type="hidden" id="blacklistEntryId">
                        <div class="mb-3">
                            <label for="blacklistEntryOrgName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Название организации <span class="text-red-500">*</span></label>
                            <input type="text" id="blacklistEntryOrgName" required class="mt-1 block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm">
                        </div>
                        <div class="mb-3">
                            <label for="blacklistEntryInn" class="block text-sm font-medium text-gray-700 dark:text-gray-300">ИНН</label>
                            <input type="text" id="blacklistEntryInn" class="mt-1 block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" pattern="[0-9]{10}|[0-9]{12}">
                        </div>
                        <div class="mb-3">
                            <label for="blacklistEntryPhone" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Номер телефона</label>
                            <input type="tel" id="blacklistEntryPhone" class="mt-1 block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm">
                        </div>
                        <div class="mb-3">
                            <label for="blacklistEntryNotes" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Примечание</label>
                            <textarea id="blacklistEntryNotes" rows="3" class="mt-1 block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"></textarea>
                        </div>
                        <div class="mb-3">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Уровень опасности</label>
                            <div class="mt-2 flex items-center space-x-6">
                                <label class="flex items-center">
                                    <input type="radio" name="blacklistLevel" value="1" class="form-radio h-4 w-4 text-green-600 focus:ring-green-500">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">1 (Низкий)</span>
                                </label>
                                <label class="flex items-center">
                                    <input type="radio" name="blacklistLevel" value="2" class="form-radio h-4 w-4 text-yellow-500 focus:ring-yellow-400">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">2 (Средний)</span>
                                </label>
                                <label class="flex items-center">
                                    <input type="radio" name="blacklistLevel" value="3" class="form-radio h-4 w-4 text-red-600 focus:ring-red-500">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">3 (Высокий)</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700 text-right rounded-b-lg">
                        <button type="button" class="cancel-modal px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 rounded-md mr-2">Отмена</button>
                        <button type="submit" id="saveBlacklistEntryBtn" class="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md">Сохранить</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        State.blacklistEntryModalInstance.modal = modal;
        State.blacklistEntryModalInstance.form = modal.querySelector('#blacklistEntryForm');
        State.blacklistEntryModalInstance.titleEl = modal.querySelector('#blacklistEntryModalTitle');
        State.blacklistEntryModalInstance.idInput = modal.querySelector('#blacklistEntryId');
        State.blacklistEntryModalInstance.orgNameInput = modal.querySelector('#blacklistEntryOrgName');
        State.blacklistEntryModalInstance.innInput = modal.querySelector('#blacklistEntryInn');
        State.blacklistEntryModalInstance.phoneInput = modal.querySelector('#blacklistEntryPhone');
        State.blacklistEntryModalInstance.notesInput = modal.querySelector('#blacklistEntryNotes');
        State.blacklistEntryModalInstance.saveBtn = modal.querySelector('#saveBlacklistEntryBtn');

        State.blacklistEntryModalInstance.form.addEventListener('submit', handleSaveBlacklistEntry);
        modal.querySelectorAll('.close-modal, .cancel-modal').forEach((btn) =>
            btn.addEventListener('click', () => {
                modal.classList.add('hidden');
                if (deps.getVisibleModals?.().length === 0) {
                    document.body.classList.remove('modal-open');
                }
            })
        );
    }

    const {
        modal,
        form,
        titleEl,
        idInput,
        orgNameInput,
        innInput,
        phoneInput,
        notesInput,
        saveBtn,
    } = State.blacklistEntryModalInstance;

    form.reset();
    idInput.value = '';
    orgNameInput.setCustomValidity('');
    innInput.setCustomValidity('');
    phoneInput.setCustomValidity('');

    const level1Radio = form.querySelector('input[name="blacklistLevel"][value="1"]');
    if (level1Radio) level1Radio.checked = true;

    if (entryId !== null) {
        titleEl.textContent = 'Редактировать запись';
        saveBtn.textContent = 'Сохранить изменения';
        try {
            const entry = await getBlacklistEntryDB(entryId);
            if (entry) {
                idInput.value = entry.id;
                orgNameInput.value = entry.organizationName || '';
                innInput.value = entry.inn || '';
                phoneInput.value = entry.phone || '';
                notesInput.value = entry.notes || '';

                const level = entry.level || 1;
                const levelRadio = form.querySelector(
                    `input[name="blacklistLevel"][value="${level}"]`
                );
                if (levelRadio) {
                    levelRadio.checked = true;
                } else if (level1Radio) {
                    level1Radio.checked = true;
                }
            } else {
                deps.showNotification?.('Запись для редактирования не найдена', 'error');
                return;
            }
        } catch (error) {
            deps.showNotification?.('Ошибка загрузки записи для редактирования', 'error');
            return;
        }
    } else {
        titleEl.textContent = 'Добавить в черный список';
        saveBtn.textContent = 'Добавить';
    }
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    orgNameInput.focus();
}

/**
 * Обработчик сохранения записи черного списка
 */
export async function handleSaveBlacklistEntry(event) {
    event.preventDefault();
    const { form, idInput, orgNameInput, innInput, phoneInput, notesInput, saveBtn, modal } =
        State.blacklistEntryModalInstance;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Сохранение...';

    const organizationName = orgNameInput.value.trim();
    const inn = innInput.value.trim();
    const phone = phoneInput.value.trim();
    const notes = notesInput.value.trim();
    const level = parseInt(
        form.querySelector('input[name="blacklistLevel"]:checked')?.value || '1',
        10
    );
    const id = idInput.value ? parseInt(idInput.value, 10) : null;

    if (!organizationName) {
        orgNameInput.setCustomValidity('Название организации обязательно для заполнения.');
        orgNameInput.reportValidity();
        setTimeout(() => orgNameInput.setCustomValidity(''), 3000);
        saveBtn.disabled = false;
        saveBtn.textContent = id ? 'Сохранить изменения' : 'Добавить';
        return;
    }

    if (inn && !/^\d{10}$|^\d{12}$/.test(inn)) {
        innInput.setCustomValidity('ИНН должен состоять из 10 или 12 цифр.');
        innInput.reportValidity();
        setTimeout(() => innInput.setCustomValidity(''), 3000);
        saveBtn.disabled = false;
        saveBtn.textContent = id ? 'Сохранить изменения' : 'Добавить';
        return;
    }

    const entryData = {
        organizationName,
        organizationNameLc: organizationName.toLowerCase(),
        inn: inn || null,
        phone: phone || null,
        notes: notes || null,
        level: level,
        dateUpdated: new Date().toISOString(),
    };

    try {
        let oldData = null;
        if (id) {
            entryData.id = id;
            oldData = await getBlacklistEntryDB(id);
            entryData.dateAdded = oldData?.dateAdded || new Date().toISOString();
            await updateBlacklistEntryDB(entryData);
            deps.showNotification?.('Запись успешно обновлена', 'success');
        } else {
            entryData.dateAdded = new Date().toISOString();
            const newId = await addBlacklistEntryDB(entryData);
            entryData.id = newId;
            deps.showNotification?.('Запись успешно добавлена', 'success');
        }

        State.allBlacklistEntriesCache = await getAllBlacklistEntriesDB();
        sortAndRenderBlacklist();

        if (deps.updateSearchIndex) {
            await deps.updateSearchIndex(
                'blacklistedClients',
                entryData.id,
                entryData,
                id ? 'update' : 'add',
                oldData
            );
        }
        modal.classList.add('hidden');
        if (deps.getVisibleModals?.().length === 0) {
            document.body.classList.remove('modal-open');
        }
    } catch (error) {
        console.error('Ошибка сохранения записи в черный список:', error);
        deps.showNotification?.('Ошибка сохранения записи', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = id ? 'Сохранить изменения' : 'Добавить';
    }
}

/**
 * Удаляет запись из черного списка
 */
export async function deleteBlacklistEntry(entryId) {
    try {
        const entryToDelete = await getBlacklistEntryDB(entryId);
        await deleteBlacklistEntryDB(entryId);

        State.allBlacklistEntriesCache = await getAllBlacklistEntriesDB();
        await handleBlacklistSearchInput();

        if (deps.updateSearchIndex && entryToDelete) {
            await deps.updateSearchIndex('blacklistedClients', entryId, entryToDelete, 'delete');
        }
        deps.showNotification?.('Запись удалена из черного списка', 'success');
    } catch (error) {
        console.error('Ошибка удаления записи из черного списка:', error);
        deps.showNotification?.('Ошибка удаления записи', 'error');
    }
}

// ============================================================================
// ПРЕДУПРЕЖДЕНИЕ
// ============================================================================

/**
 * Показывает предупреждение о черном списке
 */
export function showBlacklistWarning() {
    if (State.currentBlacklistWarningOverlay) {
        State.currentBlacklistWarningOverlay.remove();
        State.currentBlacklistWarningOverlay = null;
    }

    const overlay = document.createElement('div');
    overlay.id = 'blacklistWarningOverlay';
    overlay.className =
        'fixed inset-0 bg-red-700 dark:bg-red-800 text-white p-8 flex flex-col items-center justify-center text-center z-[10000]';
    overlay.innerHTML = `
        <div class="max-w-2xl">
            <i class="fas fa-exclamation-triangle fa-3x mb-6 text-yellow-300"></i>
            <h1 class="text-3xl font-bold mb-4">ВНИМАНИЕ!</h1>
            <p class="text-lg mb-3">Раздел "Черный список клиентов-жаб" предназначен для использования с особой осторожностью.</p>
            <p class="text-lg mb-6">Не рекомендуется к использованию, если вы не руководитель группы, ведущий специалист или старший технический специалист!</p>
            <p class="text-base mb-8">Используйте крайне осторожно, внимательно и избирательно! НЕ ЗЛОУПОТРЕБЛЯТЬ!</p>
            <button id="acceptBlacklistWarningBtn" class="px-8 py-3 bg-yellow-400 hover:bg-yellow-500 text-red-800 font-bold rounded-lg shadow-lg transition-colors">
                Я понимаю и принимаю риски
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
    State.currentBlacklistWarningOverlay = overlay;
    document.body.classList.add('overflow-hidden');

    const acceptBtn = overlay.querySelector('#acceptBlacklistWarningBtn');
    acceptBtn.addEventListener('click', () => {
        overlay.remove();
        State.currentBlacklistWarningOverlay = null;
        if (deps.getVisibleModals?.().length === 0) {
            document.body.classList.remove('overflow-hidden');
        }
        deps.setActiveTab?.('blacklistedClients', true);
    });
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

/**
 * Инициализирует систему черного списка
 */
export function initBlacklistSystem() {
    const section = document.getElementById('blacklistedClientsContent');
    const q = (sel) => (section ? section.querySelector(sel) : null);

    const addBlacklistEntryBtn = q('#addBlacklistEntryBtn');
    const blacklistTableContainer = q('#blacklistTableContainer');
    const searchInput = q('#blacklistSearchInput');
    const clearSearchBtn = q('#clearBlacklistSearchBtn');
    const actionsContainer = q('.flex.justify-between.items-center.mb-4');

    if (addBlacklistEntryBtn) {
        if (addBlacklistEntryBtn._clickHandler) {
            addBlacklistEntryBtn.removeEventListener('click', addBlacklistEntryBtn._clickHandler);
        }
        addBlacklistEntryBtn._clickHandler = () => showBlacklistEntryModal();
        addBlacklistEntryBtn.addEventListener('click', addBlacklistEntryBtn._clickHandler);
        addBlacklistEntryBtn.classList.add(
            'h-9',
            'px-3.5',
            'leading-5',
            'inline-flex',
            'items-center',
            'gap-2',
            'whitespace-nowrap',
            'border',
            'border-transparent'
        );
    } else {
        console.warn('Кнопка #addBlacklistEntryBtn не найдена в секции blacklist.');
    }

    if (blacklistTableContainer) {
        if (blacklistTableContainer._clickHandler) {
            blacklistTableContainer.removeEventListener(
                'click',
                blacklistTableContainer._clickHandler
            );
        }
        blacklistTableContainer._clickHandler = (e) => handleBlacklistActionClick(e);
        blacklistTableContainer.addEventListener('click', blacklistTableContainer._clickHandler);
    }

    if (searchInput) {
        if (searchInput._debouncedSearchHandler) {
            searchInput.removeEventListener('input', searchInput._debouncedSearchHandler);
        }
        searchInput._debouncedSearchHandler = deps.debounce?.(handleBlacklistSearchInput, 300) || handleBlacklistSearchInput;
        searchInput.addEventListener('input', searchInput._debouncedSearchHandler);
        if (clearSearchBtn)
            clearSearchBtn.classList.toggle('hidden', searchInput.value.length === 0);
    }

    if (clearSearchBtn) {
        if (clearSearchBtn._clearClickHandler) {
            clearSearchBtn.removeEventListener('click', clearSearchBtn._clearClickHandler);
        }
        clearSearchBtn._clearClickHandler = () => {
            if (!searchInput) return;
            searchInput.value = '';
            searchInput.focus();
            searchInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        };
        clearSearchBtn.addEventListener('click', clearSearchBtn._clearClickHandler);
    }

    if (actionsContainer) {
        const rightContainer = addBlacklistEntryBtn
            ? addBlacklistEntryBtn.parentElement
            : actionsContainer;
        if (rightContainer) rightContainer.classList.add('flex', 'items-center', 'gap-2');

        let sortControls = document.getElementById('blacklistSortControls');
        if (!sortControls) {
            sortControls = document.createElement('div');
            sortControls.id = 'blacklistSortControls';
            sortControls.className = 'flex items-center gap-2';
            sortControls.innerHTML = `
                <button id="sortBlacklistByLevel"
                    class="h-9 px-3.5 leading-5 text-sm font-medium rounded-md transition
                           inline-flex items-center gap-1.5 whitespace-nowrap
                           shadow-sm border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50"
                    data-sort="level">
                    <span class="btn-label">По уровню</span>
                    <i class="sort-icon fas ml-1 w-3 opacity-0"></i>
                </button>
                <button id="sortBlacklistByDate"
                    class="h-9 px-3.5 leading-5 text-sm font-medium rounded-md transition
                           inline-flex items-center gap-1.5 whitespace-nowrap
                           shadow-sm border border-gray-300 dark:border-gray-600
                           bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50"
                    data-sort="date">
                    <span class="btn-label">По дате</span>
                    <i class="sort-icon fas ml-1 w-3 opacity-0"></i>
                </button>
            `;
            if (rightContainer && addBlacklistEntryBtn) {
                rightContainer.insertBefore(sortControls, addBlacklistEntryBtn);
            } else if (rightContainer) {
                rightContainer.appendChild(sortControls);
            } else {
                actionsContainer.appendChild(sortControls);
            }
        }

        let exportBtn = document.getElementById('exportBlacklistToExcelBtn');
        if (!exportBtn) {
            exportBtn = document.createElement('button');
            exportBtn.id = 'exportBlacklistToExcelBtn';
            exportBtn.className =
                'h-9 px-3.5 leading-5 text-sm font-medium rounded-md transition ' +
                'inline-flex items-center gap-2 whitespace-nowrap shadow-sm ' +
                'bg-emerald-600 text-white hover:bg-emerald-700 border border-transparent';
            exportBtn.innerHTML = '<i class="fas fa-file-excel"></i><span>Экспорт</span>';
            if (rightContainer && addBlacklistEntryBtn) {
                rightContainer.insertBefore(exportBtn, addBlacklistEntryBtn);
            } else if (rightContainer) {
                rightContainer.appendChild(exportBtn);
            } else {
                actionsContainer.appendChild(exportBtn);
            }
        }
        if (exportBtn) {
            if (exportBtn._clickHandler)
                exportBtn.removeEventListener('click', exportBtn._clickHandler);
            exportBtn._clickHandler = () => exportBlacklistToExcel();
            exportBtn.addEventListener('click', exportBtn._clickHandler);
        }

        const updateSortButtonsUI = () => {
            const levelBtn = document.getElementById('sortBlacklistByLevel');
            const dateBtn = document.getElementById('sortBlacklistByDate');
            if (!levelBtn || !dateBtn) return;

            const baseCompact =
                'h-9 px-3.5 leading-5 text-sm font-medium rounded-md transition ' +
                'inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm border';

            [levelBtn, dateBtn].forEach((btn) => {
                btn.className =
                    `${baseCompact} border-gray-300 dark:border-gray-600 ` +
                    `bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50`;
                const icon = btn.querySelector('.sort-icon');
                if (icon) icon.className = 'sort-icon fas ml-1 w-3 opacity-0';
            });

            const activeBtn = State.currentBlacklistSort.criteria === 'level' ? levelBtn : dateBtn;
            activeBtn.className = `${baseCompact} border-transparent bg-primary text-white hover:bg-secondary`;

            const activeIcon = activeBtn.querySelector('.sort-icon');
            if (activeIcon) {
                activeIcon.className = `sort-icon fas ${
                    State.currentBlacklistSort.direction === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up'
                } ml-1 w-3 opacity-100`;
            }
        };

        const handleSortClick = (criteria) => {
            if (State.currentBlacklistSort.criteria === criteria) {
                State.currentBlacklistSort.direction =
                    State.currentBlacklistSort.direction === 'desc' ? 'asc' : 'desc';
            } else {
                State.currentBlacklistSort.criteria = criteria;
                State.currentBlacklistSort.direction = 'desc';
            }
            updateSortButtonsUI();
            sortAndRenderBlacklist();
        };

        const levelBtn = document.getElementById('sortBlacklistByLevel');
        const dateBtn = document.getElementById('sortBlacklistByDate');

        if (levelBtn) {
            if (levelBtn._clickHandler)
                levelBtn.removeEventListener('click', levelBtn._clickHandler);
            levelBtn._clickHandler = () => handleSortClick('level');
            levelBtn.addEventListener('click', levelBtn._clickHandler);
        }
        if (dateBtn) {
            if (dateBtn._clickHandler) dateBtn.removeEventListener('click', dateBtn._clickHandler);
            dateBtn._clickHandler = () => handleSortClick('date');
            dateBtn.addEventListener('click', dateBtn._clickHandler);
        }

        updateSortButtonsUI();
    }

    loadBlacklistedClients();
    console.log('Система черного списка инициализирована (унифицированные метрики кнопок).');
}
