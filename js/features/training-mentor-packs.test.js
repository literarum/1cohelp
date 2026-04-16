'use strict';

import { describe, it, expect } from 'vitest';
import {
    normalizeMentorQuizPack,
    parseMentorPackImport,
    buildMentorPackExportJson,
    assignMentorPackIdForImport,
    mentorPackToUserTrack,
    validateMentorPackStrict,
    MENTOR_QUIZ_EXPORT_KIND,
    MENTOR_QUIZ_SCHEMA_VERSION,
} from './training-mentor-packs.js';

describe('training-mentor-packs', () => {
    const validPack = {
        id: 'mentor-test-1',
        title: 'Тестовый пакет',
        subtitle: 'Подзаголовок',
        instructionsHtml: '<p>Читайте внимательно.</p>',
        questions: [
            {
                question: '2+2?',
                options: ['3', '4', '5'],
                correctIndex: 1,
            },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
    };

    it('normalizeMentorQuizPack accepts valid record', () => {
        const n = normalizeMentorQuizPack(validPack);
        expect(n?.id).toBe('mentor-test-1');
        expect(n?.questions).toHaveLength(1);
        expect(n?.questions[0].correctIndex).toBe(1);
    });

    it('normalizeMentorQuizPack rejects bad id', () => {
        expect(normalizeMentorQuizPack({ ...validPack, id: 'user-x' })).toBeNull();
    });

    it('parseMentorPackImport rejects without copilot1coExport', () => {
        const r = parseMentorPackImport(
            JSON.stringify({ kind: MENTOR_QUIZ_EXPORT_KIND, pack: validPack }),
        );
        expect(r.ok).toBe(false);
    });

    it('parseMentorPackImport round-trip', () => {
        const n = normalizeMentorQuizPack(validPack);
        expect(n).not.toBeNull();
        const json = buildMentorPackExportJson(/** @type {any} */ (n));
        const parsed = parseMentorPackImport(json);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            expect(parsed.pack.title).toBe('Тестовый пакет');
            expect(parsed.pack.questions[0].question).toBe('2+2?');
        }
    });

    it('parseMentorPackImport rejects wrong kind', () => {
        const env = {
            copilot1coExport: true,
            kind: 'other',
            schemaVersion: MENTOR_QUIZ_SCHEMA_VERSION,
            pack: validPack,
        };
        const r = parseMentorPackImport(JSON.stringify(env));
        expect(r.ok).toBe(false);
    });

    it('assignMentorPackIdForImport assigns new id on collision', () => {
        const n = normalizeMentorQuizPack(validPack);
        expect(n).not.toBeNull();
        const out = assignMentorPackIdForImport(/** @type {any} */ (n), new Set(['mentor-test-1']));
        expect(out.id.startsWith('mentor-')).toBe(true);
        expect(out.id).not.toBe('mentor-test-1');
    });

    it('mentorPackToUserTrack produces user- track with one step and quiz', () => {
        const n = normalizeMentorQuizPack(validPack);
        expect(n).not.toBeNull();
        const tr = mentorPackToUserTrack(/** @type {any} */ (n));
        expect(tr.id.startsWith('user-')).toBe(true);
        expect(tr.steps).toHaveLength(1);
        expect(tr.steps[0].quiz?.length).toBe(1);
    });

    it('validateMentorPackStrict double-pass', () => {
        const n = normalizeMentorQuizPack(validPack);
        const v = validateMentorPackStrict(/** @type {any} */ (n));
        expect(v?.id).toBe('mentor-test-1');
    });
});
