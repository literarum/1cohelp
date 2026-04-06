'use strict';

/**
 * В режиме просмотра главного алгоритма шаг сворачиваем по умолчанию.
 * Явное isCollapsible: false в данных отключает сворачивание.
 * @param {object | null | undefined} step
 * @returns {boolean}
 */
export function isMainStepCollapsibleInView(step) {
    if (!step || typeof step !== 'object') return false;
    return typeof step.isCollapsible === 'boolean' ? step.isCollapsible : true;
}

/**
 * Сбор глобальных индексов свёрнутых шагов главного алгоритма из DOM.
 * Каждый сворачиваемый шаг должен иметь атрибут data-main-algo-step-index (глобальный индекс в algorithms.main.steps).
 * Нельзя использовать индекс позиции в NodeList — среди шагов могут быть несворачиваемые.
 *
 * @param {ParentNode | null | undefined} container — #mainAlgorithm
 * @returns {number[]}
 */
export function collectCollapsedMainAlgoIndicesFromDom(container) {
    if (!container || typeof container.querySelectorAll !== 'function') {
        return [];
    }
    return Array.from(container.querySelectorAll('.algorithm-step.collapsible.is-collapsed'))
        .map((el) => parseInt(el.getAttribute('data-main-algo-step-index'), 10))
        .filter((n) => Number.isInteger(n) && !Number.isNaN(n) && n >= 0)
        .sort((a, b) => a - b);
}
