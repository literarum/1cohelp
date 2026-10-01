'use strict';

import { describe, it, expect } from 'vitest';
import {
    extractImportDataEnvelope,
    normalizeCompatibilityData,
    normalizeLegacyImportData,
    buildBackupIntegrityBlock,
    verifyBackupIntegrity,
    buildBackupIntegrityBlockWithHashes,
    verifyBackupStoreHashes,
    resolveImportSchemaVersion,
} from './import-export.js';

describe('normalizeLegacyImportData', () => {
    it('maps legacy extLinks category keys to numeric category ids', () => {
        const raw = {
            extLinkCategories: [{ id: 10, name: 'Документация' }],
            extLinks: [{ id: 1, title: 'Доки', category: 'docs', url: 'https://example.com' }],
        };

        const normalized = normalizeLegacyImportData(raw);
        expect(normalized.extLinks[0].category).toBe(10);
    });

    it('normalizes legacy folder and screenshot linkage fields', () => {
        const raw = {
            bookmarks: [{ id: 11, title: 'Wiki', folderId: 7 }],
            screenshots: [{ id: 31, algorithmId: 12 }],
        };

        const normalized = normalizeLegacyImportData(raw);
        expect(normalized.bookmarks[0].folder).toBe(7);
        expect(normalized.bookmarks[0]).not.toHaveProperty('folderId');
        expect(normalized.screenshots[0].parentType).toBe('algorithm');
        expect(normalized.screenshots[0].parentId).toBe('12');
        expect(normalized.screenshots[0]).not.toHaveProperty('algorithmId');
    });

    it('normalizes cross-store id/string fields for references', () => {
        const raw = {
            favorites: [{ id: 5, itemType: 'bookmark', originalItemId: 99 }],
            pdfFiles: [{ id: 6, parentType: 'bookmark', parentId: 42 }],
        };

        const normalized = normalizeLegacyImportData(raw);
        expect(normalized.favorites[0].originalItemId).toBe('99');
        expect(normalized.pdfFiles[0].parentId).toBe('42');
        expect(normalized.pdfFiles[0].parentKey).toBe('bookmark:42');
    });

    it('does not mutate input payload object', () => {
        const raw = {
            extLinkCategories: [{ id: 1, name: 'Документация' }],
            extLinks: [{ id: 101, category: 'docs' }],
        };
        const snapshot = JSON.parse(JSON.stringify(raw));

        const normalized = normalizeLegacyImportData(raw);
        expect(raw).toEqual(snapshot);
        expect(normalized.extLinks[0].category).toBe(1);
    });
});

describe('compatibility helpers', () => {
    it('maps aliased legacy store names into modern store names', () => {
        const raw = {
            externalLinks: [{ id: 1, title: 'Legacy ext' }],
            externalLinkCategories: [{ id: 2, name: 'Legacy cat' }],
            bookmarkFolder: [{ id: 3, name: 'Legacy folder' }],
            regulations: [{ id: 4, title: 'Legacy reglament' }],
        };

        const normalized = normalizeCompatibilityData(raw);
        expect(normalized.extLinks).toHaveLength(1);
        expect(normalized.extLinkCategories).toHaveLength(1);
        expect(normalized.bookmarkFolders).toHaveLength(1);
        expect(normalized.reglaments).toHaveLength(1);
    });

    it('preserves known stores while applying aliases', () => {
        const raw = {
            bookmarks: [{ id: 10, title: 'Current bookmark' }],
            externalLinks: [{ id: 11, title: 'Legacy ext' }],
        };
        const normalized = normalizeCompatibilityData(raw);
        expect(normalized.bookmarks).toHaveLength(1);
        expect(normalized.extLinks).toHaveLength(1);
    });

    it('does not coerce non-array store payloads into empty arrays (prevents silent data wipe)', () => {
        const raw = { bookmarks: 'oops', reglaments: null, links: [{ id: 1 }] };
        const compat = normalizeCompatibilityData(raw);
        expect(compat.bookmarks).toBe('oops');
        expect(compat.reglaments).toBeNull();
        expect(compat.links).toHaveLength(1);

        const legacy = normalizeLegacyImportData(compat);
        expect(Array.isArray(legacy.bookmarks)).toBe(false);
        expect(Array.isArray(legacy.reglaments)).toBe(false);
        expect(legacy.links).toHaveLength(1);
    });

    it('resolves schema version from file and infers fallback when missing', () => {
        const explicit = resolveImportSchemaVersion({ schemaVersion: '1.5' });
        expect(explicit).toEqual({ schemaVersion: '1.5', inferred: false });

        const inferred = resolveImportSchemaVersion({ data: {} });
        expect(inferred).toEqual({ schemaVersion: '1.0', inferred: true });
    });

    it('extracts modern envelope with data object as-is', () => {
        const payload = {
            schemaVersion: '1.5',
            data: {
                bookmarks: [{ id: 1, title: 'Bookmark' }],
            },
        };
        const extracted = extractImportDataEnvelope(payload);
        expect(extracted.usedLegacyEnvelope).toBe(false);
        expect(extracted.data.bookmarks).toHaveLength(1);
    });

    it('extracts legacy envelope without data wrapper', () => {
        const payload = {
            schemaVersion: '0.7',
            exportDate: '2024-01-01T00:00:00.000Z',
            bookmarks: [{ id: 1, title: 'Legacy bookmark' }],
            extLinks: [{ id: 2, title: 'Legacy ext' }],
        };
        const extracted = extractImportDataEnvelope(payload);
        expect(extracted.usedLegacyEnvelope).toBe(true);
        expect(extracted.data.bookmarks).toHaveLength(1);
        expect(extracted.data.extLinks).toHaveLength(1);
    });
});

describe('backup integrity block', () => {
    it('builds per-store counts and verifies an intact file', () => {
        const data = { bookmarks: [{ id: 1 }, { id: 2 }], links: [] };
        const integrity = buildBackupIntegrityBlock(data);
        expect(integrity.storeCounts).toEqual({ bookmarks: 2, links: 0 });
        expect(verifyBackupIntegrity({ integrity }, data)).toEqual({
            ok: true,
            checked: true,
            mismatches: [],
        });
    });

    it('detects dropped records, missing sections and unaccounted sections', () => {
        const integrity = buildBackupIntegrityBlock({ bookmarks: [{ id: 1 }, { id: 2 }], links: [] });
        const tampered = { bookmarks: [{ id: 1 }], extra: [] };
        const result = verifyBackupIntegrity({ integrity }, tampered);
        expect(result.ok).toBe(false);
        expect(result.mismatches.join('|')).toContain('bookmarks');
        expect(result.mismatches.join('|')).toContain('links');
        expect(result.mismatches.join('|')).toContain('extra');
    });

    it('skips verification for legacy files without integrity block', () => {
        expect(verifyBackupIntegrity({ schemaVersion: '1.5' }, { bookmarks: [] })).toEqual({
            ok: true,
            checked: false,
            mismatches: [],
        });
    });
});

describe('backup content hashes (SHA-256)', () => {
    it('passes for an intact backup and detects same-count content tampering', async () => {
        const data = { bookmarks: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }] };
        const integrity = await buildBackupIntegrityBlockWithHashes(data);
        expect(integrity.storeHashes.bookmarks).toMatch(/^[0-9a-f]{64}$/);
        const roundTripped = JSON.parse(JSON.stringify({ integrity, data }));
        expect((await verifyBackupStoreHashes(roundTripped, roundTripped.data)).ok).toBe(true);

        roundTripped.data.bookmarks[1].title = 'TAMPERED';
        const bad = await verifyBackupStoreHashes(roundTripped, roundTripped.data);
        expect(bad.ok).toBe(false);
        expect(bad.mismatches[0]).toContain('bookmarks');
    });

    it('skips legacy files without hashes', async () => {
        const res = await verifyBackupStoreHashes({ integrity: { algorithm: 'store-counts-v1' } }, {});
        expect(res).toEqual({ ok: true, checked: false, mismatches: [] });
    });

    it('rejects a malformed integrity value instead of silently skipping it', () => {
        expect(verifyBackupIntegrity({ integrity: 'garbage' }, { a: [] }).ok).toBe(false);
        expect(verifyBackupIntegrity({ integrity: 42 }, { a: [] }).ok).toBe(false);
        expect(verifyBackupIntegrity({ integrity: [] }, { a: [] }).ok).toBe(false);
        expect(verifyBackupIntegrity({ integrity: null }, { a: [] }).ok).toBe(true);
        // объект неизвестного формата / без обязательных полей тоже считается повреждённым
        expect(verifyBackupIntegrity({ integrity: { stores: null } }, { a: [] }).ok).toBe(false);
        expect(verifyBackupIntegrity({ integrity: {} }, { a: [] }).ok).toBe(false);
    });
});
