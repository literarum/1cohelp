'use strict';

import { describe, it, expect } from 'vitest';
import {
    sanitizeTrainingBodyHtml,
    isRichTextMeaningfullyEmpty,
    normalizeQuizItem,
    normalizeUserStep,
    normalizeUserTrackRecord,
    reconcileUserCurriculumLists,
} from './training-user-curriculum.js';

describe('training-user-curriculum', () => {
    it('isRichTextMeaningfullyEmpty treats empty markup as empty', () => {
        expect(isRichTextMeaningfullyEmpty('')).toBe(true);
        expect(isRichTextMeaningfullyEmpty('<p><br></p>')).toBe(true);
        expect(isRichTextMeaningfullyEmpty('<p>&nbsp;</p>')).toBe(true);
        expect(isRichTextMeaningfullyEmpty('<p>Текст</p>')).toBe(false);
    });

    it('sanitizeTrainingBodyHtml removes script and on* handlers', () => {
        const raw = '<p>Hi</p><script>alert(1)</script><b onclick="evil()">x</b>';
        const s = sanitizeTrainingBodyHtml(raw);
        expect(s).not.toMatch(/script/i);
        expect(s).not.toMatch(/onclick/i);
        expect(s).toMatch(/Hi/);
    });

    it('normalizeQuizItem requires question and two options', () => {
        expect(normalizeQuizItem(null)).toBe(null);
        expect(
            normalizeQuizItem({
                question: 'Q?',
                options: ['a', 'b'],
                correctIndex: 1,
            }),
        ).toEqual({
            question: 'Q?',
            options: ['a', 'b'],
            correctIndex: 1,
        });
        expect(
            normalizeQuizItem({
                question: 'Я',
                options: ['a', 'b'],
                correctIndex: 0,
            }),
        ).toMatchObject({ question: 'Я', options: ['a', 'b'] });
    });

    it('normalizeUserStep requires id title body', () => {
        expect(
            normalizeUserStep({
                id: 'st-1',
                title: 'T',
                bodyHtml: '<p>x</p>',
                quiz: [{ question: 'Q', options: ['a', 'b'], correctIndex: 0 }],
            }),
        ).toMatchObject({ id: 'st-1', title: 'T' });
        expect(normalizeUserStep({ id: '', title: 'x', bodyHtml: '<p>a</p>' })).toBe(null);
    });

    it('normalizeUserTrackRecord requires user- prefix id', () => {
        expect(normalizeUserTrackRecord({ id: 'bad', title: 'T', steps: [] })).toBe(null);
        const t = normalizeUserTrackRecord({
            id: 'user-abc',
            title: 'Модуль',
            steps: [{ id: 'st1', title: 'Шаг', bodyHtml: '<p>ok</p>' }],
        });
        expect(t?.id).toBe('user-abc');
        expect(t?.steps?.length).toBe(1);
    });

    it('reconcileUserCurriculumLists prefers newer updatedAt', () => {
        const a = [
            {
                id: 'user-x',
                title: 'Old',
                mode: 'textbook',
                steps: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
            },
        ];
        const b = [
            {
                id: 'user-x',
                title: 'New',
                mode: 'textbook',
                steps: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-06-01T00:00:00.000Z',
            },
        ];
        const r = reconcileUserCurriculumLists(a, b);
        expect(r).toHaveLength(1);
        expect(r[0].title).toBe('New');
    });
});
