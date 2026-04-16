'use strict';

/**
 * Инициализация системы данных клиента (заметки, ИНН-превью, копирование).
 * Вынесено из script.js
 */

import { buildClientNotesInputCompositeHandler } from './client-notes-input-debounce.js';

let State = null;
let debounce = null;
let saveClientData = null;
let checkForBlacklistedInn = null;
let createClientNotesInnPreview = null;
let copyToClipboard = null;
let getFromIndexedDB = null;
let applyClientNotesFontSize = null;
let clearClientData = null;
let exportClientDataToTxt = null;
let getVisibleModals = null;
let showAppConfirm = null;
let openClientNotesWindow = null;
let openClientNotesPopupWindow = null;
let initTextareaHeightsPersistence = null;

export function setClientDataInitDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.debounce !== undefined) debounce = deps.debounce;
    if (deps.saveClientData !== undefined) saveClientData = deps.saveClientData;
    if (deps.checkForBlacklistedInn !== undefined)
        checkForBlacklistedInn = deps.checkForBlacklistedInn;
    if (deps.createClientNotesInnPreview !== undefined)
        createClientNotesInnPreview = deps.createClientNotesInnPreview;
    if (deps.copyToClipboard !== undefined) copyToClipboard = deps.copyToClipboard;
    if (deps.getFromIndexedDB !== undefined) getFromIndexedDB = deps.getFromIndexedDB;
    if (deps.applyClientNotesFontSize !== undefined)
        applyClientNotesFontSize = deps.applyClientNotesFontSize;
    if (deps.clearClientData !== undefined) clearClientData = deps.clearClientData;
    if (deps.exportClientDataToTxt !== undefined)
        exportClientDataToTxt = deps.exportClientDataToTxt;
    if (deps.getVisibleModals !== undefined) getVisibleModals = deps.getVisibleModals;
    if (deps.showAppConfirm !== undefined) showAppConfirm = deps.showAppConfirm;
    if (deps.openClientNotesWindow !== undefined)
        openClientNotesWindow = deps.openClientNotesWindow;
    if (deps.openClientNotesPopupWindow !== undefined)
        openClientNotesPopupWindow = deps.openClientNotesPopupWindow;
    if (deps.initTextareaHeightsPersistence !== undefined)
        initTextareaHeightsPersistence = deps.initTextareaHeightsPersistence;
}

let __lastCopyLockTime = 0;

function __acquireCopyLock(minIntervalMs = 250) {
    const now = Date.now();
    if (now - __lastCopyLockTime < minIntervalMs) {
        return false;
    }
    __lastCopyLockTime = now;
    return true;
}

/** На macOS для копирования ИНН и превью используется Cmd (metaKey), на Win/Linux — Ctrl (ctrlKey). */
export function isMac() {
    const plat = typeof navigator !== 'undefined' && navigator.platform ? navigator.platform : '';
    const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
    return /Mac/i.test(plat) || /Mac|iPhone|iPad/i.test(ua);
}

/**
 * Ищет ИНН (10 или 12 цифр) в тексте textarea рядом с текущей позицией курсора.
 * @param {HTMLTextAreaElement} ta
 * @returns {{ inn: string, start: number, end: number } | null}
 */
export function getInnAtCursor(ta) {
    if (!ta || typeof ta.value !== 'string') return null;
    const text = ta.value;
    const n = text.length;
    const isDigit = (ch) => ch >= '0' && ch <= '9';
    const basePos = ta.selectionStart ?? 0;
    const candidates = [basePos, basePos - 1, basePos + 1, basePos - 2, basePos + 2];
    for (const p of candidates) {
        if (p < 0 || p >= n) continue;
        if (!isDigit(text[p])) continue;
        let l = p,
            r = p + 1;
        while (l > 0 && isDigit(text[l - 1])) l--;
        while (r < n && isDigit(text[r])) r++;
        const token = text.slice(l, r);
        if (token.length === 10 || token.length === 12) {
            return { inn: token, start: l, end: r };
        }
    }
    return null;
}

/**
 * Вешает на textarea обработчик Ctrl+ЛКМ (Cmd+ЛКМ на Mac): выделение ИНН под курсором и копирование.
 * Используется для основного #clientNotes, плавающей панели и standalone-окна.
 * @param {HTMLTextAreaElement} textarea
 * @param {(text: string, message?: string) => Promise<boolean>|boolean} copyToClipboardFn
 * @param {() => void} [onAfterCopy] — опционально (напр. сброс превью в основном окне)
 * @returns {((e: MouseEvent) => void) | undefined} — обработчик (для сохранения в State / removeEventListener)
 */
export function attachInnCtrlClickToTextarea(textarea, copyToClipboardFn, onAfterCopy) {
    if (!textarea || typeof copyToClipboardFn !== 'function') return undefined;
    const handler = async (event) => {
        const modifier = isMac() ? event.metaKey : event.ctrlKey;
        if (!modifier) return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        if (!__acquireCopyLock(250)) return;

        await new Promise((resolve) => setTimeout(resolve, 0));

        const hit = getInnAtCursor(textarea);
        if (!hit) return;

        event.preventDefault();
        event.stopPropagation();

        try {
            textarea.setSelectionRange(hit.start, hit.end);
            await copyToClipboardFn(hit.inn, `ИНН ${hit.inn} скопирован!`);
        } catch (e) {
            console.error('[ClientDataSystem] Ошибка копирования ИНН по Ctrl+MouseDown:', e);
        } finally {
            if (typeof onAfterCopy === 'function') onAfterCopy();
        }
    };
    textarea.addEventListener('mousedown', handler);
    return handler;
}

export function ensureInnPreviewStyles() {
    if (document.getElementById('innPreviewStyles')) return;
    const style = document.createElement('style');
    style.id = 'innPreviewStyles';
    style.textContent = `
    .client-notes-preview{
        position: absolute;
        --inn-offset-x: 0.6px;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        overflow: hidden;
        scrollbar-width: none;
        -ms-overflow-style: none;
        background: transparent;
        pointer-events: none;
        z-index: 2;
    }
    .client-notes-preview::-webkit-scrollbar{
        width: 0; height: 0; display: none;
    }
        .client-notes-preview__inner{
        position: relative;
        will-change: transform;
    }
    .client-notes-preview .inn-highlight{
        color: var(--color-primary, #7aa2ff) !important;
        text-decoration: underline;
        text-decoration-color: var(--color-primary);
        text-decoration-thickness: .1em;
        text-underline-offset: .12em;
        text-decoration-skip-ink: auto;
        /* НИЧЕГО, что меняет метрики инлайна */
        display: inline;
        padding: 0;
        margin: 0;
    }
    .client-notes-preview .client-notes-inn-search-flash{
        background-color: var(--search-highlight-text-bg-light, #fff352);
        color: var(--search-highlight-text-color-light, #333333);
        border-radius: 2px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
        display: inline;
        padding: 0;
        margin: 0;
    }
    .dark .client-notes-preview .client-notes-inn-search-flash{
        background-color: var(--search-highlight-text-bg-dark, #ffd700);
        color: var(--search-highlight-text-color-dark, #1a1a1a);
    }
 
  `;
    document.head.appendChild(style);
}

export async function initClientDataSystem() {
    ensureInnPreviewStyles();
    const LOG_PREFIX = '[ClientDataSystem]';
    console.log(`${LOG_PREFIX} Запуск инициализации...`);

    const clientNotes = document.getElementById('clientNotes');
    if (!clientNotes) {
        console.error(
            `${LOG_PREFIX} КРИТИЧЕСКАЯ ОШИБКА: поле для заметок #clientNotes не найдено. Система не будет работать.`,
        );
        return;
    }
    console.log(`${LOG_PREFIX} Поле #clientNotes успешно найдено.`);

    const clearClientDataBtn = document.getElementById('clearClientDataBtn');
    if (!clearClientDataBtn) {
        console.warn(`${LOG_PREFIX} Кнопка #clearClientDataBtn не найдена.`);
    }

    const openClientNotesWindowBtn = document.getElementById('openClientNotesWindowBtn');
    if (openClientNotesWindowBtn && typeof openClientNotesWindow === 'function') {
        openClientNotesWindowBtn.addEventListener('click', () => openClientNotesWindow());
    }
    const openClientNotesPopupBtn = document.getElementById('openClientNotesPopupBtn');
    if (openClientNotesPopupBtn && typeof openClientNotesPopupWindow === 'function') {
        openClientNotesPopupBtn.addEventListener('click', () => openClientNotesPopupWindow());
    }

    const buttonContainer = clearClientDataBtn?.parentNode;
    if (!buttonContainer) {
        console.warn(
            `${LOG_PREFIX} Родительский контейнер для кнопок управления данными клиента не найден.`,
        );
    }

    if (State.clientNotesInputHandler) {
        clientNotes.removeEventListener('input', State.clientNotesInputHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'input' удален.`);
    }
    if (State.clientNotesKeydownHandler) {
        clientNotes.removeEventListener('keydown', State.clientNotesKeydownHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keydown' удален.`);
    }
    if (State.clientNotesCtrlClickHandler) {
        clientNotes.removeEventListener('mousedown', State.clientNotesCtrlClickHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'click' (Ctrl+Click INN) удален.`);
    }
    if (State.clientNotesBlurHandler) {
        clientNotes.removeEventListener('blur', State.clientNotesBlurHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'blur' (сброс курсора) удален.`);
    }
    if (State.clientNotesContextMenuHandler) {
        clientNotes.removeEventListener('contextmenu', State.clientNotesContextMenuHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'contextmenu' (сброс Ctrl при ПКМ) удален.`);
    }
    if (State.clientNotesCtrlKeyDownHandler) {
        document.removeEventListener('keydown', State.clientNotesCtrlKeyDownHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keydown' (Ctrl cursor) удален.`);
    }
    if (State.clientNotesCtrlKeyUpHandler) {
        document.removeEventListener('keyup', State.clientNotesCtrlKeyUpHandler);
        console.log(`${LOG_PREFIX} Старый обработчик 'keyup' (Ctrl cursor) удален.`);
    }

    if (window.__clientNotesInnPreviewInputHandler) {
        clientNotes.removeEventListener('input', window.__clientNotesInnPreviewInputHandler);
        window.__clientNotesInnPreviewInputHandler = null;
        console.log(`${LOG_PREFIX} Старый обработчик 'input' (ИНН-превью) удален.`);
    }
    if (
        window.__clientNotesInnPreview &&
        typeof window.__clientNotesInnPreview.destroy === 'function'
    ) {
        window.__clientNotesInnPreview.destroy();
        window.__clientNotesInnPreview = null;
        console.log(`${LOG_PREFIX} Старое ИНН-превью уничтожено.`);
    }

    State.clientNotesInputHandler = buildClientNotesInputCompositeHandler(
        debounce,
        clientNotes,
        LOG_PREFIX,
        saveClientData,
        checkForBlacklistedInn,
    );

    clientNotes.addEventListener('input', State.clientNotesInputHandler);
    console.log(
        `${LOG_PREFIX} Обработчик 'input': отдельный debounce для ЧС по ИНН и для автосохранения.`,
    );

    State.clientNotesKeydownHandler = (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            const textarea = event.target;
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const textBeforeCursor = value.substring(0, start);
            const regex = /(?:^|\n)\s*(\d+)([).])\s/g;
            let lastNum = 0;
            let delimiter = ')';
            let match;
            while ((match = regex.exec(textBeforeCursor)) !== null) {
                const currentNum = parseInt(match[1], 10);
                if (currentNum >= lastNum) {
                    lastNum = currentNum;
                    delimiter = match[2];
                }
            }
            const nextNum = lastNum + 1;
            let prefix = '\n\n';
            if (start === 0) {
                prefix = '';
            } else {
                const charBefore = value.substring(start - 1, start);
                if (charBefore === '\n') {
                    if (start >= 2 && value.substring(start - 2, start) === '\n\n') {
                        prefix = '';
                    } else {
                        prefix = '\n';
                    }
                }
            }
            const insertionText = prefix + nextNum + delimiter + ' ';
            textarea.value = value.substring(0, start) + insertionText + value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + insertionText.length;
            textarea.scrollTop = textarea.scrollHeight;
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
    };
    clientNotes.addEventListener('keydown', State.clientNotesKeydownHandler);
    console.log(`${LOG_PREFIX} Обработчик 'keydown' (Ctrl+Enter) успешно привязан.`);

    function releaseClientNotesCtrlState() {
        clientNotes.style.cursor = '';
        if (window.__clientNotesInnPreview) window.__clientNotesInnPreview.hide();
    }

    State.clientNotesCtrlClickHandler = attachInnCtrlClickToTextarea(
        clientNotes,
        copyToClipboard,
        releaseClientNotesCtrlState,
    );
    console.log(`${LOG_PREFIX} Обработчик 'mousedown' (Ctrl+Click INN→copy) привязан.`);

    State.clientNotesCtrlKeyDownHandler = (e) => {
        const isClientNotesFocused = document.activeElement === clientNotes;
        const modifier = isMac() ? e.metaKey : e.ctrlKey;
        if (modifier && isClientNotesFocused) {
            ensureInnPreviewStyles();
            if (!window.__clientNotesInnPreview) {
                window.__clientNotesInnPreview = createClientNotesInnPreview(clientNotes);
            }
            const p = window.__clientNotesInnPreview;
            p.show();
            p.update();
            if (!window.__clientNotesInnPreviewInputHandler) {
                window.__clientNotesInnPreviewInputHandler = () => {
                    if (window.__clientNotesInnPreview) window.__clientNotesInnPreview.update();
                };
                clientNotes.addEventListener('input', window.__clientNotesInnPreviewInputHandler);
            }
        }
    };
    State.clientNotesCtrlKeyUpHandler = (e) => {
        const modifier = isMac() ? e.metaKey : e.ctrlKey;
        if (!modifier) {
            releaseClientNotesCtrlState();
        }
    };
    State.clientNotesBlurHandler = () => {
        releaseClientNotesCtrlState();
    };
    State.clientNotesContextMenuHandler = () => {
        releaseClientNotesCtrlState();
    };
    document.addEventListener('keydown', State.clientNotesCtrlKeyDownHandler);
    document.addEventListener('keyup', State.clientNotesCtrlKeyUpHandler);
    clientNotes.addEventListener('blur', State.clientNotesBlurHandler);
    clientNotes.addEventListener('contextmenu', State.clientNotesContextMenuHandler);
    console.log(`${LOG_PREFIX} Индикация курсора при Ctrl/Meta активирована.`);

    if (clearClientDataBtn) {
        clearClientDataBtn.addEventListener('click', async () => {
            const confirmed =
                typeof showAppConfirm === 'function'
                    ? await showAppConfirm({
                          title: 'Очистка данных',
                          message: 'Вы уверены, что хотите очистить все данные по обращению?',
                          confirmText: 'Очистить',
                          cancelText: 'Отмена',
                          confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white',
                      })
                    : confirm('Вы уверены, что хотите очистить все данные по обращению?');
            if (confirmed) {
                clearClientData();
            }
        });
    }

    if (buttonContainer) {
        const existingExportBtn = document.getElementById('exportTextBtn');
        if (!existingExportBtn) {
            const exportTextBtn = document.createElement('button');
            exportTextBtn.id = 'exportTextBtn';
            exportTextBtn.innerHTML = `<i class="fas fa-save"></i>`;
            exportTextBtn.className =
                'w-8 h-8 flex items-center justify-center rounded-md bg-primary hover:bg-secondary text-white transition text-sm shrink-0';
            exportTextBtn.title = 'Сохранить заметки как .txt файл';
            exportTextBtn.addEventListener('click', exportClientDataToTxt);
            buttonContainer.appendChild(exportTextBtn);
        }
    }

    try {
        console.log(`${LOG_PREFIX} Загрузка начальных данных для clientNotes...`);
        let clientDataNotesValue = '';
        if (State.db) {
            const clientDataFromDB = await getFromIndexedDB('clientData', 'current');
            if (clientDataFromDB && clientDataFromDB.notes) {
                clientDataNotesValue = clientDataFromDB.notes;
            }
        } else {
            const localData = localStorage.getItem('clientData');
            if (localData) {
                try {
                    clientDataNotesValue = JSON.parse(localData).notes || '';
                } catch (e) {
                    console.warn(
                        '[initClientDataSystem] Ошибка парсинга clientData из localStorage:',
                        e,
                    );
                }
            }
        }
        clientNotes.value = clientDataNotesValue;
        console.log(`${LOG_PREFIX} Данные загружены. clientNotes.value установлен.`);

        applyClientNotesFontSize();
    } catch (error) {
        console.error(`${LOG_PREFIX} Ошибка при загрузке данных клиента:`, error);
    }

    if (typeof initTextareaHeightsPersistence === 'function') {
        initTextareaHeightsPersistence();
    }

    console.log(`${LOG_PREFIX} Инициализация системы данных клиента полностью завершена.`);
    try {
        const visibleModals = typeof getVisibleModals === 'function' ? getVisibleModals() : [];
        if (visibleModals.length === 0) {
            document.body.classList.remove('modal-open', 'overflow-hidden');
            if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
            if (document.documentElement.style.overflow === 'hidden')
                document.documentElement.style.overflow = '';
        }
    } catch (e) {
        console.warn('[initClientDataSystem] Ошибка при проверке модальных окон:', e);
    }
}
