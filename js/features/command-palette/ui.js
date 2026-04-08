'use strict';

import { TYPE_LABELS } from './constants.js';

let modalEl = null;
let inputEl = null;
let listEl = null;
let selectedIndex = 0;
let currentResults = [];

let selectResultCallback = null;
let onCloseCallback = null;

export function setUiCallbacks(callbacks) {
    if (callbacks.selectResult !== undefined) selectResultCallback = callbacks.selectResult;
    if (callbacks.onClose !== undefined) onCloseCallback = callbacks.onClose;
}

function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

export function getOrCreateModal() {
    if (modalEl && document.body.contains(modalEl)) return modalEl;
    const modal = document.createElement('div');
    modal.id = 'commandPaletteModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Палитра команд');
    modal.className =
        'command-palette-overlay fixed inset-0 z-[100] flex flex-col items-stretch bg-black/50 dark:bg-black/60';
    modal.innerHTML = `
        <div class="command-palette-panel w-full max-w-none rounded-b-xl shadow-2xl bg-white dark:bg-gray-800 border-x border-b border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[85vh]">
          <div class="flex-shrink-0 p-2 sm:p-3 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              id="commandPaletteInput"
              class="w-full px-4 py-3 bg-transparent border-0 focus:ring-0 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-base"
              placeholder="Поиск: алгоритмы, вкладки, действия… @действие @вкладка — фильтр по типу"
              autocomplete="off"
              autocapitalize="off"
            />
          </div>
          <div id="commandPaletteList" class="flex-1 min-h-0 overflow-y-auto py-1 max-h-[60vh]"></div>
          <div class="flex-shrink-0 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2 flex-wrap">
            <span id="commandPaletteCount" class="flex-shrink-0">Показано 0</span>
            <span>↑↓ навигация · Enter выбор · Esc закрыть · <span class="opacity-90">@тип</span> — фильтр · <span class="opacity-90">@окно</span> — все модальные окна</span>
          </div>
        </div>
    `;
    modal.classList.add('hidden');
    document.body.appendChild(modal);
    modalEl = modal;
    inputEl = modal.querySelector('#commandPaletteInput');
    listEl = modal.querySelector('#commandPaletteList');
    return modal;
}

export function renderResults(results) {
    currentResults = results;
    selectedIndex = 0;
    const countEl = modalEl?.querySelector('#commandPaletteCount');
    if (countEl)
        countEl.textContent =
            results.length === 0 ? 'Нет результатов' : `Показано ${results.length}`;
    if (!listEl) return;
    listEl.innerHTML = '';
    if (results.length === 0) {
        listEl.innerHTML =
            '<div class="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">Нет результатов</div>';
        return;
    }
    results.forEach((r, i) => {
        const row = document.createElement('div');
        row.className =
            'command-palette-item flex items-center gap-3 px-4 py-2.5 cursor-pointer border-l-2 border-transparent';
        row.dataset.index = String(i);
        row.innerHTML = `
          <span class="flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">${TYPE_LABELS[r.type] || r.type}</span>
          <div class="min-w-0 flex-1">
            <div class="font-medium text-gray-900 dark:text-gray-100 truncate">${escapeHtml(r.label)}</div>
            ${r.subtitle ? `<div class="text-sm text-gray-500 dark:text-gray-400 truncate">${escapeHtml(r.subtitle)}</div>` : ''}
          </div>
        `;
        row.addEventListener('mouseenter', () => {
            selectedIndex = i;
            updateHighlight();
        });
        row.addEventListener('click', () => {
            if (typeof selectResultCallback === 'function') selectResultCallback(r);
        });
        listEl.appendChild(row);
    });
    updateHighlight();
}

export function updateHighlight() {
    const items = listEl ? listEl.querySelectorAll('.command-palette-item') : [];
    items.forEach((el, i) => {
        const isSelected = i === selectedIndex;
        el.classList.toggle('bg-primary/10', isSelected);
        el.classList.toggle('dark:bg-primary/20', isSelected);
        el.classList.toggle('border-primary', isSelected);
        el.classList.toggle('border-transparent', !isSelected);
        el.classList.toggle('hover:bg-gray-100', !isSelected);
        el.classList.toggle('dark:hover:bg-gray-700', !isSelected);
        el.classList.toggle('hover:bg-primary/15', isSelected);
        el.classList.toggle('dark:hover:bg-primary/25', isSelected);
    });
    const selectedEl = listEl?.querySelector(
        `.command-palette-item[data-index="${selectedIndex}"]`,
    );
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

export function onKeydown(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onCloseCallback === 'function') onCloseCallback();
        return;
    }
    if (e.key === 'Tab' && modalEl && modalEl.contains(document.activeElement)) {
        e.preventDefault();
        if (inputEl) inputEl.focus();
        return;
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentResults.length === 0) return;
        selectedIndex =
            selectedIndex === currentResults.length - 1 ? 0 : selectedIndex + 1;
        updateHighlight();
        return;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentResults.length === 0) return;
        selectedIndex =
            selectedIndex === 0 ? currentResults.length - 1 : selectedIndex - 1;
        updateHighlight();
        return;
    }
    if (e.key === 'Enter' && currentResults[selectedIndex]) {
        e.preventDefault();
        if (typeof selectResultCallback === 'function')
            selectResultCallback(currentResults[selectedIndex]);
    }
}

export function hide() {
    if (modalEl) modalEl.classList.add('hidden');
}

export function getInputEl() {
    return inputEl;
}
