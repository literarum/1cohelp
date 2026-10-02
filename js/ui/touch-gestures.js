// Touch gestures for the mobile layout: tab swipe, drag-to-dismiss for modals/sheets,
// long-press -> contextmenu, swipe-to-dismiss toasts. Pure helpers are exported for tests.

export const SWIPE = Object.freeze({
    MIN_DISTANCE: 64,
    AXIS_RATIO: 1.6,
    FAST_MS: 320,
    FAST_DISTANCE: 36,
    EDGE_GUARD: 22,
    DISMISS_DISTANCE: 110,
    DISMISS_VELOCITY: 0.55,
    LONG_PRESS_MS: 520,
    LONG_PRESS_SLOP: 10
});

/** Classify a finished touch as a swipe direction (finger movement direction) or null. */
export function classifySwipe(dx, dy, dt) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const fast = dt <= SWIPE.FAST_MS && Math.max(ax, ay) >= SWIPE.FAST_DISTANCE;
    const long = Math.max(ax, ay) >= SWIPE.MIN_DISTANCE;
    if (!fast && !long) return null;
    if (ax >= ay * SWIPE.AXIS_RATIO) return dx < 0 ? 'left' : 'right';
    if (ay >= ax * SWIPE.AXIS_RATIO) return dy < 0 ? 'up' : 'down';
    return null;
}

/** Swipe left => next tab, swipe right => previous. No wrap-around. */
export function adjacentTabId(ids, activeId, direction) {
    if (!Array.isArray(ids) || !ids.length) return null;
    const i = ids.indexOf(activeId);
    if (i < 0) return null;
    const j = direction === 'left' ? i + 1 : direction === 'right' ? i - 1 : i;
    if (j === i || j < 0 || j >= ids.length) return null;
    return ids[j];
}

/** Resistance curve for over-drag. */
export function rubberBand(dy, limit = 240) {
    if (dy <= 0) return 0;
    return limit * (1 - 1 / (dy / limit + 1));
}

export function shouldDismissDrag(dy, dt) {
    if (dy <= 0) return false;
    if (dy >= SWIPE.DISMISS_DISTANCE) return true;
    const v = dy / Math.max(dt, 1);
    return dy > 36 && v >= SWIPE.DISMISS_VELOCITY;
}

const BLOCK_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'TABLE', 'PRE', 'CODE', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO']);
const BLOCK_ROLES = new Set(['slider', 'textbox', 'listbox', 'scrollbar']);

export function isSwipeBlockedTarget(el, root = null) {
    let n = el && el.nodeType === 1 ? el : el && el.parentElement;
    while (n && n !== root && n !== document.documentElement) {
        if (BLOCK_TAGS.has(n.tagName)) return true;
        if (n.isContentEditable) return true;
        const role = n.getAttribute && n.getAttribute('role');
        if (role && BLOCK_ROLES.has(role)) return true;
        if (n.hasAttribute && n.hasAttribute('data-no-swipe')) return true;
        if (n.scrollWidth > n.clientWidth + 2 && typeof getComputedStyle === 'function') {
            const ox = getComputedStyle(n).overflowX;
            if (ox === 'auto' || ox === 'scroll') return true;
        }
        n = n.parentElement;
    }
    return false;
}

function vibrate(ms) {
    try {
        if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
        /* ignore */
    }
}

/**
 * Drag a panel down to dismiss. Touch events; touchmove is non-passive only while dragging.
 */
export function attachDragToDismiss(panel, opts = {}) {
    const { canStart = () => true, onDismiss = () => {}, onProgress = null, onCancel = null } = opts;
    let startY = 0;
    let startX = 0;
    let startT = 0;
    let dragging = false;
    let tracking = false;
    let lastDy = 0;

    const reset = () => {
        dragging = false;
        tracking = false;
        panel.classList.remove('is-sheet-dragging');
    };

    const onStart = (e) => {
        if (e.touches.length !== 1 || !canStart(e)) return;
        const t = e.touches[0];
        startY = t.clientY;
        startX = t.clientX;
        startT = performance.now();
        lastDy = 0;
        tracking = true;
        dragging = false;
    };
    const onMove = (e) => {
        if (!tracking) return;
        const t = e.touches[0];
        const dy = t.clientY - startY;
        const dx = t.clientX - startX;
        if (!dragging) {
            if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
                tracking = false;
                return;
            }
            if (dy < -6) {
                tracking = false;
                return;
            }
            if (dy < 8) return;
            dragging = true;
            panel.classList.remove('is-sheet-settling');
            panel.classList.add('is-sheet-dragging');
        }
        if (e.cancelable) e.preventDefault();
        lastDy = dy;
        const eff = dy <= 160 ? dy : 160 + rubberBand(dy - 160, 600);
        panel.style.transform = `translate3d(0, ${Math.max(0, eff)}px, 0)`;
        if (onProgress) onProgress(Math.max(0, eff));
    };
    const onEnd = () => {
        if (!tracking) return;
        const wasDragging = dragging;
        const dt = performance.now() - startT;
        const dy = lastDy;
        reset();
        if (!wasDragging) return;
        if (shouldDismissDrag(dy, dt)) {
            vibrate(8);
            panel.classList.add('is-sheet-settling');
            panel.style.transform = 'translate3d(0, 100%, 0)';
            const done = () => {
                panel.classList.remove('is-sheet-settling');
                panel.style.transform = '';
                onDismiss();
            };
            let fired = false;
            const once = () => {
                if (fired) return;
                fired = true;
                done();
            };
            panel.addEventListener('transitionend', once, { once: true });
            setTimeout(once, 260);
        } else {
            panel.classList.add('is-sheet-settling');
            panel.style.transform = '';
            setTimeout(() => panel.classList.remove('is-sheet-settling'), 260);
            if (onCancel) onCancel();
        }
    };
    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd, { passive: true });
    panel.addEventListener('touchcancel', onEnd, { passive: true });
    const detach = () => {
        panel.removeEventListener('touchstart', onStart);
        panel.removeEventListener('touchmove', onMove);
        panel.removeEventListener('touchend', onEnd);
        panel.removeEventListener('touchcancel', onEnd);
    };
    detach.start = onStart;
    return detach;
}

const PANEL_SEL =
    '.modal-inner-container, .engineering-cockpit-shell, .app-customization-panel, .bg-white.dark\\:bg-gray-800.rounded-lg, .db-merge-shell';
const NO_SWIPE_ZONES = '.mobile-nav, #scrollNavButtons, #notification-container, .mobile-sheet';

function hasTextSelection() {
    try {
        const s = window.getSelection && window.getSelection();
        return !!(s && !s.isCollapsed && String(s).length > 0);
    } catch {
        return false;
    }
}

export function initTouchGestures(api) {
    if (typeof document === 'undefined' || initTouchGestures._done) return;
    initTouchGestures._done = true;
    const mobile = () => (api.isMobile ? api.isMobile() : true);

    // 1) Tab swipe
    const content = document.getElementById('appContent');
    if (content) {
        let sx = 0;
        let sy = 0;
        let st = 0;
        let active = false;
        content.addEventListener(
            'touchstart',
            (e) => {
                active = false;
                if (!mobile() || e.touches.length !== 1) return;
                if (api.hasOpenOverlay && api.hasOpenOverlay()) return;
                const t = e.touches[0];
                if (t.clientX < SWIPE.EDGE_GUARD || t.clientX > window.innerWidth - SWIPE.EDGE_GUARD) return;
                const vv = window.visualViewport;
                if (vv && vv.scale > 1.02) return;
                if (e.target.closest && e.target.closest(NO_SWIPE_ZONES)) return;
                if (isSwipeBlockedTarget(e.target, content)) return;
                if (hasTextSelection()) return;
                sx = t.clientX;
                sy = t.clientY;
                st = performance.now();
                active = true;
            },
            { passive: true }
        );
        content.addEventListener(
            'touchend',
            (e) => {
                if (!active) return;
                active = false;
                const t = e.changedTouches[0];
                if (!t) return;
                if (api.hasOpenOverlay && api.hasOpenOverlay()) return;
                const dir = classifySwipe(t.clientX - sx, t.clientY - sy, performance.now() - st);
                if (dir !== 'left' && dir !== 'right') return;
                const next = adjacentTabId(api.getTabIds(), api.getActiveTabId(), dir);
                if (!next) {
                    vibrate(4);
                    return;
                }
                api.activateTab(next, 'swipe');
                requestAnimationFrame(() => {
                    const panel = document.querySelector('.tab-content:not(.hidden)');
                    if (!panel) return;
                    const cls = dir === 'left' ? 'swipe-nudge-next' : 'swipe-nudge-prev';
                    panel.classList.remove('swipe-nudge-next', 'swipe-nudge-prev');
                    void panel.offsetWidth;
                    panel.classList.add(cls);
                    setTimeout(() => panel.classList.remove(cls), 320);
                });
            },
            { passive: true }
        );
        content.addEventListener('touchcancel', () => (active = false), { passive: true });
    }

    // 2) Modal drag-to-dismiss (delegated)
    const attached = new WeakSet();
    document.addEventListener(
        'touchstart',
        (e) => {
            if (!mobile() || e.touches.length !== 1) return;
            const target = e.target;
            if (!target || !target.closest) return;
            const modal = target.closest('[role="dialog"]');
            if (!modal || modal.classList.contains('hidden')) return;
            const panel = target.closest(PANEL_SEL);
            if (!panel || !modal.contains(panel) || attached.has(panel)) return;
            if (panel.dataset.fullscreen === 'true' || modal.classList.contains('modal-fullscreen')) return;
            attached.add(panel);
            const canStart = (ev) => {
                if (!mobile()) return false;
                const tt = ev.target;
                if (tt.closest && tt.closest('.modal-sheet-handle')) return true;
                const r = panel.getBoundingClientRect();
                const y = ev.touches[0].clientY - r.top;
                if (y > 64) return false;
                return !(tt.closest && tt.closest('button, a, input, textarea, select, [role="button"]'));
            };
            const drag = attachDragToDismiss(panel, {
                canStart,
                onDismiss: () => api.closeModal(modal)
            });
            // forward the very first touch (listeners were attached after it began)
            drag.start(e);
        },
        { capture: true, passive: true }
    );

    // 3) Long-press -> contextmenu
    let lpTimer = 0;
    let lpX = 0;
    let lpY = 0;
    let suppressClickUntil = 0;
    const cancelLp = () => {
        clearTimeout(lpTimer);
        lpTimer = 0;
    };
    document.addEventListener(
        'touchstart',
        (e) => {
            cancelLp();
            if (!mobile() || e.touches.length !== 1) return;
            const target = e.target;
            if (!target || !target.closest) return;
            if (!target.closest('#appContent, [role="dialog"]')) return;
            if (target.closest('input, textarea, select, [contenteditable="true"], .mobile-nav, .mobile-sheet')) return;
            const t = e.touches[0];
            lpX = t.clientX;
            lpY = t.clientY;
            lpTimer = setTimeout(() => {
                lpTimer = 0;
                if (hasTextSelection()) return;
                const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: lpX, clientY: lpY, button: 2 });
                const handled = !target.dispatchEvent(ev);
                if (handled) {
                    suppressClickUntil = performance.now() + 700;
                    vibrate(12);
                }
            }, SWIPE.LONG_PRESS_MS);
        },
        { capture: true, passive: true }
    );
    document.addEventListener(
        'touchmove',
        (e) => {
            if (!lpTimer) return;
            const t = e.touches[0];
            if (Math.hypot(t.clientX - lpX, t.clientY - lpY) > SWIPE.LONG_PRESS_SLOP) cancelLp();
        },
        { capture: true, passive: true }
    );
    document.addEventListener('touchend', cancelLp, { capture: true, passive: true });
    document.addEventListener('touchcancel', cancelLp, { capture: true, passive: true });
    document.addEventListener(
        'click',
        (e) => {
            if (performance.now() < suppressClickUntil) {
                e.preventDefault();
                e.stopPropagation();
                suppressClickUntil = 0;
            }
        },
        true
    );

    // 4) Toast swipe
    const host = document.getElementById('notification-container');
    if (host) {
        let tx = 0;
        let ty = 0;
        let el = null;
        let moving = false;
        host.addEventListener(
            'touchstart',
            (e) => {
                el = e.target.closest && e.target.closest('.app-toast-wrap');
                if (!el || e.touches.length !== 1) {
                    el = null;
                    return;
                }
                tx = e.touches[0].clientX;
                ty = e.touches[0].clientY;
                moving = false;
            },
            { passive: true }
        );
        host.addEventListener(
            'touchmove',
            (e) => {
                if (!el) return;
                const dx = e.touches[0].clientX - tx;
                const dy = e.touches[0].clientY - ty;
                if (!moving && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) moving = true;
                if (!moving) return;
                el.style.transition = 'none';
                el.style.transform = `translate3d(${dx}px,0,0)`;
                el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 240));
            },
            { passive: true }
        );
        const end = (e) => {
            if (!el) return;
            const t = (e.changedTouches && e.changedTouches[0]) || null;
            const dx = t ? t.clientX - tx : 0;
            const node = el;
            el = null;
            node.style.transition = 'transform .2s ease, opacity .2s ease';
            if (moving && Math.abs(dx) > 80) {
                node.style.transform = `translate3d(${dx > 0 ? 120 : -120}%,0,0)`;
                node.style.opacity = '0';
                const btn = node.querySelector('.app-toast__close');
                setTimeout(() => (btn ? btn.click() : node.remove()), 180);
            } else {
                node.style.transform = '';
                node.style.opacity = '';
            }
            moving = false;
        };
        host.addEventListener('touchend', end, { passive: true });
        host.addEventListener('touchcancel', end, { passive: true });
    }
}
