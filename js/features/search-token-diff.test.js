// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { State } from '../app/state.js';
import { initDB, getFromIndexedDB } from '../db/indexeddb.js';
import { updateSearchIndex, buildIndexEntriesForItem, diffIndexEntries } from './search.js';

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

describe('правка любой записи обновляет индекс по разнице', () => {
    beforeAll(async () => {
        if (!State.db) await initDB();
    });

    /** Все ссылки индекса на запись в виде «слово|поле|шаг». */
    async function indexKeysFor(type, id) {
        const keys = new Set();
        await new Promise((resolve) => {
            const req = State.db.transaction('searchIndex').objectStore('searchIndex').openCursor();
            req.onsuccess = () => {
                const c = req.result;
                if (!c) return resolve();
                for (const r of c.value.refs) {
                    if (r.type === type && String(r.id) === String(id)) {
                        keys.add(`${c.value.word}|${r.field}|${r.stepIndex ?? ''}`);
                    }
                }
                c.continue();
            };
        });
        return keys;
    }

    it('алгоритм: результат совпадает с полной переиндексацией, шаги переиндексируются', async () => {
        const v1 = {
            id: 'alg-diff-1',
            title: 'Ошибка подписи',
            description: 'сертификат просрочен',
            steps: [
                { title: 'Проверить сертификат', description: 'открыть криптопро' },
                { title: 'Перевыпуск', description: 'заявление на перевыпуск' },
            ],
        };
        await updateSearchIndex('algorithms', v1.id, v1, 'add', null);
        const v2 = {
            ...v1,
            description: 'сертификат отозван',
            steps: [
                { title: 'Проверить сертификат', description: 'открыть криптопро' },
                { title: 'Перевыпуск', description: 'обращение в удостоверяющий центр' },
            ],
        };
        await updateSearchIndex('algorithms', v1.id, v2, 'update', v1);
        const got = await indexKeysFor('algorithms', v1.id);

        const expected = new Set(
            buildIndexEntriesForItem('algorithms', v2).map((e) => {
                const w = e.word.toLowerCase().replace(/ё/g, 'е');
                return `${w}|${e.details.field}|${e.details.stepIndex ?? ''}`;
            }),
        );
        // В индекс не пишутся слишком короткие слова — сравниваем по тому, что реально хранится.
        for (const k of got) expect(expected.has(k)).toBe(true);
        expect([...got].some((k) => k.startsWith('просроч'))).toBe(false);
        expect([...got].some((k) => k.startsWith('отозва'))).toBe(true);
        expect([...got].some((k) => k.startsWith('удостоверя') && k.includes('|steps|'))).toBe(true);
        expect([...got].some((k) => k.startsWith('заявлен'))).toBe(false);
    });

    it('diffIndexEntries: без изменений — пустая разница; смена id — null', () => {
        const a = { id: 5, title: 'Ссылка на ЛК', link: 'https://x', description: 'вход' };
        const same = diffIndexEntries('links', a, { ...a });
        expect(same.add).toHaveLength(0);
        expect(same.remove.size).toBe(0);
        expect(diffIndexEntries('links', a, { ...a, id: 6 })).toBeNull();
    });
});

describe('исправление опечаток по словарю индекса', () => {
    it('находит ближайшие слова: одна правка для коротких, две — для длинных', async () => {
        const { nearestIndexTokens } = await import('./search.js');
        const keys = ['отчет', 'отче', 'отчетн', 'сертификат', 'сертифик', 'подпис', 'ош'];
        expect(nearestIndexTokens('отчот', keys)[0]).toBe('отчет');
        expect(nearestIndexTokens('сертефикат', keys)[0]).toBe('сертификат');
        expect(nearestIndexTokens('сетрификат', keys)).toContain('сертификат'); // перестановка
        expect(nearestIndexTokens('абв', keys)).toEqual([]);
        expect(nearestIndexTokens('подпис', keys)).not.toContain('подпис');
    });
});
