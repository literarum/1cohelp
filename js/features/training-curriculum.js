'use strict';

/**
 * Учебные треки: фиксированный порядок шагов (режим «учебник») и мини-квизы.
 * Встроенный каталог по умолчанию пуст: раздел «Учебник» без карточек до добавления
 * пользовательских модулей или импорта от наставника. При необходимости треки
 * добавляются сюда или через переопределения в IndexedDB (trainingBuiltinCurriculum).
 */

/** @typedef {{ question: string, options: string[], correctIndex: number }} TrainingQuizItem */

/** @typedef {{
 *   id: string,
 *   title: string,
 *   bodyHtml: string,
 *   quiz?: TrainingQuizItem[],
 * }} TrainingStep */

/** @typedef {{
 *   id: string,
 *   title: string,
 *   subtitle?: string,
 *   mode: 'textbook',
 *   steps: TrainingStep[],
 * }} TrainingTrack */

/** @type {TrainingTrack[]} */
export const TRAINING_TRACKS = [];

/**
 * @param {string} trackId
 * @param {string} stepId
 * @returns {string}
 */
export function trainingStepKey(trackId, stepId) {
    return `${trackId}::${stepId}`;
}

/**
 * @param {string} trackId
 * @returns {TrainingTrack | null}
 */
export function getTrackById(trackId) {
    return TRAINING_TRACKS.find((t) => t.id === trackId) || null;
}

/**
 * @param {string} trackId
 * @param {string} stepId
 * @returns {TrainingStep | null}
 */
export function getStepById(trackId, stepId) {
    const track = getTrackById(trackId);
    if (!track) return null;
    return track.steps.find((s) => s.id === stepId) || null;
}
