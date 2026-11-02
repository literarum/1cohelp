import { afterEach, describe, expect, it, vi } from 'vitest';
import { animateSectionEntrance } from './motion.js';
import { applyMotionMode } from '../utils/motion-pref.js';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); applyMotionMode('auto', { persistMirror: false }); });

function panel() {
    document.body.innerHTML = '<section id="old"><div class="view-item">Old</div></section><section id="new"><div data-section-id="items">'+Array.from({ length: 20 }, (_, i) => `<div class="view-item">${i}</div>`).join('')+'</div></section>';
    const incoming = document.getElementById('new');
    document.querySelectorAll('section, .view-item').forEach(el => {
        el.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }));
    });
    return incoming;
}

describe('section entrances', () => {
    it('animates only incoming cards, caps effects without removing data, and never animates their parent', async () => {
        const incoming = panel();
        applyMotionMode('auto', { persistMirror: false });
        await animateSectionEntrance(incoming);
        expect(document.getElementById('old').animate).not.toHaveBeenCalled();
        expect(document.querySelector('#old .view-item').animate).not.toHaveBeenCalled();
        expect(incoming.animate).not.toHaveBeenCalled();
        expect([...incoming.querySelectorAll('.view-item')].filter(el => el.animate.mock.calls.length)).toHaveLength(12);
        expect(incoming.querySelectorAll('.view-item')).toHaveLength(20);
    });
    it('uses a short opacity entrance in calm mode and leaves reduce mode static', async () => {
        const incoming = panel();
        applyMotionMode('calm', { persistMirror: false });
        await animateSectionEntrance(incoming);
        expect(incoming.animate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ transform: 'none' })]), expect.objectContaining({ duration: 120 }));
        incoming.animate.mockClear();
        applyMotionMode('reduce', { persistMirror: false });
        await animateSectionEntrance(incoming);
        expect(incoming.animate).not.toHaveBeenCalled();
    });
    it('does not block callers forever if the browser suspends an animation', async () => {
        vi.useFakeTimers();
        const incoming = panel();
        applyMotionMode('calm', { persistMirror: false });
        const cancel = vi.fn();
        incoming.animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel }));
        let settled = false;
        void animateSectionEntrance(incoming).then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(500);
        expect(settled).toBe(true);
        expect(cancel).toHaveBeenCalled();
    });
});
