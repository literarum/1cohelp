'use strict';

/**
 * Чистая логика стеков отката/повтора для сущностей (без I/O).
 * Лимиты: до MAX_UNDO шагов «назад» и до MAX_REDO шагов «вперёд» от текущего сохранённого состояния.
 */

export const MAX_ENTITY_UNDO = 5;
export const MAX_ENTITY_REDO = 5;

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function snapshotsEqual(a, b) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

/**
 * После успешного сохранения: в стек отката кладётся снимок состояния ДО сохранения; ветка «вперёд» сбрасывается.
 * @param {{ undoStack: unknown[], redoStack: unknown[] }} state
 * @param {unknown} previousSnapshot
 * @param {{ maxUndo?: number, maxRedo?: number }} [opts]
 * @returns {{ undoStack: unknown[], redoStack: unknown[], changed: boolean }}
 */
export function pushUndoAfterSave(state, previousSnapshot, opts = {}) {
    const maxUndo = opts.maxUndo ?? MAX_ENTITY_UNDO;
    const undoStack = Array.isArray(state.undoStack) ? [...state.undoStack] : [];
    const redoStack = [];

    if (previousSnapshot === undefined || previousSnapshot === null) {
        return { undoStack, redoStack, changed: false };
    }

    const last = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
    if (last !== null && snapshotsEqual(last, previousSnapshot)) {
        return { undoStack, redoStack, changed: false };
    }

    undoStack.push(previousSnapshot);
    while (undoStack.length > maxUndo) {
        undoStack.shift();
    }

    return { undoStack, redoStack, changed: true };
}

/**
 * Откат: снимок «текущий» уходит в redo, с вершины undo применяется целевой.
 * @param {{ undoStack: unknown[], redoStack: unknown[] }} state
 * @param {unknown} currentSnapshot
 * @param {{ maxRedo?: number }} [opts]
 * @returns {{ target: unknown | null, undoStack: unknown[], redoStack: unknown[], error?: string }}
 */
export function popUndo(state, currentSnapshot, opts = {}) {
    const maxRedo = opts.maxRedo ?? MAX_ENTITY_REDO;
    const undoStack = Array.isArray(state.undoStack) ? [...state.undoStack] : [];
    const redoStack = Array.isArray(state.redoStack) ? [...state.redoStack] : [];

    if (undoStack.length === 0) {
        return { target: null, undoStack, redoStack, error: 'EMPTY_UNDO' };
    }

    const target = undoStack.pop();
    if (currentSnapshot !== undefined && currentSnapshot !== null) {
        redoStack.push(currentSnapshot);
        while (redoStack.length > maxRedo) {
            redoStack.shift();
        }
    }

    return { target, undoStack, redoStack };
}

/**
 * Повтор: симметрично popUndo.
 * @param {{ undoStack: unknown[], redoStack: unknown[] }} state
 * @param {unknown} currentSnapshot
 * @param {{ maxUndo?: number }} [opts]
 * @returns {{ target: unknown | null, undoStack: unknown[], redoStack: unknown[], error?: string }}
 */
export function popRedo(state, currentSnapshot, opts = {}) {
    const maxUndo = opts.maxUndo ?? MAX_ENTITY_UNDO;
    const undoStack = Array.isArray(state.undoStack) ? [...state.undoStack] : [];
    const redoStack = Array.isArray(state.redoStack) ? [...state.redoStack] : [];

    if (redoStack.length === 0) {
        return { target: null, undoStack, redoStack, error: 'EMPTY_REDO' };
    }

    const target = redoStack.pop();
    if (currentSnapshot !== undefined && currentSnapshot !== null) {
        undoStack.push(currentSnapshot);
        while (undoStack.length > maxUndo) {
            undoStack.shift();
        }
    }

    return { target, undoStack, redoStack };
}
