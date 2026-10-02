/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect } from 'vitest';
import { SWIPE, classifySwipe, adjacentTabId, rubberBand, shouldDismissDrag, isSwipeBlockedTarget } from './touch-gestures.js';

describe('classifySwipe', () => {
    it('распознаёт горизонтальные свайпы', () => {
        expect(classifySwipe(-120, 10, 400)).toBe('left');
        expect(classifySwipe(120, -10, 400)).toBe('right');
    });
    it('быстрый короткий свайп засчитывается, медленный короткий — нет', () => {
        expect(classifySwipe(-45, 2, 200)).toBe('left');
        expect(classifySwipe(-45, 2, 900)).toBeNull();
    });
    it('диагональ и мелкое движение — не свайп', () => {
        expect(classifySwipe(80, 70, 300)).toBeNull();
        expect(classifySwipe(5, 4, 100)).toBeNull();
    });
    it('вертикальные свайпы', () => {
        expect(classifySwipe(4, -150, 300)).toBe('up');
        expect(classifySwipe(-3, 150, 300)).toBe('down');
    });
});

describe('adjacentTabId', () => {
    const ids = ['a', 'b', 'c'];
    it('влево — следующая, вправо — предыдущая', () => {
        expect(adjacentTabId(ids, 'b', 'left')).toBe('c');
        expect(adjacentTabId(ids, 'b', 'right')).toBe('a');
    });
    it('без циклического перехода и при неизвестной вкладке', () => {
        expect(adjacentTabId(ids, 'c', 'left')).toBeNull();
        expect(adjacentTabId(ids, 'a', 'right')).toBeNull();
        expect(adjacentTabId(ids, 'zz', 'left')).toBeNull();
        expect(adjacentTabId([], 'a', 'left')).toBeNull();
    });
});

describe('drag helpers', () => {
    it('rubberBand: монотонно растёт и не превышает предел', () => {
        expect(rubberBand(-5)).toBe(0);
        expect(rubberBand(100)).toBeLessThan(rubberBand(300));
        expect(rubberBand(10000, 240)).toBeLessThan(240);
    });
    it('shouldDismissDrag: по расстоянию или скорости', () => {
        expect(shouldDismissDrag(SWIPE.DISMISS_DISTANCE + 1, 2000)).toBe(true);
        expect(shouldDismissDrag(60, 80)).toBe(true);
        expect(shouldDismissDrag(60, 900)).toBe(false);
        expect(shouldDismissDrag(-80, 50)).toBe(false);
    });
});

describe('isSwipeBlockedTarget', () => {
    it('поля ввода, таблицы и data-no-swipe блокируют жест', () => {
        document.body.innerHTML =
            '<div id="root"><input id="i"><table><tbody><tr><td id="td">x</td></tr></tbody></table><div data-no-swipe><span id="ns">y</span></div><p id="p">z</p></div>';
        const root = document.getElementById('root');
        expect(isSwipeBlockedTarget(document.getElementById('i'), root)).toBe(true);
        expect(isSwipeBlockedTarget(document.getElementById('td'), root)).toBe(true);
        expect(isSwipeBlockedTarget(document.getElementById('ns'), root)).toBe(true);
        expect(isSwipeBlockedTarget(document.getElementById('p'), root)).toBe(false);
    });
});
