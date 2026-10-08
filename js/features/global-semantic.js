'use strict';

/**
 * Семантический слой глобального поиска в шапке.
 * Основной (индексный) поиск остаётся как есть; этот слой берёт тексты записей
 * (алгоритмы, ссылки 1С, закладки/заметки, регламенты, внешние ресурсы), строит из них
 * семантический индекс (синонимы, опечатки, выученные связи) и находит то, что индекс токенов
 * не нашёл. Результаты помечаются «по смыслу» и объясняются.
 */
import { SemanticIndex, docsSignature } from './semantic-engine.js';

const STORES = ['links', 'bookmarks', 'reglaments', 'extLinks'];
const TTL_MS = 15000;
const MAX_FIELD_CHARS = 6000;

let corpus = null; // { at, sig, index, refs: Map<string,{store,id,item}> }
let building = null;

function toFields(textsByField) {
    const entries = Object.entries(textsByField || {}).filter(([, v]) => typeof v === 'string' && v);
    const titleKeys = entries.filter(([k]) => /^(title|name|h\d)$/.test(k));
    const rest = entries.filter(([k]) => !/^(title|name|h\d)$/.test(k));
    const fields = [];
    const title = titleKeys.map(([, v]) => v).join(' ');
    fields.push({ text: title, weight: 3 });
    const body = rest.map(([, v]) => v).join(' \n ');
    fields.push({ text: body.length > MAX_FIELD_CHARS ? body.slice(0, MAX_FIELD_CHARS) : body, weight: 1 });
    return fields;
}

/**
 * @param {{ getAll:(s:string)=>Promise<any[]>, getOne:(s:string,k:string)=>Promise<any>, getText:(s:string,item:any)=>Record<string,string> }} deps
 */
async function loadDocs(deps) {
    const docs = [];
    const refs = new Map();
    const add = (store, id, item) => {
        const key = `${store}:${id}`;
        const fields = toFields(deps.getText(store, item));
        if (!fields[0].text && !fields[1].text) return;
        docs.push({ id: key, fields });
        refs.set(key, { store, id: String(id), item });
    };
    for (const store of STORES) {
        try {
            const items = (await deps.getAll(store)) || [];
            for (const it of items) if (it && it.id !== undefined) add(store, it.id, it);
        } catch {
            /* хранилище недоступно — пропускаем */
        }
    }
    try {
        const container = await deps.getOne('algorithms', 'all');
        const data = container && container.data;
        if (data) {
            if (data.main) add('algorithms', 'main', { ...data.main, id: 'main' });
            for (const k of Object.keys(data)) {
                if (k === 'main' || !Array.isArray(data[k])) continue;
                for (const a of data[k]) if (a && a.id) add('algorithms', a.id, a);
            }
        }
    } catch {
        /* нет алгоритмов */
    }
    return { docs, refs };
}

export function invalidateGlobalSemanticCorpus() {
    corpus = null;
}

async function getCorpus(deps) {
    const now = Date.now();
    if (corpus && now - corpus.at < TTL_MS) return corpus;
    if (building) return building;
    building = (async () => {
        const { docs, refs } = await loadDocs(deps);
        const sig = docsSignature(docs);
        if (corpus && corpus.sig === sig) {
            corpus.at = Date.now();
            corpus.refs = refs;
            return corpus;
        }
        corpus = { at: Date.now(), sig, index: new SemanticIndex(docs), refs };
        return corpus;
    })();
    try {
        return await building;
    } finally {
        building = null;
    }
}

/**
 * @returns {Promise<{ hits: Array<{ref:{store:string,id:string,item:any}, score:number, why:string[], exact:boolean}>, suggestion: string|null }>}
 */
export async function semanticGlobalSearch(query, deps, limit = 30) {
    const c = await getCorpus(deps);
    if (!c.index.size) return { hits: [], suggestion: null };
    const res = c.index.search(query, { limit });
    const top = res.hits.length ? res.hits[0].score : 0;
    const hits = res.hits
        .filter((h) => h.score >= top * 0.2)
        .map((h) => ({ ref: c.refs.get(h.id), score: h.score, why: h.why, exact: h.exact }))
        .filter((h) => h.ref);
    return { hits, suggestion: res.suggestion || null };
}
