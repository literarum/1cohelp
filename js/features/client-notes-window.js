'use strict';

/**
 * Отдельное перетаскиваемое окно «Информация по обращению».
 * Синхронизация с #clientNotes, применение стилей родителя, поддержка подсветки глобального поиска.
 */

let highlightElement = null;
let copyToClipboard = null;
let attachInnCtrlClickToTextarea = null;
let createClientNotesInnPreview = null;
let ensureInnPreviewStyles = null;

/** Превью подсветки ИНН для textarea плавающей панели (показ при зажатом Ctrl). */
let panelInnPreview = null;
let panelInnPreviewInputHandler = null;

export function setClientNotesWindowDependencies(deps) {
    if (deps.highlightElement !== undefined) highlightElement = deps.highlightElement;
    if (deps.copyToClipboard !== undefined) copyToClipboard = deps.copyToClipboard;
    if (deps.attachInnCtrlClickToTextarea !== undefined)
        attachInnCtrlClickToTextarea = deps.attachInnCtrlClickToTextarea;
    if (deps.createClientNotesInnPreview !== undefined)
        createClientNotesInnPreview = deps.createClientNotesInnPreview;
    if (deps.ensureInnPreviewStyles !== undefined)
        ensureInnPreviewStyles = deps.ensureInnPreviewStyles;
}

let panel = null;
let panelTextarea = null;
let panelWrap = null;
let syncFromParent = true;
let dragStartX = 0;
let dragStartY = 0;
let panelStartLeft = 0;
let panelStartTop = 0;
/** 'normal' | 'maximized' | 'minimized' */
let panelState = 'normal';
/** Сохранённые размеры/позиция перед максимизацией или минимизацией */
let savedPanelRect = null;

function getClientNotesEl() {
    return document.getElementById('clientNotes');
}

function isMac() {
    const plat = typeof navigator !== 'undefined' && navigator.platform ? navigator.platform : '';
    const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
    return /Mac/i.test(plat) || /Mac|iPhone|iPad/i.test(ua);
}

function releasePanelInnPreview() {
    if (panelInnPreview) panelInnPreview.hide();
}

function syncToParent(value) {
    const el = getClientNotesEl();
    if (el && value !== el.value) {
        syncFromParent = false;
        el.value = value;
        if (typeof el.dispatchEvent === 'function') {
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        setTimeout(() => {
            syncFromParent = true;
        }, 50);
    }
}

function syncFromParentToPanel() {
    if (!syncFromParent || !panelTextarea) return;
    const el = getClientNotesEl();
    if (el && panelTextarea.value !== el.value) {
        panelTextarea.value = el.value;
    }
}

function setPanelState(state) {
    if (!panel || !panelWrap) return;
    const maximizeBtn = panel.querySelector('.client-notes-window-maximize');
    const maximizeIcon = maximizeBtn?.querySelector('i');

    if (state === panelState) return;
    if (panelState === 'maximized' || panelState === 'minimized') {
        savedPanelRect = null;
    }
    if (state === 'normal') {
        if (savedPanelRect) {
            panel.style.left = savedPanelRect.left + 'px';
            panel.style.top = savedPanelRect.top + 'px';
            panel.style.width = savedPanelRect.width;
            panel.style.height = savedPanelRect.height;
            panel.style.minWidth = savedPanelRect.minWidth || '320px';
            panel.style.maxWidth = savedPanelRect.maxWidth || '90vw';
            panel.style.minHeight = savedPanelRect.minHeight || '280px';
            panel.style.maxHeight = savedPanelRect.maxHeight || '85vh';
            panel.style.transform = 'none';
        } else {
            panel.style.left = '50%';
            panel.style.top = '80px';
            panel.style.transform = 'translateX(-50%)';
            panel.style.width = '480px';
            panel.style.height = '70vh';
            panel.style.minWidth = '320px';
            panel.style.maxWidth = '90vw';
            panel.style.minHeight = '280px';
            panel.style.maxHeight = '85vh';
        }
        panelWrap.style.display = '';
        if (maximizeIcon) maximizeIcon.className = 'fas fa-expand';
        if (maximizeBtn) maximizeBtn.title = 'Развернуть на весь экран';
    } else if (state === 'maximized') {
        savedPanelRect = {
            left: panel.getBoundingClientRect().left,
            top: panel.getBoundingClientRect().top,
            width: panel.style.width || '480px',
            height: panel.style.height || '70vh',
            minWidth: panel.style.minWidth,
            maxWidth: panel.style.maxWidth,
            minHeight: panel.style.minHeight,
            maxHeight: panel.style.maxHeight,
        };
        panel.style.left = '0';
        panel.style.top = '0';
        panel.style.transform = 'none';
        panel.style.width = '100vw';
        panel.style.height = '100vh';
        panel.style.minWidth = '0';
        panel.style.maxWidth = 'none';
        panel.style.minHeight = '0';
        panel.style.maxHeight = 'none';
        panelWrap.style.display = '';
        if (maximizeIcon) maximizeIcon.className = 'fas fa-compress';
        if (maximizeBtn) maximizeBtn.title = 'Восстановить размер';
    } else if (state === 'minimized') {
        savedPanelRect = {
            left: panel.getBoundingClientRect().left,
            top: panel.getBoundingClientRect().top,
            width: panel.style.width || '480px',
            height: panel.style.height || '70vh',
            minWidth: panel.style.minWidth,
            maxWidth: panel.style.maxWidth,
            minHeight: panel.style.minHeight,
            maxHeight: panel.style.maxHeight,
        };
        panel.style.height = 'auto';
        panel.style.minHeight = '0';
        panel.style.maxHeight = 'none';
        panelWrap.style.display = 'none';
        if (maximizeIcon) maximizeIcon.className = 'fas fa-expand';
        if (maximizeBtn) maximizeBtn.title = 'Развернуть на весь экран';
    }
    panelState = state;
}

function applyParentStyles() {
    if (!panel) return;
    const root = document.documentElement;
    const isDark = document.documentElement.classList.contains('dark');
    const baseClasses =
        'client-notes-floating-panel flex flex-col rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden isolate';
    panel.className = baseClasses + (isDark ? ' dark' : '');
    const vars = [
        '--color-primary',
        '--color-primary-default',
        '--color-text-primary',
        '--color-surface-2',
        '--color-border',
        '--color-background',
    ];
    try {
        const computed = window.getComputedStyle(root);
        vars.forEach((v) => {
            const val = computed.getPropertyValue(v) || root.style.getPropertyValue(v);
            if (val) panel.style.setProperty(v, val.trim());
        });
    } catch {
        // style sync is optional; panel still works with default classes
    }
}

function createPanel() {
    if (panel) {
        panel.classList.remove('hidden');
        syncFromParentToPanel();
        applyParentStyles();
        return;
    }

    const notesEl = getClientNotesEl();
    const initialValue = notesEl ? notesEl.value : '';

    panel = document.createElement('div');
    panel.id = 'clientNotesFloatingPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Информация по обращению — отдельное окно');
    panel.className =
        'client-notes-floating-panel flex flex-col rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden isolate';
    Object.assign(panel.style, {
        position: 'fixed',
        zIndex: '8500',
        left: '50%',
        top: '80px',
        transform: 'translateX(-50%)',
        width: '480px',
        minWidth: '320px',
        maxWidth: '90vw',
        height: '70vh',
        minHeight: '280px',
        maxHeight: '85vh',
    });

    const header = document.createElement('div');
    header.className =
        'flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 cursor-move select-none flex-shrink-0 bg-opacity-100';
    header.innerHTML = `
        <span class="text-sm font-semibold text-gray-800 dark:text-gray-200">Информация по обращению</span>
        <div class="flex items-center gap-0.5">
            <button type="button" class="client-notes-window-minimize p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300" title="Свернуть">
                <i class="fas fa-minus"></i>
            </button>
            <button type="button" class="client-notes-window-maximize p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300" title="Развернуть на весь экран">
                <i class="fas fa-expand"></i>
            </button>
            <button type="button" class="client-notes-window-close p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300" title="Закрыть">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    panelWrap = document.createElement('div');
    panelWrap.className =
        'flex-1 overflow-hidden p-2 flex flex-col min-h-0 bg-white dark:bg-gray-800';
    panelTextarea = document.createElement('textarea');
    panelTextarea.id = 'clientNotesFloatingTextarea';
    panelTextarea.className =
        'w-full flex-1 min-h-[200px] p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base resize-none focus:ring-2 focus:ring-primary focus:border-primary custom-scrollbar';
    panelTextarea.placeholder =
        'Здесь для удобства можно фиксировать всю информацию по обращению клиента...';
    panelTextarea.value = initialValue;

    panelWrap.appendChild(panelTextarea);
    panel.appendChild(header);
    panel.appendChild(panelWrap);
    document.body.appendChild(panel);

    applyParentStyles();

    header.querySelector('.client-notes-window-close').addEventListener('click', () => {
        panel.classList.add('hidden');
    });

    header.querySelector('.client-notes-window-minimize').addEventListener('click', (e) => {
        e.stopPropagation();
        setPanelState(panelState === 'minimized' ? 'normal' : 'minimized');
    });
    header.querySelector('.client-notes-window-maximize').addEventListener('click', (e) => {
        e.stopPropagation();
        setPanelState(panelState === 'maximized' ? 'normal' : 'maximized');
    });

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const rect = panel.getBoundingClientRect();
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        panelStartLeft = rect.left;
        panelStartTop = rect.top;
        // Сначала переводим позицию в пиксели, чтобы при снятии transform окно не прыгнуло
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.transform = 'none';
        const onMove = (e2) => {
            const dx = e2.clientX - dragStartX;
            const dy = e2.clientY - dragStartY;
            panel.style.left = panelStartLeft + dx + 'px';
            panel.style.top = panelStartTop + dy + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    panelTextarea.addEventListener('input', () => {
        syncToParent(panelTextarea.value);
    });

    if (typeof attachInnCtrlClickToTextarea === 'function' && typeof copyToClipboard === 'function') {
        attachInnCtrlClickToTextarea(panelTextarea, copyToClipboard, releasePanelInnPreview);
    }

    if (
        typeof createClientNotesInnPreview === 'function' &&
        typeof ensureInnPreviewStyles === 'function'
    ) {
        document.addEventListener('keydown', onPanelKeydown);
        document.addEventListener('keyup', onPanelKeyup);
        panelTextarea.addEventListener('blur', releasePanelInnPreview);
    }

    function onPanelKeydown(e) {
        const modifier = isMac() ? e.metaKey : e.ctrlKey;
        if (!modifier || document.activeElement !== panelTextarea) return;
        ensureInnPreviewStyles();
        if (!panelInnPreview) {
            panelInnPreview = createClientNotesInnPreview(panelTextarea);
            panelInnPreviewInputHandler = () => {
                if (panelInnPreview) panelInnPreview.update();
            };
            panelTextarea.addEventListener('input', panelInnPreviewInputHandler);
        }
        panelInnPreview.show();
        panelInnPreview.update();
    }

    function onPanelKeyup(e) {
        const modifier = isMac() ? e.metaKey : e.ctrlKey;
        if (!modifier) releasePanelInnPreview();
    }

    if (notesEl) {
        notesEl.addEventListener('input', syncFromParentToPanel);
        notesEl.addEventListener('blur', syncFromParentToPanel);
    }

    const observer = new MutationObserver(() => {
        if (
            document.documentElement.classList.contains('dark') !== panel.classList.contains('dark')
        ) {
            panel.classList.toggle('dark', document.documentElement.classList.contains('dark'));
            applyParentStyles();
        }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Открывает или показывает плавающее окно с заметками по обращению.
 */
export function openClientNotesWindow() {
    createPanel();
    panel.classList.remove('hidden');
    syncFromParentToPanel();
    if (panelTextarea) {
        panelTextarea.focus();
    }
}

/**
 * Закрывает плавающее окно.
 */
export function closeClientNotesWindow() {
    if (panel) panel.classList.add('hidden');
}

/**
 * Подсветка поиска в плавающем окне (вызывается из глобального поиска при открытом окне).
 * @param {string} term - поисковый термин для подсветки
 */
export function highlightClientNotesWindow(term) {
    if (!panel || panel.classList.contains('hidden') || !panelTextarea || !term) return;
    if (typeof highlightElement === 'function') {
        highlightElement(panelTextarea, term);
    }
}

/**
 * Возвращает, открыто ли плавающее окно.
 */
export function isClientNotesWindowOpen() {
    return !!panel && !panel.classList.contains('hidden');
}

/** Префикс сообщений postMessage для синхронизации с popup. */
const CLIENT_NOTES_MSG_PREFIX = 'copilot1co:clientNotes:';

/** Референс на открытое popup-окно заметок. */
let notesPopupRef = null;

/** Последняя известная тема для синхронизации с popup (чтобы не слать лишние postMessage). */
let _lastThemeForPopup = null;

function sendThemeToPopupIfOpen() {
    if (!notesPopupRef || notesPopupRef.closed) return;
    const isDark = document.documentElement.classList.contains('dark');
    const theme = isDark ? 'dark' : 'light';
    if (_lastThemeForPopup === theme) return;
    _lastThemeForPopup = theme;
    try {
        notesPopupRef.postMessage(
            CLIENT_NOTES_MSG_PREFIX +
                JSON.stringify({
                    type: 'clientNotesInit',
                    value: getClientNotesEl()?.value || '',
                    theme,
                }),
            window.location.origin,
        );
    } catch (e) {
        console.warn('[clientNotesWindow] Failed to send theme to popup:', e);
    }
}

function setupClientNotesPopupMessageListener() {
    if (window.__clientNotesPopupListenerSetup) return;
    window.__clientNotesPopupListenerSetup = true;
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        const raw = event.data;
        if (typeof raw !== 'string' || !raw.startsWith(CLIENT_NOTES_MSG_PREFIX)) return;
        try {
            const data = JSON.parse(raw.slice(CLIENT_NOTES_MSG_PREFIX.length));
            const el = getClientNotesEl();
            if (!el) return;
            if (data.type === 'clientNotesRequest') {
                const theme = document.documentElement.classList.contains('dark')
                    ? 'dark'
                    : 'light';
                _lastThemeForPopup = theme;
                event.source?.postMessage(
                    CLIENT_NOTES_MSG_PREFIX +
                        JSON.stringify({
                            type: 'clientNotesInit',
                            value: el.value || '',
                            theme,
                        }),
                    window.location.origin,
                );
            } else if (data.type === 'clientNotesSync' && typeof data.value === 'string') {
                syncToParent(data.value);
            }
        } catch (e) {
            console.warn('[clientNotesWindow] Invalid popup message:', e);
        }
    });
    const themeObserver = new MutationObserver(() => {
        sendThemeToPopupIfOpen();
    });
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
    });
}

/**
 * Открывает заметки в отдельном окне браузера.
 * Окно можно закрепить поверх других приложений через PowerToys (Win+Ctrl+T) или Floaty/Rectangle на macOS.
 */
export function openClientNotesPopupWindow() {
    setupClientNotesPopupMessageListener();
    if (notesPopupRef?.closed) notesPopupRef = null;
    if (notesPopupRef && !notesPopupRef.closed) {
        notesPopupRef.focus();
        const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        _lastThemeForPopup = theme;
        notesPopupRef.postMessage(
            CLIENT_NOTES_MSG_PREFIX +
                JSON.stringify({
                    type: 'clientNotesInit',
                    value: getClientNotesEl()?.value || '',
                    theme,
                }),
            window.location.origin,
        );
        return;
    }
    const url = new URL('client-notes-standalone.html', window.location.href).href;
    const features =
        'width=400,height=1200,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
    notesPopupRef = window.open(url, 'clientNotesPopup', features);
    if (notesPopupRef) {
        notesPopupRef.addEventListener('beforeunload', () => {
            notesPopupRef = null;
        });
        notesPopupRef.addEventListener('load', () => {
            if (notesPopupRef && !notesPopupRef.closed) {
                const theme = document.documentElement.classList.contains('dark')
                    ? 'dark'
                    : 'light';
                _lastThemeForPopup = theme;
                notesPopupRef.postMessage(
                    CLIENT_NOTES_MSG_PREFIX +
                        JSON.stringify({
                            type: 'clientNotesInit',
                            value: getClientNotesEl()?.value || '',
                            theme,
                        }),
                    window.location.origin,
                );
            }
        });
    }
}
