'use strict';

/**
 * Проверка ИНН прямо в заметках «Информация по обращению».
 * Проверяются только числа, перед которыми стоит слово «ИНН» (иначе 10-значные телефоны
 * давали бы ложные срабатывания). Ошибка контрольной суммы или длины — строка под полем.
 */

import { isValidInn10Checksum, isValidInn12Checksum } from './client-analytics-parse.js';

/**
 * @param {string} text
 * @returns {Array<{value:string, reason:string}>}
 */
export function findInvalidInns(text) {
    const out = [];
    const re = /ИНН\s*[:№#-]?\s*(\d[\d\s]{6,14}\d)/gi;
    let m;
    while ((m = re.exec(String(text || '')))) {
        const digits = m[1].replace(/\s+/g, '');
        let reason = '';
        if (digits.length !== 10 && digits.length !== 12) {
            reason = `${digits.length} цифр — у ИНН 10 (организация) или 12 (ИП, физлицо)`;
        } else if (digits.length === 10 ? !isValidInn10Checksum(digits) : !isValidInn12Checksum(digits)) {
            reason = 'неверная контрольная сумма — вероятно, опечатка';
        }
        if (reason && !out.some((x) => x.value === digits)) out.push({ value: digits, reason });
    }
    return out;
}

let timer = null;

export function initNotesInnCheck() {
    const ta = document.getElementById('clientNotes');
    if (!ta || ta.dataset.innCheck === '1') return;
    ta.dataset.innCheck = '1';
    const box = document.createElement('div');
    box.id = 'clientNotesInnWarnings';
    box.className = 'notes-inn-warn';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.hidden = true;
    ta.insertAdjacentElement('afterend', box);
    const run = () => {
        const bad = findInvalidInns(ta.value);
        box.hidden = bad.length === 0;
        box.textContent = '';
        for (const b of bad.slice(0, 3)) {
            const line = document.createElement('div');
            line.innerHTML = '<i class="fas fa-triangle-exclamation" aria-hidden="true"></i> ';
            line.append(`Проверьте ИНН ${b.value}: ${b.reason}.`);
            box.appendChild(line);
        }
    };
    ta.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(run, 400);
    });
    run();
}
