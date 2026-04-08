/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    attachModalBackdropWheelScroll,
    syncBodyScrollLockAfterModalClose,
} from './modals-manager.js';

describe('attachModalBackdropWheelScroll', () => {
    let modal;

    beforeEach(() => {
        document.body.innerHTML = '';
        modal = document.createElement('div');
        modal.id = 'testModal';
        modal.innerHTML = `
            <div class="backdrop-layer" style="height:400px">
                <div class="scroll-area" style="height:100px;overflow:auto">
                    <div style="height:300px">tall</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('scrolls .scroll-area when wheel targets modal root (backdrop), not inner content', () => {
        attachModalBackdropWheelScroll(modal, '.scroll-area');
        const scrollArea = modal.querySelector('.scroll-area');
        Object.defineProperty(scrollArea, 'scrollHeight', { value: 400, configurable: true });
        Object.defineProperty(scrollArea, 'clientHeight', { value: 100, configurable: true });
        expect(scrollArea.scrollTop).toBe(0);

        const wheel = new WheelEvent('wheel', {
            deltaY: 40,
            bubbles: true,
            cancelable: true,
        });
        modal.dispatchEvent(wheel);
        expect(scrollArea.scrollTop).toBe(40);
        expect(wheel.defaultPrevented).toBe(true);
    });

    it('does not intercept wheel when target is inside scroll area', () => {
        attachModalBackdropWheelScroll(modal, '.scroll-area');
        const scrollArea = modal.querySelector('.scroll-area');
        const inner = scrollArea.querySelector('div');

        const wheel = new WheelEvent('wheel', {
            deltaY: 25,
            bubbles: true,
            cancelable: true,
        });
        inner.dispatchEvent(wheel);
        expect(scrollArea.scrollTop).toBe(0);
        expect(wheel.defaultPrevented).toBe(false);
    });

    it('is idempotent (dataset guard)', () => {
        attachModalBackdropWheelScroll(modal, '.scroll-area');
        attachModalBackdropWheelScroll(modal, '.scroll-area');
        const scrollArea = modal.querySelector('.scroll-area');
        Object.defineProperty(scrollArea, 'scrollHeight', { value: 400, configurable: true });
        Object.defineProperty(scrollArea, 'clientHeight', { value: 100, configurable: true });
        const wheel = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true });
        modal.dispatchEvent(wheel);
        expect(scrollArea.scrollTop).toBe(10);
    });
});

describe('syncBodyScrollLockAfterModalClose', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        document.body.className = '';
    });

    it('removes scroll lock classes when no modals match [id$=Modal]', async () => {
        document.body.classList.add('modal-open', 'overflow-hidden');
        const m = document.createElement('div');
        m.id = 'bookmarkModal';
        m.classList.add('hidden');
        document.body.appendChild(m);

        syncBodyScrollLockAfterModalClose();
        await new Promise((r) => requestAnimationFrame(r));

        expect(document.body.classList.contains('modal-open')).toBe(false);
        expect(document.body.classList.contains('overflow-hidden')).toBe(false);
    });
});
