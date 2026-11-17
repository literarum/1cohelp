import { describe, it, expect } from 'vitest';
import { expandSnippet, sanitizeSnippets, matchSnippets, findSlashToken } from './notes-snippets.js';

describe('notes-snippets', () => {
    it('переменные подставляются', () => {
        const now = new Date(2026, 10, 17, 9, 5);
        expect(expandSnippet('ИНН: {ИНН}, {дата} {время}', 'клиент ИНН 7707083893', now)).toBe('ИНН: 7707083893, 17.11.2026 09:05');
        expect(expandSnippet('{инн}', 'нет', now)).toBe('');
    });
    it('sanitize: ключ нормализуется, пустые отбрасываются', () => {
        expect(sanitizeSnippets([{ key: ' Итог Звонка ', title: 't', text: 'x' }, { key: '', text: 'y' }])).toEqual([
            { key: 'итог-звонка', title: 't', text: 'x' },
        ]);
    });
    it('matchSnippets: начало ключа раньше вхождения', () => {
        const list = [{ key: 'перезвон', title: 'Итог', text: '1' }, { key: 'итог', title: '', text: '2' }];
        expect(matchSnippets(list, 'ит').map((s) => s.key)).toEqual(['итог', 'перезвон']);
    });
    it('findSlashToken: только в начале строки или после пробела', () => {
        expect(findSlashToken('текст /ито', 10)).toEqual({ start: 6, query: 'ито' });
        expect(findSlashToken('/', 1)).toEqual({ start: 0, query: '' });
        expect(findSlashToken('https://site', 12)).toBeNull();
        expect(findSlashToken('1/2', 3)).toBeNull();
    });
});
