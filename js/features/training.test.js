'use strict';

import { describe, it, expect } from 'vitest';
import {
    gradeToQuality,
    sm2Schedule,
    scaleInterval,
    intervalScaleFromPreset,
    nextDueFromInterval,
} from './training-srs.js';
import {
    normalizeTrainingProgress,
    mergeTrackProgressMaps,
    reconcileTrainingProgress,
    normalizeHiddenBuiltinTrackIds,
} from './training-store.js';
import { trainingStepKey, getTrackById, getStepById, TRAINING_TRACKS } from './training-curriculum.js';
import { sortUserTracksForDisplay, isTrackFullyComplete, applyQuizRetake } from './training.js';

describe('training-srs', () => {
    it('gradeToQuality maps to SM-2 quality', () => {
        expect(gradeToQuality('again')).toBe(2);
        expect(gradeToQuality('good')).toBe(4);
    });

    it('sm2Schedule resets on lapse', () => {
        const out = sm2Schedule(2, 5, 2.6, 20);
        expect(out.repetitions).toBe(0);
        expect(out.intervalDays).toBe(1);
    });

    it('sm2Schedule progresses new card', () => {
        const first = sm2Schedule(4, 0, 2.5, 0);
        expect(first.repetitions).toBe(1);
        expect(first.intervalDays).toBe(1);
        const second = sm2Schedule(4, first.repetitions, first.easeFactor, first.intervalDays);
        expect(second.repetitions).toBe(2);
        expect(second.intervalDays).toBe(6);
    });

    it('scaleInterval clamps', () => {
        expect(scaleInterval(10, 0)).toBe(10);
        expect(scaleInterval(10, 2)).toBe(20);
    });

    it('intervalScaleFromPreset', () => {
        expect(intervalScaleFromPreset('gentle')).toBeGreaterThan(1);
        expect(intervalScaleFromPreset('intensive')).toBeLessThan(1);
    });

    it('nextDueFromInterval adds days', () => {
        const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
        const t1 = nextDueFromInterval(t0, 2);
        expect(t1 - t0).toBe(2 * 86400000);
    });
});

describe('training-store', () => {
    it('normalizeTrainingProgress fills defaults', () => {
        const n = normalizeTrainingProgress(null);
        expect(n.id).toBe('default');
        expect(n.quizStats.correct).toBe(0);
    });

    it('normalizeTrainingProgress preserves trackProgress', () => {
        const n = normalizeTrainingProgress({
            trackProgress: { a: { acknowledged: { x: true } } },
        });
        expect(n.trackProgress.a).toBeDefined();
    });

    it('normalizeHiddenBuiltinTrackIds keeps only known builtin ids (empty when catalog empty)', () => {
        expect(normalizeHiddenBuiltinTrackIds(['legacy-builtin', 'bogus', null])).toEqual([]);
    });

    it('normalizeTrainingProgress normalizes hiddenBuiltinTrackIds', () => {
        const n = normalizeTrainingProgress({
            hiddenBuiltinTrackIds: ['legacy-builtin', 'not-a-real-builtin'],
        });
        expect(n.hiddenBuiltinTrackIds).toEqual([]);
    });

    it('mergeTrackProgressMaps unions ack, quizPassed, max quizRuns', () => {
        const a = {
            t1: {
                acknowledged: { s1: true, s2: false },
                quizPassed: { s1: true },
                quizRuns: { s1: 2, s2: 1 },
            },
        };
        const b = {
            t1: {
                acknowledged: { s2: true, s3: true },
                quizPassed: { s2: true },
                quizRuns: { s1: 1, s2: 3 },
            },
            t2: { acknowledged: { x: true }, quizPassed: {}, quizRuns: {} },
        };
        const m = mergeTrackProgressMaps(a, b);
        expect(m.t1.acknowledged.s1).toBe(true);
        expect(m.t1.acknowledged.s2).toBe(true);
        expect(m.t1.acknowledged.s3).toBe(true);
        expect(m.t1.quizPassed.s1).toBe(true);
        expect(m.t1.quizPassed.s2).toBe(true);
        expect(m.t1.quizRuns.s1).toBe(2);
        expect(m.t1.quizRuns.s2).toBe(3);
        expect(m.t2.acknowledged.x).toBe(true);
    });

    it('mergeTrackProgressMaps unions quizFeedbackByStep', () => {
        const a = {
            t1: {
                acknowledged: {},
                quizPassed: {},
                quizRuns: {},
                quizFeedbackByStep: { s1: [0, 1] },
            },
        };
        const b = {
            t1: {
                acknowledged: {},
                quizPassed: {},
                quizRuns: {},
                quizFeedbackByStep: { s2: [0] },
            },
        };
        const m = mergeTrackProgressMaps(a, b);
        expect(m.t1.quizFeedbackByStep.s1).toEqual([0, 1]);
        expect(m.t1.quizFeedbackByStep.s2).toEqual([0]);
    });

    it('reconcileTrainingProgress merges stats and prefers newer segment metadata', () => {
        const older = normalizeTrainingProgress({
            updatedAt: '2026-01-01T00:00:00.000Z',
            activeSegment: 'textbook',
            srsPreset: 'gentle',
            quizStats: { sessions: 1, answered: 3, correct: 2 },
            trackProgress: {
                a: { acknowledged: { s1: true }, quizPassed: {}, quizRuns: { s1: 1 } },
            },
        });
        const newer = normalizeTrainingProgress({
            updatedAt: '2026-02-01T00:00:00.000Z',
            activeSegment: 'srs',
            srsPreset: 'intensive',
            quizStats: { sessions: 2, answered: 5, correct: 4 },
            trackProgress: {
                a: { acknowledged: { s2: true }, quizPassed: { s2: true }, quizRuns: { s2: 2 } },
            },
        });
        const r = reconcileTrainingProgress(newer, older);
        expect(r.activeSegment).toBe('srs');
        expect(r.srsPreset).toBe('intensive');
        expect(r.quizStats.sessions).toBe(2);
        expect(r.quizStats.answered).toBeGreaterThanOrEqual(5);
        expect(r.trackProgress.a.acknowledged.s1).toBe(true);
        expect(r.trackProgress.a.acknowledged.s2).toBe(true);
        expect(r.trackProgress.a.quizPassed.s2).toBe(true);
    });
});

describe('training user track order', () => {
    it('sortUserTracksForDisplay lists incomplete modules before fully complete', () => {
        const progress = {
            trackProgress: {
                'user-done': {
                    acknowledged: { s1: true },
                    quizPassed: {},
                    quizRuns: {},
                    quizFeedbackByStep: {},
                },
                'user-open': {
                    acknowledged: {},
                    quizPassed: {},
                    quizRuns: {},
                    quizFeedbackByStep: {},
                },
            },
        };
        const doneTrack = {
            id: 'user-done',
            steps: [{ id: 's1', title: 'a', bodyHtml: '<p>x</p>' }],
        };
        const openTrack = {
            id: 'user-open',
            steps: [{ id: 's1', title: 'b', bodyHtml: '<p>x</p>' }],
        };
        const sorted = sortUserTracksForDisplay(progress, [doneTrack, openTrack]);
        expect(sorted[0].id).toBe('user-open');
        expect(sorted[1].id).toBe('user-done');
    });

    it('isTrackFullyComplete matches progress keys with String(step.id)', () => {
        const progress = {
            trackProgress: {
                'user-x': {
                    acknowledged: { 1: true },
                    quizPassed: {},
                    quizRuns: {},
                    quizFeedbackByStep: {},
                },
            },
        };
        const track = {
            id: 'user-x',
            steps: [{ id: 1, title: 's', bodyHtml: '<p>x</p>' }],
        };
        expect(isTrackFullyComplete(progress, track)).toBe(true);
    });
});

describe('applyQuizRetake', () => {
    it('clears quizPassed and quizFeedbackByStep for the step', () => {
        const progress = normalizeTrainingProgress({
            trackProgress: {
                tr1: {
                    acknowledged: { st: true },
                    quizPassed: { st: true, other: true },
                    quizRuns: { st: 2 },
                    quizFeedbackByStep: { st: [0], other: [1] },
                },
            },
        });
        applyQuizRetake(progress, 'tr1', 'st');
        const tp = progress.trackProgress.tr1;
        expect(tp.quizPassed.st).toBeUndefined();
        expect(tp.quizPassed.other).toBe(true);
        expect(tp.quizFeedbackByStep.st).toBeUndefined();
        expect(tp.quizFeedbackByStep.other).toEqual([1]);
    });

    it('creates track bucket if missing', () => {
        const progress = normalizeTrainingProgress({ trackProgress: {} });
        applyQuizRetake(progress, 'new', 's1');
        expect(progress.trackProgress.new).toBeDefined();
    });
});

describe('training-curriculum', () => {
    it('ships with empty builtin catalog (no default textbook cards)', () => {
        expect(TRAINING_TRACKS.length).toBe(0);
    });

    it('getTrackById / getStepById return null for unknown ids', () => {
        expect(getTrackById('no-such-track')).toBeNull();
        expect(getStepById('no-such-track', 's1')).toBeNull();
    });

    it('trainingStepKey stable', () => {
        expect(trainingStepKey('a', 'b')).toBe('a::b');
    });
});
