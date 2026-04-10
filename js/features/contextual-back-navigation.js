'use strict';

/**
 * iOS-подобная контекстная навигация «назад» внутри SPA:
 * основной контур — стек в памяти; резерв — sessionStorage (версионированная схема).
 */

import { State } from '../app/state.js';

const STORAGE_KEY = 'copilot1co_ctx_nav_stack_v1';
const SCHEMA_VERSION = 1;
const MAX_STACK = 8;

/** Источники: только programmatic пополняет стек */
export const NavigationSource = {
    PROGRAMMATIC: 'programmatic',
    TAB_BAR: 'tab-bar',
    CONTEXTUAL_BACK: 'contextual-back',
    HEADER_SHORTCUT: 'header-shortcut',
    INITIAL: 'initial',
    KEYBOARD_SHORTCUT: 'keyboard-shortcut',
    SYSTEM: 'system',
    ONBOARDING: 'onboarding',
    HEALTH_SWEEP: 'health-sweep',
};

let memoryStack = [];

let getSectionTitleFn = (id) => id || '';
let showReglamentsForCategoryFn = null;
let setActiveTabFn = null;

/**
 * @param {Object} options
 * @param {(sectionId: string) => string} options.getSectionTitle
 * @param {(categoryId: string) => Promise<void>} [options.showReglamentsForCategory]
 * @param {(tabId: string, warning?: boolean, nav?: object) => Promise<void>} options.setActiveTab
 */
export function initContextualBackNavigation(options = {}) {
    if (typeof options.getSectionTitle === 'function') {
        getSectionTitleFn = options.getSectionTitle;
    }
    if (typeof options.showReglamentsForCategory === 'function') {
        showReglamentsForCategoryFn = options.showReglamentsForCategory;
    }
    if (typeof options.setActiveTab === 'function') {
        setActiveTabFn = options.setActiveTab;
    }
    hydrateStackFromSessionStorage();
    bindBackButton();
    updateBackButtonUi();
}

function getScrollRoots() {
    if (typeof document === 'undefined') {
        return { main: null, windowScrollY: 0 };
    }
    const appContent = document.getElementById('appContent');
    const main = appContent?.querySelector('main');
    const win = typeof globalThis !== 'undefined' ? globalThis : {};
    const sy = typeof win.scrollY === 'number' ? win.scrollY : 0;
    return { main: main || null, windowScrollY: sy };
}

function readMainScrollTop(main) {
    if (!main) return 0;
    return main.scrollTop || 0;
}

/** @returns {{ v: number, section: string, windowScrollY: number, mainScrollY: number, reglaments: object|null }} */
export function captureNavigationSnapshot() {
    if (typeof document === 'undefined') {
        return {
            v: SCHEMA_VERSION,
            section: State.currentSection || 'main',
            windowScrollY: 0,
            mainScrollY: 0,
            reglaments: null,
        };
    }
    const section = State.currentSection || 'main';
    const { main, windowScrollY } = getScrollRoots();
    const mainScrollY = readMainScrollTop(main);

    let reglaments = null;
    if (section === 'reglaments') {
        const reglamentsListDiv = document.getElementById('reglamentsList');
        if (reglamentsListDiv) {
            reglaments = {
                listVisible: !reglamentsListDiv.classList.contains('hidden'),
                currentCategory: reglamentsListDiv.dataset.currentCategory || null,
            };
        }
    }

    return {
        v: SCHEMA_VERSION,
        section,
        windowScrollY,
        mainScrollY,
        reglaments,
    };
}

export function stackDepth() {
    return memoryStack.length;
}

export function peekBackEntry() {
    if (!memoryStack.length) return null;
    return memoryStack[memoryStack.length - 1];
}

/**
 * @param {ReturnType<typeof captureNavigationSnapshot>} snapshot
 * @param {string} returnToTitleSectionId — id вкладки, куда вернёмся (для подписи кнопки)
 */
export function pushNavigationEntry(snapshot, returnToTitleSectionId) {
    if (!snapshot || !snapshot.section) return;
    memoryStack.push({
        snapshot,
        labelSectionId: returnToTitleSectionId || snapshot.section,
        ts: Date.now(),
    });
    while (memoryStack.length > MAX_STACK) {
        memoryStack.shift();
    }
    persistStackToSessionStorage();
    updateBackButtonUi();
}

export function popNavigationEntry() {
    const entry = memoryStack.pop() || null;
    persistStackToSessionStorage();
    updateBackButtonUi();
    return entry;
}

export function clearNavigationStack() {
    memoryStack = [];
    persistStackToSessionStorage();
    updateBackButtonUi();
}

function persistStackToSessionStorage() {
    if (typeof sessionStorage === 'undefined') return;
    try {
        const payload = {
            v: SCHEMA_VERSION,
            entries: memoryStack.map((e) => ({
                snapshot: e.snapshot,
                labelSectionId: e.labelSectionId,
                ts: e.ts,
            })),
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('[contextual-back] sessionStorage persist failed', e);
    }
}

function hydrateStackFromSessionStorage() {
    if (typeof sessionStorage === 'undefined') return;
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
            sessionStorage.removeItem(STORAGE_KEY);
            return;
        }
        memoryStack = parsed.entries
            .filter(
                (e) =>
                    e &&
                    e.snapshot &&
                    typeof e.snapshot.section === 'string' &&
                    e.snapshot.v === SCHEMA_VERSION,
            )
            .map((e) => ({
                snapshot: e.snapshot,
                labelSectionId: e.labelSectionId || e.snapshot.section,
                ts: e.ts || 0,
            }));
        if (memoryStack.length > MAX_STACK) {
            memoryStack = memoryStack.slice(-MAX_STACK);
        }
    } catch (e) {
        console.warn('[contextual-back] sessionStorage hydrate failed', e);
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (_) {
            /* ignore */
        }
    }
}

function bindBackButton() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('contextualBackNavBtn');
    if (!btn || btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => {
        void handleContextualBackClick();
    });
}

async function handleContextualBackClick() {
    const entry = popNavigationEntry();
    if (!entry || !setActiveTabFn) return;
    const { snapshot } = entry;
    await setActiveTabFn(snapshot.section, true, {
        navigationSource: NavigationSource.CONTEXTUAL_BACK,
        scrollRestore: {
            windowScrollY: snapshot.windowScrollY,
            mainScrollY: snapshot.mainScrollY,
        },
        reglamentsSnapshot: snapshot.reglaments,
    });
}

export function updateBackButtonUi() {
    if (typeof document === 'undefined') return;
    const wrap = document.getElementById('contextualBackNav');
    const labelEl = document.getElementById('contextualBackNavLabel');
    const btn = document.getElementById('contextualBackNavBtn');
    if (!wrap || !labelEl || !btn) return;

    const top = peekBackEntry();
    if (!top) {
        wrap.classList.add('hidden');
        wrap.setAttribute('aria-hidden', 'true');
        btn.disabled = true;
        return;
    }

    const title = getSectionTitleFn(top.labelSectionId) || top.labelSectionId;
    labelEl.textContent = title;
    const backLabel = `Вернуться к разделу «${title}»`;
    btn.setAttribute('aria-label', backLabel);
    btn.setAttribute('title', backLabel);
    wrap.classList.remove('hidden');
    wrap.setAttribute('aria-hidden', 'false');
    btn.disabled = false;
}

/**
 * Перед сменой секции: при programmatic — сохранить текущее состояние.
 */
export function onBeforeProgrammaticSectionChange(fromSection, toSection) {
    if (!fromSection || !toSection || fromSection === toSection) return;
    const snap = captureNavigationSnapshot();
    pushNavigationEntry(snap, fromSection);
}

/**
 * Восстановить под-экран регламентов после переключения вкладки.
 * @param {object|null|undefined} regSnap
 */
export async function applyReglamentsSnapshotIfNeeded(regSnap) {
    if (typeof document === 'undefined' || !regSnap || State.currentSection !== 'reglaments')
        return;

    const backBtn = document.getElementById('backToCategories');
    const reglamentsListDiv = document.getElementById('reglamentsList');

    if (!regSnap.listVisible) {
        backBtn?.click();
        return;
    }

    if (regSnap.currentCategory && typeof showReglamentsForCategoryFn === 'function') {
        await showReglamentsForCategoryFn(regSnap.currentCategory);
    } else if (reglamentsListDiv) {
        reglamentsListDiv.classList.add('hidden');
        delete reglamentsListDiv.dataset.currentCategory;
        backBtn?.click();
    }
}

/**
 * Применить сохранённые позиции скролла (после анимации вкладки).
 */
export function scheduleScrollRestore(scrollRestore, delayMs) {
    if (!scrollRestore) return;
    const { windowScrollY, mainScrollY } = scrollRestore;
    const delay = typeof delayMs === 'number' ? delayMs : 200;
    const g = typeof globalThis !== 'undefined' ? globalThis : {};
    const raf =
        typeof g.requestAnimationFrame === 'function'
            ? g.requestAnimationFrame.bind(g)
            : (cb) => setTimeout(cb, 0);

    setTimeout(() => {
        raf(() => {
            try {
                if (typeof g.scrollTo === 'function') {
                    g.scrollTo({ top: windowScrollY, left: 0, behavior: 'auto' });
                }
            } catch (_e) {
                if (typeof g.scrollTo === 'function') g.scrollTo(0, windowScrollY);
            }
            const { main } = getScrollRoots();
            if (main && typeof mainScrollY === 'number') {
                try {
                    main.scrollTo({ top: mainScrollY, left: 0, behavior: 'auto' });
                } catch (_e) {
                    main.scrollTop = mainScrollY;
                }
            }
        });
    }, delay);
}

/** Тестовый сброс */
export function __resetForTests() {
    memoryStack = [];
    try {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem(STORAGE_KEY);
        }
    } catch (_) {
        /* ignore */
    }
}
