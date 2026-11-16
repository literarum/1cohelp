import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    pickNewestNotes,
    writePendingNotes,
    clearPendingNotes,
    readLocalNotesCandidates,
    installClientNotesUnloadGuard,
    PENDING_NOTES_KEY,
} from './client-notes-guard.js';

describe('client-notes-guard', () => {
    beforeEach(() => localStorage.clear());

    it('более свежая локальная копия побеждает БД', () => {
        const r = pickNewestNotes(
            { notes: 'старое', timestamp: '2026-11-16T10:00:00Z' },
            [{ notes: 'новое', timestamp: '2026-11-16T10:00:05Z' }],
        );
        expect(r).toEqual({ notes: 'новое', source: 'local', restored: true });
    });
    it('БД свежее — остаётся БД', () => {
        const r = pickNewestNotes(
            { notes: 'бд', timestamp: '2026-11-16T10:00:10Z' },
            [{ notes: 'лок', timestamp: '2026-11-16T10:00:05Z' }, null],
        );
        expect(r.source).toBe('db');
        expect(r.restored).toBe(false);
    });
    it('без записи в БД берётся локальная', () => {
        expect(pickNewestNotes(null, [{ notes: 'x' }]).notes).toBe('x');
        expect(pickNewestNotes(null, []).notes).toBe('');
    });
    it('запись/очистка ожидающей копии', () => {
        writePendingNotes('abc');
        expect(readLocalNotesCandidates()[0].notes).toBe('abc');
        clearPendingNotes();
        expect(localStorage.getItem(PENDING_NOTES_KEY)).toBeNull();
    });
    it('pagehide с несохранённым текстом пишет копию и запускает сохранение', () => {
        const ta = document.createElement('textarea');
        ta.value = 'набрано';
        const save = vi.fn().mockResolvedValue();
        const off = installClientNotesUnloadGuard(ta, { getLastSaved: () => 'набр', save });
        window.dispatchEvent(new Event('pagehide'));
        expect(JSON.parse(localStorage.getItem(PENDING_NOTES_KEY)).notes).toBe('набрано');
        expect(save).toHaveBeenCalledOnce();
        off();
    });
    it('ничего не делает, если всё сохранено', () => {
        const ta = document.createElement('textarea');
        ta.value = 'same';
        const save = vi.fn();
        const off = installClientNotesUnloadGuard(ta, { getLastSaved: () => 'same', save });
        window.dispatchEvent(new Event('pagehide'));
        expect(save).not.toHaveBeenCalled();
        off();
    });
});
