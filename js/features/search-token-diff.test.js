// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { State } from '../app/state.js';
import { initDB, getFromIndexedDB } from '../db/indexeddb.js';
import { updateSearchIndex } from './search.js';

async function refsFor(word) {
    const e = await getFromIndexedDB('searchIndex', word);
    return (e?.refs || []).filter((r) => r.type === 'clientData');
}

describe('индекс заметок обновляется по разнице токенов', () => {
    beforeAll(async () => {
        await initDB();
    });
    it('добавляет новые слова и убирает исчезнувшие, не трогая чужие ссылки', async () => {
        const v1 = { id: 'current', notes: 'клиент ромашка звонил', timestamp: '1' };
        await updateSearchIndex('clientData', 'current', v1, 'add', null);
        expect((await refsFor('ромашк')).length).toBe(1);
        // чужая ссылка на то же слово
        await updateSearchIndex('links', 1, { id: 1, title: 'ромашка', link: 'x' }, 'add', null);

        const v2 = { id: 'current', notes: 'клиент василек звонил', timestamp: '2' };
        await updateSearchIndex('clientData', 'current', v2, 'update', v1);
        expect(await refsFor('ромашк')).toHaveLength(0);
        expect(await refsFor('василек')).toHaveLength(1);
        expect(await refsFor('клиент')).toHaveLength(1);
        const all = await getFromIndexedDB('searchIndex', 'ромашк');
        expect(all.refs.some((r) => r.type === 'links')).toBe(true);
        expect(State.db).toBeTruthy();
    });
});
