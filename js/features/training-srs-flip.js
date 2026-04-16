'use strict';

/** @typedef {{ front: string, back: string, cardId?: string | number }} SrsFlipCardContent */

export const SRS_FLIP_LABEL_SHOW = 'Показать ответ';
export const SRS_FLIP_LABEL_HIDE = 'Показать вопрос';

/** Подсказка для области карточки (клик / фокус) */
export const SRS_FLIP_HIT_TITLE = 'Перевернуть карточку';

/**
 * @param {unknown} s
 * @returns {string}
 */
export function escapeTrainingSrsHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Markup for the SRS flashcard flip region (клик по карточке — переворот; отдельной кнопки нет).
 * @param {SrsFlipCardContent} card
 * @returns {string}
 */
export function buildSrsFlipCardSectionHtml(card) {
    const front = escapeTrainingSrsHtml(card.front);
    const back = escapeTrainingSrsHtml(card.back);
    const rawId =
        card.cardId != null && String(card.cardId).trim() !== '' ? String(card.cardId) : '';
    const safeBackId = rawId ? `training-srs-flip-back-${rawId.replace(/[^\w-]/g, '')}` : '';
    const backIdAttr = safeBackId ? ` id="${escapeTrainingSrsHtml(safeBackId)}"` : '';
    const toggleControlsAttr = safeBackId
        ? ` aria-controls="${escapeTrainingSrsHtml(safeBackId)}"`
        : '';
    const hintBlock = `<p class="training-srs-flip__hint text-xs text-center text-gray-500 dark:text-gray-400 mt-2 mb-0" aria-hidden="true">Нажмите на карточку или используйте Enter / пробел в фокусе.</p>`;
    return `<div class="training-srs-flip mb-6" data-srs-flip-root role="region" aria-label="Карточка для повторения">
        <div class="training-srs-flip__stage"
            data-srs-flip-hit
            tabindex="0"
            role="button"
            aria-pressed="false"
            title="${escapeTrainingSrsHtml(SRS_FLIP_HIT_TITLE)}"
            aria-label="${escapeTrainingSrsHtml(SRS_FLIP_LABEL_SHOW)}"${toggleControlsAttr}>
            <div class="training-srs-flip__inner">
                <div class="training-srs-flip__face training-srs-flip__face--front" data-srs-flip-front aria-hidden="false">
                    <p class="training-srs-flip__label">Вопрос</p>
                    <p class="training-srs-flip__text text-lg font-semibold text-gray-900 dark:text-gray-50 whitespace-pre-wrap">${front}</p>
                </div>
                <div class="training-srs-flip__face training-srs-flip__face--back" data-srs-flip-back${backIdAttr} aria-hidden="true">
                    <p class="training-srs-flip__label training-srs-flip__label--answer">Ответ</p>
                    <p class="training-srs-flip__text text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${back}</p>
                </div>
            </div>
        </div>
        ${hintBlock}
    </div>`;
}

/**
 * @param {Element | null} el
 * @returns {el is HTMLElement}
 */
function isHtmlElement(el) {
    return (
        !!el &&
        el.nodeType === 1 &&
        typeof (/** @type {HTMLElement} */ (el).setAttribute) === 'function'
    );
}

export function setSrsFlipRevealed(root, revealed) {
    if (!root) return;
    root.classList.toggle('training-srs-flip--revealed', revealed);
    const hit = root.querySelector('[data-srs-flip-hit]');
    const front = root.querySelector('[data-srs-flip-front]');
    const back = root.querySelector('[data-srs-flip-back]');
    const pressed = revealed ? 'true' : 'false';
    const label = revealed ? SRS_FLIP_LABEL_HIDE : SRS_FLIP_LABEL_SHOW;
    if (isHtmlElement(hit)) {
        hit.setAttribute('aria-pressed', pressed);
        hit.setAttribute('aria-label', label);
        if (isHtmlElement(back) && back.id) {
            hit.setAttribute('aria-controls', back.id);
        }
    }
    if (isHtmlElement(front)) {
        front.setAttribute('aria-hidden', revealed ? 'true' : 'false');
    }
    if (isHtmlElement(back)) {
        back.setAttribute('aria-hidden', revealed ? 'false' : 'true');
    }
}

/**
 * @param {HTMLElement | null} root
 * @returns {boolean}
 */
export function getSrsFlipRevealed(root) {
    return !!(root && root.classList.contains('training-srs-flip--revealed'));
}

/**
 * @param {HTMLElement | null} root
 */
export function toggleSrsFlip(root) {
    setSrsFlipRevealed(root, !getSrsFlipRevealed(root));
}
