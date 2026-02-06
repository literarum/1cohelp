'use strict';

/**
 * Модуль управления данными клиента
 * Содержит функции для сохранения, загрузки, экспорта и очистки данных клиента
 */

import { State } from '../app/state.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';

let deps = {
    showNotification: null,
    NotificationService: null,
    updateSearchIndex: null,
};

/**
 * Устанавливает зависимости модуля
 */
export function setClientDataDependencies(dependencies) {
    if (dependencies.showNotification) deps.showNotification = dependencies.showNotification;
    if (dependencies.NotificationService) deps.NotificationService = dependencies.NotificationService;
    if (dependencies.updateSearchIndex) deps.updateSearchIndex = dependencies.updateSearchIndex;
    console.log('[client-data.js] Зависимости установлены');
}

/**
 * Получает данные клиента из DOM
 * @returns {Object} объект с данными клиента
 */
export function getClientData() {
    const notesValue = document.getElementById('clientNotes')?.value ?? '';
    return {
        id: 'current',
        notes: notesValue,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Сохраняет данные клиента в IndexedDB или localStorage
 */
export async function saveClientData() {
    const clientDataToSave = getClientData();
    let oldData = null;
    let savedToDB = false;

    if (State.db) {
        try {
            oldData = await getFromIndexedDB('clientData', clientDataToSave.id);
            await saveToIndexedDB('clientData', clientDataToSave);
            console.log('Client data saved to IndexedDB');
            savedToDB = true;

            if (deps.updateSearchIndex && typeof deps.updateSearchIndex === 'function') {
                await deps.updateSearchIndex(
                    'clientData',
                    clientDataToSave.id,
                    clientDataToSave,
                    'update',
                    oldData,
                );
                console.log(
                    `Обновление индекса для clientData (${clientDataToSave.id}) инициировано.`,
                );
            }
        } catch (error) {
            console.error('Ошибка сохранения данных клиента в IndexedDB:', error);
            if (deps.showNotification) {
                deps.showNotification('Ошибка сохранения данных клиента', 'error');
            }
        }
    }

    if (!savedToDB) {
        try {
            localStorage.setItem('clientData', JSON.stringify(clientDataToSave));
            console.warn(
                'Данные клиента сохранены в localStorage (БД недоступна или ошибка сохранения в БД).',
            );

            if (State.db && deps.showNotification) {
                deps.showNotification(
                    'Данные клиента сохранены локально (резервное хранилище), но не в базу данных.',
                    'warning',
                );
            }
        } catch (lsError) {
            console.error(
                'Критическая ошибка: Не удалось сохранить данные клиента ни в БД, ни в localStorage!',
                lsError,
            );
            if (deps.showNotification) {
                deps.showNotification('Критическая ошибка: Не удалось сохранить данные клиента.', 'error');
            }
        }
    }
}

/**
 * Экспортирует данные клиента в TXT файл
 */
export async function exportClientDataToTxt() {
    const notes = document.getElementById('clientNotes')?.value ?? '';
    if (!notes.trim()) {
        if (deps.showNotification) {
            deps.showNotification('Нет данных для сохранения', 'error');
        }
        return;
    }

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const filename = `Обращение_1С_${timestamp}.txt`;
    const blob = new Blob([notes], { type: 'text/plain;charset=utf-8' });

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [
                    {
                        description: 'Текстовые файлы',
                        accept: { 'text/plain': ['.txt'] },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            if (deps.showNotification) {
                deps.showNotification('Файл успешно сохранен');
            }
            console.log('Экспорт текста клиента через File System Access API завершен успешно.');
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Сохранение файла отменено пользователем.');
                if (deps.showNotification) {
                    deps.showNotification('Сохранение файла отменено', 'info');
                }
            } else {
                console.error(
                    'Ошибка сохранения через File System Access API, используем fallback:',
                    err,
                );
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                if (deps.showNotification) {
                    deps.showNotification('Файл успешно сохранен (fallback)');
                }
                console.log('Экспорт текста клиента через data URI (fallback) завершен успешно.');
            }
        }
    } else {
        console.log('File System Access API не поддерживается, используем fallback.');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        if (deps.showNotification) {
            deps.showNotification('Файл успешно сохранен');
        }
        console.log('Экспорт текста клиента через data URI завершен успешно.');
    }
}

/**
 * Загружает данные клиента в DOM
 * @param {Object} data - объект с данными клиента
 */
export function loadClientData(data) {
    if (!data) return;
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes) {
        clientNotes.value = data.notes ?? '';
    }
}

/**
 * Очищает данные клиента
 */
export function clearClientData() {
    const LOG_PREFIX = '[ClearClientData V2]';
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes) {
        clientNotes.value = '';
        saveClientData();
        if (deps.showNotification) {
            deps.showNotification('Данные очищены');
        }

        console.log(`${LOG_PREFIX} Очистка состояний черного списка...`);

        if (deps.NotificationService && State.activeToadNotifications) {
            for (const notificationId of State.activeToadNotifications.values()) {
                deps.NotificationService.dismissImportant(notificationId);
            }
        }

        if (State.lastKnownInnCounts) {
            State.lastKnownInnCounts.clear();
        }
        if (State.activeToadNotifications) {
            State.activeToadNotifications.clear();
        }

        console.log(
            `${LOG_PREFIX} Состояния 'State.lastKnownInnCounts' и 'State.activeToadNotifications' очищены.`,
        );
    }
}

/**
 * Применяет размер шрифта для поля заметок клиента
 */
export function applyClientNotesFontSize() {
    const clientNotes = document.getElementById('clientNotes');
    if (clientNotes && State.userPreferences && typeof State.userPreferences.clientNotesFontSize === 'number') {
        const fontSize = State.userPreferences.clientNotesFontSize;
        clientNotes.style.fontSize = `${fontSize}%`;
        console.log(`[applyClientNotesFontSize] Font size for client notes set to ${fontSize}%.`);
    } else {
        if (!clientNotes)
            console.warn(
                '[applyClientNotesFontSize] Could not apply font size: #clientNotes element not found.',
            );
        if (!State.userPreferences || typeof State.userPreferences.clientNotesFontSize !== 'number') {
            console.warn(
                '[applyClientNotesFontSize] Could not apply font size: State.userPreferences.clientNotesFontSize is missing or invalid.',
            );
        }
    }
}

/**
 * Создает превью ИНН в поле заметок клиента
 * @param {HTMLTextAreaElement} textarea - элемент textarea
 * @param {Function} escapeHtml - функция для экранирования HTML
 * @param {Function} getVisibleModals - функция для получения видимых модальных окон
 * @returns {Object} объект с методами управления превью
 */
export function createClientNotesInnPreview(textarea, escapeHtml, getVisibleModals) {
    const wrapper = textarea.parentElement;
    try {
        const ws = getComputedStyle(wrapper);
        if (ws.position === 'static') wrapper.style.position = 'relative';
    } catch (_) {}

    const preview = document.createElement('div');
    preview.className = 'client-notes-preview';
    preview.style.display = 'none';
    const inner = document.createElement('div');
    inner.className = 'client-notes-preview__inner';
    preview.appendChild(inner);
    wrapper.appendChild(preview);

    const posOverlay = () => {
        const tr = textarea.getBoundingClientRect();
        const wr = wrapper.getBoundingClientRect();
        const left = tr.left - wr.left + wrapper.scrollLeft;
        const top = tr.top - wr.top + wrapper.scrollTop;
        preview.style.left = `${left}px`;
        preview.style.top = `${top}px`;
        preview.style.width = `${textarea.clientWidth}px`;
        preview.style.height = `${textarea.clientHeight}px`;
    };

    const getOffsetX = () => {
        const v = getComputedStyle(preview).getPropertyValue('--inn-offset-x').trim();
        return v ? parseFloat(v) : 0;
    };

    const computeUsedLineHeightPx = () => {
        const cs = getComputedStyle(textarea);
        if (cs.lineHeight && cs.lineHeight !== 'normal') return cs.lineHeight;
        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.whiteSpace = 'pre-wrap';
        probe.style.font =
            cs.font ||
            `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
        probe.style.letterSpacing = cs.letterSpacing;
        probe.textContent = 'A\nA';
        document.body.appendChild(probe);
        const h = probe.getBoundingClientRect().height / 2;
        document.body.removeChild(probe);
        return `${h}px`;
    };

    const syncMetrics = () => {
        const cs = getComputedStyle(textarea);
        preview.style.font = cs.font;
        preview.style.lineHeight = computeUsedLineHeightPx();
        preview.style.lineHeight = cs.lineHeight;
        preview.style.letterSpacing = cs.letterSpacing;
        preview.style.textAlign = cs.textAlign;
        preview.style.borderRadius = cs.borderRadius;
        preview.style.boxSizing = cs.boxSizing;
        preview.style.color = 'transparent';
        preview.style.paddingTop = cs.paddingTop;
        preview.style.paddingRight = cs.paddingRight;
        preview.style.paddingBottom = cs.paddingBottom;
        preview.style.paddingLeft = cs.paddingLeft;
        posOverlay();
    };

    const ensureBodyScrollUnlocked = () => {
        try {
            const hasVisibleModals =
                typeof getVisibleModals === 'function' && getVisibleModals().length > 0;
            if (!hasVisibleModals) {
                document.body.classList.remove('modal-open', 'overflow-hidden');
                if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
                if (document.documentElement.style.overflow === 'hidden')
                    document.documentElement.style.overflow = '';
            }
        } catch (_) {}
    };

    const update = () => {
        const text = textarea.value || '';
        const escaped =
            typeof escapeHtml === 'function'
                ? escapeHtml(text)
                : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const rx = /(^|\D)(\d{10}|\d{12})(?!\d)/g;
        inner.innerHTML = escaped.replace(rx, '$1<span class="inn-highlight">$2</span>');
        inner.style.transform = `translate(${getOffsetX()}px, ${-textarea.scrollTop}px)`;
        posOverlay();
    };

    const onScroll = () => {
        inner.style.transform = `translate(${getOffsetX()}px, ${-textarea.scrollTop}px)`;
    };
    textarea.addEventListener('scroll', onScroll);
    window.addEventListener('resize', () => {
        syncMetrics();
    });
    syncMetrics();

    return {
        show() {
            textarea.style.cursor = 'pointer';
            preview.style.display = '';
            syncMetrics();
            ensureBodyScrollUnlocked();
        },
        hide() {
            textarea.style.cursor = '';
            preview.style.display = 'none';
            ensureBodyScrollUnlocked();
        },
        update,
        destroy() {
            textarea.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', syncMetrics);
            preview.remove();
        },
    };
}
