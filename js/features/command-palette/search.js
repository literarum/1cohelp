'use strict';

import { getAlgorithmText } from '../../components/algorithms.js';
import { getSectionName } from '../../utils/helpers.js';
import {
    MAX_RESULTS,
    MIN_GLOBAL_SCORE,
    DOMAIN_SYNONYMS,
    CONTROLLING_AUTHORITIES,
    TABS,
    FILTER_PREFIX,
    TYPE_FILTER_MAP,
    TYPE_ORDER,
} from './constants.js';
import { getActionResults } from './actions.js';
import { getErrorDictionaryResults } from './errors.js';
import { getGlobalSearchResults } from '../search.js';

function normalizeText(s) {
    if (typeof s !== 'string') return '';
    return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Парсит ведущий фильтр типа из запроса (@действие, @вкладка и т.д.).
 * @param {string} query - сырой запрос
 * @returns {{ queryTrimmed: string, typeFilter: string|null }}
 */
function parseTypeFilter(query) {
    const raw = (query || '').trim();
    if (!raw.startsWith(FILTER_PREFIX)) {
        return { queryTrimmed: raw, typeFilter: null };
    }
    const after = raw.slice(FILTER_PREFIX.length).trim();
    const firstWord = after.split(/\s+/)[0] || '';
    const key = normalizeText(firstWord);
    const typeFilter = TYPE_FILTER_MAP[key] || null;
    const queryTrimmed = typeFilter ? after.slice(firstWord.length).trim() : raw;
    return { queryTrimmed: queryTrimmed || (typeFilter ? '' : raw), typeFilter };
}

function expandQueryWithSynonyms(query) {
    const words = normalizeText(query).split(/\s+/).filter(Boolean);
    const expanded = new Set(words);
    words.forEach((word) => {
        for (const [, variants] of Object.entries(DOMAIN_SYNONYMS)) {
            if (variants.some((v) => v === word || (word.length >= 2 && v.includes(word)))) {
                variants.forEach((v) => expanded.add(v));
            }
        }
    });
    return Array.from(expanded);
}

function getAlgorithmResults(query, algoMap) {
    if (!query || !algoMap) return [];
    const queryWords = expandQueryWithSynonyms(query);
    const raw = queryWords.map((w) => w.toLowerCase().replace(/ё/g, 'е'));
    const results = [];

    const sections = ['main', 'program', 'skzi', 'webReg', 'lk1c'];
    for (const section of sections) {
        const list =
            section === 'main' ? (algoMap.main ? [algoMap.main] : []) : algoMap[section] || [];
        if (!Array.isArray(list)) continue;
        for (const algo of list) {
            if (!algo || !algo.id) continue;
            const texts = getAlgorithmText({ ...algo, section });
            const combined = Object.values(texts).filter(Boolean).join(' ');
            let sc = 0;
            for (const w of raw) {
                if (combined.toLowerCase().includes(w)) sc += 1;
            }
            for (const [, variants] of Object.entries(DOMAIN_SYNONYMS)) {
                if (variants.some((v) => combined.toLowerCase().includes(v))) {
                    if (raw.some((r) => variants.includes(r))) sc += 0.3;
                }
            }
            if (sc > 0) {
                results.push({
                    id: `algorithm:${section}:${algo.id}`,
                    type: 'algorithm',
                    label: algo.title || 'Без названия',
                    subtitle: getSectionName(section),
                    score: sc,
                    payload: { algorithm: algo, section },
                });
            }
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

function getXmlReportResults(query) {
    const q = normalizeText(query);
    if (!q || q.length < 2) {
        return [];
    }
    const queryWords = expandQueryWithSynonyms(query);
    const raw = queryWords.map((w) => w.toLowerCase().replace(/ё/g, 'е'));
    const results = [];
    const xmlRelatedWords = ['xml', 'анализ', 'отчёт', 'отчет', 'анализатор'];
    const hasXmlIntent = raw.some((w) =>
        xmlRelatedWords.some((x) => w === x || x.includes(w) || (w.length >= 2 && w.includes(x))),
    );

    for (const auth of CONTROLLING_AUTHORITIES) {
        const labelNorm = normalizeText(auth.label);
        let sc = 0;
        for (const w of raw) {
            if (labelNorm.includes(w) || normalizeText(auth.key).includes(w)) sc += 1;
        }
        if (sc > 0) {
            results.push({
                id: `xml:${auth.key}`,
                type: 'xml_report',
                label: auth.label,
                subtitle: 'Открыть вкладку «Анализатор XML»',
                score: sc,
                payload: { tabId: 'xmlAnalyzer' },
            });
        }
    }
    // Показывать пункт «Анализатор XML» только при явном XML-запросе или при уже найденных отчётах по органам
    if (hasXmlIntent || results.length > 0) {
        results.push({
            id: 'xml:analyzer',
            type: 'xml_report',
            label: 'Анализатор XML',
            subtitle: 'Открыть вкладку «Анализатор XML»',
            score: hasXmlIntent ? 0.8 : 0.5,
            payload: { tabId: 'xmlAnalyzer' },
        });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

function getTabResults(query) {
    const q = normalizeText(query);
    if (!q) return [];
    const words = q.split(/\s+/).filter(Boolean);
    const results = [];
    for (const tab of TABS) {
        const labelNorm = normalizeText(tab.label);
        const synonymsNorm = tab.synonyms.map((s) => normalizeText(s));
        let sc = 0;
        for (const w of words) {
            if (labelNorm.includes(w) || synonymsNorm.some((s) => s.includes(w) || w.includes(s)))
                sc += 1;
        }
        if (sc > 0) {
            results.push({
                id: `tab:${tab.tabId}`,
                type: 'tab',
                label: tab.label,
                subtitle: 'Перейти на вкладку',
                score: sc,
                payload: { tabId: tab.tabId },
            });
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

function getErrorResults(query) {
    const q = normalizeText(query);
    if (!q || q.length < 2) return [];
    const queryWords = expandQueryWithSynonyms(query);
    const raw = queryWords.map((w) => w.toLowerCase().replace(/ё/g, 'е'));
    const results = [];
    for (const [key, variants] of Object.entries(DOMAIN_SYNONYMS)) {
        if (variants.some((v) => raw.includes(v) || raw.some((r) => v.includes(r)))) {
            const label =
                key === 'fns' ? 'ФНС / ИФНС / Налоговая' : key === 'sfr' ? 'СФР / ПФР / ФСС' : key;
            results.push({
                id: `error:synonym:${key}`,
                type: 'error',
                label: `Поиск по теме: ${label}`,
                subtitle: 'Открыть вкладку «Анализатор XML» для отчётов',
                score: 0.6,
                payload: { tabId: 'xmlAnalyzer' },
            });
        }
    }
    return results.slice(0, 5);
}

/**
 * Выполняет поиск по алгоритмам, XML‑отчётам и ошибкам.
 * @param {string} query - строка запроса
 * @param {object|null} algorithms - карта алгоритмов (из setCommandPaletteDependencies)
 * @returns {Array} массив результатов для отображения в палитре
 */
export function runSearch(query, algorithms) {
    const { queryTrimmed, typeFilter } = parseTypeFilter(query);
    const trimmed = queryTrimmed.trim();

    const algoResults =
        typeFilter === null || typeFilter === 'algorithm'
            ? getAlgorithmResults(trimmed, algorithms)
            : [];
    let tabResults = typeFilter === null || typeFilter === 'tab' ? getTabResults(trimmed) : [];
    if (typeFilter === 'tab' && tabResults.length === 0 && !trimmed) {
        tabResults = TABS.map((tab) => ({
            id: `tab:${tab.tabId}`,
            type: 'tab',
            label: tab.label,
            subtitle: 'Перейти на вкладку',
            score: 0.5,
            payload: { tabId: tab.tabId },
        }));
    }
    const xmlResults =
        typeFilter === null || typeFilter === 'xml_report' ? getXmlReportResults(trimmed) : [];
    const errorResults =
        typeFilter === null || typeFilter === 'error' ? getErrorResults(trimmed) : [];
    const errorDictResults =
        typeFilter === null || typeFilter === 'error' ? getErrorDictionaryResults(trimmed) : [];
    const actionResults =
        typeFilter === null || typeFilter === 'action' ? getActionResults(trimmed) : [];

    const combined = [
        ...algoResults,
        ...tabResults,
        ...xmlResults,
        ...errorResults,
        ...errorDictResults,
        ...actionResults,
    ];
    combined.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        const orderA = TYPE_ORDER[a.type] ?? 99;
        const orderB = TYPE_ORDER[b.type] ?? 99;
        return orderA - orderB;
    });
    return combined.slice(0, MAX_RESULTS);
}

/**
 * Преобразует результат глобального поиска в формат палитры команд.
 * @param {object} r - результат из getGlobalSearchResults
 * @returns {object} { id, type, label, subtitle, score, payload: { fullResult } }
 */
function mapGlobalResultToPalette(r) {
    if (!r || typeof r !== 'object') return null;
    let id;
    let type = r.type || 'record';
    let payload = { fullResult: r };
    if (r.type === 'algorithm' || r.type === 'main') {
        id = `algorithm:${r.section || 'main'}:${String(r.id)}`;
    } else if (r.type === 'section_link') {
        id = `tab:${r.section || ''}`;
        type = 'tab';
        payload = { tabId: r.section || '', fullResult: r };
    } else {
        id = `global:${r.type}:${r.section || ''}:${r.id}`;
    }
    return {
        id,
        type,
        label: r.title || `(${r.type} ${r.id})`,
        subtitle: r.description || '',
        score: typeof r.score === 'number' ? r.score : 0,
        payload,
    };
}

/**
 * Нормализованный ключ для дедупликации (алгоритм из палитры и из глобального поиска).
 */
function normalizedDedupKey(item) {
    if (item.type === 'algorithm' || item.type === 'main') {
        if (item.payload?.fullResult) {
            const r = item.payload.fullResult;
            return `algorithm:${String(r.section || 'main')}:${String(r.id)}`;
        }
        return typeof item.id === 'string' ? item.id : String(item.id);
    }
    if (item.type === 'tab') {
        return typeof item.id === 'string' ? item.id : String(item.id);
    }
    return item.id;
}

/**
 * Поиск с объединением результатов палитры и глобального поиска по индексу.
 * При пустом запросе возвращает только runSearch('', algorithms).
 * @param {string} query - строка запроса
 * @param {object|null} algorithms - карта алгоритмов
 * @returns {Promise<Array>} объединённый и отсортированный список результатов палитры
 */
const MIN_QUERY_LENGTH_FOR_GLOBAL = 3;

export async function runSearchWithGlobal(query, algorithms) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
        return runSearch('', algorithms);
    }

    const paletteResults = runSearch(query, algorithms);

    if (trimmed.length < MIN_QUERY_LENGTH_FOR_GLOBAL) {
        return paletteResults.slice(0, MAX_RESULTS);
    }

    const seenKeys = new Set(paletteResults.map(normalizedDedupKey));

    let globalResults = [];
    try {
        globalResults = await getGlobalSearchResults(trimmed);
    } catch (err) {
        console.warn('[command-palette] getGlobalSearchResults failed:', err);
    }

    const mapped = globalResults
        .map(mapGlobalResultToPalette)
        .filter(Boolean)
        .filter((item) => (item.score ?? 0) >= MIN_GLOBAL_SCORE);
    const merged = [...paletteResults];
    for (const item of mapped) {
        const key = normalizedDedupKey(item);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        merged.push(item);
    }
    // Действия, вкладки, алгоритмы, XML, ошибки — выше поисковой выдачи по приложению
    const isFromPalette = (item) => !item.payload?.fullResult;
    merged.sort((a, b) => {
        const aPalette = isFromPalette(a);
        const bPalette = isFromPalette(b);
        if (aPalette && !bPalette) return -1;
        if (!aPalette && bPalette) return 1;
        const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        const orderA = TYPE_ORDER[a.type] ?? 99;
        const orderB = TYPE_ORDER[b.type] ?? 99;
        return orderA - orderB;
    });
    return merged.slice(0, MAX_RESULTS);
}
