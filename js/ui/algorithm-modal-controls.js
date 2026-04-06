'use strict';

let deps = {
    deleteAlgorithm: null,
    showNotification: null,
    editAlgorithm: null,
    ExportService: null,
    closeAnimatedModal: null,
    showAppConfirm: null,
    showAddModal: null,
};

export function setAlgorithmModalControlDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

export function initAlgorithmModalControls() {
    const algorithmModal = document.getElementById('algorithmModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const editMainBtn = document.getElementById('editMainBtn');
    const deleteAlgorithmBtn = document.getElementById('deleteAlgorithmBtn');

    closeModalBtn?.addEventListener('click', () => {
        if (typeof deps.closeAnimatedModal === 'function') {
            deps.closeAnimatedModal(algorithmModal);
        }
    });

    editMainBtn?.addEventListener('click', async () => {
        if (typeof deps.editAlgorithm === 'function') {
            await deps.editAlgorithm('main');
        } else {
            console.error('Функция editAlgorithm не найдена для кнопки editMainBtn');
        }
    });

    const editAlgorithmBtn = document.getElementById('editAlgorithmBtn');
    if (editAlgorithmBtn) {
        const editFromDetailHandler = async () => {
            const algorithmId = algorithmModal?.dataset?.currentAlgorithmId;
            const section = algorithmModal?.dataset?.currentSection;
            if (
                algorithmId === undefined ||
                algorithmId === null ||
                String(algorithmId).trim() === '' ||
                section === undefined ||
                section === null ||
                String(section).trim() === ''
            ) {
                deps.showNotification?.(
                    'Ошибка: Не удалось определить алгоритм для редактирования.',
                    'error',
                );
                return;
            }
            if (typeof deps.editAlgorithm === 'function') {
                await deps.editAlgorithm(algorithmId, section);
            } else {
                console.error('Функция editAlgorithm не найдена для кнопки editAlgorithmBtn');
            }
        };
        if (editAlgorithmBtn._editFromDetailHandler) {
            editAlgorithmBtn.removeEventListener('click', editAlgorithmBtn._editFromDetailHandler);
        }
        editAlgorithmBtn.addEventListener('click', editFromDetailHandler);
        editAlgorithmBtn._editFromDetailHandler = editFromDetailHandler;
    }

    const exportMainBtn = document.getElementById('exportMainBtn');
    if (exportMainBtn) {
        exportMainBtn.addEventListener('click', () => {
            const mainAlgorithmContainer = document.getElementById('mainAlgorithm');
            const mainTitleElement = document.querySelector('#mainContent h2');
            const title = mainTitleElement ? mainTitleElement.textContent : 'Главная';
            deps.ExportService?.exportElementToPdf(mainAlgorithmContainer, title);
        });
    }

    if (!deleteAlgorithmBtn) return;

    const clickHandler = async (event) => {
        const button = event.currentTarget;
        const currentModal = button.closest('#algorithmModal');

        if (!currentModal) {
            deps.showNotification?.(
                'Ошибка: Не удалось определить контекст для удаления.',
                'error',
            );
            return;
        }

        const algorithmIdToDelete = currentModal.dataset.currentAlgorithmId;
        const sectionToDelete = currentModal.dataset.currentSection;

        if (!algorithmIdToDelete || !sectionToDelete) {
            deps.showNotification?.(
                'Ошибка: Не удалось определить алгоритм для удаления.',
                'error',
            );
            return;
        }

        if (sectionToDelete === 'main') {
            deps.showNotification?.('Главный алгоритм удалить нельзя.', 'warning');
            return;
        }

        const modalTitleElement = document.getElementById('modalTitle');
        const algorithmTitle = modalTitleElement
            ? modalTitleElement.textContent
            : `алгоритм с ID ${algorithmIdToDelete}`;

        const confirmed = deps.showAppConfirm
            ? await deps.showAppConfirm({
                  title: 'Удаление алгоритма',
                  message: `Вы уверены, что хотите удалить алгоритм "${algorithmTitle}"? Это действие необратимо.`,
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : confirm(
                  `Вы уверены, что хотите удалить алгоритм "${algorithmTitle}"? Это действие необратимо.`,
              );
        if (confirmed) {
            currentModal.classList.add('hidden');

            try {
                if (typeof deps.deleteAlgorithm === 'function') {
                    await deps.deleteAlgorithm(algorithmIdToDelete, sectionToDelete);
                } else {
                    throw new Error('Функция удаления недоступна.');
                }
            } catch (error) {
                console.error('Ошибка при вызове deleteAlgorithm:', error);
                deps.showNotification?.(
                    'Произошла ошибка при попытке удаления алгоритма.',
                    'error',
                );
            }
        }
    };

    if (deleteAlgorithmBtn._clickHandler) {
        deleteAlgorithmBtn.removeEventListener('click', deleteAlgorithmBtn._clickHandler);
    }
    deleteAlgorithmBtn.addEventListener('click', clickHandler);
    deleteAlgorithmBtn._clickHandler = clickHandler;

    // Кнопки «Добавить» в разделах алгоритмов (Программа 1С, СКЗИ, 1СО ЛК, Веб-Регистратор)
    const addButtonSections = [
        { id: 'addProgramAlgorithmBtn', section: 'program' },
        { id: 'addSkziAlgorithmBtn', section: 'skzi' },
        { id: 'addLk1cAlgorithmBtn', section: 'lk1c' },
        { id: 'addWebRegAlgorithmBtn', section: 'webReg' },
    ];
    for (const { id, section } of addButtonSections) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        if (btn._addAlgorithmHandler) {
            btn.removeEventListener('click', btn._addAlgorithmHandler);
        }
        const handler = async () => {
            if (typeof deps.showAddModal === 'function') {
                await deps.showAddModal(section);
            } else {
                console.error('showAddModal не найден для кнопки', id);
            }
        };
        btn.addEventListener('click', handler);
        btn._addAlgorithmHandler = handler;
    }
}
