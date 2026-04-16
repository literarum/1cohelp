'use strict';

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
    collectCollapsedMainAlgoIndicesFromDom,
    isMainStepCollapsibleInView,
} from './main-algo-collapse-persist.js';

describe('isMainStepCollapsibleInView', () => {
    it('по умолчанию true, если флаг не задан', () => {
        expect(isMainStepCollapsibleInView({ title: 'A' })).toBe(true);
    });
    it('false только при явном isCollapsible: false', () => {
        expect(isMainStepCollapsibleInView({ isCollapsible: false })).toBe(false);
        expect(isMainStepCollapsibleInView({ isCollapsible: true })).toBe(true);
    });
});

describe('collectCollapsedMainAlgoIndicesFromDom', () => {
    it('собирает глобальные индексы свёрнутых шагов, а не позиции в списке collapsible', () => {
        const dom = new JSDOM(
            `<div id="main">
        <div class="algorithm-step collapsible is-collapsed" data-main-algo-step-index="0"></div>
        <div class="algorithm-step"></div>
        <div class="algorithm-step collapsible is-collapsed" data-main-algo-step-index="2"></div>
      </div>`,
        );
        const container = dom.window.document.querySelector('#main');
        expect(collectCollapsedMainAlgoIndicesFromDom(container)).toEqual([0, 2]);
    });

    it('возвращает пустой массив, если контейнер отсутствует', () => {
        expect(collectCollapsedMainAlgoIndicesFromDom(null)).toEqual([]);
    });

    it('игнорирует невалидные атрибуты индекса', () => {
        const dom = new JSDOM(
            `<div id="main">
        <div class="algorithm-step collapsible is-collapsed" data-main-algo-step-index="1"></div>
        <div class="algorithm-step collapsible is-collapsed" data-main-algo-step-index="bad"></div>
      </div>`,
        );
        expect(
            collectCollapsedMainAlgoIndicesFromDom(dom.window.document.querySelector('#main')),
        ).toEqual([1]);
    });
});
