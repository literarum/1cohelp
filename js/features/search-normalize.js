'use strict';

/**
 * Нормализация текста для поиска и индексации.
 * Rule-based стеммер для русского и базовый для английского — одна форма при индексации и запросе.
 */

const MIN_STEM_LEN = 2;

/** Русские суффиксы для снятия (длинные первыми) */
const RU_SUFFIXES = [
    'изация',
    'тельность',
    'ственный',
    'ами',
    'ями',
    'ение',
    'ание',
    'ость',
    'овая',
    'емый',
    'ние',
    'тель',
    'ный',
    'ная',
    'ное',
    'ные',
    'ая',
    'ый',
    'ий',
    'ое',
    'ие',
    'ов',
    'ев',
    'ам',
    'ем',
    'им',
    'ом',
    'ах',
    'ях',
    'ы',
    'и',
    'а',
    'я',
    'о',
    'е',
    'у',
    'ю',
    'ь',
];

/** Базовые английские суффиксы */
const EN_SUFFIXES = [
    'izing',
    'ation',
    'ement',
    'ness',
    'able',
    'ible',
    'ing',
    'ed',
    'er',
    'es',
    's',
];

/**
 * Проверяет, что строка похожа на кириллицу (русское слово).
 */
function isCyrillic(word) {
    return /[а-яё]/i.test(word);
}

/**
 * Стеммирует одно слово (русский — снятие окончаний, английский — базовое).
 * @param {string} word — слово в нижнем регистре, ё уже заменено на е
 * @returns {string} основа слова, не короче MIN_STEM_LEN
 */
export function stemWord(word) {
    if (!word || typeof word !== 'string') return '';
    const w = word.trim().toLowerCase().replace(/ё/g, 'е');
    if (w.length <= MIN_STEM_LEN) return w;

    if (isCyrillic(w)) {
        let stem = w;
        let changed = true;
        while (changed && stem.length > MIN_STEM_LEN) {
            changed = false;
            for (const suf of RU_SUFFIXES) {
                if (suf.length >= stem.length) continue;
                if (stem.endsWith(suf)) {
                    stem = stem.slice(0, -suf.length);
                    changed = true;
                    break;
                }
            }
        }
        return stem.length >= MIN_STEM_LEN ? stem : w;
    }

    // Краткий английский стемминг
    if (/^[a-z0-9]+$/.test(w)) {
        let stem = w;
        for (const suf of EN_SUFFIXES) {
            if (stem.length <= 4) break;
            if (suf.length < stem.length && stem.endsWith(suf)) {
                stem = stem.slice(0, -suf.length);
                break;
            }
        }
        return stem.length >= MIN_STEM_LEN ? stem : w;
    }

    return w;
}

/**
 * Нормализует строку для индексации: нижний регистр, ё→е, без лишних символов.
 * @param {string} text
 * @returns {string}
 */
export function normalizeTextForIndex(text) {
    if (typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9\s]/g, (c) => (c === '-' || c === '_' ? c : ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Токены для индексации: нормализованные слова (стеммы) + префиксы стеммов.
 * Используется при построении индекса и при поиске, чтобы запрос и индекс совпадали.
 * @param {string} text
 * @param {{ minTokenLen?: number, minPrefixLen?: number, maxPrefixLen?: number }} opts
 * @returns {string[]} уникальные токены (стеммы и префиксы)
 */
export function tokenizeNormalized(text, opts = {}) {
    const minTokenLen = opts.minTokenLen ?? 2;
    const minPrefixLen = opts.minPrefixLen ?? 2;
    const maxPrefixLen = opts.maxPrefixLen ?? 8;

    if (!text || typeof text !== 'string') return [];
    const normalized = normalizeTextForIndex(text);
    const words = normalized.split(/\s+/).filter((w) => w.length > 0);
    const tokens = new Set();

    function addStemAndPrefixes(str, set) {
        const stem = stemWord(str);
        if (stem.length >= minTokenLen) {
            set.add(stem);
            const maxPrefix = Math.min(stem.length, maxPrefixLen);
            for (let i = minPrefixLen; i <= maxPrefix; i++) {
                set.add(stem.substring(0, i));
            }
        }
    }

    words.forEach((word) => {
        if (word.length >= minTokenLen) {
            addStemAndPrefixes(word, tokens);
        }
        const parts = word.split(/[-_]/);
        if (parts.length > 1) {
            parts.forEach((part) => {
                if (part.length >= minTokenLen) {
                    addStemAndPrefixes(part, tokens);
                }
            });
        }
    });

    return Array.from(tokens);
}

/**
 * Короткие токены, допустимые в запросе к индексу (точный ключ, без префиксного скана).
 * Совпадает с исключениями в search.js / палитре команд.
 */
const RETRIEVAL_SHORT_TOKEN_EXCEPTIONS = new Set([
    '1с',
    '1c',
    'сф',
    'фн',
    'фс',
    'ск',
    'эц',
    'пф',
    'иф',
    'инн',
]);

const MIN_RETRIEVAL_TOKEN_LEN = 4;

/**
 * Допускается ли токен для обращения к searchIndex (префиксный диапазон или точный get).
 */
export function isRetrievalQueryTokenAllowed(token) {
    if (!token || typeof token !== 'string') return false;
    if (token.length >= MIN_RETRIEVAL_TOKEN_LEN) return true;
    return RETRIEVAL_SHORT_TOKEN_EXCEPTIONS.has(token);
}

/**
 * Токены для обхода searchIndex по строке запроса (после sanitize).
 * Важно: только стеммы слов запроса (без префиксов 2–8 символов из tokenizeNormalized).
 * Иначе короткие префиксы + IDBKeyRange дают лавину нерелевантных кандидатов (OR по всем токенам).
 *
 * Чисто цифровой запрос не раскладываем на префиксы 77, 770, 7707, … — иначе
 * IDBKeyRange.bound('77','77\uffff') перебирает лавину ключей и поиск не доходит до подсказок по ИНН.
 * @param {string} query
 * @returns {string[]}
 */
export function indexQueryTokensFromUserQuery(query) {
    if (typeof query !== 'string') return [];
    const q = query.trim();
    if (!q) return [];
    if (/^\d+$/.test(q)) {
        if (q.length <= 4) return [];
        return [q];
    }

    const normalized = normalizeTextForIndex(q);
    const words = normalized.split(/\s+/).filter((w) => w.length > 0);
    const stems = new Set();

    for (const word of words) {
        if (/^\d+$/.test(word)) {
            if (word.length >= 5) stems.add(word);
            continue;
        }
        if (word.length < 3 && !RETRIEVAL_SHORT_TOKEN_EXCEPTIONS.has(word)) {
            continue;
        }

        const stem = stemWord(word);
        /** Для коротких слов (ИНН, аббревиатуры) берём форму слова, если стем слишком общий */
        const token =
            stem.length >= MIN_RETRIEVAL_TOKEN_LEN
                ? stem
                : word.length <= 4 && word.length >= 2
                  ? word
                  : stem;

        if (!isRetrievalQueryTokenAllowed(token)) continue;
        stems.add(token);

        const parts = word.split(/[-_]/);
        if (parts.length > 1) {
            for (const part of parts) {
                if (part.length < 2) continue;
                if (/^\d+$/.test(part)) {
                    if (part.length >= 5) stems.add(part);
                    continue;
                }
                const st = stemWord(part);
                const partTok =
                    st.length >= MIN_RETRIEVAL_TOKEN_LEN
                        ? st
                        : part.length <= 4 && part.length >= 2
                          ? part
                          : st;
                if (isRetrievalQueryTokenAllowed(partTok)) stems.add(partTok);
            }
        }
    }

    return Array.from(stems);
}

/** Символы для подстановки при генерации вариантов с опечаткой (Левенштейн 1) */
const TYPO_SUBSTITUTE_CHARS = 'аеоиуыэяёйь';

/**
 * Генерирует до maxVariants вариантов токена с расстоянием Левенштейна 1 (одна замена символа).
 * Используется для мягкого поиска при малом числе результатов.
 * @param {string} token — нормализованный токен (нижний регистр, без ё)
 * @param {number} maxVariants — максимум вариантов
 * @returns {string[]}
 */
export function suggestTokenVariants(token, maxVariants = 2) {
    if (!token || token.length < 3 || token.length > 8) return [];
    const out = new Set();
    for (let i = 0; i < token.length && out.size < maxVariants; i++) {
        for (const c of TYPO_SUBSTITUTE_CHARS) {
            if (c === token[i]) continue;
            const v = token.slice(0, i) + c + token.slice(i + 1);
            out.add(v);
            if (out.size >= maxVariants) break;
        }
    }
    return Array.from(out).slice(0, maxVariants);
}
