'use strict';

/**
 * Словарь кодов/симптомов ошибок 1С/ФНС/СФР для поиска в палитре команд.
 * Расширяемый список: добавлять записи в ERROR_ENTRIES.
 */

/** Записи: id, label, subtitle, keywords (для поиска), payload (tabId или иное) */
const ERROR_ENTRIES = [
    {
        id: 'error:1c:lock',
        label: 'Блокировка сеанса 1С',
        subtitle: 'Типичные причины и разблокировка',
        keywords: ['блокировка', 'сеанс', 'lock', 'занято', 'блок'],
        payload: { tabId: 'xmlAnalyzer' },
    },
    {
        id: 'error:1c:license',
        label: 'Ошибки лицензирования 1С',
        subtitle: 'Нет лицензии, истекла, не найдена',
        keywords: ['лицензи', 'license', 'лицензия', 'истек'],
        payload: { tabId: 'xmlAnalyzer' },
    },
    {
        id: 'error:fns:reject',
        label: 'Отказ ФНС по отчётности',
        subtitle: 'Отклонение отчёта, ошибки контроля',
        keywords: ['отказ', 'отклонен', 'фнс', 'отчет', 'контроль'],
        payload: { tabId: 'xmlAnalyzer' },
    },
    {
        id: 'error:sfr:report',
        label: 'Ошибки отчётов СФР (ПФР/ФСС)',
        subtitle: 'СЗВ-ТД, ЕФС-1, отчётность в соцфонд',
        keywords: ['сфр', 'пфр', 'фсс', 'сзв', 'ефс', 'отчет'],
        payload: { tabId: 'xmlAnalyzer' },
    },
    {
        id: 'error:signature',
        label: 'Ошибка подписи / ЭЦП',
        subtitle: 'Неверная подпись, сертификат, КриптоПро',
        keywords: ['подпись', 'эцп', 'сертификат', 'крипто', 'подпис'],
        payload: { tabId: 'xmlAnalyzer' },
    },
];

function normalizeText(s) {
    if (typeof s !== 'string') return '';
    return s
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Поиск по словарю ошибок.
 * @param {string} query - строка запроса
 * @returns {Array} массив результатов { id, type: 'error', label, subtitle, score, payload }
 */
export function getErrorDictionaryResults(query) {
    const q = normalizeText(query);
    if (!q || q.length < 2) return [];
    const words = q.split(/\s+/).filter(Boolean);
    const results = [];
    for (const entry of ERROR_ENTRIES) {
        const labelNorm = normalizeText(entry.label);
        const subtitleNorm = normalizeText(entry.subtitle || '');
        const keywordsNorm = (entry.keywords || []).map((k) => normalizeText(k));
        let sc = 0;
        for (const w of words) {
            if (labelNorm.includes(w) || subtitleNorm.includes(w)) sc += 1;
            if (keywordsNorm.some((k) => k.includes(w) || w.length >= 2 && k.includes(w))) sc += 1;
        }
        if (sc > 0) {
            results.push({
                id: entry.id,
                type: 'error',
                label: entry.label,
                subtitle: entry.subtitle || 'Открыть Анализатор XML',
                score: sc,
                payload: entry.payload || { tabId: 'xmlAnalyzer' },
            });
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
