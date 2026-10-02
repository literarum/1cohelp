'use strict';

import { describe, expect, it } from 'vitest';
import { parseXml, searchDoc, jsonToXmlString, serializeNode, decodeXmlEntities } from './xml-analyzer-model.js';

describe('xml-analyzer-model', () => {
    it('разбирает пространства имён, атрибуты и статистику', async () => {
        const d = await parseXml('<?xml version="1.0"?><r xmlns:p="u:p" a="1"><p:i n="&amp;q">текст</p:i><i/></r>');
        const s = d.stats();
        expect(d.errors.length).toBe(0);
        expect(s.elements).toBe(3);
        expect(s.rootName).toBe('r');
        expect(s.maxDepth).toBeGreaterThanOrEqual(2);
    });

    it('сообщает о неверной вложенности с ошибкой, но не падает', async () => {
        const d = await parseXml('<a><b></a>');
        expect(d.errors.length).toBeGreaterThan(0);
    });

    it('не раскрывает пользовательские сущности и DTD (billion laughs)', async () => {
        const bomb = '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><l>&b;&b;</l>';
        const d = await parseXml(bomb);
        expect(d.warnings.length).toBeGreaterThan(0);
        expect(d.n).toBeLessThan(10);
    });

    it('находит по тексту и разрешает путь', async () => {
        const d = await parseXml('<r><i n="1">альфа</i><i n="2">бета</i></r>');
        const res = await searchDoc(d, 'бета');
        expect(res.ids.length).toBeGreaterThan(0);
        expect(d.resolvePath('/r/i[2]').node).toBeGreaterThan(0);
    });

    it('терпимо относится к пустому и мусорному вводу', async () => {
        expect((await parseXml('')).n).toBeGreaterThanOrEqual(0);
        const d = await parseXml('<<<>>> &&& \u0000');
        expect(d.errors.length + d.warnings.length).toBeGreaterThanOrEqual(0);
    });

    it('JSON превращается в XML с безопасными именами', () => {
        const x = jsonToXmlString({ messages: [{ a: 1, 'b c': null }] });
        expect(x.startsWith('<')).toBe(true);
        expect(x).not.toContain('b c=');
    });

    it('сериализация экранирует спецсимволы', async () => {
        const d = await parseXml('<r a="&quot;x&quot;">&lt;b&gt;</r>');
        const out = serializeNode(d, 0).text;
        expect(out).toContain('&lt;b&gt;');
        expect(decodeXmlEntities('&amp;&lt;')).toBe('&<');
    });
});
