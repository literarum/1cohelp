'use strict';

import { State } from '../app/state.js';
import {
    getAllFromIndexedDB,
    getFromIndexedDB,
    saveToIndexedDB,
    deleteFromIndexedDB,
} from '../db/indexeddb.js';
import { TRAINING_TRACKS, getTrackById, trainingStepKey } from './training-curriculum.js';
import {
    loadUserCurriculumTracks,
    saveUserCurriculumTrack,
    deleteUserCurriculumTrack,
    newUserTrackId,
    getUserStepById,
} from './training-user-curriculum.js';
import {
    loadMentorQuizPacks,
    saveMentorQuizPack,
    deleteMentorQuizPack,
    buildMentorPackExportJson,
    parseMentorPackImport,
    assignMentorPackIdForImport,
    validateMentorPackStrict,
    mentorPackToUserTrack,
} from './training-mentor-packs.js';
import {
    loadBuiltinTrackOverrides,
    saveBuiltinTrackOverride,
    getEffectiveBuiltinTrack,
} from './training-builtin-curriculum.js';
import {
    gradeToQuality,
    sm2Schedule,
    scaleInterval,
    intervalScaleFromPreset,
    nextDueFromInterval,
} from './training-srs.js';
import { buildSrsFlipCardSectionHtml, toggleSrsFlip } from './training-srs-flip.js';
import {
    loadTrainingProgress,
    saveTrainingProgress,
    normalizeTrainingProgress,
} from './training-store.js';
import { logTrainingEvent } from './training-diagnostics.js';
import {
    openTrainingPickModal,
    openTrainingManualCardModal,
    openTrainingWeakNoteModal,
    closeTrainingModal,
    openUserCurriculumEditorModal,
} from './training-ui-modals.js';
import { openMentorQuizPackEditorModal } from './training-mentor-modals.js';

/** @type {{ showNotification?: function, showAppConfirm?: function }} */
let deps = {};

/** Кэш пользовательских модулей для обработчиков без лишних чтений БД между перерисовками */
let cachedUserTracks = [];

/** Переопределения встроенных треков (IndexedDB) */
let cachedBuiltinOverrides = [];

/**
 * @param {object} d
 */
export function setTrainingDependencies(d) {
    deps = { ...deps, ...d };
}

const SEGMENTS = [
    { id: 'textbook', label: 'Учебник', icon: 'fa-book-open' },
    { id: 'mentor', label: 'Наставник', icon: 'fa-chalkboard-teacher' },
    { id: 'srs', label: 'Карточки SRS', icon: 'fa-layer-group' },
    { id: 'weak', label: 'Слабые места', icon: 'fa-exclamation-circle' },
    { id: 'stats', label: 'Статистика', icon: 'fa-chart-bar' },
];

/**
 * @param {object} progress
 * @param {string} trackId
 * @returns {object}
 */
function ensureTrackProgress(progress, trackId) {
    const tp = progress.trackProgress[trackId];
    if (tp && typeof tp === 'object') {
        if (!tp.quizFeedbackByStep || typeof tp.quizFeedbackByStep !== 'object') {
            tp.quizFeedbackByStep = {};
        }
        return tp;
    }
    const fresh = {
        acknowledged: {},
        quizPassed: {},
        quizRuns: {},
        quizFeedbackByStep: {},
    };
    progress.trackProgress[trackId] = fresh;
    return fresh;
}

/**
 * Сброс отметки «квиз пройден» для повторной попытки (идемпотентно мутирует progress).
 * @param {object} progress
 * @param {string} trackId
 * @param {string} stepId
 */
export function applyQuizRetake(progress, trackId, stepId) {
    const tp = ensureTrackProgress(progress, trackId);
    const sid = String(stepId);
    delete tp.quizPassed[sid];
    if (tp.quizFeedbackByStep && typeof tp.quizFeedbackByStep === 'object') {
        delete tp.quizFeedbackByStep[sid];
    }
    return progress;
}

/**
 * Шаг считается завершённым: отметка «прочитал» и (если есть квиз) успешная попытка.
 * @param {object} tp
 * @param {import('./training-curriculum.js').TrainingStep} step
 */
function isStepComplete(tp, step) {
    const sid = String(step.id);
    if (!tp.acknowledged[sid]) return false;
    if (step.quiz && step.quiz.length > 0) {
        return !!tp.quizPassed[sid];
    }
    return true;
}

/**
 * Все шаги модуля завершены (прочитано + квиз при наличии).
 * @param {object} progress
 * @param {import('./training-curriculum.js').TrainingTrack} track
 */
export function isTrackFullyComplete(progress, track) {
    const tp = ensureTrackProgress(progress, track.id);
    if (!track.steps.length) return false;
    return track.steps.every((s) => isStepComplete(tp, s));
}

/**
 * Незавершённые пользовательские модули выше, полностью пройденные — внизу.
 * @param {object} progress
 * @param {import('./training-curriculum.js').TrainingTrack[]} tracks
 */
export function sortUserTracksForDisplay(progress, tracks) {
    return [...tracks].sort((a, b) => {
        const ca = isTrackFullyComplete(progress, a);
        const cb = isTrackFullyComplete(progress, b);
        if (ca !== cb) return ca ? 1 : -1;
        return 0;
    });
}

/**
 * @param {import('./training-curriculum.js').TrainingTrack} track
 * @param {object} tp
 */
function firstIncompleteIndex(track, tp) {
    for (let i = 0; i < track.steps.length; i++) {
        if (!isStepComplete(tp, track.steps[i])) return i;
    }
    return track.steps.length;
}

/**
 * @param {import('./training-curriculum.js').TrainingTrack} track
 * @param {object} tp
 * @param {number} idx
 */
function canOpenStep(track, tp, idx) {
    if (idx <= 0) return true;
    for (let j = 0; j < idx; j++) {
        if (!isStepComplete(tp, track.steps[j])) return false;
    }
    return true;
}

/**
 * Встроенные переопределения из IndexedDB имеют приоритет над TRAINING_TRACKS.
 * @param {string} trackId
 */
function resolveTrainingTrack(trackId) {
    const o = cachedBuiltinOverrides.find((t) => t.id === trackId);
    if (o) return o;
    const builtin = getTrackById(trackId);
    if (builtin) return builtin;
    return cachedUserTracks.find((t) => t.id === trackId) || null;
}

/**
 * @param {string} trackId
 * @param {string} stepId
 */
function resolveTrainingStep(trackId, stepId) {
    const track = resolveTrainingTrack(trackId);
    if (!track) return null;
    const sid = String(stepId);
    const step = track.steps.find((s) => String(s.id) === sid);
    if (step) return step;
    return getUserStepById(trackId, sid, cachedUserTracks);
}

/**
 * @param {string | null} trackId
 */
async function openUserCurriculumEditorFlow(trackId) {
    const userTracks = await loadUserCurriculumTracks(State);
    const initial = trackId ? userTracks.find((t) => t.id === trackId) : null;
    if (trackId && !initial) {
        deps.showNotification?.('Модуль не найден', 'error');
        return;
    }
    openUserCurriculumEditorModal({
        initialTrack: initial || null,
        onSave: async (track) => {
            const merged = {
                ...track,
                id:
                    track.id && String(track.id).startsWith('user-')
                        ? track.id
                        : newUserTrackId(),
                mode: 'textbook',
                createdAt: initial?.createdAt || track.createdAt || new Date().toISOString(),
            };
            await saveUserCurriculumTrack(State, merged);
            logTrainingEvent('info', 'USER_CURRICULUM_SAVE', merged.id);
            deps.showNotification?.('Модуль сохранён', 'success', { duration: 2500 });
            await renderTrainingPage();
        },
        onDelete: initial
            ? async (id) => {
                  const confirmed =
                      typeof deps.showAppConfirm === 'function'
                          ? await deps.showAppConfirm({
                                title: 'Удалить модуль?',
                                message:
                                    'Содержимое модуля будет удалено. Прогресс по шагам в общей статистике может сохраниться.',
                                confirmText: 'Удалить',
                                cancelText: 'Отмена',
                                confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
                            })
                          : window.confirm('Удалить модуль?');
                  if (!confirmed) return;
                  await deleteUserCurriculumTrack(State, id);
                  closeTrainingModal();
                  logTrainingEvent('info', 'USER_CURRICULUM_DELETE', id);
                  deps.showNotification?.('Модуль удалён', 'info', { duration: 2500 });
                  await renderTrainingPage();
              }
            : undefined,
    });
}

/**
 * @param {string} trackId
 */
/**
 * @param {string} trackId
 */
async function openBuiltinTrackEditorFlow(trackId) {
    const base = getTrackById(trackId);
    if (!base) {
        deps.showNotification?.('Модуль не найден', 'error');
        return;
    }
    let overrides = [];
    try {
        overrides = await loadBuiltinTrackOverrides(State);
    } catch (e) {
        logTrainingEvent('error', 'BUILTIN_OVERRIDE_LOAD', String(e));
        overrides = [];
    }
    const initial = getEffectiveBuiltinTrack(trackId, overrides);
    if (!initial) return;
    openUserCurriculumEditorModal({
        mode: 'builtin',
        initialTrack: initial,
        onSave: async (track) => {
            const merged = {
                ...track,
                id: trackId,
                title: track.title?.trim() || base.title,
                mode: 'textbook',
                updatedAt: new Date().toISOString(),
                createdAt: track.createdAt || base.createdAt || new Date().toISOString(),
            };
            await saveBuiltinTrackOverride(State, merged);
            logTrainingEvent('info', 'BUILTIN_CURRICULUM_SAVE', trackId);
            deps.showNotification?.('Встроенный модуль сохранён', 'success', { duration: 2500 });
            await renderTrainingPage();
        },
    });
}

/**
 * Запись в «Слабые места» при ошибках мини-квиза (обновление по stepKey).
 * @param {string} trackId
 * @param {string} stepId
 * @param {number[]} wrongIndices
 */
async function upsertWeakQuizNote(trackId, stepId, wrongIndices) {
    if (!wrongIndices.length) return;
    const stepKey = trainingStepKey(trackId, stepId);
    const note = `Квиз: ошибки в вопросах ${wrongIndices.map((i) => i + 1).join(', ')}.`;
    let list = [];
    try {
        list = await getAllFromIndexedDB('trainingWeakSpots');
    } catch (e) {
        logTrainingEvent('error', 'WEAK_QUIZ_LIST', String(e));
        return;
    }
    const existing = list.find((w) => w && w.stepKey === stepKey);
    const row = existing
        ? { ...existing, note, updatedAt: new Date().toISOString() }
        : {
              stepKey,
              trackId,
              stepId,
              note,
              createdAt: new Date().toISOString(),
          };
    try {
        await saveToIndexedDB('trainingWeakSpots', row);
        logTrainingEvent('info', 'WEAK_QUIZ_UPSERT', stepKey);
    } catch (e) {
        logTrainingEvent('error', 'WEAK_QUIZ_UPSERT_FAIL', String(e));
    }
}

async function confirmDeleteUserTrack(trackId) {
    const confirmed =
        typeof deps.showAppConfirm === 'function'
            ? await deps.showAppConfirm({
                  title: 'Удалить модуль?',
                  message: 'Удалить пользовательский учебный модуль?',
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : window.confirm('Удалить пользовательский учебный модуль?');
    if (!confirmed) return;
    try {
        await deleteUserCurriculumTrack(State, trackId);
        logTrainingEvent('info', 'USER_CURRICULUM_DELETE', trackId);
        deps.showNotification?.('Модуль удалён', 'info', { duration: 2500 });
        await renderTrainingPage();
    } catch (e) {
        logTrainingEvent('error', 'USER_CURRICULUM_DELETE_FAIL', String(e));
        deps.showNotification?.('Не удалось удалить', 'error');
    }
}

/**
 * Скрыть встроенный (стандартный) модуль из списка «Учебник».
 * @param {string} trackId
 */
async function confirmHideBuiltinTrack(trackId) {
    const tid = String(trackId || '').trim();
    if (!TRAINING_TRACKS.some((tr) => tr.id === tid)) return;
    const confirmed =
        typeof deps.showAppConfirm === 'function'
            ? await deps.showAppConfirm({
                  title: 'Убрать из списка?',
                  message:
                      'Стандартный модуль скроется из раздела «Учебник». Локальный прогресс по шагам сохранится. Продолжить?',
                  confirmText: 'Убрать',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
              })
            : window.confirm('Убрать стандартный модуль из списка?');
    if (!confirmed) return;
    try {
        const progress = await loadTrainingProgress(State);
        const hid = new Set(progress.hiddenBuiltinTrackIds || []);
        hid.add(tid);
        progress.hiddenBuiltinTrackIds = [...hid];
        await saveTrainingProgress(State, progress);
        logTrainingEvent('info', 'BUILTIN_HIDE', tid);
        await renderTrainingPage();
    } catch (e) {
        logTrainingEvent('error', 'BUILTIN_HIDE_FAIL', String(e));
        deps.showNotification?.('Не удалось сохранить', 'error');
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {object} progress
 * @param {string} trackId
 * @param {string} stepId
 */
async function persistAck(progress, trackId, stepId) {
    const tp = ensureTrackProgress(progress, trackId);
    tp.acknowledged[String(stepId)] = true;
    try {
        await saveTrainingProgress(State, progress);
    } catch (err) {
        logTrainingEvent('error', 'PERSIST_ACK', String(err), { trackId, stepId });
        throw err;
    }
}

let trainingInitDone = false;

export function initTrainingSystem() {
    if (trainingInitDone) return;
    trainingInitDone = true;
    const root = document.getElementById('trainingMount');
    if (!root) return;

    document.addEventListener('copilot1co:tabShown', (e) => {
        const id = /** @type {CustomEvent} */ (e).detail?.tabId;
        if (id && id !== 'training') closeTrainingModal();
    });

    root.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t instanceof HTMLSelectElement && t.id === 'trainingSrsPreset') {
            void (async () => {
                try {
                    const progress = await loadTrainingProgress(State);
                    progress.srsPreset = t.value;
                    progress.intervalScale = intervalScaleFromPreset(t.value);
                    await saveTrainingProgress(State, progress);
                    deps.showNotification?.('Пресет интервалов повторения сохранён', 'success', {
                        duration: 2000,
                    });
                    await renderTrainingPage();
                } catch (err) {
                    logTrainingEvent('error', 'SRS_PRESET_CHANGE', String(err));
                    deps.showNotification?.('Не удалось сохранить пресет', 'error');
                }
            })();
            return;
        }
        if (t && t instanceof HTMLInputElement && t.id === 'trainingMentorImportFile' && t.files?.length) {
            const f = t.files[0];
            t.value = '';
            if (f) void handleMentorImportFile(f);
        }
    });

    root.addEventListener('click', (e) => {
        const t = /** @type {HTMLElement} */ (e.target);
        const seg = t.closest?.('[data-training-segment]');
        if (seg && seg instanceof HTMLElement) {
            const id = seg.getAttribute('data-training-segment');
            if (id) {
                void setSegment(id);
            }
            return;
        }
        const ack = t.closest?.('[data-training-ack]');
        if (ack && ack instanceof HTMLElement) {
            const trackId = ack.getAttribute('data-track');
            const stepId = ack.getAttribute('data-step');
            if (trackId && stepId) void handleAck(trackId, stepId);
            return;
        }
        const quizCheck = t.closest?.('[data-training-quiz-check]');
        if (quizCheck && quizCheck instanceof HTMLElement) {
            const wrap = quizCheck.closest('[data-training-quiz-submit]');
            if (wrap && wrap instanceof HTMLElement) {
                const trackId = wrap.getAttribute('data-track');
                const stepId = wrap.getAttribute('data-step');
                if (trackId && stepId) void handleQuizSubmit(trackId, stepId, wrap);
            }
            return;
        }
        const quizRetake = t.closest?.('[data-training-quiz-retake]');
        if (quizRetake && quizRetake instanceof HTMLElement) {
            const trackId = quizRetake.getAttribute('data-track');
            const stepId = quizRetake.getAttribute('data-step');
            if (trackId && stepId) void handleQuizRetake(trackId, stepId);
            return;
        }
        const addCard = t.closest?.('[data-training-add-card]');
        if (addCard && addCard instanceof HTMLElement) {
            void handleAddManualCard();
            return;
        }
        const imp = t.closest?.('[data-training-import-reglament]');
        if (imp) {
            void handleImportReglamentPrompt();
            return;
        }
        const imb = t.closest?.('[data-training-import-bookmark]');
        if (imb) {
            void handleImportBookmarkPrompt();
            return;
        }
        const srsFlipHit = t.closest?.('[data-srs-flip-hit]');
        if (srsFlipHit && srsFlipHit instanceof HTMLElement) {
            const flipRoot = srsFlipHit.closest('[data-srs-flip-root]');
            if (flipRoot instanceof HTMLElement) {
                toggleSrsFlip(flipRoot);
            }
            return;
        }
        const srs = t.closest?.('[data-srs-grade]');
        if (srs && srs instanceof HTMLElement) {
            const id = srs.getAttribute('data-card-id');
            const g = srs.getAttribute('data-srs-grade');
            if (id && g) void handleSrsGrade(parseInt(id, 10), g);
        }
        const delWeak = t.closest?.('[data-weak-delete]');
        if (delWeak && delWeak instanceof HTMLElement) {
            const id = delWeak.getAttribute('data-id');
            if (id) void deleteWeakSpot(parseInt(id, 10));
        }
        const markWeak = t.closest?.('[data-training-mark-weak]');
        if (markWeak && markWeak instanceof HTMLElement) {
            const trackId = markWeak.getAttribute('data-track');
            const stepId = markWeak.getAttribute('data-step');
            if (trackId && stepId) void openWeakNotePrompt(trackId, stepId);
            return;
        }
        const nu = t.closest?.('[data-training-user-new-module]');
        if (nu) {
            void openUserCurriculumEditorFlow(null);
            return;
        }
        const ed = t.closest?.('[data-training-user-edit]');
        if (ed && ed instanceof HTMLElement) {
            const tid = ed.getAttribute('data-track-id');
            if (tid) void openUserCurriculumEditorFlow(tid);
            return;
        }
        const del = t.closest?.('[data-training-user-delete]');
        if (del && del instanceof HTMLElement) {
            const tid = del.getAttribute('data-track-id');
            if (tid) void confirmDeleteUserTrack(tid);
            return;
        }
        const bed = t.closest?.('[data-training-builtin-edit]');
        if (bed && bed instanceof HTMLElement) {
            const tid = bed.getAttribute('data-track-id');
            if (tid) void openBuiltinTrackEditorFlow(tid);
            return;
        }
        const bh = t.closest?.('[data-training-builtin-hide]');
        if (bh && bh instanceof HTMLElement) {
            const tid = bh.getAttribute('data-track-id');
            if (tid) void confirmHideBuiltinTrack(tid);
            return;
        }
        const mn = t.closest?.('[data-training-mentor-new]');
        if (mn) {
            void openMentorEditorFlow(null);
            return;
        }
        const mi = t.closest?.('[data-training-mentor-import-trigger]');
        if (mi) {
            document.getElementById('trainingMentorImportFile')?.click();
            return;
        }
        const me = t.closest?.('[data-training-mentor-edit]');
        if (me && me instanceof HTMLElement) {
            const pid = me.getAttribute('data-mentor-pack-id');
            if (pid) void openMentorEditorFlow(pid);
            return;
        }
        const mx = t.closest?.('[data-training-mentor-export]');
        if (mx && mx instanceof HTMLElement) {
            const pid = mx.getAttribute('data-mentor-pack-id');
            if (pid) void handleMentorExportPack(pid);
            return;
        }
        const md = t.closest?.('[data-training-mentor-delete]');
        if (md && md instanceof HTMLElement) {
            const pid = md.getAttribute('data-mentor-pack-id');
            if (pid) void handleMentorDeletePack(pid);
            return;
        }
        const mp = t.closest?.('[data-training-mentor-publish]');
        if (mp && mp instanceof HTMLElement) {
            const pid = mp.getAttribute('data-mentor-pack-id');
            if (pid) void handleMentorPublishPack(pid);
            return;
        }
    });

    root.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const tgt = e.target;
        if (!tgt || !(tgt instanceof Element)) return;
        const hit = tgt.closest?.('[data-srs-flip-hit]');
        if (!hit || !(hit instanceof HTMLElement)) return;
        e.preventDefault();
        const flipRoot = hit.closest('[data-srs-flip-root]');
        if (flipRoot instanceof HTMLElement) {
            toggleSrsFlip(flipRoot);
        }
    });
}

async function setSegment(segmentId) {
    try {
        const progress = await loadTrainingProgress(State);
        progress.activeSegment = segmentId;
        await saveTrainingProgress(State, progress);
        await renderTrainingPage();
    } catch (err) {
        logTrainingEvent('error', 'SET_SEGMENT', String(err), { segmentId });
        deps.showNotification?.('Не удалось переключить раздел', 'error');
    }
}

async function handleAck(trackId, stepId) {
    try {
        const progress = await loadTrainingProgress(State);
        const step = resolveTrainingStep(trackId, String(stepId));
        if (!step) {
            logTrainingEvent('error', 'HANDLE_ACK_NO_STEP', '', { trackId, stepId });
            deps.showNotification?.('Не удалось найти шаг модуля', 'error');
            return;
        }
        await persistAck(progress, trackId, String(step.id));
        await renderTrainingPage();
    } catch (err) {
        logTrainingEvent('error', 'HANDLE_ACK', String(err), { trackId, stepId });
        deps.showNotification?.('Не удалось сохранить прогресс', 'error');
    }
}

/**
 * @param {string} trackId
 * @param {string} stepId
 * @param {HTMLElement} container
 */
async function handleQuizSubmit(trackId, stepId, container) {
    const step = resolveTrainingStep(trackId, stepId);
    if (!step?.quiz?.length) return;
    const sid = String(step.id);
    const progress = await loadTrainingProgress(State);
    const tp = ensureTrackProgress(progress, trackId);
    /** @type {number[]} */
    const wrongIndices = [];
    let correctCount = 0;
    for (let qi = 0; qi < step.quiz.length; qi++) {
        const q = step.quiz[qi];
        const name = `train_quiz_${trackId}_${sid}_${qi}`;
        const sel = container.querySelector(`input[name="${name}"]:checked`);
        const idx = sel && sel instanceof HTMLInputElement ? parseInt(sel.value, 10) : -1;
        if (idx === q.correctIndex) {
            correctCount++;
        } else {
            wrongIndices.push(qi);
        }
    }
    const allCorrect = correctCount === step.quiz.length;

    tp.quizRuns[sid] = (tp.quizRuns[sid] || 0) + 1;
    if (!tp.quizFeedbackByStep || typeof tp.quizFeedbackByStep !== 'object') {
        tp.quizFeedbackByStep = {};
    }
    if (allCorrect) {
        delete tp.quizFeedbackByStep[sid];
    } else {
        tp.quizFeedbackByStep[sid] = wrongIndices;
    }
    progress.quizStats.sessions += 1;
    progress.quizStats.answered += step.quiz.length;
    progress.quizStats.correct += correctCount;
    if (allCorrect) tp.quizPassed[sid] = true;
    try {
        await saveTrainingProgress(State, progress);
    } catch (err) {
        logTrainingEvent('error', 'QUIZ_SUBMIT_SAVE', String(err), { trackId, stepId });
        deps.showNotification?.('Не удалось сохранить результат квиза', 'error');
        return;
    }
    if (wrongIndices.length) {
        await upsertWeakQuizNote(trackId, stepId, wrongIndices);
    }
    try {
        await renderTrainingPage();
    } catch (err) {
        logTrainingEvent('error', 'QUIZ_SUBMIT_RENDER', String(err), { trackId, stepId });
    }
}

/**
 * Повторная попытка: снимаем «пройден» и подсветку ошибок, сохраняем прогресс.
 * @param {string} trackId
 * @param {string} stepId
 */
async function handleQuizRetake(trackId, stepId) {
    try {
        const progress = await loadTrainingProgress(State);
        applyQuizRetake(progress, trackId, stepId);
        await saveTrainingProgress(State, progress);
    } catch (err) {
        logTrainingEvent('error', 'QUIZ_RETAKE_SAVE', String(err), { trackId, stepId });
        deps.showNotification?.('Не удалось сбросить квиз', 'error');
        return;
    }
    try {
        await renderTrainingPage();
    } catch (err) {
        logTrainingEvent('error', 'QUIZ_RETAKE_RENDER', String(err), { trackId, stepId });
    }
}

async function handleAddManualCard() {
    openTrainingManualCardModal({
        onSubmit: async ({ front, back }) => {
            await addSrsCard({
                front,
                back,
                sourceType: 'manual',
                sourceId: null,
            });
        },
    });
}

async function handleImportReglamentPrompt() {
    let list = [];
    try {
        list = await getAllFromIndexedDB('reglaments');
    } catch (e) {
        logTrainingEvent('error', 'IMPORT_REGL_LOAD', String(e));
        deps.showNotification?.('Не удалось загрузить регламенты', 'error');
        return;
    }
    if (!list.length) {
        deps.showNotification?.('Нет регламентов в базе', 'info');
        return;
    }
    const items = list.map((r) => ({
        id: r.id,
        label: r.title || 'Без названия',
        subtitle: (r.content || '')
            .replace(/<[^>]+>/g, ' ')
            .trim()
            .slice(0, 100),
        _raw: r,
    }));
    openTrainingPickModal({
        title: 'Выберите регламент',
        items,
        onPick: async (it) => {
            const r = it._raw;
            const excerpt = (r.content || '')
                .replace(/<[^>]+>/g, ' ')
                .trim()
                .slice(0, 400);
            await addSrsCard({
                front: r.title || 'Регламент',
                back: excerpt || '(нет текста)',
                sourceType: 'reglament',
                sourceId: r.id,
            });
        },
    });
}

async function handleImportBookmarkPrompt() {
    let list = [];
    try {
        list = await getAllFromIndexedDB('bookmarks');
    } catch (e) {
        logTrainingEvent('error', 'IMPORT_BM_LOAD', String(e));
        deps.showNotification?.('Не удалось загрузить закладки', 'error');
        return;
    }
    if (!list.length) {
        deps.showNotification?.('Нет закладок', 'info');
        return;
    }
    const items = list.map((b) => ({
        id: b.id,
        label: b.title || 'Без названия',
        subtitle: (b.description || b.url || '').toString().slice(0, 100),
        _raw: b,
    }));
    openTrainingPickModal({
        title: 'Выберите закладку',
        items,
        onPick: async (it) => {
            const b = it._raw;
            await addSrsCard({
                front: b.title || 'Закладка',
                back: (b.description || b.url || '').toString().slice(0, 600),
                sourceType: 'bookmark',
                sourceId: b.id,
            });
        },
    });
}

/**
 * @param {object} card
 */
async function addSrsCard(card) {
    const now = Date.now();
    const progress = await loadTrainingProgress(State);
    const scale =
        Number(progress.intervalScale) || intervalScaleFromPreset(String(progress.srsPreset));
    const row = {
        front: card.front,
        back: card.back,
        sourceType: card.sourceType,
        sourceId: card.sourceId,
        repetitions: 0,
        easeFactor: 2.5,
        intervalDays: 1,
        dueAt: now,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        intervalScale: scale,
    };
    try {
        await saveToIndexedDB('trainingSrsCards', row);
        logTrainingEvent('info', 'SRS_CARD_ADD', String(card.sourceType));
        deps.showNotification?.('Карточка добавлена в очередь SRS', 'success');
        await renderTrainingPage();
    } catch (e) {
        logTrainingEvent('error', 'SRS_CARD_ADD_FAIL', String(e));
        deps.showNotification?.('Ошибка сохранения карточки', 'error');
    }
}

/**
 * @param {number} cardId
 * @param {string} grade
 */
async function handleSrsGrade(cardId, grade) {
    const progress = await loadTrainingProgress(State);
    const scale =
        Number(progress.intervalScale) || intervalScaleFromPreset(String(progress.srsPreset));
    let card;
    try {
        card = await getFromIndexedDB('trainingSrsCards', cardId);
    } catch (e) {
        logTrainingEvent('error', 'SRS_GRADE_LOAD', String(e));
        return;
    }
    if (!card) return;
    const q = gradeToQuality(/** @type {any} */ (grade));
    const next = sm2Schedule(q, card.repetitions || 0, card.easeFactor || 2.5, card.intervalDays || 0);
    const interval = scaleInterval(next.intervalDays, scale);
    const dueAt = nextDueFromInterval(Date.now(), interval);
    const updated = {
        ...card,
        repetitions: next.repetitions,
        easeFactor: next.easeFactor,
        intervalDays: interval,
        dueAt,
        updatedAt: new Date().toISOString(),
    };
    try {
        await saveToIndexedDB('trainingSrsCards', updated);
        await renderTrainingPage();
    } catch (e) {
        logTrainingEvent('error', 'SRS_GRADE_SAVE', String(e));
        deps.showNotification?.('Ошибка SRS', 'error');
    }
}

/**
 * @param {number} id
 */
async function deleteWeakSpot(id) {
    const confirmed =
        typeof deps.showAppConfirm === 'function'
            ? await deps.showAppConfirm({
                  title: 'Удалить запись?',
                  message: 'Убрать эту отметку из списка слабых мест?',
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : window.confirm('Удалить эту отметку из слабых мест?');
    if (!confirmed) return;
    try {
        await deleteFromIndexedDB('trainingWeakSpots', id);
        logTrainingEvent('info', 'WEAK_DELETE', String(id));
        deps.showNotification?.('Запись удалена', 'info', { duration: 2000 });
        await renderTrainingPage();
    } catch (e) {
        logTrainingEvent('error', 'WEAK_DELETE_FAIL', String(e));
        deps.showNotification?.('Не удалось удалить', 'error');
    }
}

/**
 * @param {string} trackId
 * @param {string} stepId
 */
async function openWeakNotePrompt(trackId, stepId) {
    openTrainingWeakNoteModal({
        onSubmit: async (note) => {
            const row = {
                stepKey: trainingStepKey(trackId, stepId),
                trackId,
                stepId,
                note: note.trim(),
                createdAt: new Date().toISOString(),
            };
            try {
                await saveToIndexedDB('trainingWeakSpots', row);
                logTrainingEvent('info', 'WEAK_ADD', trainingStepKey(trackId, stepId));
                deps.showNotification?.('Добавлено в «Слабые места»', 'success');
                await renderTrainingPage();
            } catch (e) {
                logTrainingEvent('error', 'WEAK_ADD_FAIL', String(e));
                deps.showNotification?.('Не удалось сохранить', 'error');
            }
        },
    });
}

/**
 * @param {string} filename
 * @param {string} text
 */
function downloadTextAsFile(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * @param {string | null} packId
 */
async function openMentorEditorFlow(packId) {
    let packs = [];
    try {
        packs = await loadMentorQuizPacks(State);
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_EDITOR_LOAD', String(e));
        deps.showNotification?.('Не удалось загрузить пакеты', 'error');
        return;
    }
    const initial = packId ? packs.find((p) => p.id === packId) : null;
    if (packId && !initial) {
        deps.showNotification?.('Пакет не найден', 'error');
        return;
    }
    openMentorQuizPackEditorModal({
        initialPack: initial || null,
        onSave: async (pack) => {
            await saveMentorQuizPack(State, pack);
            logTrainingEvent('info', 'MENTOR_PACK_SAVE', pack.id);
            deps.showNotification?.('Квиз-пакет сохранён', 'success', { duration: 2500 });
            await renderTrainingPage();
        },
    });
}

/**
 * @param {string} packId
 */
async function handleMentorExportPack(packId) {
    let packs = [];
    try {
        packs = await loadMentorQuizPacks(State);
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_EXPORT_LOAD', String(e));
        deps.showNotification?.('Не удалось прочитать пакет', 'error');
        return;
    }
    const p = packs.find((x) => x.id === packId);
    if (!p) {
        deps.showNotification?.('Пакет не найден', 'error');
        return;
    }
    try {
        const json = buildMentorPackExportJson(p);
        const safe = (p.title || 'quiz')
            .replace(/[^\w\-\u0400-\u04FF]+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 72);
        downloadTextAsFile(`copilot1co-mentor-quiz_${safe}.json`, json);
        logTrainingEvent('info', 'MENTOR_PACK_EXPORT', packId);
        deps.showNotification?.('Файл подготовлен к передаче', 'success', { duration: 2200 });
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_EXPORT_FAIL', String(e));
        deps.showNotification?.('Не удалось сформировать файл', 'error');
    }
}

/**
 * @param {string} packId
 */
async function handleMentorDeletePack(packId) {
    const confirmed =
        typeof deps.showAppConfirm === 'function'
            ? await deps.showAppConfirm({
                  title: 'Удалить квиз-пакет?',
                  message: 'Локальная копия пакета будет удалена с этого устройства.',
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : window.confirm('Удалить квиз-пакет?');
    if (!confirmed) return;
    try {
        await deleteMentorQuizPack(State, packId);
        logTrainingEvent('info', 'MENTOR_PACK_DELETE', packId);
        deps.showNotification?.('Пакет удалён', 'info', { duration: 2000 });
        await renderTrainingPage();
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_DELETE_FAIL', String(e));
        deps.showNotification?.('Не удалось удалить', 'error');
    }
}

/**
 * @param {string} packId
 */
async function handleMentorPublishPack(packId) {
    let packs = [];
    try {
        packs = await loadMentorQuizPacks(State);
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_PUBLISH_LOAD', String(e));
        deps.showNotification?.('Не удалось загрузить пакет', 'error');
        return;
    }
    const p = packs.find((x) => x.id === packId);
    if (!p) {
        deps.showNotification?.('Пакет не найден', 'error');
        return;
    }
    const strict = validateMentorPackStrict(p);
    if (!strict) {
        logTrainingEvent('error', 'MENTOR_PUBLISH_VALIDATE', packId);
        deps.showNotification?.('Пакет не прошёл повторную проверку', 'error');
        return;
    }
    try {
        const track = mentorPackToUserTrack(strict);
        await saveUserCurriculumTrack(State, track);
        logTrainingEvent('info', 'MENTOR_PUBLISH_TEXTBOOK', `${packId}->${track.id}`);
        deps.showNotification?.('Модуль добавлен в «Учебник»', 'success', { duration: 2800 });
        await renderTrainingPage();
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_PUBLISH_FAIL', String(e));
        deps.showNotification?.('Не удалось добавить в учебник', 'error');
    }
}

/**
 * @param {File} file
 */
async function handleMentorImportFile(file) {
    let text = '';
    try {
        text = await file.text();
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_IMPORT_READ', String(e));
        deps.showNotification?.('Не удалось прочитать файл', 'error');
        return;
    }
    const parsed = parseMentorPackImport(text);
    if (!parsed.ok) {
        logTrainingEvent('warn', 'MENTOR_IMPORT_PARSE', parsed.message);
        deps.showNotification?.(parsed.message, 'error', { duration: 6000 });
        return;
    }
    let packs = [];
    try {
        packs = await loadMentorQuizPacks(State);
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_IMPORT_LIST', String(e));
        deps.showNotification?.('Не удалось проверить локальные пакеты', 'error');
        return;
    }
    const ids = new Set(packs.map((x) => x.id));
    let toSave = parsed.pack;
    const strict = validateMentorPackStrict(toSave);
    if (!strict) {
        deps.showNotification?.('Импорт не прошёл вторичную проверку содержимого', 'error');
        return;
    }
    toSave = assignMentorPackIdForImport(strict, ids);
    try {
        await saveMentorQuizPack(State, toSave);
        logTrainingEvent('info', 'MENTOR_PACK_IMPORT', toSave.id);
        deps.showNotification?.('Пакет импортирован. При необходимости нажмите «В учебник».', 'success', {
            duration: 4000,
        });
        await renderTrainingPage();
    } catch (e) {
        logTrainingEvent('error', 'MENTOR_IMPORT_SAVE', String(e));
        deps.showNotification?.('Не удалось сохранить импорт', 'error');
    }
}

/**
 * @returns {Promise<void>}
 */
export async function renderTrainingPage() {
    const mount = document.getElementById('trainingMount');
    if (!mount) return;

    let userTracks = [];
    try {
        userTracks = await loadUserCurriculumTracks(State);
    } catch (e) {
        logTrainingEvent('error', 'USER_CURRICULUM_LOAD', String(e));
        userTracks = [];
    }
    cachedUserTracks = userTracks;

    let builtinOverrides = [];
    try {
        builtinOverrides = await loadBuiltinTrackOverrides(State);
    } catch (e) {
        logTrainingEvent('error', 'BUILTIN_OVERRIDE_LOAD_PAGE', String(e));
        builtinOverrides = [];
    }
    cachedBuiltinOverrides = builtinOverrides;

    const progress = normalizeTrainingProgress(await loadTrainingProgress(State));
    const segment = SEGMENTS.some((s) => s.id === progress.activeSegment)
        ? progress.activeSegment
        : 'textbook';

    let weakList = [];
    let srsDue = [];
    try {
        weakList = await getAllFromIndexedDB('trainingWeakSpots');
    } catch {
        weakList = [];
    }
    try {
        const all = await getAllFromIndexedDB('trainingSrsCards');
        const now = Date.now();
        srsDue = (all || []).filter((c) => c && typeof c.dueAt === 'number' && c.dueAt <= now);
        srsDue.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
    } catch {
        srsDue = [];
    }

    let mentorPacks = [];
    if (segment === 'mentor') {
        try {
            mentorPacks = await loadMentorQuizPacks(State);
        } catch (e) {
            logTrainingEvent('error', 'MENTOR_PACKS_PAGE_LOAD', String(e));
            mentorPacks = [];
        }
    }

    const segHtml = SEGMENTS.map(
        (s) =>
            `<button type="button" data-training-segment="${s.id}" class="training-seg ${segment === s.id ? 'training-seg--active' : ''}" aria-pressed="${segment === s.id}"><i class="fas ${s.icon} mr-1.5" aria-hidden="true"></i>${escapeHtml(s.label)}</button>`,
    ).join('');

    let body = '';
    if (segment === 'textbook') {
        body = renderTextbook(progress, userTracks);
    } else if (segment === 'mentor') {
        body = renderMentorPanel(mentorPacks);
    } else if (segment === 'srs') {
        body = renderSrsPanel(srsDue);
    } else if (segment === 'weak') {
        body = renderWeakPanel(weakList);
    } else {
        body = renderStatsPanel(progress);
    }

    mount.innerHTML = `
        <div class="training-shell space-y-6">
            <header class="training-hero rounded-2xl border border-gray-200/80 dark:border-gray-600/80 bg-gradient-to-br from-white/90 to-gray-50 dark:from-gray-800/90 dark:to-gray-900/90 p-6 shadow-sm">
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">Обучение специалиста</h2>
                    </div>
                </div>
                <nav class="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Разделы обучения">${segHtml}</nav>
            </header>
            <div class="training-body">${body}</div>
        </div>`;

    const presetEl = document.getElementById('trainingSrsPreset');
    if (presetEl && presetEl instanceof HTMLSelectElement) {
        presetEl.value = String(progress.srsPreset || 'balanced');
    }
}

/**
 * @param {import('./training-curriculum.js').TrainingTrack[]} userTracks
 */
/**
 * @param {object} progress
 * @param {import('./training-curriculum.js').TrainingTrack} track
 */
function renderTrainingTrackSection(progress, track) {
    const tp = ensureTrackProgress(progress, track.id);
    const fi = firstIncompleteIndex(track, tp);
    const cards = track.steps
        .map((step, idx) => {
            const sid = String(step.id);
            const open = canOpenStep(track, tp, idx);
            const done = isStepComplete(tp, step);
            const locked = !open;
            const wrongForStep = tp.quizFeedbackByStep?.[sid];
            const wrongSet = Array.isArray(wrongForStep) ? wrongForStep : null;
            const quizPassed = !!tp.quizPassed[sid];
            const quizInputsLocked = quizPassed;
            const quizBlock = (step.quiz || [])
                .map((q, qi) => {
                    const opts = q.options
                        .map(
                            (o, oi) =>
                                `<label class="training-quiz-opt"><input type="radio" name="train_quiz_${track.id}_${sid}_${qi}" value="${oi}" ${quizInputsLocked ? 'disabled' : ''} /> <span>${escapeHtml(o)}</span></label>`,
                        )
                        .join('');
                    const wrongQ = wrongSet && wrongSet.includes(qi);
                    return `<div class="training-quiz-q ${wrongQ ? 'training-quiz-q--wrong' : ''}"><p class="font-medium text-gray-800 dark:text-gray-100 mb-2">${escapeHtml(q.question)}</p><div class="space-y-1">${opts}</div></div>`;
                })
                .join('');

            const ackDisabled = locked || tp.acknowledged[sid];
            const quizFeedbackBanner =
                !locked && step.quiz && step.quiz.length && wrongSet && wrongSet.length
                    ? `<p class="text-sm text-amber-800 dark:text-amber-200 mb-2" role="status">Проверьте подсвеченные вопросы и нажмите «Проверить ответы» снова.</p>`
                    : !locked && step.quiz && step.quiz.length && quizPassed
                      ? `<p class="text-sm text-emerald-600 dark:text-emerald-400 mb-2" role="status">Квиз пройден.</p>`
                      : '';
            const checkQuizDisabled = !tp.acknowledged[sid] || quizPassed;
            const quizSection =
                step.quiz && step.quiz.length
                    ? `<div class="mt-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-600/60" data-training-quiz-submit data-track="${escapeHtml(track.id)}" data-step="${escapeHtml(sid)}">
                        <p class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Мини-квиз</p>
                        <div class="training-quiz-block ${quizPassed ? 'training-quiz-section--passed' : ''}">
                        ${quizFeedbackBanner}
                        ${quizBlock}
                        </div>
                        <div class="mt-3 flex flex-wrap items-center gap-2">
                        <button type="button" data-training-quiz-check class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-95 disabled:opacity-40" ${checkQuizDisabled ? 'disabled' : ''}>Проверить ответы</button>
                        ${
                            quizPassed
                                ? `<button type="button" data-training-quiz-retake data-track="${escapeHtml(track.id)}" data-step="${escapeHtml(sid)}" class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50">Пройти квиз повторно</button>`
                                : ''
                        }
                        </div>
                       </div>`
                    : '';

            return `
                <li class="training-step ${done ? 'training-step--done' : ''} ${locked ? 'training-step--locked' : ''}">
                    <div class="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div class="training-step-badge">${idx + 1}</div>
                        <div class="flex-1 min-w-0">
                            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-50">${escapeHtml(step.title)}</h4>
                            <div class="training-step-body prose-dark mt-2 text-gray-700 dark:text-gray-300">${locked ? '<p class="text-gray-500">Завершите предыдущий шаг и квиз (если есть).</p>' : step.bodyHtml}</div>
                            ${!locked ? `<div class="mt-4 flex flex-wrap gap-2">
                                <button type="button" class="training-ack-btn px-4 py-2 rounded-xl text-primary text-sm font-medium disabled:opacity-40" data-training-ack data-track="${escapeHtml(track.id)}" data-step="${escapeHtml(sid)}" ${ackDisabled ? 'disabled' : ''}>${tp.acknowledged[sid] ? 'Прочитано' : 'Прочитал / понял'}</button>
                                <button type="button" class="training-weak-mark-btn px-3 py-2 rounded-xl text-sm text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20" data-training-mark-weak data-track="${escapeHtml(track.id)}" data-step="${escapeHtml(sid)}">Ошибся здесь</button>
                            </div>` : ''}
                            ${!locked ? quizSection : ''}
                        </div>
                    </div>
                </li>`;
        })
        .join('');

    const pct =
        track.steps.length === 0 ? 100 : Math.round((fi / track.steps.length) * 100);

    const userActions =
        String(track.id).startsWith('user-') ?
            `<div class="flex items-center gap-1 shrink-0">
                <button type="button" class="training-icon-btn text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60" data-training-user-edit data-track-id="${escapeHtml(track.id)}" aria-label="Изменить модуль" title="Изменить"><i class="fas fa-pen text-sm" aria-hidden="true"></i></button>
                <button type="button" class="training-icon-btn text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" data-training-user-delete data-track-id="${escapeHtml(track.id)}" aria-label="Удалить модуль" title="Удалить"><i class="fas fa-trash-alt text-sm" aria-hidden="true"></i></button>
            </div>`
        :   '';

    const builtinHideBtn =
        !String(track.id).startsWith('user-') ?
            `<button type="button" class="training-icon-btn shrink-0 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30" data-training-builtin-hide data-track-id="${escapeHtml(track.id)}" aria-label="Убрать стандартный модуль из списка" title="Убрать из списка"><i class="fas fa-eye-slash text-sm" aria-hidden="true"></i></button>`
        :   '';

    const builtinEditBtn =
        !String(track.id).startsWith('user-') ?
            `<button type="button" class="training-icon-btn shrink-0 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60" data-training-builtin-edit data-track-id="${escapeHtml(track.id)}" aria-label="Настроить стандартный модуль" title="Настроить"><i class="fas fa-sliders-h text-sm" aria-hidden="true"></i></button>`
        :   '';

    return `<section class="training-track-card rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/80 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-xl font-bold text-gray-900 dark:text-gray-50">${escapeHtml(track.title)}</h3>
                    </div>
                    ${track.subtitle ? `<p class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(track.subtitle)}</p>` : ''}
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    ${userActions}
                    ${builtinHideBtn}
                    ${builtinEditBtn}
                    <div class="training-progress-ring" style="--p:${pct}"><span>${pct}%</span></div>
                </div>
            </div>
            <ol class="p-5 space-y-6 list-none">${cards || '<li class="text-sm text-gray-500 px-2">В этом модуле пока нет шагов — откройте «Изменить» в заголовке карточки.</li>'}</ol>
        </section>`;
}

/**
 * @param {object} progress
 * @param {import('./training-curriculum.js').TrainingTrack[]} userTracks
 */
function renderTextbook(progress, userTracks) {
    const sortedUser = sortUserTracksForDisplay(progress, userTracks);
    const toolbar = `
        <div class="training-user-toolbar flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-50 tracking-tight">Мои учебные модули</h3>
            <button type="button" data-training-user-new-module class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                <i class="fas fa-plus" aria-hidden="true"></i> Новый модуль
            </button>
        </div>`;
    const userSections = sortedUser.map((t) => renderTrainingTrackSection(progress, t)).join('');
    const emptyUserHint =
        sortedUser.length === 0 ?
            '<p class="text-sm text-gray-500 dark:text-gray-400 mb-8">Пока нет своих модулей — нажмите «Новый модуль», добавьте шаги и при необходимости квизы.</p>'
        :   '';
    const hiddenBuiltin = new Set(progress.hiddenBuiltinTrackIds || []);
    const visibleBuiltinDefs = TRAINING_TRACKS.filter((t) => !hiddenBuiltin.has(t.id));
    const builtinIntro =
        visibleBuiltinDefs.length ?
            `
        <div class="pt-4 pb-2 border-t border-gray-200 dark:border-gray-700 mt-4">
            <h3 class="text-xl font-bold text-gray-900 dark:text-gray-50">Стандартные материалы</h3>
        </div>`
        :   '';
    const builtinSections = visibleBuiltinDefs
        .map((t) => {
            const eff = getEffectiveBuiltinTrack(t.id, cachedBuiltinOverrides);
            return eff ? renderTrainingTrackSection(progress, eff) : '';
        })
        .join('');
    return `<div class="space-y-8">${toolbar}${emptyUserHint}${userSections}${builtinIntro}${builtinSections}</div>`;
}

/**
 * @param {object[]} packs нормализованные квиз-пакеты наставника
 */
function renderMentorPanel(packs) {
    const list = (packs || [])
        .map((pk) => {
            const qn = pk.questions?.length || 0;
            const sub = pk.subtitle ? escapeHtml(pk.subtitle) : '';
            return `<li class="rounded-2xl border border-gray-200 dark:border-gray-600 bg-white/90 dark:bg-gray-800/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
                <div class="min-w-0 flex-1">
                    <h4 class="text-base font-semibold text-gray-900 dark:text-gray-50 truncate">${escapeHtml(pk.title)}</h4>
                    ${sub ? `<p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">${sub}</p>` : ''}
                    <p class="text-xs text-gray-500 mt-1">${qn} вопр. · обновл. ${escapeHtml((pk.updatedAt || '').slice(0, 10))}</p>
                </div>
                <div class="flex flex-wrap gap-2 shrink-0">
                    <button type="button" data-training-mentor-edit data-mentor-pack-id="${escapeHtml(pk.id)}" class="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50">Изменить</button>
                    <button type="button" data-training-mentor-export data-mentor-pack-id="${escapeHtml(pk.id)}" class="px-3 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800">Выгрузить JSON</button>
                    <button type="button" data-training-mentor-publish data-mentor-pack-id="${escapeHtml(pk.id)}" class="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">В учебник</button>
                    <button type="button" data-training-mentor-delete data-mentor-pack-id="${escapeHtml(pk.id)}" class="px-3 py-2 rounded-xl text-sm text-red-600 bg-red-500/10 dark:bg-red-950/30 hover:bg-red-500/15">Удалить</button>
                </div>
            </li>`;
        })
        .join('');
    const empty = packs?.length
        ? ''
        : '<p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Пока нет сохранённых пакетов — создайте тест или импортируйте файл от наставника.</p>';
    return `
        <div class="training-mentor-panel space-y-6">
            <div class="training-mentor-hero rounded-2xl p-6 shadow-sm">
                <h3 class="text-lg font-bold text-gray-900 dark:text-gray-50 tracking-tight">Режим наставника</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300 mt-2 max-w-3xl leading-relaxed">
                    Здесь вы собираете квиз-тесты, сохраняете их локально и передаёте ученику файлом JSON.
                    В другом экземпляре приложения ученик открывает этот раздел, нажимает «Загрузить JSON», затем «В учебник» — тест появится в разделе «Учебник» как обычный модуль с мини-квизом.
                </p>
                <div class="mt-4 flex flex-wrap gap-2">
                    <button type="button" data-training-mentor-new class="training-mentor-btn training-mentor-btn--primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900">
                        <i class="fas fa-plus" aria-hidden="true"></i> Создать квиз-тест
                    </button>
                    <button type="button" data-training-mentor-import-trigger class="training-mentor-btn training-mentor-btn--secondary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900">
                        <i class="fas fa-file-import" aria-hidden="true"></i> Загрузить JSON
                    </button>
                    <input type="file" id="trainingMentorImportFile" accept="application/json,.json" class="sr-only" aria-hidden="true" tabindex="-1" />
                </div>
            </div>
            <div>
                <h3 class="text-base font-bold text-gray-900 dark:text-gray-50 mb-3">Сохранённые пакеты</h3>
                ${empty}
                <ul class="space-y-3 list-none p-0 m-0">${list}</ul>
            </div>
        </div>`;
}

/**
 * @param {object[]} srsDue
 */
function renderSrsPanel(srsDue) {
    const card = srsDue[0];
    const queueInfo = `<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">В очереди на повторение: <strong>${srsDue.length}</strong>.</p>`;
    const scaleSelect = `
        <div class="mb-6 flex flex-wrap items-center gap-3">
            <label for="trainingSrsPreset" class="text-sm font-medium text-gray-700 dark:text-gray-200">Пресет интервалов повторения</label>
            <select id="trainingSrsPreset" class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
                <option value="gentle">Мягче (дольше между показами)</option>
                <option value="balanced">Сбалансировано</option>
                <option value="intensive">Интенсивнее (чаще)</option>
            </select>
        </div>`;

    if (!card) {
        return `${scaleSelect}${queueInfo}
        <div class="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-gray-500">
            <p class="mb-4">Нет карточек к показу. Добавьте из регламента, закладки или вручную.</p>
            <div class="flex flex-wrap justify-center gap-2">
                <button type="button" class="px-4 py-2 rounded-xl bg-primary text-white text-sm" data-training-import-reglament>Из регламента</button>
                <button type="button" class="px-4 py-2 rounded-xl bg-gray-700 text-white text-sm" data-training-import-bookmark>Из закладки</button>
                <button type="button" class="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white text-sm" data-training-add-card>Вручную</button>
            </div>
        </div>`;
    }

    return `${scaleSelect}${queueInfo}
    <div class="max-w-xl mx-auto rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-6 shadow-md">
        <p class="text-xs uppercase tracking-wide text-gray-500 mb-2">Карточка</p>
        ${buildSrsFlipCardSectionHtml({
            front: card.front,
            back: card.back,
            cardId: card.id,
        })}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button type="button" class="py-2 rounded-xl bg-red-600/90 text-white text-sm" data-srs-grade="again" data-card-id="${card.id}">Ужас</button>
            <button type="button" class="py-2 rounded-xl bg-amber-600/90 text-white text-sm" data-srs-grade="hard" data-card-id="${card.id}">Сложно</button>
            <button type="button" class="py-2 rounded-xl bg-emerald-600/90 text-white text-sm" data-srs-grade="good" data-card-id="${card.id}">Хорошо</button>
            <button type="button" class="py-2 rounded-xl bg-sky-600/90 text-white text-sm" data-srs-grade="easy" data-card-id="${card.id}">Легко</button>
        </div>
        <div class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600 flex flex-wrap gap-2 justify-center">
            <button type="button" class="px-3 py-1.5 rounded-xl text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100" data-training-import-reglament>+ Регламент</button>
            <button type="button" class="px-3 py-1.5 rounded-xl text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100" data-training-import-bookmark>+ Закладка</button>
            <button type="button" class="px-3 py-1.5 rounded-xl text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100" data-training-add-card>+ Вручную</button>
        </div>
    </div>`;
}

/**
 * @param {object[]} weakList
 */
function renderWeakPanel(weakList) {
    const rows = (weakList || [])
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map((w) => {
            const tr = w.trackId ? resolveTrainingTrack(w.trackId) : null;
            const st = w.trackId && w.stepId ? resolveTrainingStep(w.trackId, w.stepId) : null;
            const title =
                tr && st ? `${tr.title} — ${st.title}` : w.stepKey || w.note?.slice(0, 40) || 'Шаг';
            return `<li class="training-weak-row flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-gray-200 dark:border-gray-600">
                <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(title)}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">${escapeHtml(w.note || '')}</p>
                    <p class="text-xs text-gray-400 mt-1">${escapeHtml(w.createdAt || '')}</p>
                </div>
                <button type="button" class="training-icon-btn text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0" data-weak-delete data-id="${w.id}" aria-label="Удалить запись" title="Удалить"><i class="fas fa-trash-alt text-sm" aria-hidden="true"></i></button>
            </li>`;
        })
        .join('');
    return `<div class="rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/80 p-5">
        <h3 class="text-lg font-bold text-gray-900 dark:text-gray-50 mb-4">Слабые места</h3>
        ${rows ? `<ul class="list-none">${rows}</ul>` : '<p class="text-gray-500 text-sm">Пока пусто.</p>'}
    </div>`;
}

/**
 * @param {object} progress
 */
function renderStatsPanel(progress) {
    const qs = progress.quizStats || { sessions: 0, answered: 0, correct: 0 };
    const rate = qs.answered ? Math.round((qs.correct / qs.answered) * 100) : 0;
    return `<div class="grid gap-4 md:grid-cols-3">
        <div class="rounded-xl border border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-gray-800">
            <p class="text-xs text-gray-500 uppercase">Ответы в квизах</p>
            <p class="text-3xl font-bold text-gray-900 dark:text-gray-50">${qs.answered}</p>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-gray-800">
            <p class="text-xs text-gray-500 uppercase">Верных</p>
            <p class="text-3xl font-bold text-emerald-600">${qs.correct}</p>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-600 p-4 bg-white dark:bg-gray-800">
            <p class="text-xs text-gray-500 uppercase">Точность</p>
            <p class="text-3xl font-bold text-primary">${rate}%</p>
        </div>
    </div>`;
}
