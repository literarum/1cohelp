import { describe, it, expect } from 'vitest';
import {
    fixKeyboardLayout,
    editDistance,
    createMatcher,
    rankItems,
    relatedStems,
    expandStemsSemantically,
} from './smart-search.js';
import { stemWord } from './search-normalize.js';

describe('smart-search', () => {
    it('исправляет раскладку', () => {
        expect(fixKeyboardLayout('cthnbabrfn')).toBe('сертификат');
        expect(fixKeyboardLayout('сертификат')).toBe('');
        expect(fixKeyboardLayout('1c')).toBe('');
        expect(fixKeyboardLayout('https://example.com')).toBe('');
    });

    it('расстояние Дамерау — Левенштейна', () => {
        expect(editDistance('сертификат', 'сертефикат', 2)).toBe(1);
        expect(editDistance('подпись', 'подспись', 2)).toBe(1);
        expect(editDistance('ab', 'ba', 2)).toBe(1);
        expect(editDistance('abc', 'xyzxyz', 2)).toBeGreaterThan(2);
    });

    it('тезаурус связывает ЭЦП и сертификат', () => {
        expect(relatedStems(stemWord('эцп')).has(stemWord('подпись'))).toBe(true);
        expect(expandStemsSemantically([stemWord('подпись')]).length).toBeGreaterThan(0);
    });

    it('находит по синониму, опечатке, раскладке и словоформе', () => {
        const items = [
            { t: 'Установка сертификата в КриптоПро', d: '' },
            { t: 'Ошибка при отправке отчёта', d: 'Не отправляется' },
            { t: 'Курсы валют', d: 'ничего общего' },
        ];
        const f = (x) => [{ text: x.t, weight: 3 }, x.d];
        expect(rankItems(items, 'эцп', f).items[0]).toBe(items[0]);
        expect(rankItems(items, 'сертефикат', f).items[0]).toBe(items[0]);
        expect(rankItems(items, 'cthnbabrfn', f).items[0]).toBe(items[0]);
        expect(rankItems(items, 'отчетов', f).items[0]).toBe(items[1]);
        expect(rankItems(items, 'сбой', f).items[0]).toBe(items[1]);
        expect(rankItems(items, 'валюты', f).items).toEqual([items[2]]);
    });

    it('мягкий режим, когда не все слова нашлись', () => {
        const items = [{ t: 'Подпись руководителя' }, { t: 'Курсы' }];
        const r = rankItems(items, 'подпись принтер', (x) => [x.t]);
        expect(r.soft).toBe(true);
        expect(r.items).toEqual([items[0]]);
    });

    it('пустой запрос возвращает всё без изменений', () => {
        const items = [1, 2, 3];
        expect(rankItems(items, '  ', () => ['x']).items).toBe(items);
        expect(createMatcher('').empty).toBe(true);
    });

    it('мусорные запросы ничего не находят', () => {
        const items = [{ t: 'Подпись' }];
        expect(rankItems(items, 'зщ', (x) => [x.t]).items).toEqual([]);
    });
});
