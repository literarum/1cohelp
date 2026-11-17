import { describe, it, expect } from 'vitest';
import { isOrphanAttachment } from './storage-overview.js';

describe('isOrphanAttachment', () => {
    const bm = new Set(['1']);
    const al = new Set(['prog1', 'main']);
    it('владелец удалён — сирота, существует — нет', () => {
        expect(isOrphanAttachment({ parentType: 'bookmark', parentId: 2 }, bm, al)).toBe(true);
        expect(isOrphanAttachment({ parentType: 'bookmark', parentId: 1 }, bm, al)).toBe(false);
        expect(isOrphanAttachment({ parentType: 'algorithm', parentId: 'gone' }, bm, al)).toBe(true);
        expect(isOrphanAttachment({ parentType: 'algorithm', parentId: 'main' }, bm, al)).toBe(false);
    });
    it('неизвестный тип родителя не трогаем', () => {
        expect(isOrphanAttachment({ parentType: 'reglament', parentId: 5 }, bm, al)).toBe(false);
        expect(isOrphanAttachment({}, bm, al)).toBe(false);
    });
});
