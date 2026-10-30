import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory, IDBRequest } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { State } from '../app/state.js';
import { storeConfigs } from '../db/stores.js';
import { getAllFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';
import { analyzeMergeData, buildMergePlan, applyMergePlan, CONTENT_STORES, setDbMergeDependencies } from './db-merge.js';
import { buildBackupIntegrityBlock } from './import-export.js';

const payload = data => JSON.stringify({ schemaVersion: '1.7', data });
describe('merge parity on a disposable IndexedDB database', () => {
    beforeEach(async () => {
        vi.stubGlobal('Blob', NodeBlob);
        vi.stubGlobal('IDBRequest', IDBRequest);
        for (const method of ['log', 'warn', 'error']) vi.spyOn(console, method).mockImplementation(() => {});
        const factory = new IDBFactory();
        State.db = await new Promise((resolve, reject) => {
            const request = factory.open('merge-disposable-fixture', 1);
            request.onupgradeneeded = () => {
                for (const config of storeConfigs) {
                    const store = request.result.createObjectStore(config.name, config.options);
                    for (const index of config.indexes || []) store.createIndex(index.name, index.keyPath, index.options);
                }
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
        setDbMergeDependencies({ storeConfigs, showNotification: vi.fn(), loadFromIndexedDB: vi.fn(), buildInitialSearchIndex: vi.fn() });
    });
    afterEach(() => { State.db?.close(); State.db = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('covers every importable current schema store', () => {
        const expected = storeConfigs.map(store => store.name).filter(name => !['searchIndex', 'recentlyDeleted', 'entityEditHistory'].includes(name));
        expect(new Set(CONTENT_STORES)).toEqual(new Set(expected));
    });

    it('uses the same legacy envelope and alias compatibility as full import', async () => {
        const result = await analyzeMergeData(JSON.stringify({ externalLinks: [{ id: 1, title: 'Synthetic', url: 'https://example.test' }] }), { stores: ['extLinks'] });
        expect(result.storeDiffs[0].importOnly).toHaveLength(1);
    });

    it('rejects malformed data, newer major schema and tampered integrity before applying', async () => {
        await expect(analyzeMergeData(payload({ bookmarks: 'broken' }), { stores: ['bookmarks'] })).rejects.toThrow();
        await expect(analyzeMergeData(JSON.stringify({ schemaVersion: '99.0', data: { bookmarks: [] } }))).rejects.toThrow();
        const data = { links: [{ id: 1, title: 'Synthetic' }] };
        const integrity = buildBackupIntegrityBlock(data);
        data.links.push({ id: 2, title: 'Extra' });
        await expect(analyzeMergeData(JSON.stringify({ schemaVersion: '1.7', data, integrity }), { stores: ['links'] })).rejects.toThrow();
        expect(await getAllFromIndexedDB('links')).toEqual([]);
    });

    it('writes omitted entity types while keeping local settings until explicitly selected', async () => {
        await saveToIndexedDB('preferences', { id: 'userGlobalPreferences', data: { theme: 'dark', localOnly: 'keep' } });
        const data = {
            links: [{ id: 10, title: 'Synthetic 1C', url: 'https://example.test' }],
            clientData: [{ id: 'current', notes: 'Synthetic note' }],
            preferences: [{ id: 'userGlobalPreferences', data: { theme: 'light' } }, { id: 'customBackgroundImage', value: 'data:image/png;base64,YQ==' }],
            blacklistedClients: [{ id: 10, inn: 'synthetic-inn', reason: 'Synthetic' }],
            trainingProgress: [{ id: 'progress', completed: { synthetic: true } }],
            trainingSrsCards: [{ id: 10, front: 'Front', back: 'Back', sourceType: 'manual' }],
            trainingWeakSpots: [{ id: 10, stepKey: 'synthetic:step', note: 'Synthetic' }],
            trainingUserCurriculum: [{ id: 'user-synthetic', title: 'Synthetic', steps: [] }],
            trainingBuiltinCurriculum: [{ id: 'builtin', data: [] }],
            mentorQuizPackages: [{ id: 'synthetic-quiz', questions: [] }],
        };
        const analysis = await analyzeMergeData(payload(data), { stores: Object.keys(data) });
        expect(analysis.storeDiffs.find(diff => diff.storeName === 'preferences').conflicts).toHaveLength(1);
        await applyMergePlan(buildMergePlan(analysis, { perStorePolicy: { preferences: 'keepLocal' } }));
        for (const name of Object.keys(data).filter(name => name !== 'preferences')) expect(await getAllFromIndexedDB(name), name).toHaveLength(1);
        expect((await getAllFromIndexedDB('preferences')).find(record => record.id === 'userGlobalPreferences').data.theme).toBe('dark');
        expect((await getAllFromIndexedDB('preferences')).find(record => record.id === 'customBackgroundImage').value).toBe('data:image/png;base64,YQ==');
    });

    it('refuses Keep Both for fixed keys instead of overwriting local work', async () => {
        await saveToIndexedDB('clientData', { id: 'current', notes: 'Local' });
        const analysis = await analyzeMergeData(payload({ clientData: [{ id: 'current', notes: 'Incoming' }] }), { stores: ['clientData'] });
        expect(() => buildMergePlan(analysis, { perStorePolicy: { clientData: 'keepBoth' } })).toThrow();
        expect((await getAllFromIndexedDB('clientData'))[0].notes).toBe('Local');
    });

    it('does not collapse distinct legacy records without auto-generated ids and rejects missing fixed keys', async () => {
        const analysis = await analyzeMergeData(payload({ links: [{ title: 'First', url: 'https://example.test/1' }, { title: 'Second', url: 'https://example.test/2' }] }), { stores: ['links'] });
        await applyMergePlan(buildMergePlan(analysis, {}));
        expect((await getAllFromIndexedDB('links')).map(record => record.title)).toEqual(['First', 'Second']);
        await expect(analyzeMergeData(payload({ clientData: [{ notes: 'No key' }] }), { stores: ['clientData'] })).rejects.toThrow();
    });

    it('updates both PDF and screenshot conflicts, restoring Blob and recomputed parentKey', async () => {
        await saveToIndexedDB('bookmarks', { id: 100, title: 'Existing', url: 'https://existing.test' });
        await saveToIndexedDB('pdfFiles', { id: 1, parentType: 'bookmark', parentId: '100', parentKey: 'bookmark:100', filename: 'test.pdf', blob: new NodeBlob(['old'], { type: 'application/pdf' }) });
        await saveToIndexedDB('screenshots', { id: 2, parentType: 'bookmark', parentId: '100', blob: new NodeBlob(['old'], { type: 'image/png' }) });
        const data = { pdfFiles: [{ id: 1, parentType: 'bookmark', parentId: '100', filename: 'test.pdf', blob: { base64: 'bmV3', type: 'application/pdf' } }],
            screenshots: [{ id: 2, parentType: 'bookmark', parentId: '100', blob: { base64: 'bmV3', type: 'image/png' } }] };
        const analysis = await analyzeMergeData(payload(data), { stores: Object.keys(data) });
        await applyMergePlan(buildMergePlan(analysis, { perStorePolicy: { pdfFiles: 'preferImport', screenshots: 'preferImport' } }));
        expect(await (await getAllFromIndexedDB('pdfFiles'))[0].blob.text()).toBe('new');
        expect((await getAllFromIndexedDB('pdfFiles'))[0].parentKey).toBe('bookmark:100');
        expect(await (await getAllFromIndexedDB('screenshots'))[0].blob.text()).toBe('new');
    });

    it('aborts every store on a late unique constraint failure, with no clear-store rollback', async () => {
        await saveToIndexedDB('bookmarkFolders', { id: 1, name: 'Local' });
        await saveToIndexedDB('extLinkCategories', { id: 1, name: 'Duplicate' });
        const transactionSpy = vi.spyOn(State.db, 'transaction');
        const plan = { perStore: {
            bookmarkFolders: { toInsert: [{ record: { id: 2, name: 'Incoming' } }], toUpdate: [] },
            extLinkCategories: { toInsert: [{ record: { id: 2, name: 'Duplicate' } }], toUpdate: [] },
        } };
        await expect(applyMergePlan(plan)).rejects.toThrow();
        expect(await getAllFromIndexedDB('bookmarkFolders')).toEqual([{ id: 1, name: 'Local' }]);
        expect(transactionSpy.mock.calls.filter(([, mode]) => mode === 'readwrite')).toHaveLength(1);
    });

    it('does not overwrite a record changed since analysis', async () => {
        await saveToIndexedDB('bookmarks', { id: 1, title: 'Same', url: 'https://example.test', description: 'Before' });
        const analysis = await analyzeMergeData(payload({ bookmarks: [{ id: 10, title: 'Same', url: 'https://example.test', description: 'Imported' }] }), { stores: ['bookmarks'] });
        const plan = buildMergePlan(analysis, { perStorePolicy: { bookmarks: 'preferImport' } });
        await saveToIndexedDB('bookmarks', { id: 1, title: 'Same', url: 'https://example.test', description: 'Edited after preview' });
        await expect(applyMergePlan(plan)).rejects.toThrow();
        expect((await getAllFromIndexedDB('bookmarks'))[0].description).toBe('Edited after preview');
    });

    it('remaps children to matched existing folders and newly inserted analytics entities', async () => {
        await saveToIndexedDB('bookmarkFolders', { id: 1, name: 'Shared' });
        await saveToIndexedDB('clientAnalyticsFiles', { id: 1, filename: 'Local' });
        await saveToIndexedDB('clientAnalyticsFolders', { id: 1, name: 'Local' });
        const data = {
            bookmarkFolders: [{ id: 10, name: 'Shared' }],
            bookmarks: [{ id: 10, title: 'Synthetic', url: 'https://example.test', folder: 10 }],
            clientAnalyticsFiles: [{ id: 20, filename: 'Incoming' }],
            clientAnalyticsFolders: [{ id: 20, name: 'Incoming' }],
            clientAnalyticsTags: [{ id: 20, name: 'Incoming' }],
            clientAnalyticsRecords: [{ id: 20, inn: 'synthetic', sourceFileId: 20 }],
            clientAnalyticsCardMeta: [{ id: 'inn:synthetic', folderId: 20, tagIds: [20] }],
        };
        const analysis = await analyzeMergeData(payload(data), { stores: Object.keys(data) });
        await applyMergePlan(buildMergePlan(analysis, {}));
        expect((await getAllFromIndexedDB('bookmarks'))[0].folder).toBe(1);
        const file = (await getAllFromIndexedDB('clientAnalyticsFiles')).find(r => r.filename === 'Incoming');
        const folder = (await getAllFromIndexedDB('clientAnalyticsFolders')).find(r => r.name === 'Incoming');
        const tag = (await getAllFromIndexedDB('clientAnalyticsTags'))[0];
        expect((await getAllFromIndexedDB('clientAnalyticsRecords'))[0].sourceFileId).toBe(file.id);
        expect((await getAllFromIndexedDB('clientAnalyticsCardMeta'))[0]).toMatchObject({ folderId: folder.id, tagIds: [tag.id] });
    });
});
