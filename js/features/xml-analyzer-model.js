'use strict';

/**
 * Универсальная модель XML для анализатора: собственный толерантный потоковый разбор в компактное
 * хранилище (типизированные массивы), без DOM и без рекурсии.
 *
 * Зачем свой разбор, а не DOMParser:
 *  - любой «сломанный» XML (оборванный, с лишними тегами) всё равно даёт частичное дерево + список ошибок;
 *  - документы на десятки/сотни МБ разбираются кусками с отдачей управления интерфейсу и прогрессом;
 *  - внешние сущности и DTD никогда не раскрываются (XXE и «billion laughs» невозможны по построению:
 *    пользовательские &имя; остаются буквальным текстом);
 *  - в памяти хранятся только смещения в исходной строке, а не копии текста.
 *
 * Узел 0 — виртуальный «документ» (родитель верхнего уровня). Идентификаторы узлов выдаются
 * в порядке следования в документе, поэтому потомки узла n — это ровно узлы n+1 … n+sub[n].
 */

export const XML_LIMITS = Object.freeze({
    MAX_DEPTH: 3000,
    MAX_NODES: 6_000_000,
    MAX_ERRORS: 60,
    MAX_NS_DECLS: 5000,
    MAX_PATHS: 400_000,
});

export const NODE_KIND = Object.freeze({
    DOCUMENT: 0,
    ELEMENT: 1,
    TEXT: 2,
    CDATA: 3,
    COMMENT: 4,
    PI: 5,
});

const FLAG_INLINE_CDATA = 1;
const FLAG_SELF_CLOSING = 2;

const ENTITY_RE = /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z_][\w.-]*);/g;
const PREDEFINED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/**
 * Раскрывает ТОЛЬКО предопределённые и числовые сущности. Прочие &имя; остаются как есть.
 * @param {string} s
 * @returns {string}
 */
export function decodeXmlEntities(s) {
    if (!s || s.indexOf('&') === -1) return s || '';
    return s.replace(ENTITY_RE, (m, body) => {
        if (body.charCodeAt(0) === 35) {
            const code =
                body.charCodeAt(1) === 120 || body.charCodeAt(1) === 88
                    ? parseInt(body.slice(2), 16)
                    : parseInt(body.slice(1), 10);
            if (
                !Number.isFinite(code) ||
                code <= 0 ||
                code > 0x10ffff ||
                (code >= 0xd800 && code <= 0xdfff)
            ) {
                return m;
            }
            return String.fromCodePoint(code);
        }
        const v = PREDEFINED[body];
        return v === undefined ? m : v;
    });
}

/** Отдача управления UI без привязки к троттлингу таймеров фоновых вкладок. */
let yieldChannel = null;
export function yieldToUi() {
    if (typeof MessageChannel === 'function') {
        return new Promise((resolve) => {
            if (!yieldChannel) yieldChannel = new MessageChannel();
            const ch = yieldChannel;
            ch.port1.onmessage = () => {
                ch.port1.onmessage = null;
                resolve();
            };
            ch.port2.postMessage(0);
        });
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function nowMs() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function growTyped(arr, newLen) {
    const out = new arr.constructor(newLen);
    out.set(arr);
    return out;
}

function isWs(c) {
    return c === 32 || c === 10 || c === 13 || c === 9;
}

function isNameStartChar(c) {
    return (
        (c >= 65 && c <= 90) || // A-Z
        (c >= 97 && c <= 122) || // a-z
        c === 95 || // _
        c === 58 || // :
        c >= 0x80 // юникод (кириллица и др.)
    );
}

/**
 * Хранилище дерева XML.
 */
export class XmlDoc {
    constructor(src) {
        this.src = src;
        this.n = 1; // узел 0 — документ
        this.cap = 0;
        this.names = [];
        this.nameMap = new Map();
        this.nsDecls = [];
        this.errors = [];
        this.warnings = [];
        this.decl = null; // { version, encoding, standalone }
        this.doctype = null; // { text, entities, externalEntities }
        this.truncated = null; // 'depth' | 'nodes' | null
        this.rootElement = -1;
        this.elementCount = 0;
        this.textNodeCount = 0;
        this.commentCount = 0;
        this.cdataCount = 0;
        this.piCount = 0;
        this.attrCount = 0;
        this.maxDepth = 0;
        this.textBytes = 0;
        // path-trie (структурные пути без индексов)
        this.pathParent = [-1];
        this.pathName = [-1];
        this.pathCount = [0];
        this.pathText = [0];
        this.pathKids = [0];
        this.pathAttrs = [null];
        this.pathMap = new Map();
        this._lineStarts = null;
        this._childCountCache = new Map();
        this._allocate(1024);
    }

    _allocate(cap) {
        const first = this.cap === 0;
        const g = (a, T) => (first ? new T(cap) : growTyped(a, cap));
        this.kind = g(this.kind, Uint8Array);
        this.flags = g(this.flags, Uint8Array);
        this.parent = g(this.parent, Int32Array);
        this.first = g(this.first, Int32Array);
        this.next = g(this.next, Int32Array);
        this.nameId = g(this.nameId, Int32Array);
        this.pos = g(this.pos, Int32Array);
        this.ts = g(this.ts, Int32Array);
        this.te = g(this.te, Int32Array);
        this.aStart = g(this.aStart, Int32Array);
        this.aCnt = g(this.aCnt, Uint16Array);
        this.depth = g(this.depth, Uint16Array);
        this.sub = g(this.sub, Int32Array);
        this.pathId = g(this.pathId, Int32Array);
        this.cap = cap;
        if (first) {
            this.kind[0] = NODE_KIND.DOCUMENT;
            this.parent[0] = -1;
            this.first[0] = -1;
            this.next[0] = -1;
            this.nameId[0] = -1;
            this.ts[0] = -1;
            this.te[0] = -1;
            this.sub[0] = 0;
        }
    }

    _allocAttrs(cap) {
        if (!this.aName) {
            this.aName = new Int32Array(cap);
            this.aVs = new Int32Array(cap);
            this.aVe = new Int32Array(cap);
            this.attrCap = cap;
            this.attrTotal = 0;
        } else {
            this.aName = growTyped(this.aName, cap);
            this.aVs = growTyped(this.aVs, cap);
            this.aVe = growTyped(this.aVe, cap);
            this.attrCap = cap;
        }
    }

    internName(name) {
        let id = this.nameMap.get(name);
        if (id === undefined) {
            id = this.names.length;
            this.names.push(name);
            this.nameMap.set(name, id);
        }
        return id;
    }

    // ---------- Доступ к данным ----------

    /** Полное имя элемента (с префиксом). Для не-элементов — ''. */
    name(n) {
        const id = this.nameId[n];
        return id >= 0 ? this.names[id] : '';
    }

    localName(n) {
        const q = this.name(n);
        const i = q.indexOf(':');
        return i < 0 ? q : q.slice(i + 1);
    }

    prefix(n) {
        const q = this.name(n);
        const i = q.indexOf(':');
        return i < 0 ? '' : q.slice(0, i);
    }

    isElement(n) {
        return this.kind[n] === NODE_KIND.ELEMENT;
    }

    /** Список атрибутов [{name, value, id}] (значения декодированы). */
    attrs(n) {
        const out = [];
        const c = this.aCnt[n];
        if (!c) return out;
        const s = this.aStart[n];
        for (let k = 0; k < c; k++) {
            const idx = s + k;
            out.push({
                name: this.names[this.aName[idx]],
                value: decodeXmlEntities(this.src.slice(this.aVs[idx], this.aVe[idx])),
                index: idx,
            });
        }
        return out;
    }

    attr(n, name) {
        const c = this.aCnt[n];
        if (!c) return null;
        const id = this.nameMap.get(name);
        if (id === undefined) return null;
        const s = this.aStart[n];
        for (let k = 0; k < c; k++) {
            if (this.aName[s + k] === id) {
                return decodeXmlEntities(this.src.slice(this.aVs[s + k], this.aVe[s + k]));
            }
        }
        return null;
    }

    /** Атрибут по локальному имени (игнорируя префикс). */
    attrLocal(n, local) {
        for (const a of this.attrs(n)) {
            const i = a.name.indexOf(':');
            if ((i < 0 ? a.name : a.name.slice(i + 1)) === local) return a.value;
        }
        return null;
    }

    /** Собственный текст узла: для text/cdata/comment/pi — содержимое, для элемента — «встроенный» текст. */
    ownRaw(n) {
        const s = this.ts[n];
        if (s < 0) return '';
        return this.src.slice(s, this.te[n]);
    }

    /** Декодированный собственный текст без пробелов по краям. */
    ownText(n) {
        const k = this.kind[n];
        const raw = this.ownRaw(n);
        if (!raw) return '';
        const isCdata = k === NODE_KIND.CDATA || (this.flags[n] & FLAG_INLINE_CDATA) !== 0;
        const t = isCdata || k === NODE_KIND.COMMENT || k === NODE_KIND.PI ? raw : decodeXmlEntities(raw);
        return t.trim();
    }

    hasOwnText(n) {
        return this.ts[n] >= 0 && this.te[n] > this.ts[n];
    }

    firstChild(n) {
        return this.first[n];
    }

    nextSibling(n) {
        return this.next[n];
    }

    children(n) {
        const out = [];
        for (let c = this.first[n]; c >= 0; c = this.next[c]) out.push(c);
        return out;
    }

    /** Число дочерних узлов (с кэшем: у «плоских» узлов с миллионами детей — один проход). */
    childCount(n) {
        let v = this._childCountCache.get(n);
        if (v === undefined) {
            v = 0;
            for (let c = this.first[n]; c >= 0; c = this.next[c]) v++;
            if (this._childCountCache.size > 50000) this._childCountCache.clear();
            this._childCountCache.set(n, v);
        }
        return v;
    }

    elementChildren(n) {
        const out = [];
        for (let c = this.first[n]; c >= 0; c = this.next[c]) {
            if (this.kind[c] === NODE_KIND.ELEMENT) out.push(c);
        }
        return out;
    }

    /** Строковое значение: конкатенация текстов потомков (до limit символов). */
    textContent(n, limit = 100000) {
        let out = '';
        const k = this.kind[n];
        if (k !== NODE_KIND.ELEMENT && k !== NODE_KIND.DOCUMENT) return this.ownText(n);
        const end = n + this.sub[n];
        for (let i = n; i <= end && out.length < limit; i++) {
            const kk = this.kind[i];
            if (kk === NODE_KIND.COMMENT || kk === NODE_KIND.PI) continue;
            if (this.hasOwnText(i) && (kk === NODE_KIND.ELEMENT || kk === NODE_KIND.TEXT || kk === NODE_KIND.CDATA)) {
                out += this.ownTextRaw(i);
            }
        }
        return out.length > limit ? out.slice(0, limit) : out;
    }

    /** Текст с декодированием, но без trim (для склейки). */
    ownTextRaw(n) {
        const raw = this.ownRaw(n);
        if (!raw) return '';
        const isCdata = this.kind[n] === NODE_KIND.CDATA || (this.flags[n] & FLAG_INLINE_CDATA) !== 0;
        return isCdata ? raw : decodeXmlEntities(raw);
    }

    /** Значение листового элемента: trim встроенного текста. */
    leafValue(n) {
        return this.ownText(n);
    }

    isLeafElement(n) {
        return this.kind[n] === NODE_KIND.ELEMENT && this.first[n] < 0;
    }

    pathKeyOf(n) {
        return this.pathId[n];
    }

    pathString(pid) {
        const parts = [];
        let p = pid;
        let guard = 0;
        while (p > 0 && guard++ < 10000) {
            parts.push(this.names[this.pathName[p]]);
            p = this.pathParent[p];
        }
        return '/' + parts.reverse().join('/');
    }

    /** URI пространства имён элемента (по объявлениям xmlns у предков). */
    namespaceUri(n) {
        const pfx = this.prefix(n);
        const attrName = pfx ? 'xmlns:' + pfx : 'xmlns';
        let cur = n;
        let guard = 0;
        while (cur > 0 && guard++ < 10000) {
            if (this.aCnt[cur]) {
                const v = this.attr(cur, attrName);
                if (v !== null) return v;
            }
            cur = this.parent[cur];
        }
        if (pfx === 'xml') return 'http://www.w3.org/XML/1998/namespace';
        return '';
    }

    /** Предки от корня к узлу (включая узел), без виртуального документа. */
    ancestors(n) {
        const out = [];
        let c = n;
        while (c > 0) {
            out.push(c);
            c = this.parent[c];
        }
        return out.reverse();
    }

    /**
     * XPath-подобный путь: /a/b[2]/c, для атрибута — …/@id.
     * Индекс [k] добавляется, если у узла есть одноимённые соседи.
     */
    pathOf(n, attrName = null) {
        if (n <= 0) return '/';
        const parts = [];
        let c = n;
        while (c > 0) {
            const k = this.kind[c];
            let seg;
            if (k === NODE_KIND.ELEMENT) {
                seg = this.name(c);
                const par = this.parent[c];
                let idx = 0;
                let total = 0;
                let scanned = 0;
                for (let s = this.first[par]; s >= 0 && scanned < 200000; s = this.next[s], scanned++) {
                    if (this.nameId[s] === this.nameId[c] && this.kind[s] === NODE_KIND.ELEMENT) {
                        total++;
                        if (s === c) idx = total;
                    }
                }
                if (total > 1) seg += '[' + idx + ']';
            } else if (k === NODE_KIND.TEXT || k === NODE_KIND.CDATA) {
                seg = 'text()';
            } else if (k === NODE_KIND.COMMENT) {
                seg = 'comment()';
            } else {
                seg = 'processing-instruction()';
            }
            parts.push(seg);
            c = this.parent[c];
        }
        let p = '/' + parts.reverse().join('/');
        if (attrName) p += '/@' + attrName;
        return p;
    }

    /** Обратная операция к pathOf (поддерживает name[k], @attr, * и text()). Возвращает {node, attr} или null. */
    resolvePath(path) {
        const str = String(path || '').trim();
        if (!str.startsWith('/')) return null;
        const segs = str.split('/').filter(Boolean);
        let cur = 0;
        let attr = null;
        for (let si = 0; si < segs.length; si++) {
            const seg = segs[si];
            if (seg.startsWith('@')) {
                if (si !== segs.length - 1) return null;
                attr = seg.slice(1);
                break;
            }
            const m = seg.match(/^(.*?)(?:\[(\d+)\])?$/);
            const nm = m[1];
            const want = m[2] ? parseInt(m[2], 10) : 1;
            let seen = 0;
            let found = -1;
            for (let c = this.first[cur]; c >= 0; c = this.next[c]) {
                const k = this.kind[c];
                const match =
                    nm === '*'
                        ? k === NODE_KIND.ELEMENT
                        : nm === 'text()'
                          ? k === NODE_KIND.TEXT || k === NODE_KIND.CDATA
                          : k === NODE_KIND.ELEMENT && this.name(c) === nm;
                if (match) {
                    seen++;
                    if (seen === want) {
                        found = c;
                        break;
                    }
                }
            }
            if (found < 0) return null;
            cur = found;
        }
        if (cur === 0) return null;
        if (attr !== null && this.attr(cur, attr) === null) return null;
        return { node: cur, attr };
    }

    // ---------- Строки/позиции ----------

    _buildLineStarts() {
        if (this._lineStarts) return this._lineStarts;
        const src = this.src;
        const starts = [0];
        let i = src.indexOf('\n');
        while (i !== -1) {
            starts.push(i + 1);
            i = src.indexOf('\n', i + 1);
        }
        this._lineStarts = starts;
        return starts;
    }

    lineCol(offset) {
        const starts = this._buildLineStarts();
        let lo = 0;
        let hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= offset) lo = mid;
            else hi = mid - 1;
        }
        return { line: lo + 1, col: offset - starts[lo] + 1 };
    }

    /** Строка исходника, в которой начинается узел. */
    lineOf(n) {
        return this.lineCol(this.pos[n]).line;
    }

    // ---------- Обход ----------

    /** Вызывает fn(node) для всех потомков узла n (включая n) в порядке документа. Итеративно. */
    forEachDescendant(n, fn) {
        const end = n + this.sub[n];
        for (let i = n; i <= end; i++) fn(i);
    }

    /** Статистика по документу. */
    stats() {
        const byName = new Map();
        for (let i = 1; i < this.n; i++) {
            if (this.kind[i] !== NODE_KIND.ELEMENT) continue;
            const id = this.nameId[i];
            byName.set(id, (byName.get(id) || 0) + 1);
        }
        const topNames = [...byName.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([id, count]) => ({ name: this.names[id], count }));
        const root = this.rootElement;
        const nsList = [];
        const seen = new Set();
        for (const d of this.nsDecls) {
            const key = d.prefix + '=' + d.uri;
            if (seen.has(key)) continue;
            seen.add(key);
            nsList.push({ prefix: d.prefix, uri: d.uri });
        }
        return {
            size: this.src.length,
            nodes: this.n - 1,
            elements: this.elementCount,
            textNodes: this.textNodeCount,
            comments: this.commentCount,
            cdata: this.cdataCount,
            processingInstructions: this.piCount,
            attributes: this.attrCount,
            maxDepth: this.maxDepth,
            distinctNames: this.names.length,
            distinctPaths: this.pathName.length - 1,
            rootName: root > 0 ? this.name(root) : '',
            rootLocalName: root > 0 ? this.localName(root) : '',
            rootNamespace: root > 0 ? this.namespaceUri(root) : '',
            topNames,
            namespaces: nsList,
        };
    }
}

/**
 * Толерантный разбор XML в XmlDoc.
 * @param {string} src
 * @param {{onProgress?:(ratio:number)=>void, signal?:AbortSignal, budgetMs?:number, sync?:boolean}} [opts]
 * @returns {Promise<XmlDoc>}
 */
export async function parseXml(src, opts = {}) {
    const text = typeof src === 'string' ? src : String(src ?? '');
    const doc = new XmlDoc(text);
    const { onProgress, signal, budgetMs = 14, sync = false } = opts;
    const len = text.length;

    let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    if (len > 200000) doc._allocate(Math.min(Math.max(1024, len >> 6), 4_000_000));

    // Стек открытых элементов (индекс 0 — документ) и «последний ребёнок» каждого уровня
    const MAXD = XML_LIMITS.MAX_DEPTH + 2;
    const stack = new Int32Array(MAXD);
    const lastOf = new Int32Array(MAXD);
    let sp = 0;
    stack[0] = 0;
    lastOf[0] = -1;

    // «Ожидающий» текстовый фрагмент текущего элемента
    let pTs = -1;
    let pTe = -1;
    let pCdata = false;

    let nodeLimitHit = false;
    let lastYield = nowMs();
    let tokenTick = 0;
    let rootSeen = 0;
    let stray = false;
    const errCount = { n: 0 };

    const addError = (message, offset) => {
        errCount.n++;
        if (doc.errors.length < XML_LIMITS.MAX_ERRORS) doc.errors.push({ message, offset });
    };

    const ensureNode = () => {
        if (doc.n >= doc.cap) doc._allocate(Math.min(doc.cap * 2, XML_LIMITS.MAX_NODES + 16));
    };

    const link = (parentIdx, id) => {
        const l = lastOf[parentIdx];
        if (l === -1) doc.first[stack[parentIdx]] = id;
        else doc.next[l] = id;
        lastOf[parentIdx] = id;
    };

    const newNode = (kind, positionOffset, nameId) => {
        ensureNode();
        const id = doc.n++;
        doc.kind[id] = kind;
        doc.flags[id] = 0;
        doc.parent[id] = stack[sp];
        doc.first[id] = -1;
        doc.next[id] = -1;
        doc.nameId[id] = nameId;
        doc.pos[id] = positionOffset;
        doc.ts[id] = -1;
        doc.te[id] = -1;
        doc.aStart[id] = 0;
        doc.aCnt[id] = 0;
        doc.depth[id] = sp;
        doc.sub[id] = 0;
        doc.pathId[id] = 0;
        link(sp, id);
        return id;
    };

    const flushPendingAsNode = () => {
        if (pTs < 0) return;
        const id = newNode(pCdata ? NODE_KIND.CDATA : NODE_KIND.TEXT, pTs, -1);
        doc.ts[id] = pTs;
        doc.te[id] = pTe;
        if (pCdata) doc.cdataCount++;
        else doc.textNodeCount++;
        doc.textBytes += pTe - pTs;
        pTs = -1;
        pTe = -1;
        pCdata = false;
    };

    const hasNonWs = (a, b) => {
        for (let k = a; k < b; k++) {
            if (!isWs(text.charCodeAt(k))) return true;
        }
        return false;
    };

    const setPending = (a, b, cdata) => {
        if (pTs >= 0) flushPendingAsNode();
        pTs = a;
        pTe = b;
        pCdata = cdata;
    };

    const pushPathStats = (id, pathIdx) => {
        // вызывается при закрытии элемента: учёт «есть текст/есть дети»
        if (doc.ts[id] >= 0 && doc.te[id] > doc.ts[id]) doc.pathText[pathIdx]++;
        if (doc.first[id] >= 0) doc.pathKids[pathIdx]++;
    };

    const finalizeTop = () => {
        // закрыть текущий элемент: итоговый текст, размер поддерева
        const id = stack[sp];
        if (pTs >= 0) {
            if (doc.first[id] < 0) {
                doc.ts[id] = pTs;
                doc.te[id] = pTe;
                if (pCdata) doc.flags[id] |= FLAG_INLINE_CDATA;
                doc.textBytes += pTe - pTs;
                pTs = -1;
                pTe = -1;
                pCdata = false;
            } else {
                flushPendingAsNode();
            }
        }
        doc.sub[id] = doc.n - 1 - id;
        pushPathStats(id, doc.pathId[id]);
        sp--;
    };

    const handleText = (a, b) => {
        if (b <= a) return;
        if (sp === 0) {
            if (!stray && hasNonWs(a, b)) {
                stray = true;
                addError('Текст вне корневого элемента', a);
            }
            return;
        }
        if (hasNonWs(a, b)) setPending(a, b, false);
    };

    const addLeafNode = (kind, a, b, posOffset) => {
        if (pTs >= 0) flushPendingAsNode();
        const id = newNode(kind, posOffset, -1);
        doc.ts[id] = a;
        doc.te[id] = b;
        return id;
    };

    const skipDoctype = (lt) => {
        let j = lt + 9;
        let bracket = 0;
        while (j < len) {
            const c = text.charCodeAt(j);
            if (c === 34 || c === 39) {
                const e = text.indexOf(String.fromCharCode(c), j + 1);
                j = e < 0 ? len : e + 1;
                continue;
            }
            if (c === 60 && bracket > 0 && text.startsWith('<!--', j)) {
                const e = text.indexOf('-->', j + 4);
                j = e < 0 ? len : e + 3;
                continue;
            }
            if (c === 91) bracket++;
            else if (c === 93) bracket = Math.max(0, bracket - 1);
            else if (c === 62 && bracket === 0) return j + 1;
            j++;
        }
        return len;
    };

    const addAttr = (nameId, vs, ve) => {
        if (!doc.aName) doc._allocAttrs(Math.max(1024, len >> 5));
        if (doc.attrTotal >= doc.attrCap) doc._allocAttrs(doc.attrCap * 2);
        const k = doc.attrTotal++;
        doc.aName[k] = nameId;
        doc.aVs[k] = vs;
        doc.aVe[k] = ve;
        return k;
    };

    let aborted = false;

    mainLoop: while (i < len) {
        if ((++tokenTick & 255) === 0 && !sync) {
            if (nowMs() - lastYield > budgetMs) {
                if (onProgress) onProgress(i / len);
                await yieldToUi();
                lastYield = nowMs();
                if (signal && signal.aborted) {
                    aborted = true;
                    break;
                }
            }
        }
        if (doc.n >= XML_LIMITS.MAX_NODES) {
            nodeLimitHit = true;
            break;
        }

        const lt = text.indexOf('<', i);
        if (lt === -1) {
            handleText(i, len);
            i = len;
            break;
        }
        if (lt > i) handleText(i, lt);

        const c1 = text.charCodeAt(lt + 1);

        if (c1 === 33) {
            // <! ...
            if (text.startsWith('<!--', lt)) {
                const end = text.indexOf('-->', lt + 4);
                if (end < 0) {
                    addError('Не закрыт комментарий', lt);
                    addLeafNode(NODE_KIND.COMMENT, lt + 4, len, lt);
                    doc.commentCount++;
                    i = len;
                } else {
                    addLeafNode(NODE_KIND.COMMENT, lt + 4, end, lt);
                    doc.commentCount++;
                    i = end + 3;
                }
            } else if (text.startsWith('<![CDATA[', lt)) {
                const end = text.indexOf(']]>', lt + 9);
                const cEnd = end < 0 ? len : end;
                if (end < 0) addError('Не закрыт раздел CDATA', lt);
                if (sp === 0) {
                    addError('CDATA вне корневого элемента', lt);
                } else if (cEnd > lt + 9) {
                    setPending(lt + 9, cEnd, true);
                }
                i = end < 0 ? len : end + 3;
            } else if (text.startsWith('<!DOCTYPE', lt) || text.startsWith('<!doctype', lt)) {
                const end = skipDoctype(lt);
                const dtText = text.slice(lt, Math.min(end, lt + 20000));
                const entities = (dtText.match(/<!ENTITY/g) || []).length;
                const external = /<!ENTITY\s+(?:%\s+)?[^\s>]+\s+(?:SYSTEM|PUBLIC)\b/i.test(dtText);
                doc.doctype = { text: dtText, entities, externalEntities: external, truncated: end - lt > 20000, start: lt, end };
                i = end;
            } else {
                const end = text.indexOf('>', lt);
                addError('Неизвестная конструкция <!…>', lt);
                i = end < 0 ? len : end + 1;
            }
            continue;
        }

        if (c1 === 63) {
            // <? ... ?>
            const end = text.indexOf('?>', lt + 2);
            const body = text.slice(lt + 2, end < 0 ? len : end);
            if (end < 0) addError('Не закрыта инструкция обработки <?…?>', lt);
            if (/^xml(\s|$)/i.test(body) && sp === 0 && doc.n === 1 && !doc.decl) {
                const ver = body.match(/version\s*=\s*["']([^"']*)["']/i);
                const enc = body.match(/encoding\s*=\s*["']([^"']*)["']/i);
                const sa = body.match(/standalone\s*=\s*["']([^"']*)["']/i);
                doc.decl = { version: ver ? ver[1] : '', encoding: enc ? enc[1] : '', standalone: sa ? sa[1] : '' };
            } else {
                addLeafNode(NODE_KIND.PI, lt + 2, end < 0 ? len : end, lt);
                doc.piCount++;
            }
            i = end < 0 ? len : end + 2;
            continue;
        }

        if (c1 === 47) {
            // </name>
            const gt = text.indexOf('>', lt + 2);
            const endName = text.slice(lt + 2, gt < 0 ? len : gt).trim();
            if (gt < 0) addError('Не закрыт закрывающий тег', lt);
            const id = doc.nameMap.get(endName);
            if (sp > 0 && id !== undefined && doc.nameId[stack[sp]] === id) {
                finalizeTop();
            } else {
                let k = -1;
                if (id !== undefined) {
                    for (let q = sp - 1; q > 0; q--) {
                        if (doc.nameId[stack[q]] === id) {
                            k = q;
                            break;
                        }
                    }
                }
                if (k > 0) {
                    addError(
                        `Закрывающий тег </${endName}> не совпадает с открытым <${doc.name(stack[sp])}>`,
                        lt,
                    );
                    while (sp >= k) finalizeTop();
                } else {
                    addError(`Лишний закрывающий тег </${endName}>`, lt);
                }
            }
            i = gt < 0 ? len : gt + 1;
            continue;
        }

        if (isNameStartChar(c1)) {
            // <name attrs... > или />
            let j = lt + 1;
            while (j < len) {
                const c = text.charCodeAt(j);
                if (isWs(c) || c === 47 || c === 62) break;
                j++;
            }
            const tagName = text.slice(lt + 1, j);
            const nId = doc.internName(tagName);

            if (sp === 0) {
                rootSeen++;
                if (rootSeen === 2) addError('Несколько корневых элементов в документе', lt);
            }
            if (pTs >= 0) flushPendingAsNode();
            if (sp + 1 >= MAXD - 1) {
                addError(`Превышена допустимая вложенность (${XML_LIMITS.MAX_DEPTH})`, lt);
                doc.truncated = 'depth';
                i = len;
                break;
            }

            const id = newNode(NODE_KIND.ELEMENT, lt, nId);
            doc.elementCount++;
            if (doc.rootElement < 0) doc.rootElement = id;

            // атрибуты
            let selfClose = false;
            let attrN = 0;
            const aFirst = doc.attrTotal || 0;
            let broken = false;
            while (j < len) {
                let c = text.charCodeAt(j);
                while (isWs(c)) c = text.charCodeAt(++j);
                if (j >= len) {
                    broken = true;
                    break;
                }
                if (c === 62) {
                    j++;
                    break;
                }
                if (c === 47) {
                    if (text.charCodeAt(j + 1) === 62) {
                        selfClose = true;
                        j += 2;
                        break;
                    }
                    j++;
                    continue;
                }
                // имя атрибута
                const as = j;
                while (j < len) {
                    c = text.charCodeAt(j);
                    if (isWs(c) || c === 61 || c === 62 || c === 47) break;
                    j++;
                }
                if (j === as) {
                    // странный символ — пропускаем
                    j++;
                    continue;
                }
                const aName = text.slice(as, j);
                while (isWs(text.charCodeAt(j))) j++;
                let vs = j;
                let ve = j;
                if (text.charCodeAt(j) === 61) {
                    j++;
                    while (isWs(text.charCodeAt(j))) j++;
                    const q = text.charCodeAt(j);
                    if (q === 34 || q === 39) {
                        const e = text.indexOf(String.fromCharCode(q), j + 1);
                        if (e < 0) {
                            addError(`Не закрыта кавычка у атрибута ${aName}`, j);
                            vs = j + 1;
                            ve = len;
                            j = len;
                            broken = true;
                        } else {
                            vs = j + 1;
                            ve = e;
                            j = e + 1;
                        }
                    } else {
                        vs = j;
                        while (j < len) {
                            c = text.charCodeAt(j);
                            if (isWs(c) || c === 62) break;
                            if (c === 47 && text.charCodeAt(j + 1) === 62) break;
                            j++;
                        }
                        ve = j;
                        addError(`Значение атрибута ${aName} без кавычек`, vs);
                    }
                } else {
                    addError(`Атрибут ${aName} без значения`, as);
                }
                const aId = doc.internName(aName);
                addAttr(aId, vs, ve);
                attrN++;
                if (aName.charCodeAt(0) === 120 && (aName === 'xmlns' || aName.startsWith('xmlns:'))) {
                    if (doc.nsDecls.length < XML_LIMITS.MAX_NS_DECLS) {
                        doc.nsDecls.push({
                            node: id,
                            prefix: aName === 'xmlns' ? '' : aName.slice(6),
                            uri: decodeXmlEntities(text.slice(vs, ve)),
                        });
                    }
                }
            }
            doc.aStart[id] = aFirst;
            doc.aCnt[id] = Math.min(attrN, 65535);
            doc.attrCount += attrN;

            // путь-трие
            const parentPath = sp === 0 ? 0 : doc.pathId[stack[sp]];
            const pk = parentPath * 4194304 + nId;
            let pi = doc.pathMap.get(pk);
            if (pi === undefined) {
                if (doc.pathName.length < XML_LIMITS.MAX_PATHS) {
                    pi = doc.pathName.length;
                    doc.pathMap.set(pk, pi);
                    doc.pathParent.push(parentPath);
                    doc.pathName.push(nId);
                    doc.pathCount.push(0);
                    doc.pathText.push(0);
                    doc.pathKids.push(0);
                    doc.pathAttrs.push(null);
                } else {
                    pi = parentPath; // слишком много путей: учитываем в родительском
                }
            }
            doc.pathId[id] = pi;
            doc.pathCount[pi]++;
            if (attrN > 0 && doc.pathCount[pi] <= 40) {
                let set = doc.pathAttrs[pi];
                if (!set) set = doc.pathAttrs[pi] = new Set();
                for (let k = 0; k < attrN && set.size < 60; k++) {
                    set.add(doc.names[doc.aName[aFirst + k]]);
                }
            }

            if (selfClose) {
                doc.flags[id] |= FLAG_SELF_CLOSING;
                doc.sub[id] = 0;
                if (sp + 1 > doc.maxDepth) doc.maxDepth = sp + 1;
            } else {
                sp++;
                stack[sp] = id;
                lastOf[sp] = -1;
                if (sp > doc.maxDepth) doc.maxDepth = sp;
            }
            if (broken) {
                addError(`Не закрыт тег <${tagName}> (обрыв в атрибутах)`, lt);
            }
            i = j;
            continue;
        }

        // «<» не открывает конструкцию — трактуем как текст
        addError('Недопустимый символ «<» в тексте', lt);
        if (sp > 0) setPending(lt, lt + 1, false);
        i = lt + 1;
    }

    // закрыть всё, что осталось открытым
    if (!aborted) {
        if (sp > 0 && !nodeLimitHit && doc.truncated !== 'depth') {
            addError(`Документ оборван: не закрыт тег <${doc.name(stack[sp])}>`, len);
        }
        while (sp > 0) finalizeTop();
    } else {
        while (sp > 0) finalizeTop();
    }
    // sub для документа
    doc.sub[0] = doc.n - 1;

    if (nodeLimitHit) {
        doc.truncated = 'nodes';
        addError(
            `Достигнут предел числа узлов (${XML_LIMITS.MAX_NODES.toLocaleString('ru-RU')}): остальная часть документа не загружена`,
            i,
        );
    }
    if (doc.rootElement < 0 && len > 0) addError('В документе нет корневого элемента', 0);
    if (errCount.n > doc.errors.length) {
        doc.errorsSuppressed = errCount.n - doc.errors.length;
    }
    if (doc.doctype) {
        const d = doc.doctype;
        if (d.entities > 0) {
            doc.warnings.push(
                `Документ содержит объявление DTD (сущностей: ${d.entities}${d.externalEntities ? ', в том числе внешние' : ''}). Пользовательские сущности не раскрываются — это защищает от XXE и «бомб» из сущностей.`,
            );
        } else {
            doc.warnings.push('Документ содержит объявление DOCTYPE; оно проигнорировано.');
        }
    }
    if (onProgress) onProgress(1);
    if (!doc.aName) doc._allocAttrs(8);
    return doc;
}

// ---------------------------------------------------------------------------
// Поиск
// ---------------------------------------------------------------------------

/**
 * Поиск по тегам, атрибутам и значениям. Выполняется порциями с отдачей управления UI.
 * @param {XmlDoc} doc
 * @param {string} query
 * @param {{names?:boolean, attrs?:boolean, values?:boolean, caseSensitive?:boolean, limit?:number, signal?:AbortSignal, onProgress?:(r:number)=>void, sync?:boolean}} [opts]
 * @returns {Promise<{ids:number[], truncated:boolean, cancelled:boolean}>}
 */
export async function searchDoc(doc, query, opts = {}) {
    const q0 = String(query ?? '');
    if (!q0) return { ids: [], truncated: false, cancelled: false };
    const {
        names = true,
        attrs = true,
        values = true,
        caseSensitive = false,
        limit = 20000,
        signal,
        onProgress,
        sync = false,
    } = opts;
    const norm = (s) => (caseSensitive ? s : s.toLowerCase());
    const q = norm(q0);
    const ids = [];

    // быстрый отсев: если подстроки нет в исходном тексте и запрос не содержит спецсимволов — совпадений нет
    if (!/[&<>"']/.test(q0)) {
        const hay = caseSensitive ? doc.src : doc.src.length < 8_000_000 ? doc.src.toLowerCase() : null;
        if (hay !== null) {
            if (hay.indexOf(q) === -1) return { ids, truncated: false, cancelled: false };
        } else {
            const re = new RegExp(q0.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            if (!re.test(doc.src)) return { ids, truncated: false, cancelled: false };
        }
    }

    // таблица совпадений имён
    const nameHit = new Uint8Array(doc.names.length);
    for (let k = 0; k < doc.names.length; k++) {
        if (norm(doc.names[k]).includes(q)) nameHit[k] = 1;
    }

    const src = doc.src;
    const total = doc.n;
    let lastYield = nowMs();
    let truncated = false;
    for (let n = 1; n < total; n++) {
        if ((n & 1023) === 0 && !sync && nowMs() - lastYield > 14) {
            if (onProgress) onProgress(n / total);
            await yieldToUi();
            lastYield = nowMs();
            if (signal && signal.aborted) return { ids, truncated, cancelled: true };
        }
        const k = doc.kind[n];
        let hit = false;
        if (k === NODE_KIND.ELEMENT) {
            if (names && nameHit[doc.nameId[n]]) hit = true;
            if (!hit && attrs && doc.aCnt[n]) {
                const s = doc.aStart[n];
                const c = doc.aCnt[n];
                for (let a = 0; a < c; a++) {
                    const idx = s + a;
                    if (nameHit[doc.aName[idx]]) {
                        hit = true;
                        break;
                    }
                    const raw = src.slice(doc.aVs[idx], doc.aVe[idx]);
                    if (
                        norm(raw).includes(q) ||
                        (raw.indexOf('&') >= 0 && norm(decodeXmlEntities(raw)).includes(q))
                    ) {
                        hit = true;
                        break;
                    }
                }
            }
            if (!hit && values && doc.ts[n] >= 0) {
                const raw = src.slice(doc.ts[n], doc.te[n]);
                if (norm(raw).includes(q) || (raw.indexOf('&') >= 0 && norm(decodeXmlEntities(raw)).includes(q))) {
                    hit = true;
                }
            }
        } else if (values && doc.ts[n] >= 0) {
            const raw = src.slice(doc.ts[n], doc.te[n]);
            if (norm(raw).includes(q) || (raw.indexOf('&') >= 0 && norm(decodeXmlEntities(raw)).includes(q))) {
                hit = true;
            }
        }
        if (hit) {
            ids.push(n);
            if (ids.length >= limit) {
                truncated = n < total - 1;
                break;
            }
        }
    }
    if (onProgress) onProgress(1);
    return { ids, truncated, cancelled: false };
}

/**
 * Описывает, где именно совпал запрос в узле (для подсветки).
 * @returns {{name:boolean, attrs:number[], value:boolean}}
 */
export function describeMatch(doc, n, query, caseSensitive = false) {
    const norm = (s) => (caseSensitive ? s : s.toLowerCase());
    const q = norm(String(query ?? ''));
    const out = { name: false, attrs: [], value: false };
    if (!q) return out;
    if (doc.kind[n] === NODE_KIND.ELEMENT) {
        out.name = norm(doc.name(n)).includes(q);
        const c = doc.aCnt[n];
        const s = doc.aStart[n];
        for (let a = 0; a < c; a++) {
            const idx = s + a;
            const nm = doc.names[doc.aName[idx]];
            const v = decodeXmlEntities(doc.src.slice(doc.aVs[idx], doc.aVe[idx]));
            if (norm(nm).includes(q) || norm(v).includes(q)) out.attrs.push(a);
        }
    }
    if (doc.ts[n] >= 0) {
        out.value = norm(doc.ownTextRaw(n)).includes(q);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Сериализация и экспорт
// ---------------------------------------------------------------------------

export function escapeXmlText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeXmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/**
 * Красиво сериализует поддерево в XML-текст (итеративно). Обрезает по maxChars.
 * @returns {{text:string, truncated:boolean}}
 */
export function serializeNode(doc, root, { indent = '  ', maxChars = 2_000_000, maxDepth = 400 } = {}) {
    const out = [];
    let size = 0;
    let truncated = false;
    const push = (s) => {
        out.push(s);
        size += s.length;
        if (size > maxChars) truncated = true;
    };
    // явный стек: {node, state: 0 открыть | 1 закрыть}
    const st = [{ n: root, close: false, level: 0 }];
    const startLevel = 0;
    while (st.length && !truncated) {
        const { n, close, level } = st.pop();
        const pad = indent.repeat(Math.min(level, maxDepth) + startLevel);
        if (close) {
            push(pad + '</' + doc.name(n) + '>\n');
            continue;
        }
        const k = doc.kind[n];
        if (k === NODE_KIND.DOCUMENT) {
            const kids = doc.children(n);
            for (let q = kids.length - 1; q >= 0; q--) st.push({ n: kids[q], close: false, level });
            continue;
        }
        if (k === NODE_KIND.ELEMENT) {
            let head = pad + '<' + doc.name(n);
            for (const a of doc.attrs(n)) head += ' ' + a.name + '="' + escapeXmlAttr(a.value) + '"';
            const hasKids = doc.first[n] >= 0;
            const own = doc.ownText(n);
            if (!hasKids && !own) {
                push(head + '/>\n');
            } else if (!hasKids) {
                const isC = (doc.flags[n] & FLAG_INLINE_CDATA) !== 0;
                push(head + '>' + (isC ? '<![CDATA[' + own + ']]>' : escapeXmlText(own)) + '</' + doc.name(n) + '>\n');
            } else {
                push(head + '>\n');
                st.push({ n, close: true, level });
                const kids = doc.children(n);
                for (let q = kids.length - 1; q >= 0; q--) st.push({ n: kids[q], close: false, level: level + 1 });
            }
        } else if (k === NODE_KIND.TEXT) {
            push(pad + escapeXmlText(doc.ownText(n)) + '\n');
        } else if (k === NODE_KIND.CDATA) {
            push(pad + '<![CDATA[' + doc.ownRaw(n) + ']]>\n');
        } else if (k === NODE_KIND.COMMENT) {
            push(pad + '<!--' + doc.ownRaw(n) + '-->\n');
        } else if (k === NODE_KIND.PI) {
            push(pad + '<?' + doc.ownRaw(n) + '?>\n');
        }
    }
    let text = out.join('');
    if (truncated) text = text.slice(0, maxChars) + '\n… (обрезано)';
    return { text, truncated };
}

/**
 * Преобразует XML-узел в JSON-значение:
 * {"@атрибут":"…", "#text":"…", "Дочерний": {...} | [{...}, {...}]}
 */
export function nodeToJson(doc, n, { maxDepth = 120, maxNodes = 500000 } = {}) {
    let budget = maxNodes;
    const conv = (node, depth) => {
        budget--;
        const obj = {};
        for (const a of doc.attrs(node)) obj['@' + a.name] = a.value;
        const kids = [];
        for (let c = doc.first[node]; c >= 0; c = doc.next[c]) kids.push(c);
        const own = doc.ownText(node);
        if (!kids.length) {
            if (!Object.keys(obj).length) return own;
            if (own) obj['#text'] = own;
            return obj;
        }
        if (own) obj['#text'] = own;
        if (depth >= maxDepth || budget <= 0) {
            obj['…'] = 'обрезано';
            return obj;
        }
        for (const c of kids) {
            if (budget <= 0) break;
            const k = doc.kind[c];
            if (k === NODE_KIND.ELEMENT) {
                const nm = doc.name(c);
                const v = conv(c, depth + 1);
                if (Object.prototype.hasOwnProperty.call(obj, nm)) {
                    if (!Array.isArray(obj[nm])) obj[nm] = [obj[nm]];
                    obj[nm].push(v);
                } else {
                    obj[nm] = v;
                }
            } else if (k === NODE_KIND.TEXT || k === NODE_KIND.CDATA) {
                const t = doc.ownText(c);
                if (t) obj['#text'] = obj['#text'] ? obj['#text'] + ' ' + t : t;
            }
        }
        return obj;
    };
    if (n === 0) {
        const r = doc.rootElement;
        if (r < 0) return null;
        return { [doc.name(r)]: conv(r, 0) };
    }
    return { [doc.name(n)]: conv(n, 0) };
}

// ---------------------------------------------------------------------------
// JSON → XML (чтобы общий просмотрщик мог показать и JSON, например лог СЭДО)
// ---------------------------------------------------------------------------

function safeXmlName(key) {
    let s = String(key).replace(/[^\p{L}\p{N}_.-]/gu, '_');
    if (!s || !/^[\p{L}_]/u.test(s)) s = '_' + s;
    return s;
}

/**
 * Строит XML-строку из JSON-значения. Ключ-исходник сохраняется в атрибуте key, если имя пришлось изменить.
 */
export function jsonToXmlString(value, rootName = 'json', { maxNodes = 2_000_000 } = {}) {
    const out = [];
    let budget = maxNodes;
    const stack = [{ name: rootName, value, close: false }];
    while (stack.length && budget > 0) {
        const it = stack.pop();
        if (it.close) {
            out.push('</' + it.name + '>');
            continue;
        }
        budget--;
        const v = it.value;
        const nm = safeXmlName(it.name);
        const keyAttr = nm !== it.name ? ' key="' + escapeXmlAttr(it.name) + '"' : '';
        if (v === null || v === undefined) {
            out.push('<' + nm + keyAttr + ' null="true"/>');
        } else if (Array.isArray(v)) {
            if (!v.length) {
                out.push('<' + nm + keyAttr + ' type="array"/>');
                continue;
            }
            out.push('<' + nm + keyAttr + ' type="array">');
            stack.push({ name: nm, close: true });
            for (let q = v.length - 1; q >= 0; q--) stack.push({ name: 'item', value: v[q], close: false });
        } else if (typeof v === 'object') {
            const keys = Object.keys(v);
            if (!keys.length) {
                out.push('<' + nm + keyAttr + ' type="object"/>');
                continue;
            }
            out.push('<' + nm + keyAttr + '>');
            stack.push({ name: nm, close: true });
            for (let q = keys.length - 1; q >= 0; q--) stack.push({ name: keys[q], value: v[keys[q]], close: false });
        } else {
            const t = typeof v === 'string' ? v : String(v);
            out.push(
                '<' + nm + keyAttr + (typeof v !== 'string' ? ' type="' + typeof v + '"' : '') + '>' +
                    escapeXmlText(t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')) + '</' + nm + '>',
            );
        }
    }
    return out.join('');
}
