'use strict';

/**
 * Фабрика колбэков перезагрузки UI после отката/повтора версий (подключается из script.js).
 */

import { getFromIndexedDB } from '../db/indexeddb.js';

/**
 * @param {object} d
 */
export function createModalEntityHistoryHandlers(d) {
    return {
        async reloadBookmarkFolderForm(id) {
            const modal = document.getElementById('foldersModal');
            const form = modal?.querySelector('#folderForm');
            if (!modal || !form) return;
            const data = await getFromIndexedDB('bookmarkFolders', id);
            if (!data) return;
            modal.classList.remove('hidden');
            document.body.classList.add('modal-open');
            const nameInput = form.querySelector('#folderName');
            if (nameInput) nameInput.value = data.name || '';
            form.dataset.editingId = String(id);
            const color = data.color || 'blue';
            const radio = form.querySelector(`input[name="folderColor"][value="${color}"]`);
            if (radio) radio.checked = true;
            const btn = form.querySelector('#folderSubmitBtn');
            if (btn) btn.textContent = 'Сохранить изменения';
        },

        async afterBookmarkFolderHistory() {
            const list = document.getElementById('foldersList');
            if (list && typeof d.loadFoldersListInContainer === 'function') {
                await d.loadFoldersListInContainer(list);
            }
            if (typeof d.populateBookmarkFolders === 'function') await d.populateBookmarkFolders();
            if (typeof d.loadBookmarks === 'function') await d.loadBookmarks();
        },

        async reloadExtLinkCategoryForm(id) {
            const modal = document.getElementById('extLinkCategoriesModal');
            const form = modal?.querySelector('#extLinkCategoryForm');
            if (!modal || !form) return;
            const data = await getFromIndexedDB('extLinkCategories', id);
            if (!data) return;
            modal.classList.remove('hidden');
            document.body.classList.add('modal-open');
            const nameInput = form.querySelector('#categoryName');
            if (nameInput) nameInput.value = data.name || '';
            form.dataset.editingId = String(id);
            const color = data.color || 'blue';
            const radio = form.querySelector(`input[name="categoryColor"][value="${color}"]`);
            if (radio) radio.checked = true;
            const btn = form.querySelector('#extLinkCategorySubmitBtn');
            if (btn) btn.textContent = 'Сохранить изменения';
        },

        async afterExtLinkCategoryHistory() {
            const list = document.getElementById('extLinkCategoriesList');
            if (list && typeof d.loadExtLinkCategoriesList === 'function') {
                await d.loadExtLinkCategoriesList(list);
            }
            if (typeof d.populateExtLinkCategoryFilter === 'function') {
                const filter = document.getElementById('extLinkCategoryFilter');
                if (filter) await d.populateExtLinkCategoryFilter(filter);
            }
            if (typeof d.renderExtLinks === 'function') await d.renderExtLinks();
        },

        async reloadReglamentsUi() {
            if (typeof d.loadReglaments === 'function') {
                await d.loadReglaments();
            }
        },

        async refreshBlacklistAfterHistory() {
            if (typeof d.sortAndRenderBlacklist === 'function') {
                d.sortAndRenderBlacklist();
            }
        },
    };
}
