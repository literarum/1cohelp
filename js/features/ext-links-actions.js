'use strict';

/**
 * Модуль действий с внешними ссылками
 * Вынесено из script.js
 */

// ============================================================================
// ЗАВИСИМОСТИ
// ============================================================================

let State = null;
let showNotification = null;
let getAllExtLinks = null;
let renderExtLinks = null;
let showEditExtLinkModal = null;
let deleteFromIndexedDB = null;
let updateSearchIndex = null;
let escapeHtml = null;

export function setExtLinksActionsDependencies(deps) {
    if (deps.State !== undefined) State = deps.State;
    if (deps.showNotification !== undefined) showNotification = deps.showNotification;
    if (deps.getAllExtLinks !== undefined) getAllExtLinks = deps.getAllExtLinks;
    if (deps.renderExtLinks !== undefined) renderExtLinks = deps.renderExtLinks;
    if (deps.showEditExtLinkModal !== undefined) showEditExtLinkModal = deps.showEditExtLinkModal;
    if (deps.deleteFromIndexedDB !== undefined) deleteFromIndexedDB = deps.deleteFromIndexedDB;
    if (deps.updateSearchIndex !== undefined) updateSearchIndex = deps.updateSearchIndex;
    if (deps.escapeHtml !== undefined) escapeHtml = deps.escapeHtml;
}

/**
 * Фильтрует внешние ссылки по поисковому запросу и категории
 */
export async function filterExtLinks() {
    const searchInput = document.getElementById('extLinkSearchInput');
    const categoryFilter = document.getElementById('extLinkCategoryFilter');

    if (!searchInput || !categoryFilter) {
        console.error('filterExtLinks: Search input or category filter not found.');
        if (typeof renderExtLinks === 'function') {
            renderExtLinks([], State?.extLinkCategoryInfo || {});
        }
        return;
    }

    const searchValue = searchInput.value.trim().toLowerCase();
    const selectedCategoryValue = categoryFilter.value;

    try {
        const allLinks = await getAllExtLinks();
        const categoryInfoMap = State?.extLinkCategoryInfo || {};

        let linksToDisplay = [];

        if (selectedCategoryValue === '') {
            linksToDisplay = allLinks;
        } else {
            const numericCategoryId = parseInt(selectedCategoryValue, 10);
            if (!isNaN(numericCategoryId)) {
                linksToDisplay = allLinks.filter((link) => link.category === numericCategoryId);
            } else {
                console.warn(
                    `filterExtLinks: Некорректный ID категории '${selectedCategoryValue}'. Показываем все ссылки.`,
                );
                linksToDisplay = allLinks;
            }
        }

        if (searchValue) {
            linksToDisplay = linksToDisplay.filter((link) => {
                const titleMatch = link.title && link.title.toLowerCase().includes(searchValue);
                const descMatch =
                    link.description && link.description.toLowerCase().includes(searchValue);
                const urlMatch = link.url && link.url.toLowerCase().includes(searchValue);
                return titleMatch || descMatch || urlMatch;
            });
        }

        if (typeof renderExtLinks === 'function') {
            renderExtLinks(linksToDisplay, categoryInfoMap);
        } else {
            console.error('filterExtLinks: Функция renderExtLinks недоступна.');
        }
    } catch (error) {
        console.error('Ошибка при фильтрации внешних ссылок:', error);
        if (typeof showNotification === 'function') {
            showNotification('Ошибка фильтрации внешних ссылок', 'error');
        }
        if (typeof renderExtLinks === 'function') {
            renderExtLinks([], State?.extLinkCategoryInfo || {});
        }
    }
}

/**
 * Обрабатывает действия с внешними ссылками (клики по кнопкам)
 */
export async function handleExtLinkAction(event) {
    const target = event.target;
    if (!target) return;

    // Проверяем, что клик был по кнопке действия или элементу с data-action
    const button = target.closest('button[data-action], [data-action]');
    if (!button) {
        // Если клик был по карточке/элементу ссылки, открываем ссылку
        const linkItem = target.closest('.ext-link-item');
        if (linkItem && linkItem.dataset.url) {
            const url = linkItem.dataset.url;
            if (url && url !== '#') {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }
        return;
    }

    const action = button.dataset.action;
    if (!action) return;

    const linkItem = button.closest('.ext-link-item');
    if (!linkItem) {
        console.warn('handleExtLinkAction: Не найден родительский элемент .ext-link-item');
        return;
    }

    const linkId = linkItem.dataset.id;
    if (!linkId) {
        console.error('handleExtLinkAction: Не найден ID внешней ссылки');
        return;
    }

    const numericLinkId = parseInt(linkId, 10);
    if (isNaN(numericLinkId)) {
        console.error(`handleExtLinkAction: Некорректный ID внешней ссылки: ${linkId}`);
        return;
    }

    event.stopPropagation();

    switch (action) {
        case 'edit':
            if (typeof showEditExtLinkModal === 'function') {
                await showEditExtLinkModal(numericLinkId);
            } else {
                console.error('handleExtLinkAction: Функция showEditExtLinkModal недоступна.');
                if (typeof showNotification === 'function') {
                    showNotification('Функция редактирования недоступна', 'error');
                }
            }
            break;

        case 'delete':
            if (
                confirm(
                    `Вы уверены, что хотите удалить внешнюю ссылку "${escapeHtml(linkItem.querySelector('h3')?.textContent || 'ID ' + linkId)}"? Это действие необратимо.`,
                )
            ) {
                try {
                    await deleteFromIndexedDB('extLinks', numericLinkId);

                    if (typeof updateSearchIndex === 'function') {
                        await updateSearchIndex('extLinks', numericLinkId, null, 'delete').catch(
                            (err) =>
                                console.error(
                                    `Ошибка обновления индекса при удалении ссылки ${numericLinkId}:`,
                                    err,
                                ),
                        );
                    }

                    linkItem.remove();

                    // Перерисовываем список
                    if (typeof getAllExtLinks === 'function' && typeof renderExtLinks === 'function') {
                        const allLinks = await getAllExtLinks();
                        renderExtLinks(allLinks, State?.extLinkCategoryInfo || {});
                    }

                    if (typeof showNotification === 'function') {
                        showNotification('Внешняя ссылка удалена');
                    }
                } catch (error) {
                    console.error('Ошибка при удалении внешней ссылки:', error);
                    if (typeof showNotification === 'function') {
                        showNotification('Ошибка при удалении внешней ссылки', 'error');
                    }
                }
            }
            break;

        case 'open-link':
            // Открываем ссылку в новой вкладке
            const url = linkItem.dataset.url;
            if (url && url !== '#') {
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                console.warn('handleExtLinkAction: URL не найден или некорректен');
            }
            break;

        default:
            console.warn(`handleExtLinkAction: Неизвестное действие: ${action}`);
    }
}
