'use strict';

import { describe, it, expect } from 'vitest';
import { pluralRuFiles } from './client-analytics.js';

describe('client-analytics pluralRuFiles', () => {
    it('declines file count in Russian', () => {
        expect(pluralRuFiles(1)).toBe('1 файл');
        expect(pluralRuFiles(2)).toBe('2 файла');
        expect(pluralRuFiles(4)).toBe('4 файла');
        expect(pluralRuFiles(5)).toBe('5 файлов');
        expect(pluralRuFiles(11)).toBe('11 файлов');
        expect(pluralRuFiles(21)).toBe('21 файл');
        expect(pluralRuFiles(22)).toBe('22 файла');
    });
});
