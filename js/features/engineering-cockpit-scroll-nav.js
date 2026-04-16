'use strict';

/** Согласовано с `initScrollNavButtons` в site/script.js */
export const COCKPIT_SCROLL_NAV_THRESHOLD = 2;

/**
 * @param {number} scrollTop
 * @param {number} scrollHeight
 * @param {number} clientHeight
 * @param {number} [threshold]
 */
export function computeCockpitScrollNavState(
    scrollTop,
    scrollHeight,
    clientHeight,
    threshold = COCKPIT_SCROLL_NAV_THRESHOLD,
) {
    const overflowDelta = scrollHeight - clientHeight;
    const show = overflowDelta > 1;
    const canScrollUp = scrollTop > threshold;
    const canScrollDown = scrollTop + clientHeight < scrollHeight - threshold;
    return { show, canScrollUp, canScrollDown };
}

/**
 * Дублирующий контур прокрутки области `.engineering-cockpit-content`: глобальные кнопки
 * остаются под z-index модалки и недоступны.
 *
 * @param {{
 *   modal: HTMLElement,
 *   workspace: HTMLElement,
 *   contentWrap: HTMLElement,
 *   container: HTMLElement,
 *   upBtn: HTMLButtonElement,
 *   downBtn: HTMLButtonElement,
 * }} p
 */
export function bindEngineeringCockpitScrollNav(p) {
    const { modal, workspace, contentWrap, container, upBtn, downBtn } = p;
    if (!modal || !workspace || !contentWrap || !container || !upBtn || !downBtn) {
        return { requestUpdate: () => {}, detach: () => {} };
    }

    const apply = () => {
        const modalHidden = modal.classList.contains('hidden');
        const workspaceHidden = workspace.classList.contains('hidden');
        const st = contentWrap.scrollTop ?? 0;
        const sh = contentWrap.scrollHeight;
        const ch = contentWrap.clientHeight;
        const { show, canScrollUp, canScrollDown } = computeCockpitScrollNavState(st, sh, ch);
        const visible = !modalHidden && !workspaceHidden && show;

        container.classList.toggle('opacity-0', !visible);
        container.classList.toggle('pointer-events-none', !visible);
        container.setAttribute('aria-hidden', visible ? 'false' : 'true');

        upBtn.disabled = !visible || !canScrollUp;
        downBtn.disabled = !visible || !canScrollDown;
    };

    const onScroll = () => requestAnimationFrame(apply);

    const scrollToTop = () => {
        contentWrap.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const scrollToBottom = () => {
        contentWrap.scrollTo({
            top: contentWrap.scrollHeight - contentWrap.clientHeight,
            behavior: 'smooth',
        });
    };

    upBtn.addEventListener('click', scrollToTop);
    downBtn.addEventListener('click', scrollToBottom);
    contentWrap.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', apply);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => requestAnimationFrame(apply));
        ro.observe(contentWrap);
        ro.observe(workspace);
    }

    const mo = new MutationObserver(() => requestAnimationFrame(apply));
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
    mo.observe(workspace, { attributes: true, attributeFilter: ['class'] });

    requestAnimationFrame(apply);

    return {
        requestUpdate: () => requestAnimationFrame(apply),
        detach: () => {
            upBtn.removeEventListener('click', scrollToTop);
            downBtn.removeEventListener('click', scrollToBottom);
            contentWrap.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', apply);
            if (ro) ro.disconnect();
            mo.disconnect();
        },
    };
}
