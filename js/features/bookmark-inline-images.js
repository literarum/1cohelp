'use strict';

/**
 * Отображение встроенных изображений закладки (просмотр и редактор).
 *
 * Сохранённая разметка содержит только <figure data-shot="ID" …> без <img>: изображение
 * подставляется при показе из хранилища `screenshots`. Кадрирование неразрушающее —
 * исходный файл не меняется, видимая область задаётся долями (data-crop) и рисуется рамкой
 * с overflow:hidden и абсолютно позиционированным <img>. Так работает во всех браузерах
 * (CSS object-view-box в Safari и Firefox не поддерживается).
 */

import { readFigureModel } from './bookmark-rich-text.js';

export const FIGURE_SELECTOR = 'figure[data-shot], figure[data-shot-temp]';

export function figureKey(fig) {
    const shot = fig?.getAttribute('data-shot');
    if (shot) return `id:${shot}`;
    const temp = fig?.getAttribute('data-shot-temp');
    return temp || '';
}

/**
 * Применяет ширину, выравнивание и кадр к figure. `naturalRatio` — W/H исходника,
 * если data-ratio ещё не записан (старые или только что загружаемые изображения).
 */
export function layoutFigure(fig, naturalRatio = null) {
    const model = readFigureModel(fig);
    const frame = fig.querySelector(':scope > .bm-fig-frame');
    const img = frame?.querySelector('img');
    fig.style.setProperty('--bm-fig-w', `${model.align === 'wide' ? 100 : model.width}%`);
    if (!frame || !img) return model;
    const ratio = model.ratio || naturalRatio || fig._bmNaturalRatio || null;
    const crop = model.crop;
    if (crop && ratio) {
        frame.classList.add('is-cropped');
        frame.style.aspectRatio = String((ratio * crop.w) / crop.h);
        img.style.width = `${100 / crop.w}%`;
        img.style.height = `${100 / crop.h}%`;
        img.style.left = `${(-crop.x / crop.w) * 100}%`;
        img.style.top = `${(-crop.y / crop.h) * 100}%`;
    } else {
        frame.classList.remove('is-cropped');
        frame.style.aspectRatio = ratio ? String(ratio) : '';
        for (const p of ['width', 'height', 'left', 'top']) img.style.removeProperty(p);
    }
    return model;
}

export function revokeObjectUrlsIn(root) {
    root?.querySelectorAll?.('img[data-object-url]').forEach((img) => {
        try {
            URL.revokeObjectURL(img.dataset.objectUrl);
        } catch {
            /* уже освобождён */
        }
        delete img.dataset.objectUrl;
    });
}

async function defaultLoadShot(id) {
    const { getFromIndexedDB } = await import('../db/indexeddb.js');
    return getFromIndexedDB('screenshots', id);
}

function toBlob(value) {
    if (value instanceof Blob) return value;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return new Blob([value]);
    return null;
}

/**
 * Подставляет изображения в отрисованное описание закладки (режим просмотра).
 * Клик или Enter открывает полноэкранный просмотр всех встроенных изображений.
 * @returns {Promise<{ids:Set<number>, dispose:Function}>}
 */
export async function hydrateBookmarkFigures(root, options = {}) {
    const loadShot = options.loadShot || defaultLoadShot;
    const openLightbox =
        options.openLightbox ||
        (typeof window !== 'undefined' && typeof window.openLightbox === 'function'
            ? window.openLightbox
            : null);
    const figures = Array.from(root?.querySelectorAll?.('figure[data-shot]') || []);
    const ids = new Set();
    const entries = [];
    await Promise.all(
        figures.map(async (fig) => {
            const id = Number(fig.getAttribute('data-shot'));
            ids.add(id);
            const model = readFigureModel(fig);
            const frame = document.createElement('div');
            frame.className = 'bm-fig-frame';
            fig.prepend(frame);
            let record = null;
            try {
                record = await loadShot(id);
            } catch (e) {
                console.warn('[bookmark-inline-images] Не удалось загрузить изображение', id, e);
            }
            const blob = toBlob(record?.blob);
            if (!blob || !fig.isConnected) {
                frame.classList.add('is-missing');
                frame.setAttribute('role', 'img');
                frame.setAttribute('aria-label', 'Изображение недоступно');
                frame.innerHTML =
                    '<span class="bm-fig-missing"><i class="far fa-image" aria-hidden="true"></i> Изображение недоступно</span>';
                layoutFigure(fig);
                return;
            }
            const img = document.createElement('img');
            const url = URL.createObjectURL(blob);
            img.dataset.objectUrl = url;
            img.alt = model.alt || model.caption || 'Изображение';
            img.decoding = 'async';
            img.draggable = false;
            img.addEventListener(
                'load',
                () => {
                    if (img.naturalHeight) {
                        fig._bmNaturalRatio = img.naturalWidth / img.naturalHeight;
                        layoutFigure(fig);
                    }
                },
                { once: true },
            );
            img.src = url;
            frame.append(img);
            layoutFigure(fig);
            entries.push({ fig, frame, blob });
        }),
    );
    // Порядок просмотра совпадает с порядком в тексте.
    entries.sort((a, b) =>
        a.fig.compareDocumentPosition(b.fig) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const blobs = entries.map((e) => e.blob);
    entries.forEach(({ frame }, index) => {
        if (typeof openLightbox !== 'function') return;
        frame.tabIndex = 0;
        frame.setAttribute('role', 'button');
        frame.setAttribute(
            'aria-label',
            `Открыть изображение ${index + 1} из ${entries.length} в полноэкранном просмотре`,
        );
        const open = () => openLightbox(blobs, index);
        frame.addEventListener('click', open);
        frame.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });
    });
    return { ids, dispose: () => revokeObjectUrlsIn(root) };
}
