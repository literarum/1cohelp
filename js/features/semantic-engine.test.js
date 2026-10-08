import { describe, it, expect } from 'vitest';
import {
    SemanticIndex,
    parseQuery,
    getSemanticIndex,
    docsSignature,
    clearSemanticCache,
} from './semantic-engine.js';
import { rankItems } from './smart-search.js';

const docs = [
    { id: 1, fields: [{ text: 'Настройка ЭЦП в браузере', weight: 3 }, 'Установить плагин КриптоПро, проверить сертификат и токен Рутокен, драйвер'] },
    { id: 2, fields: [{ text: 'Ошибка 502 при отправке отчёта', weight: 3 }, 'Сервер недоступен, повторить позже, проверить интернет'] },
    { id: 3, fields: [{ text: 'Как сбросить пароль пользователя', weight: 3 }, 'Зайти в админку, нажать сброс, выдать новый пароль'] },
    { id: 4, fields: [{ text: 'Выгрузка ЕНВД в Excel', weight: 3 }, 'Отчёт сохранить в xls файл'] },
    { id: 5, fields: [{ text: 'Рутокен не определяется', weight: 3 }, 'Переустановить драйвер Рутокен, проверить USB порт'] },
    { id: 6, fields: [{ text: 'Лицензия не активна', weight: 3 }, 'Продлить лицензию, активировать ключ'] },
];
const top = (q, ix = new SemanticIndex(docs)) => ix.search(q).hits.map((h) => h.id);

describe('semantic-engine', () => {
    it('находит по синониму (подпись → ЭЦП) и объясняет почему', () => {
        const r = new SemanticIndex(docs).search('подпись');
        expect(r.hits[0].id).toBe(1);
        expect(r.hits[0].exact).toBe(false);
        expect(r.hits[0].why.join(' ')).toContain('эцп');
    });

    it('точное совпадение выше синонимов', () => {
        expect(top('эцп')[0]).toBe(1);
        expect(top('лицензию')[0]).toBe(6);
    });

    it('исправляет опечатки и даёт подсказку', () => {
        const r = new SemanticIndex(docs).search('сертфикат');
        expect(r.hits[0].id).toBe(1);
        expect(r.suggestion).toBe('сертификат');
        expect(top('рутокн')[0]).toBe(5);
    });

    it('исправляет раскладку', () => {
        expect(top('cthnbabrfn')[0]).toBe(1);
    });

    it('фразы в кавычках требуют соседства слов', () => {
        expect(top('"новый пароль"')).toEqual([3]);
        expect(top('"пароль новый"')).toEqual([]);
    });

    it('исключения -слово', () => {
        expect(top('пароль -сброс')).toEqual([]);
        expect(top('пароль')).toContain(3);
    });

    it('синонимы формата (эксель → Excel)', () => {
        expect(top('эксель')[0]).toBe(4);
    });

    it('пустой и бессмысленный запрос не падает', () => {
        expect(top('')).toEqual([]);
        expect(top('qwe')).toEqual([]);
        expect(parseQuery(null).words).toEqual([]);
    });

    it('выучивает контекстные связи по текстам пользователя', () => {
        const d = [];
        for (let i = 0; i < 6; i++) d.push({ id: i, fields: [`Заметка ${i} вестатрон`, 'вестатрон работает через модуль зетафикс'] });
        d.push({ id: 100, fields: ['Модуль зетафикс', 'установка и настройка'] });
        for (let i = 0; i < 40; i++) d.push({ id: 200 + i, fields: [`Прочее номер${i} слово${i % 9}`, `ничего общего текст${i}`] });
        const r = new SemanticIndex(d).search('вестатрон', { limit: 50 });
        expect(r.hits.map((h) => h.id)).toContain(100);
        expect(r.hits.map((h) => h.id)).not.toContain(200);
    });

    it('кэш индекса: тот же корпус — тот же индекс, изменение — пересборка', () => {
        clearSemanticCache();
        const a = getSemanticIndex('t', docs);
        expect(getSemanticIndex('t', docs)).toBe(a);
        const changed = docs.map((d, i) => (i === 0 ? { ...d, fields: ['другое'] } : d));
        expect(docsSignature(changed)).not.toBe(docsSignature(docs));
        expect(getSemanticIndex('t', changed)).not.toBe(a);
    });
});

describe('rankItems поверх движка', () => {
    const items = docs.map((d) => ({ t: d.fields[0].text, d: d.fields[1] }));
    const f = (x) => [{ text: x.t, weight: 3 }, x.d];
    it('возвращает отфильтрованный список по релевантности и подсказку', () => {
        const r = rankItems(items, 'сертфикат', f);
        expect(r.items[0]).toBe(items[0]);
        expect(r.suggestion).toBe('сертификат');
        expect(r.why.get(items[0]).length).toBeGreaterThan(0);
    });
    it('пустой запрос возвращает всё', () => {
        expect(rankItems(items, '  ', f).items).toBe(items);
    });
});
