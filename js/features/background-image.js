/**
 * Background Image Module
 * Управление пользовательским фоновым изображением
 */

let deps = {
    showNotification: null,
    saveToIndexedDB: null,
    deleteFromIndexedDB: null,
    processImageFile: null,
};

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
        if (confirm('Вы уверены, что хотите удалить фоновое изображение?')) {
            try {
                await deps.deleteFromIndexedDB('preferences', 'customBackgroundImage');
                removeCustomBackgroundImage();
                deps.showNotification('Фоновое изображение удалено.', 'info');
            } catch (error) {
                console.error('Ошибка при удалении фонового изображения из DB:', error);
                deps.showNotification('Ошибка при удалении фона.', 'error');
            }
        }
    });

    fileInput.addEventListener('change', async (event) => {
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
                    await deps.saveToIndexedDB('preferences', {
                        id: 'customBackgroundImage',
                        value: dataUrl,
                    });
                    applyCustomBackgroundImage(dataUrl);
                    deps.showNotification('Фоновое изображение успешно установлено.', 'success');
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
