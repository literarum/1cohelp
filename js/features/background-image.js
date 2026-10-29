/**
 * Background Image Module
 * Управление пользовательским фоновым изображением
 */

let deps = {
    showNotification: null,
    saveToIndexedDB: null,
    deleteFromIndexedDB: null,
    processImageFile: null,
    showAppConfirm: null,
};

let currentImage = null;
let previewSession = null;

export function beginBackgroundImagePreview() {
    previewSession = { original: currentImage, current: currentImage, committed: false };
}

export function restoreBackgroundImagePreview() {
    if (!previewSession) return;
    previewSession = { original: previewSession.original, current: previewSession.original, committed: false };
    if (previewSession.current) applyCustomBackgroundImage(previewSession.current);
    else removeCustomBackgroundImage();
}

export function clearBackgroundImagePreview() {
    if (!previewSession) return;
    previewSession.current = null;
    removeCustomBackgroundImage();
}

export function endBackgroundImagePreview() {
    restoreBackgroundImagePreview();
    previewSession = null;
}

export async function commitBackgroundImagePreview() {
    if (!previewSession || previewSession.current === previewSession.original) return;
    if (previewSession.current) {
        await deps.saveToIndexedDB('preferences', { id: 'customBackgroundImage', value: previewSession.current });
    } else {
        await deps.deleteFromIndexedDB('preferences', 'customBackgroundImage');
    }
    previewSession.committed = true;
}

export function acceptBackgroundImagePreview() {
    if (!previewSession) return;
    previewSession.original = previewSession.current;
    previewSession.committed = false;
}

export async function rollbackBackgroundImageCommit() {
    if (!previewSession?.committed) return;
    if (previewSession.original) {
        await deps.saveToIndexedDB('preferences', { id: 'customBackgroundImage', value: previewSession.original });
    } else {
        await deps.deleteFromIndexedDB('preferences', 'customBackgroundImage');
    }
    previewSession.committed = false;
}

/**
 * Установка зависимостей модуля
 * @param {Object} dependencies - объект с зависимостями
 */
export function setBackgroundImageDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
}

/**
 * Применить пользовательское фоновое изображение
 * @param {string} dataUrl - Data URL изображения
 */
export function applyCustomBackgroundImage(dataUrl) {
    if (dataUrl && typeof dataUrl === 'string') {
        currentImage = dataUrl;
        document.documentElement.style.setProperty('--custom-background-image', `url(${dataUrl})`);
        document.body.classList.add('custom-bg-image-active');

        const preview = document.getElementById('backgroundImagePreview');
        const previewText = document.getElementById('backgroundImagePreviewText');
        const removeBtn = document.getElementById('backgroundImageRemoveBtn');

        if (preview) {
            preview.style.backgroundImage = `url(${dataUrl})`;
        }
        if (previewText) {
            previewText.classList.add('hidden');
        }
        if (removeBtn) {
            removeBtn.classList.remove('hidden');
        }
    }
}

/**
 * Удалить пользовательское фоновое изображение
 */
export function removeCustomBackgroundImage() {
    currentImage = null;
    document.documentElement.style.removeProperty('--custom-background-image');
    document.body.classList.remove('custom-bg-image-active');

    const preview = document.getElementById('backgroundImagePreview');
    const previewText = document.getElementById('backgroundImagePreviewText');
    const removeBtn = document.getElementById('backgroundImageRemoveBtn');

    if (preview) {
        preview.style.backgroundImage = 'none';
    }
    if (previewText) {
        previewText.classList.remove('hidden');
    }
    if (removeBtn) {
        removeBtn.classList.add('hidden');
    }
}

/**
 * Инициализация элементов управления фоновым изображением
 */
export function setupBackgroundImageControls() {
    const uploadBtn = document.getElementById('backgroundImageUploadBtn');
    const removeBtn = document.getElementById('backgroundImageRemoveBtn');
    const fileInput = document.getElementById('backgroundImageInput');

    if (!uploadBtn || !removeBtn || !fileInput) {
        console.warn(
            'setupBackgroundImageControls: Один или несколько элементов управления фоном не найдены.',
        );
        return;
    }

    const uploadBtnOriginalText = uploadBtn.innerHTML;

    uploadBtn.addEventListener('click', () => fileInput.click());

    removeBtn.addEventListener('click', async () => {
        const session = previewSession;
        const confirmed = deps.showAppConfirm
            ? await deps.showAppConfirm({
                  title: 'Удаление фонового изображения',
                  message: 'Вы уверены, что хотите удалить фоновое изображение?',
                  confirmText: 'Удалить',
                  cancelText: 'Отмена',
                  confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
              })
            : confirm('Вы уверены, что хотите удалить фоновое изображение?');
        if (confirmed) {
            if (session && session !== previewSession) return;
            try {
                if (session) {
                    session.current = null;
                    document.getElementById('appCustomizationModal')?.dispatchEvent(new Event('customization-preview-change'));
                }
                else await deps.deleteFromIndexedDB('preferences', 'customBackgroundImage');
                removeCustomBackgroundImage();
                deps.showNotification(session ? 'Фон убран в предпросмотре. Нажмите «Сохранить», чтобы оставить изменение.' : 'Фоновое изображение удалено.', 'info');
            } catch (error) {
                console.error('Ошибка при удалении фонового изображения из DB:', error);
                deps.showNotification('Ошибка при удалении фона.', 'error');
            }
        }
    });

    fileInput.addEventListener('change', async (event) => {
        const session = previewSession;
        const file = event.target.files[0];
        if (!file) return;

        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            deps.showNotification(
                `Файл слишком большой. Максимальный размер: ${MAX_FILE_SIZE / 1024 / 1024} МБ.`,
                'error',
            );
            fileInput.value = '';
            return;
        }

        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Обработка...';

        try {
            const processedBlob = await deps.processImageFile(file);
            const reader = new FileReader();
            reader.onloadend = async () => {
                const dataUrl = reader.result;
                try {
                    if (session && session !== previewSession) return;
                    if (session) {
                        session.current = dataUrl;
                        document.getElementById('appCustomizationModal')?.dispatchEvent(new Event('customization-preview-change'));
                    }
                    else await deps.saveToIndexedDB('preferences', {
                        id: 'customBackgroundImage',
                        value: dataUrl,
                    });
                    applyCustomBackgroundImage(dataUrl);
                    deps.showNotification(session ? 'Предпросмотр фона готов. Нажмите «Сохранить», чтобы оставить изменение.' : 'Фоновое изображение успешно установлено.', 'success');
                } catch (dbError) {
                    console.error('Ошибка сохранения фона в DB:', dbError);
                    deps.showNotification('Не удалось сохранить фон.', 'error');
                } finally {
                    uploadBtn.disabled = false;
                    uploadBtn.innerHTML = uploadBtnOriginalText;
                    fileInput.value = '';
                }
            };
            reader.readAsDataURL(processedBlob);
        } catch (processError) {
            console.error('Ошибка обработки изображения:', processError);
            deps.showNotification('Ошибка обработки изображения.', 'error');
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = uploadBtnOriginalText;
            fileInput.value = '';
        }
    });
}
