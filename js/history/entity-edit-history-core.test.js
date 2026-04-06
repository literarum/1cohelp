'use strict';

import { describe, expect, it } from 'vitest';
import {
    MAX_ENTITY_UNDO,
    popRedo,
    popUndo,
    pushUndoAfterSave,
    snapshotsEqual,
} from './entity-edit-history-core.js';

describe('entity-edit-history-core', () => {
    it('snapshotsEqual compares JSON', () => {
        expect(snapshotsEqual({ a: 1 }, { a: 1 })).toBe(true);
        expect(snapshotsEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('pushUndoAfterSave clears redo and caps undo', () => {
        const prev = { v: 1 };
        const s1 = pushUndoAfterSave({ undoStack: [], redoStack: [{ x: 1 }] }, prev);
        expect(s1.redoStack.length).toBe(0);
        expect(s1.undoStack.length).toBe(1);
        expect(s1.changed).toBe(true);

        let big = { undoStack: [], redoStack: [] };
        for (let i = 0; i < MAX_ENTITY_UNDO + 2; i++) {
            big = pushUndoAfterSave(big, { n: i });
        }
        expect(big.undoStack.length).toBe(MAX_ENTITY_UNDO);
    });

    it('popUndo moves current to redo', () => {
        const a = { id: 'a' };
        const b = { id: 'b' };
        const c = { id: 'c' };
        const state = { undoStack: [a, b], redoStack: [] };
        const cur = c;
        const r = popUndo(state, cur);
        expect(r.target).toEqual(b);
        expect(r.undoStack).toEqual([a]);
        expect(r.redoStack).toEqual([c]);
    });

    it('popRedo moves current to undo', () => {
        const a = { id: 'a' };
        const b = { id: 'b' };
        const state = { undoStack: [a], redoStack: [b] };
        const cur = { id: 'c' };
        const r = popRedo(state, cur);
        expect(r.target).toEqual(b);
        expect(r.redoStack).toEqual([]);
        expect(r.undoStack).toEqual([a, cur]);
    });

    it('popUndo returns error when empty', () => {
        const r = popUndo({ undoStack: [], redoStack: [] }, { x: 1 });
        expect(r.target).toBeNull();
        expect(r.error).toBe('EMPTY_UNDO');
    });
});
