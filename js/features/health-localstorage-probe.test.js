'use strict';

import { describe, it, expect, vi } from 'vitest';
import { runLocalStorageHealthProbe } from './health-localstorage-probe.js';

describe('health-localstorage-probe', () => {
    it('reports warn when storage is missing', () => {
        const report = vi.fn();
        runLocalStorageHealthProbe(report, { storage: null });
        expect(report).toHaveBeenCalledWith(
            'warn',
            'localStorage (второй контур)',
            expect.stringMatching(/недоступен/),
            { system: 'storage_ls' },
        );
    });

    it('reports info on successful roundtrip', () => {
        const mem = new Map();
        const storage = {
            setItem(k, v) {
                mem.set(k, v);
            },
            getItem(k) {
                return mem.has(k) ? mem.get(k) : null;
            },
            removeItem(k) {
                mem.delete(k);
            },
        };
        const report = vi.fn();
        runLocalStorageHealthProbe(report, { storage });
        expect(report).toHaveBeenCalledWith(
            'info',
            'localStorage (второй контур)',
            expect.stringMatching(/успешно/),
            { system: 'storage_ls' },
        );
        expect([...mem.keys()].some((k) => String(k).includes('__copilot1co_health_ls_'))).toBe(
            false,
        );
    });

    it('reports error when read does not match write', () => {
        const storage = {
            _k: '',
            setItem(k, v) {
                this._k = k;
                this._v = v;
            },
            getItem() {
                return 'corrupt';
            },
            removeItem() {},
        };
        const report = vi.fn();
        runLocalStorageHealthProbe(report, { storage });
        expect(report).toHaveBeenCalledWith(
            'error',
            'localStorage (второй контур)',
            expect.stringMatching(/Расхождение/),
            { system: 'storage_ls' },
        );
    });
});
