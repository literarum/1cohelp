/**
 * @vitest-environment jsdom
 */
'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openAnimatedModal, closeAnimatedModal, setModalDependencies } from './modal.js';

/** @param {HTMLElement} modal */
function dispatchOpacityTransitionEnd(modal) {
    const ev = new Event('transitionend', { bubbles: true });
    Object.defineProperty(ev, 'propertyName', { value: 'opacity', enumerable: true });
    modal.dispatchEvent(ev);
}

vi.mock('../ui/modals-manager.js', () => ({
    activateModalFocus: vi.fn(),
    deactivateModalFocus: vi.fn(),
    enhanceModalAccessibility: vi.fn(),
}));

describe('openAnimatedModal vs in-flight closeAnimatedModal', () => {
    beforeEach(() => {
        setModalDependencies({ addEscapeHandler: null, removeEscapeHandler: null });
        document.body.innerHTML = '';
        const modal = document.createElement('div');
        modal.id = 'raceTestModal';
        modal.className = 'hidden modal-transition';
        modal.innerHTML = '<h2 id="raceTestTitle">T</h2><button type="button">x</button>';
        document.body.appendChild(modal);
    });

    it('does not re-hide after reopen when a stale transitionend fires (opacity)', async () => {
        const modal = document.getElementById('raceTestModal');
        openAnimatedModal(modal);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        expect(modal.classList.contains('hidden')).toBe(false);

        closeAnimatedModal(modal);
        openAnimatedModal(modal);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        expect(modal.classList.contains('hidden')).toBe(false);

        dispatchOpacityTransitionEnd(modal);
        expect(modal.classList.contains('hidden')).toBe(false);
    });

    it('double close does not stack listeners; reopen ignores stray transitionend', async () => {
        const modal = document.getElementById('raceTestModal');
        openAnimatedModal(modal);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        closeAnimatedModal(modal);
        closeAnimatedModal(modal);
        dispatchOpacityTransitionEnd(modal);
        expect(modal.classList.contains('hidden')).toBe(true);

        openAnimatedModal(modal);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        dispatchOpacityTransitionEnd(modal);
        expect(modal.classList.contains('hidden')).toBe(false);
    });
});
