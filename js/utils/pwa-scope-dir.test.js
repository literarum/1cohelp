'use strict';

import { describe, it, expect } from 'vitest';
import { scopeDirFromServiceWorkerPathname } from './pwa-scope-dir.js';

describe('scopeDirFromServiceWorkerPathname', () => {
    it('maps root sw.js to site root', () => {
        expect(scopeDirFromServiceWorkerPathname('/sw.js')).toBe('/');
    });

    it('maps GitHub Pages style prefix', () => {
        expect(scopeDirFromServiceWorkerPathname('/1cohelp/sw.js')).toBe('/1cohelp/');
    });

    it('maps nested path', () => {
        expect(scopeDirFromServiceWorkerPathname('/app/v2/sw.js')).toBe('/app/v2/');
    });
});
