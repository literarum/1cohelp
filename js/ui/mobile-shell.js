// Mobile shell: bottom navigation, "Ещё" bottom sheet, on-screen keyboard handling.
// Reuses the existing .tab-btn buttons (click proxy), so all tab logic stays in one place.

import { getVisibleModals } from './modals-manager.js';
import { attachDragToDismiss } from './touch-gestures.js';

export const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-height: 500px)';

export const PINNED_PREFERENCE = Object.freeze(['mainTab', 'programTab', 'bookmarksTab', 'clientAnalyticsTab']);

export const SHORT_LABELS = Object.freeze({
    mainTab: ['fa-home', 'Главная'],
    programTab: ['fa-desktop', '1С/УП'],
    linksTab: ['fa-link', 'Ссылки'],
    extLinksTab: ['fa-external-link-alt', 'Ресурсы'],
    skziTab: ['fa-key', 'СКЗИ'],
    webRegTab: ['fa-globe', 'Веб-рег.'],
    reglamentsTab: ['fa-book', 'Регламенты'],
    bookmarksTab: ['fa-bookmark', 'Закладки'],
    clientAnalyticsTab: ['fa-users', 'Клиенты'],
    trainingTab: ['fa-graduation-cap', 'Обучение'],
    sedoTypesTab: ['fa-file-alt', 'СЭДО'],
    blacklistedClientsTab: ['fa-ban', 'Ч. список'],
    xmlAnalyzerTab: ['fa-code', 'XML'],
});

export const ACTION_TILES = Object.freeze([
    { id: 'showFavoritesHeaderBtn', icon: 'fa-star', label: 'Избранное' },
    { id: 'showRemindersHeaderBtn', icon: 'fa-bell', label: 'Напоминания' },
    { id: 'openCommandPaletteBtn', icon: 'fa-terminal', label: 'Команды' },
    { id: 'themeToggle', icon: 'fa-adjust', label: 'Тема' },
    { id: 'customizeUIBtn', icon: 'fa-sliders-h', label: 'Настройки' },
    { id: 'exportDataBtn', icon: 'fa-file-export', label: 'Экспорт' },
    { id: 'importDataBtn', icon: 'fa-file-import', label: 'Импорт' },
    { id: 'showHotkeysBtn', icon: 'fa-question-circle', label: 'Справка' },
    { id: 'forceReloadBtn', icon: 'fa-sync-alt', label: 'Перезагрузка' },
]);

/** Pure: which ids go to the bar. Preferred order, only visible, at most `max`; filled up from the rest. */
export function pickPinnedTabs(visibleIds, preferred = PINNED_PREFERENCE, max = 4) {
    const vis = new Set(visibleIds);
    const out = preferred.filter((id) => vis.has(id)).slice(0, max);
    for (const id of visibleIds) {
        if (out.length >= max) break;
        if (!out.includes(id)) out.push(id);
    }
    return out;
}

export function isMobileLayout() {
    try {
        return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
    } catch {
        return false;
    }
}

function tabButtons() {
    return Array.from(document.querySelectorAll('.tab-btn:not(#moreTabsBtn)')).filter(
        (b) => b.id && !b.classList.contains('hidden') && b.dataset.tabHidden !== 'true',
    );
}

export function getMobileTabIds() {
    return tabButtons().map((b) => b.id);
}

export function getActiveTabId() {
    const a = document.querySelector('.tab-btn.tab-active:not(#moreTabsBtn)');
    return a ? a.id : null;
}

export function activateTabById(id) {
    const btn = document.getElementById(id);
    if (btn) btn.click();
}

function labelFor(btn) {
    const known = SHORT_LABELS[btn.id];
    if (known) return known;
    const icon = btn.querySelector('i');
    const ic = icon ? Array.from(icon.classList).find((c) => /^fa-/.test(c) && c !== 'fa-fw') : null;
    return [ic || 'fa-circle', (btn.textContent || '').trim().slice(0, 12)];
}

function makeEl(tag, cls, attrs) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (attrs) for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
    return el;
}

let started = false;

export function initMobileShell() {
    if (started || typeof document === 'undefined') return null;
    started = true;

    const nav = makeEl('nav', 'mobile-nav', { id: 'mobileBottomNav', 'aria-label': 'Основная навигация' });
    const backdrop = makeEl('div', 'mobile-sheet-backdrop', { 'aria-hidden': 'true' });
    const sheet = makeEl('div', 'mobile-sheet', {
        id: 'mobileMoreSheet',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Ещё',
        'aria-hidden': 'true',
    });
    const handle = makeEl('div', 'mobile-sheet-handle', { 'aria-hidden': 'true' });
    const title = makeEl('h2', 'mobile-sheet-title');
    title.textContent = 'Разделы и действия';
    const body = makeEl('div', 'mobile-sheet-body');
    sheet.append(handle, title, body);
    document.body.append(nav, backdrop, sheet);

    let sheetOpen = false;
    let lastFocus = null;

    const syncNavVisibility = () => {
        document.body.classList.toggle('mobile-nav-hidden', getVisibleModals().length > 0);
    };

    const closeSheet = (restore = true) => {
        if (!sheetOpen) return;
        sheetOpen = false;
        sheet.classList.remove('is-open', 'is-dragging');
        backdrop.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        sheet.style.transform = '';
        document.body.classList.remove('mobile-sheet-open');
        syncNavVisibility();
        if (restore && lastFocus && lastFocus.focus) {
            try {
                lastFocus.focus({ preventScroll: true });
            } catch {
                /* ignore */
            }
        }
    };

    const buildSheet = () => {
        body.textContent = '';
        const active = getActiveTabId();
        const sec1 = makeEl('div', 'mobile-sheet-section');
        sec1.textContent = 'Разделы';
        const grid1 = makeEl('div', 'mobile-sheet-grid');
        tabButtons().forEach((b) => {
            const [ic, text] = labelFor(b);
            const t = makeEl('button', 'mobile-sheet-tile' + (b.id === active ? ' is-active' : ''), { type: 'button' });
            t.innerHTML = `<i class="fas ${ic}" aria-hidden="true"></i>`;
            const s = document.createElement('span');
            s.textContent = text;
            t.appendChild(s);
            t.addEventListener('click', () => {
                closeSheet(false);
                activateTabById(b.id);
            });
            grid1.appendChild(t);
        });
        body.append(sec1, grid1);

        const tiles = ACTION_TILES.filter((a) => document.getElementById(a.id));
        if (tiles.length) {
            const sec2 = makeEl('div', 'mobile-sheet-section');
            sec2.textContent = 'Действия';
            const grid2 = makeEl('div', 'mobile-sheet-grid');
            tiles.forEach((a) => {
                const t = makeEl('button', 'mobile-sheet-tile', { type: 'button' });
                t.innerHTML = `<i class="fas ${a.icon}" aria-hidden="true"></i>`;
                const s = document.createElement('span');
                s.textContent = a.label;
                t.appendChild(s);
                t.addEventListener('click', () => {
                    closeSheet(false);
                    const target = document.getElementById(a.id);
                    // дать шторке начать закрытие, чтобы окно открылось поверх чистого экрана
                    setTimeout(() => target && target.click(), 60);
                });
                grid2.appendChild(t);
            });
            body.append(sec2, grid2);
        }
    };

    const openSheet = () => {
        if (sheetOpen) return;
        sheetOpen = true;
        lastFocus = document.activeElement;
        buildSheet();
        sheet.setAttribute('aria-hidden', 'false');
        document.body.classList.add('mobile-sheet-open');
        requestAnimationFrame(() => {
            backdrop.classList.add('is-open');
            sheet.classList.add('is-open');
            const first = sheet.querySelector('.mobile-sheet-tile');
            if (first) first.focus({ preventScroll: true });
        });
    };

    backdrop.addEventListener('click', () => closeSheet());
    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key === 'Escape' && sheetOpen) {
                e.preventDefault();
                e.stopPropagation();
                closeSheet();
            }
        },
        true,
    );
    attachDragToDismiss(sheet, {
        canStart: (e) => {
            if (e.target.closest && e.target.closest('.mobile-sheet-handle, .mobile-sheet-title')) return true;
            return body.scrollTop <= 0;
        },
        onDismiss: () => closeSheet(),
    });

    const renderNav = () => {
        const ids = getMobileTabIds();
        const pinned = pickPinnedTabs(ids);
        const active = getActiveTabId();
        nav.textContent = '';
        pinned.forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const [ic, text] = labelFor(btn);
            const it = makeEl('button', 'mobile-nav-item' + (id === active ? ' is-active' : ''), {
                type: 'button',
                'data-tab': id,
                'aria-label': text,
            });
            if (id === active) it.setAttribute('aria-current', 'page');
            it.innerHTML = `<i class="fas ${ic}" aria-hidden="true"></i>`;
            const s = document.createElement('span');
            s.textContent = text;
            it.appendChild(s);
            it.addEventListener('click', () => {
                if (id !== getActiveTabId()) activateTabById(id);
                else {
                    const sc = document.scrollingElement || document.documentElement;
                    sc.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
            nav.appendChild(it);
        });
        const moreActive = !!active && !pinned.includes(active);
        const more = makeEl('button', 'mobile-nav-item' + (moreActive ? ' is-active' : ''), {
            type: 'button',
            id: 'mobileMoreBtn',
            'aria-label': 'Ещё',
            'aria-haspopup': 'dialog',
        });
        more.innerHTML = '<i class="fas fa-th-large" aria-hidden="true"></i><span>Ещё</span>';
        more.addEventListener('click', openSheet);
        nav.appendChild(more);
        document.body.classList.toggle('has-mobile-nav', ids.length > 0);
    };

    let raf = 0;
    const scheduleRender = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            renderNav();
        });
    };

    const tabsRoot = document.querySelector('#staticHeaderWrapper') || document.body;
    new MutationObserver(scheduleRender).observe(tabsRoot, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    });
    renderNav();

    // nav hides while a modal is open (event comes from modal-choreographer)
    document.addEventListener('app:modal-visibility', syncNavVisibility);
    syncNavVisibility();

    // keyboard / visual viewport
    const root = document.documentElement;
    const vv = window.visualViewport;
    const updateViewport = () => {
        if (!vv) return;
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        root.style.setProperty('--kb-inset', inset + 'px');
        root.style.setProperty('--vvh', Math.round(vv.height) + 'px');
        const ae = document.activeElement;
        const typing = !!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
        root.classList.toggle('kb-open', inset > 120 && typing);
    };
    if (vv) {
        vv.addEventListener('resize', updateViewport);
        vv.addEventListener('scroll', updateViewport);
        updateViewport();
    }
    document.addEventListener('focusout', () => setTimeout(updateViewport, 50));
    document.addEventListener('focusin', (e) => {
        const t = e.target;
        if (!isMobileLayout() || !t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
        setTimeout(() => {
            updateViewport();
            if (t.closest && t.closest('[role="dialog"]')) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 280);
    });

    window.addEventListener('orientationchange', () => {
        closeSheet(false);
        setTimeout(() => {
            updateViewport();
            scheduleRender();
        }, 200);
    });

    return { openSheet, closeSheet, renderNav };
}
