'use strict';

/**
 * Второй контур хранения в браузере: localStorage независимо от IndexedDB.
 * Короткий roundtrip с уникальным ключом и обязательной очисткой.
 */

const KEY_PREFIX = '__copilot1co_health_ls_';

/**
 * @param {(level: string, title: string, message: string, meta?: object) => void} reportFn
 * @param {object} [opts]
 * @param {Storage | null} [opts.storage] — для тестов; по умолчанию window.localStorage
 */
export function runLocalStorageHealthProbe(reportFn, opts = {}) {
    if (typeof reportFn !== 'function') return;

    const storage =
        opts.storage !== undefined
            ? opts.storage
            : typeof localStorage !== 'undefined'
              ? localStorage
              : null;

    if (!storage || typeof storage.setItem !== 'function') {
        reportFn('warn', 'localStorage (второй контур)', 'localStorage недоступен в этой среде.', {
            system: 'storage_ls',
        });
        return;
    }

    const key = `${KEY_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const payload = JSON.stringify({ v: 1, t: Date.now(), probe: 'health_ls' });

    try {
        storage.setItem(key, payload);
        const read = storage.getItem(key);
        if (read !== payload) {
            reportFn(
                'error',
                'localStorage (второй контур)',
                'Расхождение: запись и чтение не совпали.',
                { system: 'storage_ls' },
            );
        } else {
            reportFn(
                'info',
                'localStorage (второй контур)',
                'Запись, чтение и сравнение прошли успешно (контур независим от IndexedDB).',
                { system: 'storage_ls' },
            );
        }
    } catch (err) {
        reportFn('error', 'localStorage (второй контур)', err?.message || String(err), {
            system: 'storage_ls',
        });
    } finally {
        try {
            storage.removeItem(key);
        } catch {
            /* ignore */
        }
    }
}
