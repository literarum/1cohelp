'use strict';

/**
 * Контекст по ИНН из заметок: сколько обращений этого клиента в «Базе клиентов» и есть ли он
 * в чёрном списке. Строка под полем заметок, «открыть» — переход к карточкам с фильтром по ИНН.
 */

import { State } from '../app/state.js';
import { countInIndexedDB, getAllFromIndexWithKeyVariants } from '../db/indexeddb.js';
import { extractInns } from './appeal-archive.js';
import { pluralRu } from '../utils/plural.js';

export function describeInnContext({ inn, appeals, blacklisted }) {
    const parts = [`ИНН ${inn}`];
    // «Не найден в базе» не пишем: строка появляется, только когда есть что сообщить.
    if (appeals > 0) {
        parts.push(`в базе клиентов: ${appeals} ${pluralRu(appeals, ['обращение', 'обращения', 'обращений'])}`);
    }
    if (blacklisted) parts.push('⚠ в чёрном списке');
    return parts.join(' · ');
}

async function lookup(inn) {
    let appeals = 0;
    let blacklisted = false;
    try {
        if (State.db?.objectStoreNames.contains('clientAnalyticsRecords')) {
            appeals = await countInIndexedDB('clientAnalyticsRecords', 'inn', inn);
        }
    } catch {
        appeals = 0;
    }
    try {
        if (State.db?.objectStoreNames.contains('blacklistedClients')) {
            blacklisted = (await getAllFromIndexWithKeyVariants('blacklistedClients', 'inn', inn)).length > 0;
        }
    } catch {
        blacklisted = false;
    }
    return { inn, appeals, blacklisted };
}

function openInClientBase(inn) {
    window.setActiveTab?.('clientAnalytics');
    setTimeout(() => {
        const input = document.getElementById('clientAnalyticsSearchInput');
        if (!input) return;
        input.value = inn;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    }, 350);
}

let timer = null;
let lastKey = '';

export function initNotesInnContext() {
    const ta = document.getElementById('clientNotes');
    if (!ta || ta.dataset.innContext === '1') return;
    ta.dataset.innContext = '1';
    const box = document.createElement('div');
    box.id = 'clientNotesInnContext';
    box.className = 'notes-inn-ctx';
    box.hidden = true;
    box.setAttribute('aria-live', 'polite');
    (document.getElementById('clientNotesInnWarnings') || ta).insertAdjacentElement('afterend', box);
    const run = async () => {
        const inns = extractInns(ta.value).slice(0, 3);
        const key = inns.join(',');
        if (key === lastKey) return;
        lastKey = key;
        if (!inns.length) {
            box.hidden = true;
            box.textContent = '';
            return;
        }
        const results = (await Promise.all(inns.map(lookup))).filter(
            (r) => r.appeals > 0 || r.blacklisted,
        );
        if (inns.join(',') !== lastKey) return;
        box.textContent = '';
        if (!results.length) {
            box.hidden = true;
            return;
        }
        for (const r of results) {
            const line = document.createElement('div');
            line.className = r.blacklisted ? 'is-blacklisted' : '';
            line.append(describeInnContext(r));
            if (r.appeals > 0) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'notes-inn-ctx__open';
                btn.textContent = 'открыть';
                btn.addEventListener('click', () => openInClientBase(r.inn));
                line.append(' ', btn);
            }
            box.appendChild(line);
        }
        box.hidden = false;
    };
    ta.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => void run(), 600);
    });
    void run();
}
