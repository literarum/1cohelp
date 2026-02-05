'use strict';

import { getAllFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';

/**
 * Компонент «Клиентские данные» (информация по обращению).
 * Базовые функции работы с хранилищем clientData.
 */

const STORE_NAME = 'clientData';
const DEFAULT_CLIENT_DATA_ID = 'default';

export async function getClientData() {
    try {
        const raw = await getAllFromIndexedDB(STORE_NAME);
        const record = Array.isArray(raw) ? raw.find((r) => r && r.id === DEFAULT_CLIENT_DATA_ID) : raw;
        return record && record.notes !== undefined ? record.notes : '';
    } catch (e) {
        console.warn('[client-data.js] getClientData:', e);
        return '';
    }
}

export async function saveClientData(notes) {
    try {
        await saveToIndexedDB(STORE_NAME, {
            id: DEFAULT_CLIENT_DATA_ID,
            notes: typeof notes === 'string' ? notes : '',
        });
        return true;
    } catch (e) {
        console.error('[client-data.js] saveClientData:', e);
        return false;
    }
}

export function clearClientData() {
    return saveClientData('');
}
