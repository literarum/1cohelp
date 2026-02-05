'use strict';

/**
 * Модуль лайтбокса для просмотра изображений
 * Содержит функции для отображения изображений в полноэкранном режиме
 * с поддержкой зума, панорамирования и навигации
 */

// ============================================================================
// ЗАВИСИМОСТИ (устанавливаются через setLightboxDependencies)
// ============================================================================

let deps = {
    getVisibleModals: null,
};

/**
 * Устанавливает зависимости для модуля Lightbox
 * @param {Object} dependencies - Объект с зависимостями
 */
export function setLightboxDependencies(dependencies) {
    deps = { ...deps, ...dependencies };
    console.log('[Lightbox] Зависимости установлены');
}

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

const MIN_SCALE = 0.2;
const MAX_SCALE = 5.0;
const ZOOM_SENSITIVITY_FACTOR = 0.1;

const LIGHTBOX_HTML_STRUCTURE = `
    <div class="lightbox-content relative w-full h-full flex items-center justify-center p-2 sm:p-4 md:p-8">
        <img id="lightboxImage" class="max-w-full max-h-full object-contain cursor-grab select-none transition-transform duration-100 ease-out hidden" alt="Просмотр изображения">
        <div id="lightboxLoading" class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-25 text-white text-xl">
            <i class="fas fa-spinner fa-spin"></i> Загрузка...
        </div>
        <button id="prevLightboxBtn" type="button" class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 bg-black bg-opacity-40 hover:bg-opacity-60 text-white rounded-full transition-opacity focus:outline-none focus:ring-2 focus:ring-white disabled:opacity-30 disabled:cursor-not-allowed" title="Предыдущее (Стрелка влево)">
            <i class="fas fa-chevron-left fa-fw text-base sm:text-lg"></i>
        </button>
        <button id="nextLightboxBtn" type="button" class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 bg-black bg-opacity-40 hover:bg-opacity-60 text-white rounded-full transition-opacity focus:outline-none focus:ring-2 focus:ring-white disabled:opacity-30 disabled:cursor-not-allowed" title="Следующее (Стрелка вправо)">
            <i class="fas fa-chevron-right fa-fw text-base sm:text-lg"></i>
        </button>
        <div class="absolute top-2 sm:top-4 right-2 sm:right-4 z-20 flex items-center gap-2">
            <div id="lightboxCounter" class="px-2 py-1 bg-black bg-opacity-50 text-white text-xs sm:text-sm rounded">1 / 1</div>
            <button id="closeLightboxBtn" type="button" class="p-2 sm:p-3 bg-black bg-opacity-40 hover:bg-opacity-60 text-white rounded-full transition-opacity focus:outline-none focus:ring-2 focus:ring-white" title="Закрыть (Escape / Backspace)">
                <i class="fas fa-times fa-fw text-base sm:text-lg"></i>
            </button>
        </div>
    </div>
`;

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Отображает изображение по индексу в лайтбоксе
 * @param {number} index - Индекс изображения
 * @param {Blob[]} blobs - Массив Blob изображений
 * @param {Object} stateManager - Менеджер состояния лайтбокса
 * @param {Object} elements - DOM элементы лайтбокса
 */
export function showImageAtIndex(index, blobs, stateManager, elements) {
    const {
        updateCurrentIndex,
        updateCurrentScale,
        updateTranslate,
        updateObjectUrl,
        updatePreloadedUrls,
        updateImageTransform,
        preloadImage,
        getCurrentObjectUrl,
        getCurrentPreloadedUrls,
    } = stateManager;

    const { lightboxImage, loadingIndicator, counterElement, prevBtn, nextBtn } = elements;

    if (!lightboxImage || !loadingIndicator || !counterElement || !prevBtn || !nextBtn) {
        console.error(
            `showImageAtIndex(${index}): КРИТИЧЕСКАЯ ОШИБКА! Не все необходимые DOM-элементы были переданы!`,
        );
        const lightboxRoot = document.getElementById('screenshotLightbox');
        if (lightboxRoot && lightboxRoot._closeLightboxFunction) {
            lightboxRoot._closeLightboxFunction(true);
        }
        return;
    }

    const totalImages = blobs?.length ?? 0;
    if (totalImages === 0) {
        loadingIndicator.innerHTML = 'Нет изображений';
        loadingIndicator.classList.remove('hidden');
        lightboxImage.classList.add('hidden');
        counterElement.textContent = '0 / 0';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }

    if (typeof index !== 'number' || index < 0 || index >= totalImages) {
        index = 0;
    }

    const oldObjectUrl = getCurrentObjectUrl();
    const oldPreloadedUrls = getCurrentPreloadedUrls();
    if (oldObjectUrl) {
        try {
            URL.revokeObjectURL(oldObjectUrl);
        } catch (e) {}
    }
    if (oldPreloadedUrls?.next) {
        try {
            URL.revokeObjectURL(oldPreloadedUrls.next);
        } catch (e) {}
    }
    if (oldPreloadedUrls?.prev) {
        try {
            URL.revokeObjectURL(oldPreloadedUrls.prev);
        } catch (e) {}
    }

    updateCurrentIndex(index);
    updateCurrentScale(1.0);
    updateTranslate(0, 0);
    updateObjectUrl(null);
    updatePreloadedUrls({ next: null, prev: null });

    loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
    loadingIndicator.classList.remove('hidden');
    lightboxImage.classList.add('hidden');
    updateImageTransform();

    const blob = blobs[index];
    counterElement.textContent = `${index + 1} / ${totalImages}`;
    prevBtn.disabled = totalImages <= 1;
    nextBtn.disabled = totalImages <= 1;

    if (!(blob instanceof Blob)) {
        console.error(`Элемент с индексом ${index} не является Blob.`);
        loadingIndicator.innerHTML = 'Ошибка формата';
        return;
    }

    let newObjectUrl = null;
    try {
        newObjectUrl = URL.createObjectURL(blob);

        lightboxImage.onload = null;
        lightboxImage.onerror = null;

        lightboxImage.onload = () => {
            loadingIndicator.classList.add('hidden');
            lightboxImage.classList.remove('hidden');
        };
        lightboxImage.onerror = () => {
            loadingIndicator.innerHTML = 'Ошибка загрузки';
            lightboxImage.classList.add('hidden');
            if (newObjectUrl) {
                try {
                    URL.revokeObjectURL(newObjectUrl);
                } catch (e) {}
            }
            updateObjectUrl(null);
        };
        lightboxImage.src = newObjectUrl;
        updateObjectUrl(newObjectUrl);

        let newPreloaded = { next: null, prev: null };
        if (totalImages > 1) {
            const nextIdx = (index + 1) % totalImages;
            const prevIdx = (index - 1 + totalImages) % totalImages;
            if (nextIdx !== index) {
                newPreloaded.next = preloadImage(nextIdx);
            }
            if (prevIdx !== index) {
                newPreloaded.prev = preloadImage(prevIdx);
            }
        }
        updatePreloadedUrls(newPreloaded);
    } catch (error) {
        console.error('Ошибка при создании Object URL или установке src:', error);
        loadingIndicator.innerHTML = 'Ошибка отображения';
        if (newObjectUrl) {
            try {
                URL.revokeObjectURL(newObjectUrl);
            } catch (e) {}
        }
        updateObjectUrl(null);
    }
}

// ============================================================================
// ОСНОВНАЯ ФУНКЦИЯ ЛАЙТБОКСА
// ============================================================================

/**
 * Открывает лайтбокс для просмотра изображений
 * @param {Blob[]} blobs - Массив Blob изображений
 * @param {number} initialIndex - Начальный индекс изображения
 */
export function openLightbox(blobs, initialIndex) {
    let lightbox = document.getElementById('screenshotLightbox');
    let wheelListener = null;
    let mousedownListener = null;
    let mousemoveListener = null;
    let mouseupListener = null;
    let mouseleaveListener = null;
    let dblClickListener = null;
    let originalTriggerElement = null;
    let lightboxBlobs = blobs || [];

    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'screenshotLightbox';
        lightbox.setAttribute('tabindex', '-1');
        lightbox.className =
            'fixed inset-0 bg-black bg-opacity-75 z-[100] p-0 flex items-center justify-center transition-opacity duration-300 ease-in-out opacity-0 hidden';
        lightbox.innerHTML = LIGHTBOX_HTML_STRUCTURE;
        document.body.appendChild(lightbox);
    } else {
        const requiredSelectors = [
            '#lightboxImage',
            '#lightboxLoading',
            '#lightboxCounter',
            '#prevLightboxBtn',
            '#nextLightboxBtn',
            '#closeLightboxBtn',
        ];
        let isStructureComplete = true;
        for (const selector of requiredSelectors) {
            if (!lightbox.querySelector(selector)) {
                isStructureComplete = false;
                break;
            }
        }
        if (!isStructureComplete) {
            lightbox.innerHTML = LIGHTBOX_HTML_STRUCTURE;
        }
        if (lightbox.getAttribute('tabindex') !== '-1') {
            lightbox.setAttribute('tabindex', '-1');
        }
    }

    let state = {
        currentIndex: initialIndex,
        currentScale: 1.0,
        translateX: 0,
        translateY: 0,
        isPanning: false,
        startPanX: 0,
        startPanY: 0,
        isZoomedByDoubleClick: false,
        currentObjectUrl: null,
        preloadedUrls: { next: null, prev: null },
    };

    const elements = {
        lightboxImage: lightbox.querySelector('#lightboxImage'),
        loadingIndicator: lightbox.querySelector('#lightboxLoading'),
        counterElement: lightbox.querySelector('#lightboxCounter'),
        prevBtn: lightbox.querySelector('#prevLightboxBtn'),
        nextBtn: lightbox.querySelector('#nextLightboxBtn'),
        closeBtn: lightbox.querySelector('#closeLightboxBtn'),
        lightboxContent: lightbox.querySelector('.lightbox-content'),
    };

    if (
        !elements.lightboxImage ||
        !elements.loadingIndicator ||
        !elements.counterElement ||
        !elements.prevBtn ||
        !elements.nextBtn ||
        !elements.closeBtn ||
        !elements.lightboxContent
    ) {
        console.error(
            '[Lightbox Init Error] Один или несколько ключевых DOM-элементов лайтбокса не найдены. Закрытие лайтбокса.',
        );
        closeLightboxInternal(true);
        return;
    }

    function updateImageTransform() {
        if (elements.lightboxImage) {
            const tx = state.currentScale <= 1.001 ? 0 : state.translateX;
            const ty = state.currentScale <= 1.001 ? 0 : state.translateY;
            elements.lightboxImage.style.transform = `translate(${tx}px, ${ty}px) scale(${state.currentScale})`;
            elements.lightboxImage.style.cursor =
                state.currentScale > 1.001 ? (state.isPanning ? 'grabbing' : 'grab') : 'default';
        }
    }

    function checkPanningLimits() {
        if (state.currentScale <= 1.001) {
            state.translateX = 0;
            state.translateY = 0;
            return;
        }

        const imgNaturalWidth = elements.lightboxImage.naturalWidth;
        const imgNaturalHeight = elements.lightboxImage.naturalHeight;

        if (!imgNaturalWidth || !imgNaturalHeight) return;

        const viewportRect = elements.lightboxContent.getBoundingClientRect();
        const viewportWidth = viewportRect.width;
        const viewportHeight = viewportRect.height;

        let renderedWidth, renderedHeight;
        const imgAspectRatio = imgNaturalWidth / imgNaturalHeight;
        const viewportAspectRatio = viewportWidth / viewportHeight;

        if (imgAspectRatio > viewportAspectRatio) {
            renderedWidth = viewportWidth;
            renderedHeight = viewportWidth / imgAspectRatio;
        } else {
            renderedHeight = viewportHeight;
            renderedWidth = viewportHeight * imgAspectRatio;
        }

        const scaledRenderedWidth = renderedWidth * state.currentScale;
        const scaledRenderedHeight = renderedHeight * state.currentScale;

        const maxPanX = Math.max(0, (scaledRenderedWidth - viewportWidth) / 2);
        const maxPanY = Math.max(0, (scaledRenderedHeight - viewportHeight) / 2);

        state.translateX = Math.max(-maxPanX, Math.min(maxPanX, state.translateX));
        state.translateY = Math.max(-maxPanY, Math.min(maxPanY, state.translateY));
    }

    const stateManagerForShowImage = {
        getCurrentIndex: () => state.currentIndex,
        getCurrentObjectUrl: () => state.currentObjectUrl,
        getCurrentPreloadedUrls: () => state.preloadedUrls,
        updateCurrentIndex: (idx) => {
            state.currentIndex = idx;
            state.isZoomedByDoubleClick = false;
        },
        updateCurrentScale: (s) => {
            state.currentScale = s;
            state.isZoomedByDoubleClick = false;
        },
        updateTranslate: (x, y) => {
            state.translateX = x;
            state.translateY = y;
            state.isZoomedByDoubleClick = false;
        },
        updateObjectUrl: (url) => (state.currentObjectUrl = url),
        updatePreloadedUrls: (urls) => (state.preloadedUrls = urls),
        updateImageTransform: updateImageTransform,
        preloadImage: (idx) => {
            if (idx < 0 || idx >= lightboxBlobs.length) return null;
            const blob = lightboxBlobs[idx];
            if (!(blob instanceof Blob)) return null;
            try {
                const url = URL.createObjectURL(blob);
                return url;
            } catch (e) {
                console.error(`[Lightbox] Ошибка создания URL для предзагрузки индекса ${idx}:`, e);
                return null;
            }
        },
    };

    const elementsForShowImage = {
        lightboxImage: elements.lightboxImage,
        loadingIndicator: elements.loadingIndicator,
        counterElement: elements.counterElement,
        prevBtn: elements.prevBtn,
        nextBtn: elements.nextBtn,
    };

    function closeLightboxInternal(force = false) {
        const lbElement = document.getElementById('screenshotLightbox');
        if (!lbElement || (lbElement.classList.contains('hidden') && !force)) return;

        lbElement.classList.remove('opacity-100');
        lbElement.classList.add('opacity-0');

        setTimeout(() => {
            lbElement.classList.add('hidden');
            if (deps.getVisibleModals?.().length === 0) {
                document.body.classList.remove('overflow-hidden');
            } else if (!deps.getVisibleModals) {
                document.body.classList.remove('overflow-hidden');
            }
        }, 300);

        if (elements.lightboxImage) {
            if (wheelListener) elements.lightboxImage.removeEventListener('wheel', wheelListener);
            if (mousedownListener)
                elements.lightboxImage.removeEventListener('mousedown', mousedownListener);
            if (dblClickListener)
                elements.lightboxImage.removeEventListener('dblclick', dblClickListener);
            if (mouseleaveListener)
                elements.lightboxImage.removeEventListener('mouseleave', mouseleaveListener);
            wheelListener = null;
            mousedownListener = null;
            dblClickListener = null;
            mouseleaveListener = null;
            elements.lightboxImage.onload = null;
            elements.lightboxImage.onerror = null;
            elements.lightboxImage.src = '';
            elements.lightboxImage.style.transform = 'translate(0px, 0px) scale(1)';
            elements.lightboxImage.classList.add('hidden');
        }

        if (mousemoveListener) document.removeEventListener('mousemove', mousemoveListener);
        if (mouseupListener) document.removeEventListener('mouseup', mouseupListener);
        mousemoveListener = null;
        mouseupListener = null;

        if (state.currentObjectUrl) {
            try {
                URL.revokeObjectURL(state.currentObjectUrl);
            } catch (e) {}
            state.currentObjectUrl = null;
        }
        if (state.preloadedUrls.next) {
            try {
                URL.revokeObjectURL(state.preloadedUrls.next);
            } catch (e) {}
            state.preloadedUrls.next = null;
        }
        if (state.preloadedUrls.prev) {
            try {
                URL.revokeObjectURL(state.preloadedUrls.prev);
            } catch (e) {}
            state.preloadedUrls.prev = null;
        }

        if (elements.closeBtn && elements.closeBtn._clickHandler) {
            elements.closeBtn.removeEventListener('click', elements.closeBtn._clickHandler);
            delete elements.closeBtn._clickHandler;
        }
        if (lightbox._overlayClickHandler) {
            lightbox.removeEventListener('click', lightbox._overlayClickHandler);
            delete lightbox._overlayClickHandler;
        }
        if (elements.prevBtn && elements.prevBtn._clickHandler) {
            elements.prevBtn.removeEventListener('click', elements.prevBtn._clickHandler);
            delete elements.prevBtn._clickHandler;
        }
        if (elements.nextBtn && elements.nextBtn._clickHandler) {
            elements.nextBtn.removeEventListener('click', elements.nextBtn._clickHandler);
            delete elements.nextBtn._clickHandler;
        }

        if (originalTriggerElement && typeof originalTriggerElement.focus === 'function') {
            setTimeout(() => {
                try {
                    originalTriggerElement.focus();
                } catch (e) {}
            }, 0);
        }
        originalTriggerElement = null;
    }

    lightbox._closeLightboxFunction = closeLightboxInternal;

    function navigateImage(direction) {
        if (lightboxBlobs.length <= 1) return;
        let newIndex = state.currentIndex;
        if (direction === 'prev') {
            newIndex = (state.currentIndex - 1 + lightboxBlobs.length) % lightboxBlobs.length;
        } else if (direction === 'next') {
            newIndex = (state.currentIndex + 1) % lightboxBlobs.length;
        }
        state.isZoomedByDoubleClick = false;
        showImageAtIndex(newIndex, lightboxBlobs, stateManagerForShowImage, elementsForShowImage);
    }
    lightbox._navigateImageFunction = navigateImage;

    wheelListener = (event) => {
        if (!elements.lightboxImage || elements.lightboxImage.classList.contains('hidden')) return;
        event.preventDefault();

        const delta = event.deltaY > 0 ? -1 : 1;
        const scaleAmount = state.currentScale * ZOOM_SENSITIVITY_FACTOR * delta;
        let newScale = state.currentScale + scaleAmount;
        newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

        if (newScale === state.currentScale) return;

        const rect = elements.lightboxImage.getBoundingClientRect();
        const mouseXGlobal = event.clientX;
        const mouseYGlobal = event.clientY;

        const mouseXOnImg = mouseXGlobal - rect.left;
        const mouseYOnImg = mouseYGlobal - rect.top;

        const imgRenderedWidth = rect.width / state.currentScale;
        const imgRenderedHeight = rect.height / state.currentScale;

        const pointX =
            (mouseXOnImg - imgRenderedWidth / 2 - state.translateX) / state.currentScale +
            imgRenderedWidth / 2;
        const pointY =
            (mouseYOnImg - imgRenderedHeight / 2 - state.translateY) / state.currentScale +
            imgRenderedHeight / 2;

        state.translateX =
            mouseXOnImg - imgRenderedWidth / 2 - (pointX - imgRenderedWidth / 2) * newScale;
        state.translateY =
            mouseYOnImg - imgRenderedHeight / 2 - (pointY - imgRenderedHeight / 2) * newScale;

        state.currentScale = newScale;
        state.isZoomedByDoubleClick = false;

        checkPanningLimits();
        updateImageTransform();
    };

    dblClickListener = (event) => {
        if (!elements.lightboxImage || elements.lightboxImage.classList.contains('hidden')) return;
        event.preventDefault();

        const prevScale = state.currentScale;

        if (state.isZoomedByDoubleClick) {
            state.currentScale = 1.0;
            state.translateX = 0;
            state.translateY = 0;
            state.isZoomedByDoubleClick = false;
        } else {
            state.currentScale = Math.min(prevScale * 1.2, MAX_SCALE);

            const rect = elements.lightboxImage.getBoundingClientRect();
            const mouseXGlobal = event.clientX;
            const mouseYGlobal = event.clientY;
            const mouseXOnImg = mouseXGlobal - rect.left;
            const mouseYOnImg = mouseYGlobal - rect.top;

            const imgRenderedWidth = rect.width / prevScale;
            const imgRenderedHeight = rect.height / prevScale;

            const pointX =
                (mouseXOnImg - imgRenderedWidth / 2 - state.translateX) / prevScale +
                imgRenderedWidth / 2;
            const pointY =
                (mouseYOnImg - imgRenderedHeight / 2 - state.translateY) / prevScale +
                imgRenderedHeight / 2;

            state.translateX =
                mouseXOnImg -
                imgRenderedWidth / 2 -
                (pointX - imgRenderedWidth / 2) * state.currentScale;
            state.translateY =
                mouseYOnImg -
                imgRenderedHeight / 2 -
                (pointY - imgRenderedHeight / 2) * state.currentScale;

            state.isZoomedByDoubleClick = true;
        }

        checkPanningLimits();
        updateImageTransform();
    };

    mousedownListener = (event) => {
        if (
            state.currentScale <= 1.001 ||
            !elements.lightboxImage ||
            elements.lightboxImage.classList.contains('hidden')
        )
            return;
        event.preventDefault();
        state.isPanning = true;
        state.startPanX = event.clientX - state.translateX;
        state.startPanY = event.clientY - state.translateY;
        elements.lightboxImage.style.cursor = 'grabbing';
        elements.lightboxImage.classList.add('panning');
        state.isZoomedByDoubleClick = false;
    };

    mousemoveListener = (event) => {
        if (!state.isPanning || !elements.lightboxImage) return;
        event.preventDefault();
        state.translateX = event.clientX - state.startPanX;
        state.translateY = event.clientY - state.startPanY;
        checkPanningLimits();
        updateImageTransform();
    };

    mouseupListener = (event) => {
        if (!state.isPanning || !elements.lightboxImage) return;
        event.preventDefault();
        state.isPanning = false;
        elements.lightboxImage.style.cursor = 'grab';
        elements.lightboxImage.classList.remove('panning');
    };

    mouseleaveListener = (event) => {
        if (state.isPanning) {
            mouseupListener(event);
        }
    };

    setTimeout(() => {
        const currentLightboxInstance = document.getElementById('screenshotLightbox');
        if (!currentLightboxInstance) {
            console.error('[Lightbox] openLightbox (setTimeout): Лайтбокс исчез!');
            return;
        }

        originalTriggerElement = document.activeElement;
        currentLightboxInstance._closeLightboxFunction = closeLightboxInternal;
        currentLightboxInstance._navigateImageFunction = navigateImage;

        if (elements.closeBtn) {
            if (elements.closeBtn._clickHandler)
                elements.closeBtn.removeEventListener('click', elements.closeBtn._clickHandler);
            elements.closeBtn._clickHandler = () => {
                if (currentLightboxInstance._closeLightboxFunction)
                    currentLightboxInstance._closeLightboxFunction();
            };
            elements.closeBtn.addEventListener('click', elements.closeBtn._clickHandler);
        }

        if (currentLightboxInstance._overlayClickHandler)
            currentLightboxInstance.removeEventListener(
                'click',
                currentLightboxInstance._overlayClickHandler,
            );
        currentLightboxInstance._overlayClickHandler = (event) => {
            if (event.target === currentLightboxInstance) {
                if (currentLightboxInstance._closeLightboxFunction)
                    currentLightboxInstance._closeLightboxFunction();
            }
        };
        currentLightboxInstance.addEventListener(
            'click',
            currentLightboxInstance._overlayClickHandler,
        );

        if (elements.prevBtn) {
            if (elements.prevBtn._clickHandler)
                elements.prevBtn.removeEventListener('click', elements.prevBtn._clickHandler);
            elements.prevBtn._clickHandler = () => {
                if (currentLightboxInstance._navigateImageFunction)
                    currentLightboxInstance._navigateImageFunction('prev');
            };
            elements.prevBtn.addEventListener('click', elements.prevBtn._clickHandler);
        }
        if (elements.nextBtn) {
            if (elements.nextBtn._clickHandler)
                elements.nextBtn.removeEventListener('click', elements.nextBtn._clickHandler);
            elements.nextBtn._clickHandler = () => {
                if (currentLightboxInstance._navigateImageFunction)
                    currentLightboxInstance._navigateImageFunction('next');
            };
            elements.nextBtn.addEventListener('click', elements.nextBtn._clickHandler);
        }

        if (elements.lightboxImage) {
            if (wheelListener && elements.lightboxImage._wheelListenerAttached)
                elements.lightboxImage.removeEventListener('wheel', wheelListener);
            if (mousedownListener && elements.lightboxImage._mousedownListenerAttached)
                elements.lightboxImage.removeEventListener('mousedown', mousedownListener);
            if (dblClickListener && elements.lightboxImage._dblClickListenerAttached)
                elements.lightboxImage.removeEventListener('dblclick', dblClickListener);
            if (mouseleaveListener && elements.lightboxImage._mouseleaveListenerAttached)
                elements.lightboxImage.removeEventListener('mouseleave', mouseleaveListener);

            elements.lightboxImage.addEventListener('wheel', wheelListener, { passive: false });
            elements.lightboxImage._wheelListenerAttached = true;
            elements.lightboxImage.addEventListener('dblclick', dblClickListener);
            elements.lightboxImage._dblClickListenerAttached = true;
            elements.lightboxImage.addEventListener('mousedown', mousedownListener);
            elements.lightboxImage._mousedownListenerAttached = true;
            elements.lightboxImage.addEventListener('mouseleave', mouseleaveListener);
            elements.lightboxImage._mouseleaveListenerAttached = true;
        }

        if (mousemoveListener && !document._lightboxMousemoveListenerAttached) {
            document.addEventListener('mousemove', mousemoveListener);
            document._lightboxMousemoveListenerAttached = true;
        }
        if (mouseupListener && !document._lightboxMouseupListenerAttached) {
            document.addEventListener('mouseup', mouseupListener);
            document._lightboxMouseupListenerAttached = true;
        }

        currentLightboxInstance.classList.remove('hidden');
        requestAnimationFrame(() => {
            currentLightboxInstance.classList.remove('opacity-0');
            currentLightboxInstance.classList.add('opacity-100');
        });
        document.body.classList.add('overflow-hidden');

        showImageAtIndex(
            state.currentIndex,
            lightboxBlobs,
            stateManagerForShowImage,
            elementsForShowImage,
        );

        setTimeout(() => {
            if (currentLightboxInstance && typeof currentLightboxInstance.focus === 'function') {
                currentLightboxInstance.focus();
            }
        }, 50);
    }, 0);
}
