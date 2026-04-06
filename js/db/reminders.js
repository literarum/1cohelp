'use strict';

import { REMINDERS_STORE_NAME } from '../constants.js';
import { State } from '../app/state.js';
import { saveToIndexedDB, getAllFromIndexedDB, deleteFromIndexedDB } from './indexeddb.js';

/**
 * @typedef {'bookmark'|'client'|'algorithm'|'reglament'|'free'} ReminderContextType
 * @typedef {'pending'|'done'|'dismissed'} ReminderStatus
 * @typedef {'callback'|'followup'|'return_to'|'task'|'other'} ReminderIntent
 */

/**
 * @param {object} row
 * @returns {Promise<number|string|null>}
 */
export async function saveReminderRow(row) {
    if (!State.db) {
        console.error('[reminders] DB not initialized');
        return null;
    }
    const copy = { ...row };
    if (copy.id != null && copy.id !== '') {
        const id = typeof copy.id === 'string' ? parseInt(copy.id, 10) : copy.id;
        if (!Number.isNaN(id)) copy.id = id;
    } else {
        delete copy.id;
    }
    return saveToIndexedDB(REMINDERS_STORE_NAME, copy);
}

/**
 * @returns {Promise<Array<object>>}
 */
export async function getAllRemindersFromDB() {
    if (!State.db) return [];
    try {
        const rows = await getAllFromIndexedDB(REMINDERS_STORE_NAME);
        return Array.isArray(rows) ? rows : [];
    } catch (e) {
        console.error('[reminders] getAll failed', e);
        return [];
    }
}

/**
 * @param {number|string} id
 * @returns {Promise<boolean>}
 */
export async function deleteReminderById(id) {
    if (!State.db) return false;
    try {
        await deleteFromIndexedDB(REMINDERS_STORE_NAME, id);
        return true;
    } catch (e) {
        console.error('[reminders] delete failed', e);
        return false;
    }
}
