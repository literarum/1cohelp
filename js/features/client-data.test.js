import { beforeEach, describe, expect, it, vi } from 'vitest';
import { State } from '../app/state.js';
import { getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import { saveClientData, setClientDataDependencies } from './client-data.js';

vi.mock('../db/indexeddb.js', () => ({
    getFromIndexedDB: vi.fn(),
    saveToIndexedDB: vi.fn(),
}));

describe('client-data autosave integrity', () => {
    let noteField;
    let storage;

    beforeEach(() => {
        vi.clearAllMocks();
        State.db = {};
        noteField = { value: '' };
        storage = new Map();

        globalThis.document = {
            getElementById: vi.fn((id) => (id === 'clientNotes' ? noteField : null)),
        };
        globalThis.localStorage = {
            setItem: vi.fn((key, value) => {
                storage.set(String(key), String(value));
            }),
            getItem: vi.fn((key) => (storage.has(String(key)) ? storage.get(String(key)) : null)),
            clear: vi.fn(() => storage.clear()),
        };
    });

    it('persists and verifies exact notes payload after write', async () => {
        const notes = 'Critical payload\nlast symbol: !';
        const showNotification = vi.fn();
        const updateSearchIndex = vi.fn(async () => {});

        noteField.value = notes;
        getFromIndexedDB
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'current', notes });
        saveToIndexedDB.mockResolvedValueOnce(undefined);
        setClientDataDependencies({ showNotification, updateSearchIndex });

        await saveClientData();

        expect(saveToIndexedDB).toHaveBeenCalledWith(
            'clientData',
            expect.objectContaining({ id: 'current', notes }),
        );
        expect(updateSearchIndex).toHaveBeenCalledTimes(1);
        expect(showNotification).not.toHaveBeenCalledWith(
            expect.stringContaining('резервное хранилище'),
            expect.anything(),
        );
    });

    it('falls back to localStorage when read-after-write integrity check fails', async () => {
        const notes = 'Value must survive exactly';
        const showNotification = vi.fn();
        noteField.value = notes;

        getFromIndexedDB
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'current', notes: `${notes} CORRUPTED` });
        saveToIndexedDB.mockResolvedValueOnce(undefined);
        setClientDataDependencies({ showNotification, updateSearchIndex: null });

        await saveClientData();

        const fallbackData = JSON.parse(localStorage.getItem('clientData'));
        expect(fallbackData.notes).toBe(notes);
        expect(showNotification).toHaveBeenCalledWith(
            'Данные клиента сохранены локально (резервное хранилище), но не в базу данных.',
            'warning',
        );
    });
});
