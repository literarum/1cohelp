import { describe, it, expect } from 'vitest';
import { parseDeepLink } from './deep-link.js';

const tabs = ['main', 'bookmarks', 'reglaments'];
describe('parseDeepLink', () => {
    it('читает tab и action из query и hash', () => {
        expect(parseDeepLink('?tab=bookmarks', '', tabs)).toEqual({ tab: 'bookmarks', action: null });
        expect(parseDeepLink('', '#tab=reglaments&action=search', tabs)).toEqual({ tab: 'reglaments', action: 'search' });
        expect(parseDeepLink('?tab=favorites', '', tabs).tab).toBe('favorites');
    });
    it('игнорирует неизвестные значения', () => {
        expect(parseDeepLink('?tab=evil&action=rm', '', tabs)).toEqual({ tab: null, action: null });
        expect(parseDeepLink('', '', tabs)).toEqual({ tab: null, action: null });
    });
});
