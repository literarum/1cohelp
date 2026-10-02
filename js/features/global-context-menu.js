'use strict';

/**
 * Глобальное кастомное контекстное меню (ПКМ).
 * Резервный контур: Shift+ПКМ или поля ввода → нативное меню браузера.
 */

import { openCommandPalette } from './command-palette/index.js';
import { toggleActiveSectionView, getViewToggleLabelForContextMenu } from '../ui/view-manager.js';
import { toggleTimer, resetTimer, getTimerRunning } from './timer.js';
import { setActiveTab } from '../components/tabs.js';
import {
    shouldDeferToNativeContextMenu,
    clampMenuPosition,
    buildMenuItemDescriptors,
    extractInnCandidate,
} from './global-context-menu-shared.js';
import { NotificationService } from '../services/notification.js';

export { shouldDeferToNativeContextMenu, clampMenuPosition, buildMenuItemDescriptors };

const MENU_ID = 'globalAppContextMenu';
const BACKDROP_ID = 'globalAppContextMenuBackdrop';

let menuEl = null;
let backdropEl = null;
let keydownHandler = null;
let pointerMoveHandler = null;
let activeIndex = 0;
let bound = false;
let ctxCardEl = null;
let ctxSelectionText = '';
let lastFocusEl = null;

const CARD_SEL =
    '.bookmark-item, .ext-link-item, .cib-link-item, .algorithm-card, .reglament-item, .favorite-item';
const EDIT_SEL =
    '[data-action="edit"], .edit-bookmark, .edit-ext-link, .edit-cib-link, .edit-reglament, .edit-algorithm-btn, button[aria-label^="Редактировать"]';
const DELETE_SEL =
    '[data-action="delete"], .delete-bookmark, .delete-ext-link, .delete-cib-link, .delete-reglament, button[aria-label^="Удалить"]';
const FAV_SEL = '.toggle-favorite-btn, [data-action="toggle-favorite"]';

function cardUrl(card) {
    const a = card.querySelector('a[href]');
    const href = a?.getAttribute('href') || card.dataset.url || '';
    return /^(https?:|1c:|file:)/i.test(href) ? href : '';
}

/** Снимок контекста под курсором: карточка записи и/или выделенный текст. */
function collectContext(target) {
    const ctx = {};
    const card = target instanceof Element ? target.closest(CARD_SEL) : null;
    ctxCardEl = card;
    if (card) {
        ctx.card = {
            open: true,
            copyUrl: !!cardUrl(card),
            edit: !!card.querySelector(EDIT_SEL),
            duplicate: card.classList.contains('bookmark-item') && !!card.dataset.id,
            favorite: !!card.querySelector(FAV_SEL),
            remove: !!card.querySelector(DELETE_SEL),
        };
    }
    let sel = '';
    try {
        sel = String(window.getSelection?.() || '').trim();
    } catch {
        sel = '';
    }
    ctxSelectionText = sel.length > 0 && sel.length <= 500 ? sel : '';
    if (ctxSelectionText) ctx.selection = ctxSelectionText;
    return ctx.card || ctx.selection ? ctx : undefined;
}

async function copyText(text, okMsg) {
    try {
        await navigator.clipboard.writeText(text);
        NotificationService.add(okMsg, 'success', { duration: 2000 });
    } catch {
        NotificationService.add('Не удалось скопировать в буфер обмена', 'error', { duration: 3000 });
    }
}

/** Копия закладки без вложений (скриншоты/PDF принадлежат оригиналу и не разделяются). */
async function duplicateBookmarkFromCard(card) {
    const id = card ? parseInt(card.dataset.id, 10) : NaN;
    if (!Number.isFinite(id)) return;
    try {
        const { getFromIndexedDB, saveToIndexedDB } = await import('../db/indexeddb.js');
        const src = await getFromIndexedDB('bookmarks', id);
        if (!src) {
            NotificationService.add('Запись не найдена — возможно, она уже удалена', 'warning', {
                duration: 3500,
            });
            return;
        }
        const copy = { ...src };
        delete copy.id;
        delete copy.screenshotIds;
        delete copy.screenshots;
        copy.title = `${String(src.title || 'Без названия')} (копия)`;
        copy.dateAdded = new Date().toISOString();
        copy.dateUpdated = copy.dateAdded;
        const newId = await saveToIndexedDB('bookmarks', copy);
        const { addBookmarkToDOM } = await import('./bookmarks-dom.js');
        await addBookmarkToDOM({ ...copy, id: newId });
        NotificationService.add('Копия создана (без вложений)', 'success', { duration: 2500 });
    } catch (err) {
        console.warn('[global-context-menu] duplicate', err);
        NotificationService.add('Не удалось создать копию записи', 'error', { duration: 4000 });
    }
}

/** Открывает форму чёрного списка с подставленным ИНН; предупреждает, если контрольная сумма не сходится. */
async function addSelectionInnToBlacklist(text) {
    const inn = extractInnCandidate(text);
    if (!inn) return;
    try {
        const [{ validateInn }, bl] = await Promise.all([
            import('./xml-analyzer-ids.js'),
            import('./blacklist.js'),
        ]);
        const check = validateInn(inn);
        if (!check.ok) {
            NotificationService.add(`ИНН ${inn}: ${check.reason}. Проверьте номер перед сохранением.`, 'warning', {
                duration: 6000,
            });
        }
        await bl.showBlacklistEntryModal(null);
        const input = document.getElementById('blacklistEntryInn');
        if (input instanceof HTMLInputElement) {
            input.value = inn;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        document.getElementById('blacklistEntryOrgName')?.focus();
    } catch (err) {
        console.warn('[global-context-menu] blacklist', err);
        NotificationService.add('Не удалось открыть форму чёрного списка', 'error', { duration: 4000 });
    }
}

function getEnabledButtonIndices(menu) {
    const buttons = menu.querySelectorAll('button[role="menuitem"]');
    const out = [];
    buttons.forEach((b, i) => {
        if (!b.disabled) out.push(i);
    });
    return out;
}

function ensureShell() {
    if (menuEl && backdropEl) return;

    backdropEl = document.createElement('div');
    backdropEl.id = BACKDROP_ID;
    backdropEl.className = 'global-context-menu-backdrop';
    backdropEl.setAttribute('aria-hidden', 'true');

    menuEl = document.createElement('div');
    menuEl.id = MENU_ID;
    menuEl.className = 'global-context-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.setAttribute('aria-label', 'Меню приложения');
    menuEl.tabIndex = -1;

    document.body.appendChild(backdropEl);
    document.body.appendChild(menuEl);
}

function closeGlobalContextMenu() {
    if (!menuEl) return;
    const wasOpen =
        menuEl.classList.contains('global-context-menu--open') &&
        (menuEl.contains(document.activeElement) || document.activeElement === document.body);
    menuEl.classList.remove('global-context-menu--open');
    menuEl.innerHTML = '';
    backdropEl?.classList.remove('global-context-menu-backdrop--visible');
    document.body.classList.remove('global-context-menu-active');
    if (keydownHandler) {
        menuEl.removeEventListener('keydown', keydownHandler);
        keydownHandler = null;
    }
    if (pointerMoveHandler) {
        menuEl.removeEventListener('pointermove', pointerMoveHandler);
        pointerMoveHandler = null;
    }
    if (wasOpen && lastFocusEl && document.contains(lastFocusEl)) {
        try {
            lastFocusEl.focus({ preventScroll: true });
        } catch {
            /* элемент мог исчезнуть */
        }
    }
    lastFocusEl = null;
}

function focusMenuItemByDomIndex(index) {
    if (!menuEl) return;
    const buttons = menuEl.querySelectorAll('button[role="menuitem"]');
    buttons.forEach((b, i) => {
        b.classList.toggle('global-context-menu__item--active', i === index);
        if (i === index) b.focus();
    });
}

function runAction(id) {
    try {
        switch (id) {
            case 'home':
                void setActiveTab('main');
                break;
            case 'favorites':
                void setActiveTab('favorites');
                break;
            case 'timer-toggle':
                void toggleTimer();
                break;
            case 'timer-reset':
                resetTimer();
                break;
            case 'extension': {
                const customizeBtn = document.getElementById('customizeUIBtn');
                customizeBtn?.click();
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const display = document.getElementById('employeeExtensionDisplay');
                        display?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        if (display instanceof HTMLElement) display.click();
                    });
                });
                break;
            }
            case 'search': {
                const input = document.getElementById('searchInput');
                if (input instanceof HTMLElement) {
                    input.focus();
                    if (input instanceof HTMLInputElement) input.select?.();
                }
                break;
            }
            case 'command-palette':
                openCommandPalette();
                break;
            case 'hotkeys':
                document.getElementById('showHotkeysBtn')?.click();
                break;
            case 'view-toggle':
                toggleActiveSectionView();
                break;
            case 'settings':
                document.getElementById('customizeUIBtn')?.click();
                break;
            case 'ctx-open':
                ctxCardEl?.click();
                break;
            case 'ctx-copy-url': {
                const u = ctxCardEl ? cardUrl(ctxCardEl) : '';
                if (u) void copyText(u, 'Ссылка скопирована');
                break;
            }
            case 'ctx-edit':
                ctxCardEl?.querySelector(EDIT_SEL)?.click();
                break;
            case 'ctx-favorite':
                ctxCardEl?.querySelector(FAV_SEL)?.click();
                break;
            case 'ctx-delete':
                ctxCardEl?.querySelector(DELETE_SEL)?.click();
                break;
            case 'ctx-duplicate':
                void duplicateBookmarkFromCard(ctxCardEl);
                break;
            case 'ctx-check-requisites':
                if (typeof window.openRequisitesCheck === 'function') window.openRequisitesCheck(ctxSelectionText);
                break;
            case 'ctx-blacklist-inn':
                void addSelectionInnToBlacklist(ctxSelectionText);
                break;
            case 'ctx-copy-selection':
                if (ctxSelectionText) void copyText(ctxSelectionText, 'Текст скопирован');
                break;
            case 'ctx-search-selection': {
                const input = document.getElementById('searchInput');
                if (input instanceof HTMLInputElement && ctxSelectionText) {
                    input.value = ctxSelectionText;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.focus();
                }
                break;
            }
            default:
                break;
        }
    } catch (err) {
        console.warn('[global-context-menu] action', id, err);
    }
    closeGlobalContextMenu();
}

function openGlobalContextMenuAt(clientX, clientY, target) {
    ensureShell();
    if (!(menuEl && backdropEl)) return;

    const viewToggle = getViewToggleLabelForContextMenu();
    const descriptors = buildMenuItemDescriptors({
        timerRunning: getTimerRunning(),
        viewToggle,
        context: collectContext(target),
    });

    menuEl.innerHTML = '';
    descriptors.forEach((d) => {
        if (d.type === 'sep') {
            const sep = document.createElement('div');
            sep.className = 'global-context-menu__separator';
            sep.setAttribute('role', 'separator');
            menuEl.appendChild(sep);
            return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.role = 'menuitem';
        btn.className = 'global-context-menu__item';
        btn.dataset.action = d.id;
        btn.textContent = d.label;
        if (d.danger) btn.classList.add('global-context-menu__item--danger');
        if (d.hint) {
            const kbd = document.createElement('kbd');
            kbd.className = 'global-context-menu__hint';
            kbd.textContent = d.hint;
            btn.appendChild(kbd);
        }
        if (d.disabled) {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
        }
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (d.disabled) return;
            runAction(d.id);
        });
        menuEl.appendChild(btn);
    });

    lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuEl.classList.add('global-context-menu--open');
    backdropEl.classList.add('global-context-menu-backdrop--visible');
    document.body.classList.add('global-context-menu-active');

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = menuEl.getBoundingClientRect();
    const { left, top } = clampMenuPosition(
        clientX,
        clientY,
        rect.width || 220,
        rect.height || 200,
        vw,
        vh,
    );
    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;

    /* −1: нет «лишней» подсветки первого пункта при открытии мышью (раньше выглядело как залипший ховер на «Главная»). */
    activeIndex = -1;
    requestAnimationFrame(() => {
        menuEl.focus({ preventScroll: true });
    });

    keydownHandler = (e) => {
        const buttonsList = menuEl.querySelectorAll('button[role="menuitem"]');
        const indices = getEnabledButtonIndices(menuEl);

        if (e.key === 'Escape') {
            e.preventDefault();
            closeGlobalContextMenu();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = indices.indexOf(activeIndex);
            const next =
                cur === -1 ? indices[0] : (indices[(cur + 1) % indices.length] ?? indices[0]);
            activeIndex = next;
            focusMenuItemByDomIndex(activeIndex);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const cur = indices.indexOf(activeIndex);
            const prev =
                cur === -1
                    ? indices[indices.length - 1]
                    : (indices[(cur - 1 + indices.length) % indices.length] ?? indices[0]);
            activeIndex = prev;
            focusMenuItemByDomIndex(activeIndex);
            return;
        }
        if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            activeIndex = e.key === 'Home' ? indices[0] : indices[indices.length - 1];
            focusMenuItemByDomIndex(activeIndex);
            return;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            closeGlobalContextMenu();
            return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const idx = indices.includes(activeIndex) ? activeIndex : indices[0];
            const b = idx != null ? buttonsList[idx] : null;
            const id = b?.dataset?.action;
            if (id && !b?.disabled) runAction(id);
        }
    };
    menuEl.addEventListener('keydown', keydownHandler);

    /** Синхронизация «активного» пункта с указателем: без этого класс --active остаётся на первом пункте при ховере ниже (выглядит как залипший ховер на «Главная»). */
    pointerMoveHandler = (e) => {
        if (!(e instanceof PointerEvent) || !menuEl) return;
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('button[role="menuitem"]');
        if (!btn || !menuEl.contains(btn) || btn.disabled) return;
        const buttons = menuEl.querySelectorAll('button[role="menuitem"]');
        const idx = Array.prototype.indexOf.call(buttons, btn);
        if (idx < 0 || idx === activeIndex) return;
        activeIndex = idx;
        focusMenuItemByDomIndex(activeIndex);
    };
    menuEl.addEventListener('pointermove', pointerMoveHandler);
}

function onDocumentContextMenu(e) {
    if (!(e instanceof MouseEvent)) return;
    if (shouldDeferToNativeContextMenu(e, e.target)) return;
    const t = e.target;
    if (t instanceof Node && menuEl?.contains(t)) return;

    e.preventDefault();
    e.stopPropagation();
    openGlobalContextMenuAt(e.clientX, e.clientY, e.target);
}

function onBackdropPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    closeGlobalContextMenu();
}

function onDocumentPointerDown(e) {
    if (!menuEl?.classList.contains('global-context-menu--open')) return;
    const t = e.target;
    if (t instanceof Node && (menuEl.contains(t) || backdropEl?.contains(t))) return;
    closeGlobalContextMenu();
}

/**
 * Инициализация глобального контекстного меню (один раз).
 */
export function initGlobalContextMenu() {
    if (bound || typeof document === 'undefined') return;
    bound = true;
    ensureShell();
    document.addEventListener('contextmenu', onDocumentContextMenu, true);
    document.addEventListener('mousedown', onDocumentPointerDown, true);
    backdropEl?.addEventListener('mousedown', onBackdropPointerDown, true);
    window.addEventListener(
        'resize',
        () => {
            closeGlobalContextMenu();
        },
        true,
    );
    console.log('[global-context-menu] Инициализировано (Shift+ПКМ — нативное меню).');
}
