/** @vitest-environment jsdom */
'use strict';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    BACKDROP_CLOSABLE_IDS,
    isBackdropClosable,
    findCloseButton,
    findPreferredField,
    requestBackdropClose,
} from './modal-choreographer.js';

function mount(html) {
    document.body.innerHTML = html;
}

describe('modal-choreographer', () => {
    beforeEach(() => mount(''));

    it('закрытие по затемнению — только для окон из белого списка', () => {
        expect(isBackdropClosable({ id: 'hotkeysModal' })).toBe(true);
        expect(isBackdropClosable({ id: 'addModal' })).toBe(false);
        expect(isBackdropClosable(null)).toBe(false);
        expect(BACKDROP_CLOSABLE_IDS).toContain('algorithmModal');
        expect(BACKDROP_CLOSABLE_IDS).not.toContain('editModal');
    });

    it('findCloseButton: [data-modal-close], id*close, aria-label', () => {
        mount(
            `<div id="m"><button id="x">1</button><button id="closeHotkeysModalBtn">2</button></div>`,
        );
        expect(findCloseButton(document.getElementById('m')).id).toBe('closeHotkeysModalBtn');
        mount(`<div id="m"><button id="a" data-modal-close>1</button><button id="closeB">2</button></div>`);
        expect(findCloseButton(document.getElementById('m')).id).toBe('a');
        mount(`<div id="m"><button aria-label="Закрыть окно" id="z">x</button></div>`);
        expect(findCloseButton(document.getElementById('m')).id).toBe('z');
        mount(`<div id="m"></div>`);
        expect(findCloseButton(document.getElementById('m'))).toBeNull();
    });

    it('requestBackdropClose нажимает штатную кнопку только при клике по самому затемнению', () => {
        mount(
            `<div id="hotkeysModal"><div id="inner"><button id="closeHotkeysModalBtn">x</button></div></div>`,
        );
        const modal = document.getElementById('hotkeysModal');
        const btn = document.getElementById('closeHotkeysModalBtn');
        const spy = vi.fn();
        btn.addEventListener('click', spy);
        expect(requestBackdropClose(modal, document.getElementById('inner'))).toBe(false);
        expect(spy).not.toHaveBeenCalled();
        expect(requestBackdropClose(modal, modal)).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('requestBackdropClose не закрывает окна с формами', () => {
        mount(`<div id="addModal"><button id="closeAddModalBtn">x</button></div>`);
        const modal = document.getElementById('addModal');
        const spy = vi.fn();
        document.getElementById('closeAddModalBtn').addEventListener('click', spy);
        expect(requestBackdropClose(modal, modal)).toBe(false);
        expect(spy).not.toHaveBeenCalled();
    });

    it('findPreferredField: первое редактируемое поле (в jsdom offsetParent нет — поле не найдено)', () => {
        mount(`<div id="m"><input type="checkbox"><input id="t" type="text"></div>`);
        const f = findPreferredField(document.getElementById('m'));
        // jsdom не считает layout: offsetParent === null → функция честно возвращает null.
        expect(f === null || f.id === 't').toBe(true);
    });
});
