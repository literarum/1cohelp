/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearAllApplicationData, setDataClearDependencies } from './data-clear.js';
import {
    TRAINING_PROGRESS_BACKUP_KEY,
    TRAINING_USER_CURRICULUM_BACKUP_KEY,
    TRAINING_MENTOR_QUIZ_PACKS_BACKUP_KEY,
    ONBOARDING_AUTO_OFFER_STORAGE_KEY,
} from '../constants.js';

describe('clearAllApplicationData', () => {
    let stateRef;

    beforeEach(() => {
        stateRef = { db: { close: vi.fn() } };
        setDataClearDependencies({ State: stateRef });

        globalThis.indexedDB = {
            deleteDatabase: vi.fn(() => {
                const req = /** @type {{ onsuccess?: () => void }} */ ({});
                queueMicrotask(() => req.onsuccess?.());
                return req;
            }),
        };
    });

    afterEach(() => {
        setDataClearDependencies({ State: null });
        vi.restoreAllMocks();
    });

    it('removes training localStorage mirrors (copilot1co: namespace)', async () => {
        localStorage.setItem(TRAINING_PROGRESS_BACKUP_KEY, '{"id":"default"}');
        localStorage.setItem(
            TRAINING_USER_CURRICULUM_BACKUP_KEY,
            '{"schemaVersion":1,"tracks":[]}',
        );
        localStorage.setItem(
            TRAINING_MENTOR_QUIZ_PACKS_BACKUP_KEY,
            '{"schemaVersion":1,"packs":[]}',
        );
        localStorage.setItem(ONBOARDING_AUTO_OFFER_STORAGE_KEY, '1');
        localStorage.setItem('copilot1co:gdoc-cache:test-doc', '{}');

        await clearAllApplicationData();

        expect(localStorage.getItem(TRAINING_PROGRESS_BACKUP_KEY)).toBeNull();
        expect(localStorage.getItem(TRAINING_USER_CURRICULUM_BACKUP_KEY)).toBeNull();
        expect(localStorage.getItem(TRAINING_MENTOR_QUIZ_PACKS_BACKUP_KEY)).toBeNull();
        expect(localStorage.getItem(ONBOARDING_AUTO_OFFER_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem('copilot1co:gdoc-cache:test-doc')).toBeNull();
        expect(stateRef.db).toBeNull();
        expect(globalThis.indexedDB.deleteDatabase).toHaveBeenCalled();
    });
});
