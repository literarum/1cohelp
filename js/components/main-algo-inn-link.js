'use strict';

/**
 * Эвристика для шагов главного алгоритма «уточнение ИНН» без type/showNoInnHelp в старых данных БД.
 * Дублирующий контур к явным флагам inn_step / showNoInnHelp.
 */

/**
 * @param {object | null | undefined} step
 * @returns {boolean}
 */
export function isLikelyInnClarificationStep(step) {
    if (!step || typeof step !== 'object') return false;
    const t = String(step.title || '').toLowerCase();
    let d = '';
    if (typeof step.description === 'string') {
        d = step.description.toLowerCase();
    } else if (step.description && typeof step.description === 'object') {
        d = JSON.stringify(step.description).toLowerCase();
    }
    if (!t.includes('инн') && !d.includes('инн')) return false;
    return (
        t.includes('уточн') ||
        t.includes('идентиф') ||
        d.includes('идентиф') ||
        d.includes('инн организ')
    );
}

/**
 * @param {object | null | undefined} step
 * @returns {boolean}
 */
export function stepNeedsNoInnHelpLink(step) {
    if (!step || typeof step !== 'object') return false;
    if (step.showNoInnHelp === true || step.type === 'inn_step') return true;
    return isLikelyInnClarificationStep(step);
}
