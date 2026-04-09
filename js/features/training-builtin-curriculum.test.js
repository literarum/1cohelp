'use strict';

import { describe, it, expect, vi } from 'vitest';

vi.mock('./training-curriculum.js', () => ({
    TRAINING_TRACKS: [
        {
            id: 'test-builtin',
            title: 'Catalog',
            mode: 'textbook',
            steps: [{ id: 's1', title: 'Step', bodyHtml: '<p>x</p>' }],
        },
    ],
}));

import { getEffectiveBuiltinTrack, normalizeBuiltinTrackRecord } from './training-builtin-curriculum.js';

const MOCK_STEPS = [{ id: 's1', title: 'Step', bodyHtml: '<p>x</p>' }];

describe('training-builtin-curriculum', () => {
    it('getEffectiveBuiltinTrack prefers IndexedDB-shaped override', () => {
        const ov = [
            {
                id: 'test-builtin',
                title: 'Override',
                mode: 'textbook',
                steps: MOCK_STEPS,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
            },
        ];
        const eff = getEffectiveBuiltinTrack('test-builtin', ov);
        expect(eff?.title).toBe('Override');
    });

    it('getEffectiveBuiltinTrack falls back to catalog when no override', () => {
        const eff = getEffectiveBuiltinTrack('test-builtin', []);
        expect(eff?.id).toBe('test-builtin');
        expect(eff?.title).toBe('Catalog');
    });

    it('normalizeBuiltinTrackRecord rejects unknown id', () => {
        const bad = normalizeBuiltinTrackRecord({
            id: 'not-a-builtin',
            title: 'X',
            steps: MOCK_STEPS,
        });
        expect(bad).toBeNull();
    });
});
