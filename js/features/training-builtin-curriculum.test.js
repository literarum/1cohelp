'use strict';

import { describe, it, expect } from 'vitest';
import { getEffectiveBuiltinTrack, normalizeBuiltinTrackRecord } from './training-builtin-curriculum.js';
import { TRAINING_TRACKS } from './training-curriculum.js';

describe('training-builtin-curriculum', () => {
    it('getEffectiveBuiltinTrack prefers IndexedDB-shaped override', () => {
        const base = TRAINING_TRACKS[0];
        expect(base).toBeTruthy();
        const ov = [
            {
                ...base,
                title: 'Override',
            },
        ];
        const eff = getEffectiveBuiltinTrack(base.id, ov);
        expect(eff?.title).toBe('Override');
    });

    it('getEffectiveBuiltinTrack falls back to catalog when no override', () => {
        const base = TRAINING_TRACKS[0];
        const eff = getEffectiveBuiltinTrack(base.id, []);
        expect(eff?.id).toBe(base.id);
        expect(eff?.title).toBe(base.title);
    });

    it('normalizeBuiltinTrackRecord rejects unknown id', () => {
        const bad = normalizeBuiltinTrackRecord({
            id: 'not-a-builtin',
            title: 'X',
            steps: TRAINING_TRACKS[0].steps,
        });
        expect(bad).toBeNull();
    });
});
