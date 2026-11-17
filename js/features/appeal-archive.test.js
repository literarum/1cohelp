import { describe, it, expect } from 'vitest';
import { extractInns, buildArchiveRecord, filterArchive } from './appeal-archive.js';

describe('appeal-archive', () => {
    it('extractInns берёт только ИНН с верной контрольной суммой, без повторов', () => {
        expect(extractInns('ИНН 7707083893, повтор 7707083893, плохой 7707083894, тел 79031234567')).toEqual(['7707083893']);
        expect(extractInns('')).toEqual([]);
    });
    it('buildArchiveRecord: пустые заметки не архивируются', () => {
        expect(buildArchiveRecord('   \n ')).toBeNull();
        const r = buildArchiveRecord('\n  Клиент: ООО Ромашка\nИНН 7707083893', new Date('2026-11-16T10:00:00Z'));
        expect(r.title).toBe('Клиент: ООО Ромашка');
        expect(r.inns).toEqual(['7707083893']);
        expect(r.archivedAt).toBe('2026-11-16T10:00:00.000Z');
    });
    it('filterArchive: все слова, без учёта регистра и ё/е', () => {
        const recs = [{ notes: 'Ошибка подписи, ёлка', inns: ['7707083893'] }, { notes: 'Другое' }];
        expect(filterArchive(recs, 'ЕЛКА подпис')).toHaveLength(1);
        expect(filterArchive(recs, '7707083893')).toHaveLength(1);
        expect(filterArchive(recs, '')).toHaveLength(2);
    });
});
