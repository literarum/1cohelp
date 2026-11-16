import { describe, it, expect } from 'vitest';
import {
    buildBackupFileName,
    selectBackupsToDelete,
    isBackupDue,
    AUTO_BACKUP_FILE_PREFIX,
} from './auto-backup.js';

describe('auto-backup: чистая логика', () => {
    it('имя файла в локальном времени и сортируется хронологически', () => {
        const a = buildBackupFileName(new Date(2026, 0, 5, 9, 7));
        const b = buildBackupFileName(new Date(2026, 10, 16, 14, 5));
        expect(a).toBe(`${AUTO_BACKUP_FILE_PREFIX}2026-01-05_09-07.json`);
        expect([b, a].sort()).toEqual([a, b]);
    });
    it('ротация оставляет keep новых и не трогает чужие файлы', () => {
        const names = [
            'notes.txt',
            `${AUTO_BACKUP_FILE_PREFIX}2026-01-03_10-00.json`,
            `${AUTO_BACKUP_FILE_PREFIX}2026-01-01_10-00.json`,
            `${AUTO_BACKUP_FILE_PREFIX}2026-01-02_10-00.json`,
            'other.json',
        ];
        expect(selectBackupsToDelete(names, 2)).toEqual([`${AUTO_BACKUP_FILE_PREFIX}2026-01-01_10-00.json`]);
        expect(selectBackupsToDelete(names, 10)).toEqual([]);
        // некорректное значение → значение по умолчанию (ничего лишнего не удаляем)
        expect(selectBackupsToDelete(names, 0)).toEqual([]);
        expect(selectBackupsToDelete(names, 1)).toHaveLength(2);
    });
    it('isBackupDue', () => {
        const now = Date.parse('2026-11-16T12:00:00Z');
        expect(isBackupDue(null, 24, now)).toBe(true);
        expect(isBackupDue('2026-11-16T00:00:00Z', 24, now)).toBe(false);
        expect(isBackupDue('2026-11-15T11:00:00Z', 24, now)).toBe(true);
        expect(isBackupDue('garbage', 24, now)).toBe(true);
    });
});
