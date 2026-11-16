import { describe, it, expect } from 'vitest';
import { localFileTimestamp } from './datetime.js';

describe('localFileTimestamp', () => {
    it('локальное время, нули дополняются', () => {
        const d = new Date(2026, 0, 5, 9, 7, 3);
        expect(localFileTimestamp(d)).toBe('2026-01-05_09-07-03');
        expect(localFileTimestamp(d, { seconds: false })).toBe('2026-01-05_09-07');
    });
});
