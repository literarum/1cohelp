'use strict';

/**
 * Модуль обработки горячих клавиш и навигации
 * Вынесено из script.js (Этап 5)
 */

let showNoInnModal = null;
let showNotification = null;
let handleGlobalHotkeyRef = null;
let forceReloadAppRef = null;

// Dependencies for handleGlobalHotkey
let State = null;
let CLIENT_NOTES_MAX_FONT_SIZE = null;
let CLIENT_NOTES_MIN_FONT_SIZE = null;
let CLIENT_NOTES_FONT_SIZE_STEP = null;
let applyClientNotesFontSize = null;
let saveUserPreferences = null;
let getTopmostModal = null;
let getVisibleModals = null;
let requestCloseModal = null;
let showAddModal = null;
let showAddEditCibLinkModal = null;
let showAddExtLinkModal = null;
let showAddReglamentModal = null;
let showAddBookmarkModal = null;
let setActiveTab = null;
let exportAllData = null;
let exportClientDataToTxt = null;
let clearClientData = null;
let toggleActiveSectionView = null;

let searchEscClearHandler = null;
let altRReloadHandler = null;

export function setHotkeysDependencies(deps) {
    if (deps.showNoInnModal !== undefined) showNoInnModal = deps.showNoInnModal;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.handleGlobalHotkey !== undefined) handleGlobalHotkeyRef = deps.handleGlobalHotkey;
    if (deps.forceReloadApp !== undefined) forceReloadAppRef = deps.forceReloadApp;
    
    // Dependencies for handleGlobalHotkey
    if (deps.State !== undefined) State = deps.State;
    if (deps.CLIENT_NOTES_MAX_FONT_SIZE !== undefined) CLIENT_NOTES_MAX_FONT_SIZE = deps.CLIENT_NOTES_MAX_FONT_SIZE;
    if (deps.CLIENT_NOTES_MIN_FONT_SIZE !== undefined) CLIENT_NOTES_MIN_FONT_SIZE = deps.CLIENT_NOTES_MIN_FONT_SIZE;
    if (deps.CLIENT_NOTES_FONT_SIZE_STEP !== undefined) CLIENT_NOTES_FONT_SIZE_STEP = deps.CLIENT_NOTES_FONT_SIZE_STEP;
    if (deps.applyClientNotesFontSize !== undefined) applyClientNotesFontSize = deps.applyClientNotesFontSize;
    if (deps.saveUserPreferences !== undefined) saveUserPreferences = deps.saveUserPreferences;
    if (deps.getTopmostModal !== undefined) getTopmostModal = deps.getTopmostModal;
    if (deps.getVisibleModals !== undefined) getVisibleModals = deps.getVisibleModals;
    if (deps.requestCloseModal !== undefined) requestCloseModal = deps.requestCloseModal;
    if (deps.showAddModal !== undefined) showAddModal = deps.showAddModal;
    if (deps.showAddEditCibLinkModal !== undefined) showAddEditCibLinkModal = deps.showAddEditCibLinkModal;
    if (deps.showAddExtLinkModal !== undefined) showAddExtLinkModal = deps.showAddExtLinkModal;
    if (deps.showAddReglamentModal !== undefined) showAddReglamentModal = deps.showAddReglamentModal;
    if (deps.showAddBookmarkModal !== undefined) showAddBookmarkModal = deps.showAddBookmarkModal;
    if (deps.setActiveTab !== undefined) setActiveTab = deps.setActiveTab;
    if (deps.exportAllData !== undefined) exportAllData = deps.exportAllData;
    if (deps.exportClientDataToTxt !== undefined) exportClientDataToTxt = deps.exportClientDataToTxt;
    if (deps.clearClientData !== undefined) clearClientData = deps.clearClientData;
    if (deps.toggleActiveSectionView !== undefined) toggleActiveSectionView = deps.toggleActiveSectionView;
}

/**
 * Обработчик клика по ссылке "Клиент не знает ИНН" (делегирование событий)
 */
export function handleNoInnLinkEvent(event) {
    const link = event.target.closest('a[id^="noInnLink_"]');
    if (link) {
        event.preventDefault();
        if (typeof showNoInnModal === 'function') {
            showNoInnModal();
        } else {
            console.error('Функция showNoInnModal не определена');
        }
    }
}

/**
 * Обработчик прямого клика по ссылке "Клиент не знает ИНН"
 */
export function handleNoInnLinkClick(event) {
    event.preventDefault();
    if (typeof showNoInnModal === 'function') {
        showNoInnModal();
    } else {
        console.error('Функция showNoInnModal не определена!');
        if (typeof showNotification === 'function') {
            showNotification('Функция для обработки этого действия не найдена.', 'error');
        }
    }
}

/**
 * Навигация "назад" внутри приложения (например, из списка регламентов к категориям)
 */
export function navigateBackWithinApp() {
    console.log('[App Navigate Back] Попытка навигации назад внутри приложения...');

    const reglamentsListDiv = document.getElementById('reglamentsList');
    const backToCategoriesBtn = document.getElementById('backToCategories');

    if (
        reglamentsListDiv &&
        !reglamentsListDiv.classList.contains('hidden') &&
        backToCategoriesBtn
    ) {
        console.log(
            "[App Navigate Back]   > Обнаружен активный список регламентов. Имитация клика 'Назад к категориям'.",
        );
        backToCategoriesBtn.click();
        return true;
    }

    console.log('[App Navigate Back]   > Не найдено подходящего состояния для навигации назад.');
    if (typeof showNotification === 'function') {
        showNotification("Нет действия 'назад' для текущего экрана.", 'info');
    }
    return false;
}

/**
 * Регистрирует глобальные горячие клавиши (в т.ч. Escape для очистки поиска, Alt+R перезагрузка).
 * handleGlobalHotkey теперь определена в этом модуле.
 */
export function setupHotkeys() {
    document.removeEventListener('keydown', handleGlobalHotkey, true);
    document.removeEventListener('keydown', handleGlobalHotkey, false);
    document.addEventListener('keydown', handleGlobalHotkey, false);

    if (searchEscClearHandler) {
        document.removeEventListener('keydown', searchEscClearHandler, true);
    }
    searchEscClearHandler = (event) => {
        if (event.key !== 'Escape') return;
        const ae = document.activeElement;
        if (!ae || ae.tagName !== 'INPUT') return;
        const id = ae.id || '';
        if (!/search/i.test(id)) return;
        event.preventDefault();
        event.stopPropagation();
        const clearMap = {
            searchInput: 'clearSearchBtn',
            linkSearchInput: 'clearLinkSearchInputBtn',
            extLinkSearchInput: 'clearExtLinkSearchBtn',
            bookmarkSearchInput: 'clearBookmarkSearchBtn',
            blacklistSearchInput: 'clearBlacklistSearchBtn',
            sedoSearchInput: 'clearSedoSearchBtn',
            'shablony-search-input': 'shablony-search-clear-btn',
        };
        const btnId = clearMap[id];
        const btn = btnId ? document.getElementById(btnId) : null;
        if (btn) {
            btn.click();
        } else {
            ae.value = '';
            ae.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
    };
    document.addEventListener('keydown', searchEscClearHandler, true);

    if (altRReloadHandler) {
        document.removeEventListener('keydown', altRReloadHandler, false);
    }
    altRReloadHandler = (event) => {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.code !== 'KeyR') return;
        const ae = document.activeElement;
        const isInputFocused =
            ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
        if (isInputFocused) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof forceReloadAppRef === 'function') {
            forceReloadAppRef();
        } else {
            window.location.reload();
        }
    };
    document.addEventListener('keydown', altRReloadHandler, false);

    console.log('Глобальные хоткеи и дополнительные перехватчики инициализированы.');
}

/**
 * Глобальный обработчик горячих клавиш
 * Обрабатывает множество комбинаций клавиш для различных действий в приложении
 */
export function handleGlobalHotkey(event) {
    const code = event.code;
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const alt = event.altKey;

    const activeElement = document.activeElement;
    const isInputFocused =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable);

    const clientNotes = document.getElementById('clientNotes');
    const isClientNotesVisible = clientNotes && clientNotes.offsetParent !== null;

    if (
        alt &&
        !ctrlOrMeta &&
        !shift &&
        isClientNotesVisible &&
        (event.key === '=' ||
            event.key === '+' ||
            event.key === '-' ||
            event.code === 'NumpadAdd' ||
            event.code === 'NumpadSubtract')
    ) {
        event.preventDefault();
        event.stopPropagation();

        if (!State || !State.userPreferences) {
            console.warn('[Hotkey] State.userPreferences не доступны для изменения размера шрифта.');
            return;
        }

        const isIncrease = event.key === '=' || event.key === '+' || event.code === 'NumpadAdd';
        const currentSize = State.userPreferences.clientNotesFontSize || 100;
        let newSize;

        if (isIncrease) {
            newSize = Math.min(
                CLIENT_NOTES_MAX_FONT_SIZE,
                currentSize + CLIENT_NOTES_FONT_SIZE_STEP,
            );
        } else {
            newSize = Math.max(
                CLIENT_NOTES_MIN_FONT_SIZE,
                currentSize - CLIENT_NOTES_FONT_SIZE_STEP,
            );
        }

        if (newSize !== currentSize) {
            State.userPreferences.clientNotesFontSize = newSize;
            if (typeof applyClientNotesFontSize === 'function') {
                applyClientNotesFontSize();
            }
            if (typeof saveUserPreferences === 'function') {
                saveUserPreferences().catch((err) =>
                    console.error('Не удалось сохранить настройку размера шрифта:', err),
                );
            }
        }
        return;
    }

    if (alt && !ctrlOrMeta && !shift) {
        switch (event.code) {
            case 'KeyS': // Alt + S
                console.log('[Hotkey] Обнаружена комбинация Alt + S (Сохранить)');
                event.preventDefault();
                event.stopPropagation();
                if (typeof getTopmostModal === 'function' && typeof getVisibleModals === 'function') {
                    const topModalForSave = getTopmostModal(getVisibleModals());
                    if (topModalForSave) {
                        console.log(
                            `[Hotkey Alt+S] Найдено верхнее модальное окно: #${topModalForSave.id}`,
                        );
                        const SAVE_BUTTON_SELECTORS = [
                            '#saveAlgorithmBtn',
                            '#saveNewAlgorithmBtn',
                            '#saveBookmarkBtn',
                            '#saveCibLinkBtn',
                            '#saveReglamentBtn',
                            '#saveUISettingsBtn',
                            '#saveExtLinkBtn',
                            '#saveBlacklistEntryBtn',
                        ];

                        for (const selector of SAVE_BUTTON_SELECTORS) {
                            const saveBtn = topModalForSave.querySelector(selector);
                            if (
                                saveBtn &&
                                !saveBtn.disabled &&
                                (saveBtn.offsetWidth > 0 ||
                                    saveBtn.offsetHeight > 0 ||
                                    saveBtn.getClientRects().length > 0)
                            ) {
                                console.log(
                                    `[Hotkey Alt+S] Найдена активная кнопка сохранения: ${selector}. Вызов click().`,
                                );
                                saveBtn.click();
                                return;
                            }
                        }
                        console.log(
                            `[Hotkey Alt+S] В окне #${topModalForSave.id} не найдено активных кнопок сохранения.`,
                        );
                    } else {
                        console.log(
                            `[Hotkey Alt+S] Не найдено активных модальных окон для сохранения.`,
                        );
                    }
                }
                return;

            case 'KeyK': // Alt + K
                console.log('[Hotkey] Обнаружена комбинация Alt + K (В избранное)');
                event.preventDefault();
                event.stopPropagation();
                if (typeof getTopmostModal === 'function' && typeof getVisibleModals === 'function') {
                    const topModalForFavorite = getTopmostModal(getVisibleModals());
                    if (topModalForFavorite) {
                        const favButton = topModalForFavorite.querySelector('.toggle-favorite-btn');
                        if (
                            favButton &&
                            (favButton.offsetWidth > 0 ||
                                favButton.offsetHeight > 0 ||
                                favButton.getClientRects().length > 0)
                        ) {
                            console.log(
                                `[Hotkey Alt+K] Найдена кнопка "В избранное" в окне #${topModalForFavorite.id}. Вызов click().`,
                            );
                            favButton.click();
                            return;
                        } else {
                            console.log(
                                `[Hotkey Alt+K] Кнопка "В избранное" не найдена или невидима в окне #${topModalForFavorite.id}.`,
                            );
                        }
                    } else {
                        console.log(
                            `[Hotkey Alt+K] Не найдено активных модальных окон для добавления в избранное.`,
                        );
                    }
                }
                return;
        }
    }

    if (event.key === 'Escape') {
        const activeSearchInputIds = new Set([
            'searchInput',
            'bookmarkSearchInput',
            'linkSearchInput',
            'extLinkSearchInput',
            'blacklistSearchInput',
        ]);

        if (activeElement && activeSearchInputIds.has(activeElement.id)) {
            console.log(
                `[GlobalHotkey Esc] Обработка Escape для поискового поля: ${activeElement.id}`,
            );
            activeElement.value = '';
            activeElement.blur();
            activeElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            console.log(
                `[GlobalHotkey Esc] Для поля ${activeElement.id} значение очищено, фокус убран, событие 'input' вызвано. Обработка Esc завершена.`,
            );
            return;
        }
    }

    const lightbox = document.getElementById('screenshotLightbox');
    const viewerModal = document.getElementById('screenshotViewerModal');
    const algorithmModal = document.getElementById('algorithmModal');
    const bookmarkDetailModal = document.getElementById('bookmarkDetailModal');
    const reglamentDetailModal = document.getElementById('reglamentDetailModal');
    const reglamentsListDiv = document.getElementById('reglamentsList');
    const backToCategoriesBtn = document.getElementById('backToCategories');

    if (lightbox && !lightbox.classList.contains('hidden') && !isInputFocused) {
        console.log(`[GlobalHotkey] Лайтбокс активен, перехват клавиши: ${event.key}`);
        switch (event.key) {
            case 'Escape':
                console.log('[GlobalHotkey Esc] Лайтбокс: Закрытие всей цепочки.');
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (lightbox._closeLightboxFunction) lightbox._closeLightboxFunction();

                if (viewerModal && !viewerModal.classList.contains('hidden')) {
                    if (viewerModal._modalState?.closeModalFunction)
                        viewerModal._modalState.closeModalFunction();
                    else {
                        viewerModal.classList.add('hidden');
                    }
                }
                if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
                    algorithmModal.classList.add('hidden');
                }
                if (bookmarkDetailModal && !bookmarkDetailModal.classList.contains('hidden')) {
                    bookmarkDetailModal.classList.add('hidden');
                }
                if (reglamentDetailModal && !reglamentDetailModal.classList.contains('hidden')) {
                    reglamentDetailModal.classList.add('hidden');
                }

                requestAnimationFrame(() => {
                    if (typeof getVisibleModals === 'function' && getVisibleModals().length === 0) {
                        document.body.classList.remove('overflow-hidden');
                        document.body.classList.remove('modal-open');
                    }
                });
                return;
            case 'Backspace':
                console.log('[GlobalHotkey Backspace] Лайтбокс: Закрытие лайтбокса.');
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (lightbox._closeLightboxFunction) lightbox._closeLightboxFunction();

                requestAnimationFrame(() => {
                    if (typeof getVisibleModals === 'function') {
                        const visibleModalsAfterLightboxClose = getVisibleModals().filter(
                            (m) => m.id !== 'screenshotLightbox',
                        );
                        if (visibleModalsAfterLightboxClose.length === 0) {
                            document.body.classList.remove('overflow-hidden');
                            document.body.classList.remove('modal-open');
                        }
                    }
                });
                return;
            case 'ArrowLeft':
                console.log('[GlobalHotkey ArrowLeft] Лайтбокс: Предыдущее изображение.');
                event.preventDefault();
                event.stopPropagation();
                if (lightbox._navigateImageFunction) lightbox._navigateImageFunction('prev');
                return;
            case 'ArrowRight':
                console.log('[GlobalHotkey ArrowRight] Лайтбокс: Следующее изображение.');
                event.preventDefault();
                event.stopPropagation();
                if (lightbox._navigateImageFunction) lightbox._navigateImageFunction('next');
                return;
            case 'Tab':
                const focusableElements = Array.from(
                    lightbox.querySelectorAll('button:not([disabled]), [href]:not([disabled])'),
                ).filter(
                    (el) =>
                        el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0,
                );
                if (focusableElements.length === 0) {
                    event.preventDefault();
                    return;
                }
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                if (event.shiftKey) {
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        event.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        event.preventDefault();
                    }
                }
                event.stopPropagation();
                return;
        }
    }

    if (code === 'Escape' && !isInputFocused) {
        console.log(
            '[GlobalHotkey Esc] (Лайтбокс неактивен или Escape не для него, и не для поля поиска)',
        );
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        let closedSomethingInChain = false;

        if (viewerModal && !viewerModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Esc] Цепочка: Вьювер -> Детали');
            if (viewerModal._modalState?.closeModalFunction)
                viewerModal._modalState.closeModalFunction();
            else {
                viewerModal.classList.add('hidden');
            }

            if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
                algorithmModal.classList.add('hidden');
            }
            if (bookmarkDetailModal && !bookmarkDetailModal.classList.contains('hidden')) {
                bookmarkDetailModal.classList.add('hidden');
            }
            if (reglamentDetailModal && !reglamentDetailModal.classList.contains('hidden')) {
                reglamentDetailModal.classList.add('hidden');
            }
            closedSomethingInChain = true;
        } else if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Esc] Закрытие окна деталей алгоритма');
            algorithmModal.classList.add('hidden');
            closedSomethingInChain = true;
        } else if (bookmarkDetailModal && !bookmarkDetailModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Esc] Закрытие окна деталей закладки');
            bookmarkDetailModal.classList.add('hidden');
            closedSomethingInChain = true;
        } else if (reglamentDetailModal && !reglamentDetailModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Esc] Закрытие окна деталей регламента');
            reglamentDetailModal.classList.add('hidden');
            closedSomethingInChain = true;
        }

        if (!closedSomethingInChain) {
            if (typeof getVisibleModals === 'function' && typeof getTopmostModal === 'function') {
                const visibleModals = getVisibleModals();
                if (visibleModals.length > 0) {
                    const topmost = getTopmostModal(visibleModals);
                    if (topmost) {
                        console.log(
                            `[GlobalHotkey Esc] Закрытие общего самого верхнего модального окна: ${topmost.id}`,
                        );

                        if (
                            typeof requestCloseModal === 'function' &&
                            (topmost.id === 'editModal' ||
                                topmost.id === 'addModal' ||
                                topmost.id === 'customizeUIModal' ||
                                topmost.id === 'bookmarkModal')
                        ) {
                            if (!requestCloseModal(topmost)) {
                                return;
                            }
                        } else {
                            topmost.classList.add('hidden');
                        }
                    } else {
                        console.log(
                            '[GlobalHotkey Esc] Нет самого верхнего модального окна для закрытия (getTopmostModal вернул null).',
                        );
                    }
                } else {
                    console.log('[GlobalHotkey Esc] Нет активных модальных окон для закрытия.');
                }
            }
        }

        requestAnimationFrame(() => {
            if (typeof getVisibleModals === 'function') {
                if (getVisibleModals().length === 0) {
                    document.body.classList.remove('overflow-hidden');
                    document.body.classList.remove('modal-open');
                    console.log(
                        `[GlobalHotkey Esc] overflow-hidden и modal-open сняты с body (после rAF).`,
                    );
                } else {
                    console.log(
                        `[GlobalHotkey Esc] overflow-hidden и modal-open НЕ сняты, т.к. есть другие видимые модальные окна (после rAF). Count: ${
                            getVisibleModals().length
                        }, Modals:`,
                        getVisibleModals().map((m) => m.id),
                    );
                }
            }
        });
        return;
    }

    if (code === 'Backspace' && !isInputFocused) {
        console.log('[GlobalHotkey Backspace] (Лайтбокс неактивен или Backspace не для него)');
        event.preventDefault();
        event.stopPropagation();

        let handledByBackspace = false;

        if (viewerModal && !viewerModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Закрытие вьювера скриншотов');
            if (viewerModal._modalState?.closeModalFunction)
                viewerModal._modalState.closeModalFunction();
            else {
                viewerModal.classList.add('hidden');
            }
            handledByBackspace = true;
        } else if (algorithmModal && !algorithmModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Закрытие окна деталей алгоритма');
            algorithmModal.classList.add('hidden');
            handledByBackspace = true;
        } else if (bookmarkDetailModal && !bookmarkDetailModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Закрытие окна деталей закладки');
            bookmarkDetailModal.classList.add('hidden');
            handledByBackspace = true;
        } else if (reglamentDetailModal && !reglamentDetailModal.classList.contains('hidden')) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Закрытие окна деталей регламента');
            reglamentDetailModal.classList.add('hidden');
            handledByBackspace = true;
        } else if (
            reglamentsListDiv &&
            !reglamentsListDiv.classList.contains('hidden') &&
            backToCategoriesBtn
        ) {
            console.log('[GlobalHotkey Backspace] Шаг назад: Возврат к категориям регламентов');
            backToCategoriesBtn.click();
            handledByBackspace = true;
        }

        if (handledByBackspace) {
            requestAnimationFrame(() => {
                if (typeof getVisibleModals === 'function') {
                    if (getVisibleModals().length === 0) {
                        document.body.classList.remove('overflow-hidden');
                        document.body.classList.remove('modal-open');
                        console.log(
                            `[GlobalHotkey Backspace] overflow-hidden и modal-open сняты с body (после rAF).`,
                        );
                    } else {
                        console.log(
                            `[GlobalHotkey Backspace] overflow-hidden и modal-open НЕ сняты, т.к. есть другие видимые модальные окна (после rAF). Count: ${
                                getVisibleModals().length
                            }`,
                        );
                    }
                }
            });
        }

        if (!handledByBackspace) {
            console.log(
                "[GlobalHotkey Backspace] Нет подходящего действия 'шаг назад' для текущего состояния.",
            );
        }
        return;
    }

    if (alt && !ctrlOrMeta && !isInputFocused) {
        switch (code) {
            case 'KeyH': // Alt + H
                console.log('[Hotkey] Обнаружена комбинация Alt + KeyH (Главная)');
                event.preventDefault();
                if (typeof setActiveTab === 'function') {
                    setActiveTab('main');
                }
                return;
            case 'KeyL': // Alt + L
                console.log('[Hotkey] Обнаружена комбинация Alt + KeyL (Избранное)');
                event.preventDefault();
                if (typeof setActiveTab === 'function') {
                    setActiveTab('favorites');
                }
                return;
            case 'KeyN': // Alt + N
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyN');
                    event.preventDefault();
                    event.stopPropagation();
                    if (!State) {
                        console.warn('[Hotkey Alt+N] State не доступен.');
                        return;
                    }
                    console.log(
                        `[Hotkey]   > Выполнение действия: добавить элемент для секции '${State.currentSection}'`,
                    );
                    let addFunctionN = null,
                        functionArgN = null,
                        functionNameN = '';
                    switch (State.currentSection) {
                        case 'program':
                        case 'skzi':
                        case 'webReg':
                        case 'lk1c':
                            addFunctionN = showAddModal;
                            functionArgN = State.currentSection;
                            functionNameN = 'showAddModal';
                            break;
                        case 'links':
                            addFunctionN = showAddEditCibLinkModal;
                            functionNameN = 'showAddEditCibLinkModal';
                            break;
                        case 'extLinks':
                            addFunctionN = showAddExtLinkModal;
                            functionNameN = 'showAddExtLinkModal';
                            break;
                        case 'reglaments':
                            addFunctionN = showAddReglamentModal;
                            functionNameN = 'showAddReglamentModal';
                            break;
                        case 'bookmarks':
                            addFunctionN = showAddBookmarkModal;
                            functionNameN = 'showAddBookmarkModal';
                            break;
                        case 'main':
                            if (typeof showNotification === 'function') {
                                showNotification(
                                    'Добавление элементов в главный алгоритм не предусмотрено.',
                                    'info',
                                );
                            }
                            break;
                        default:
                            console.warn(
                                `Alt+N: Неизвестная или неподдерживаемая секция '${State.currentSection}'.`,
                            );
                            if (typeof showNotification === 'function') {
                                showNotification(
                                    'Добавление для текущей секции не поддерживается.',
                                    'warning',
                                );
                            }
                    }
                    if (addFunctionN) {
                        if (typeof addFunctionN === 'function') {
                            console.log(
                                `[Hotkey Alt+N] Вызов функции ${functionNameN} с аргументом:`,
                                functionArgN,
                            );
                            addFunctionN(functionArgN);
                        } else {
                            console.error(`Alt+N: Функция ${functionNameN} не найдена!`);
                            if (typeof showNotification === 'function') {
                                showNotification(
                                    `Ошибка: Функция добавления для секции ${State.currentSection} недоступна.`,
                                    'error',
                                );
                            }
                        }
                    }
                    return;
                }
                break;

            case 'KeyT': // Alt + T
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyT');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[Hotkey]   > Выполнение действия: смена темы');
                    const themeToggleBtn = document.getElementById('themeToggle');
                    if (themeToggleBtn) {
                        themeToggleBtn.click();
                    } else {
                        console.warn('Alt+T: Кнопка темы не найдена.');
                        if (typeof showNotification === 'function') {
                            showNotification('Кнопка темы не найдена', 'error');
                        }
                    }
                    return;
                }
                break;

            case 'KeyS': // Alt + Shift + S (Экспорт)
                if (shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + Shift + KeyS (Экспорт)');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log(
                        '[Hotkey]   > Выполнение действия: экспорт данных (отложенный вызов)',
                    );
                    if (typeof exportAllData === 'function') {
                        console.log(
                            '[Hotkey]     -> Планирование вызова exportAllData() через setTimeout(0)...',
                        );
                        setTimeout(() => {
                            console.log(
                                '[Hotkey]     -> Выполняется exportAllData() из setTimeout.',
                            );
                            try {
                                exportAllData();
                            } catch (exportError) {
                                console.error(
                                    '!!! Ошибка ВНУТРИ exportAllData() при вызове из хоткея:',
                                    exportError,
                                );
                                if (typeof showNotification === 'function') {
                                    showNotification('Произошла ошибка во время экспорта.', 'error');
                                }
                            }
                        }, 0);
                    } else {
                        console.warn('Alt+Shift+S: Функция exportAllData не найдена.');
                        if (typeof showNotification === 'function') {
                            showNotification('Функция экспорта недоступна.', 'error');
                        }
                    }
                    return;
                }
                break;

            case 'KeyO': // Alt + Shift + O (Импорт)
                if (shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + Shift + KeyO (Импорт)');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[Hotkey]   > Выполнение действия: импорт данных');
                    const importFileInput = document.getElementById('importFileInput');
                    if (importFileInput) {
                        importFileInput.click();
                    } else {
                        console.warn('Alt+Shift+O: Поле импорта #importFileInput не найдено.');
                        if (typeof showNotification === 'function') {
                            showNotification('Функция импорта недоступна.', 'error');
                        }
                    }
                    return;
                }
                break;
            case 'KeyF': // Alt + F (Фокус на поиск)
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyF (вне поля ввода)');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[Hotkey]   > Выполнение действия: фокус на поиск');
                    const searchInput = document.getElementById('searchInput');
                    if (searchInput) {
                        searchInput.focus();
                        searchInput.select();
                    } else {
                        console.warn('Alt+F: Поле поиска не найдено.');
                        if (typeof showNotification === 'function') {
                            showNotification('Поле поиска не найдено', 'warning');
                        }
                    }
                    return;
                }
                break;
            case 'KeyI': // Alt + I (Открыть настройки UI)
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyI (вне поля ввода)');
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('[Hotkey]   > Выполнение действия: открыть настройки');
                    const customizeUIBtn = document.getElementById('customizeUIBtn');
                    if (customizeUIBtn) {
                        const customizeUIModal = document.getElementById('customizeUIModal');
                        if (customizeUIModal && customizeUIModal.classList.contains('hidden')) {
                            customizeUIBtn.click();
                        } else if (!customizeUIModal) {
                            console.warn('Alt+I: Модальное окно настроек не найдено.');
                            if (typeof showNotification === 'function') {
                                showNotification('Окно настроек не найдено.', 'error');
                            }
                        } else {
                            console.log('Alt+I: Окно настроек уже открыто.');
                        }
                    } else {
                        console.warn('Alt+I: Кнопка настроек не найдена.');
                        if (typeof showNotification === 'function') {
                            showNotification('Кнопка настроек не найдена.', 'error');
                        }
                    }
                    return;
                }
                break;
            case 'KeyV': // Alt + V (Переключить вид)
                if (!shift) {
                    console.log('[Hotkey] Обнаружена комбинация Alt + KeyV (вне поля ввода)');
                    event.preventDefault();
                    event.stopPropagation();

                    const screenshotModalForViewToggle =
                        document.getElementById('screenshotViewerModal');
                    if (
                        screenshotModalForViewToggle &&
                        !screenshotModalForViewToggle.classList.contains('hidden')
                    ) {
                        console.log(
                            '[Hotkey Alt+V]   > Окно просмотра скриншотов активно. Переключаем вид в нем.',
                        );
                        const gridBtn = screenshotModalForViewToggle.querySelector(
                            '#screenshotViewToggleGrid',
                        );
                        const listBtn = screenshotModalForViewToggle.querySelector(
                            '#screenshotViewToggleList',
                        );

                        if (gridBtn && listBtn) {
                            const isGridActive = gridBtn.classList.contains('bg-primary');
                            const buttonToClick = isGridActive ? listBtn : gridBtn;
                            if (buttonToClick) {
                                buttonToClick.click();
                                console.log(
                                    `[Hotkey Alt+V] Имитирован клик по кнопке '${buttonToClick.id}' в окне скриншотов.`,
                                );
                            } else {
                                console.warn(
                                    'Alt+V (Screenshot): Не удалось определить неактивную кнопку для клика.',
                                );
                            }
                        } else {
                            console.warn(
                                'Alt+V (Screenshot): Не найдены кнопки переключения вида в модальном окне.',
                            );
                            if (typeof showNotification === 'function') {
                                showNotification(
                                    'Ошибка: Не найдены кнопки вида в окне скриншотов.',
                                    'error',
                                );
                            }
                        }
                    } else {
                        console.log(
                            '[Hotkey Alt+V]   > Выполнение стандартного действия: переключить вид активной секции',
                        );
                        if (typeof toggleActiveSectionView === 'function') {
                            toggleActiveSectionView();
                        } else {
                            console.warn('Alt+V: Функция toggleActiveSectionView не найдена.');
                            if (typeof showNotification === 'function') {
                                showNotification('Функция переключения вида недоступна.', 'error');
                            }
                        }
                    }
                    return;
                }
                break;
        }
    }

    if (ctrlOrMeta && shift && !alt && !isInputFocused) {
        switch (code) {
            case 'KeyD': // Ctrl + Shift + D
                console.log('[Hotkey] Обнаружена комбинация Ctrl + Shift + KeyD');
                event.preventDefault();
                event.stopPropagation();
                console.log('[Hotkey]   > Выполнение действия: сохранить заметки в txt');
                if (typeof exportClientDataToTxt === 'function') {
                    exportClientDataToTxt();
                } else {
                    console.warn('Ctrl+Shift+D: Функция exportClientDataToTxt не найдена.');
                    if (typeof showNotification === 'function') {
                        showNotification('Функция сохранения заметок недоступна.', 'error');
                    }
                }
                return;
            case 'Backspace': // Ctrl + Shift + Backspace
                console.log('[Hotkey] Обнаружена комбинация Ctrl + Shift + Backspace');
                event.preventDefault();
                event.stopPropagation();
                console.log('[Hotkey]   > Выполнение действия: очистка заметок клиента');
                const clientNotes = document.getElementById('clientNotes');
                if (clientNotes && clientNotes.value.trim() !== '') {
                    if (confirm('Вы уверены, что хотите очистить поле данных по обращению?')) {
                        if (typeof clearClientData === 'function') {
                            clearClientData();
                        } else {
                            console.warn(
                                'Ctrl+Shift+Backspace: Функция clearClientData не найдена.',
                            );
                            clientNotes.value = '';
                            if (typeof showNotification === 'function') {
                                showNotification(
                                    'Поле очищено, но не удалось вызвать стандартную функцию.',
                                    'warning',
                                );
                            }
                        }
                    }
                } else if (clientNotes) {
                    if (typeof showNotification === 'function') {
                        showNotification('Поле данных по обращению уже пусто.', 'info');
                    }
                } else {
                    console.warn('Ctrl+Shift+Backspace: Поле #clientNotes не найдено.');
                }
                return;
            case 'KeyH': // Ctrl + Shift + H
                console.log('[Hotkey] Обнаружена комбинация Ctrl + Shift + KeyH');
                event.preventDefault();
                event.stopPropagation();
                console.log('[Hotkey]   > Выполнение действия: показать окно горячих клавиш');
                const showHotkeysBtn = document.getElementById('showHotkeysBtn');
                if (showHotkeysBtn) {
                    showHotkeysBtn.click();
                } else {
                    console.warn('Ctrl+Shift+H: Кнопка #showHotkeysBtn не найдена.');
                    if (typeof showNotification === 'function') {
                        showNotification(
                            'Не удалось найти кнопку для отображения горячих клавиш.',
                            'error',
                        );
                    }
                }
                return;
        }
    }
}
