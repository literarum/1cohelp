import { describe, it, expect } from 'vitest';
import { describeInnContext } from './notes-inn-context.js';
import { pluralRu } from '../utils/plural.js';

describe('notes-inn-context', () => {
    it('описание с числом обращений и ЧС', () => {
        expect(describeInnContext({ inn: '7707083893', appeals: 3, blacklisted: false })).toBe('ИНН 7707083893 · в базе клиентов: 3 обращения');
        expect(describeInnContext({ inn: '7707083893', appeals: 0, blacklisted: true })).toBe('ИНН 7707083893 · ⚠ в чёрном списке');
        expect(describeInnContext({ inn: '1', appeals: 11, blacklisted: false })).toContain('11 обращений');
    });
    it('pluralRu', () => {
        expect(pluralRu(1, ['а', 'б', 'в'])).toBe('а');
        expect(pluralRu(22, ['а', 'б', 'в'])).toBe('б');
        expect(pluralRu(12, ['а', 'б', 'в'])).toBe('в');
    });
});
