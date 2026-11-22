'use strict';

/**
 * Неразрушающее кадрирование изображения закладки.
 * Возвращает Promise с областью {x,y,w,h} в долях исходника, null (без кадра) или undefined (отмена).
 * Управление: перетаскивание рамки и восьми ручек (мышь, перо, палец); стрелки — сдвиг,
 * Shift+стрелки — крупный шаг, Alt+стрелки — размер; Enter — готово; Esc — отмена.
 */

const MIN = 0.04;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ASPECTS = [
    ['free', 'Свободно', null],
    ['original', 'Исходное', 'original'],
    ['16:9', '16:9', 16 / 9],
    ['4:3', '4:3', 4 / 3],
    ['1:1', '1:1', 1],
];

/** Наибольший прямоугольник заданной пропорции (в пикселях исходника) с центром в (cx, cy). */
export function fitAspect(rect, aspect, ratio) {
    if (!aspect) return rect;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    // aspect = (w·W)/(h·H) ⇒ h = w·ratio/aspect
    let w = rect.w;
    let h = (w * ratio) / aspect;
    if (h > rect.h) {
        h = rect.h;
        w = (h * aspect) / ratio;
    }
    if (w > 1) {
        w = 1;
        h = (w * ratio) / aspect;
    }
    if (h > 1) {
        h = 1;
        w = (h * aspect) / ratio;
    }
    return {
        x: clamp(cx - w / 2, 0, 1 - w),
        y: clamp(cy - h / 2, 0, 1 - h),
        w,
        h,
    };
}

/** Изменение рамки ручкой `handle` на смещение (dx, dy) в долях; с фиксацией пропорции. */
export function resizeRect(start, handle, dx, dy, aspect, ratio) {
    let { x, y, w, h } = start;
    const right = x + w;
    const bottom = y + h;
    if (handle.includes('w')) x = clamp(x + dx, 0, right - MIN);
    if (handle.includes('e')) w = clamp(w + dx, MIN, 1 - x);
    if (handle.includes('w')) w = right - x;
    if (handle.includes('n')) y = clamp(y + dy, 0, bottom - MIN);
    if (handle.includes('s')) h = clamp(h + dy, MIN, 1 - y);
    if (handle.includes('n')) h = bottom - y;
    if (!aspect) return { x, y, w, h };
    const k = ratio / aspect; // h = w·k
    const horizontal = handle === 'e' || handle === 'w';
    const vertical = handle === 'n' || handle === 's';
    if (vertical) w = h / k;
    else h = w * k;
    // Вписываем в границы, сохраняя пропорцию и неподвижную сторону/угол.
    const anchorX = handle.includes('w') ? right : handle.includes('e') ? x : start.x + start.w / 2;
    const anchorY = handle.includes('n') ? bottom : handle.includes('s') ? y : start.y + start.h / 2;
    const maxW = handle.includes('w') ? anchorX : handle.includes('e') ? 1 - anchorX : 2 * Math.min(anchorX, 1 - anchorX);
    const maxH = handle.includes('n') ? anchorY : handle.includes('s') ? 1 - anchorY : 2 * Math.min(anchorY, 1 - anchorY);
    if (w > maxW) {
        w = maxW;
        h = w * k;
    }
    if (h > maxH) {
        h = maxH;
        w = h / k;
    }
    if (w < MIN) {
        w = MIN;
        h = w * k;
    }
    if (h < MIN) {
        h = MIN;
        w = h / k;
    }
    x = handle.includes('w') ? anchorX - w : handle.includes('e') ? anchorX : anchorX - w / 2;
    y = handle.includes('n') ? anchorY - h : handle.includes('s') ? anchorY : anchorY - h / 2;
    if (horizontal) y = anchorY - h / 2;
    if (vertical) x = anchorX - w / 2;
    return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h };
}

const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
};

export function openBookmarkImageCrop({ src, crop, ratio: knownRatio, title = 'Кадрирование' }) {
    return new Promise((resolve) => {
        const previousFocus = document.activeElement;
        const overlay = make('div', 'bm-crop-overlay');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', title);
        const sheet = make('div', 'bm-crop-sheet');
        const header = make('div', 'bm-crop-header');
        header.append(make('h2', 'bm-crop-title', title));
        const hint = make(
            'p',
            'bm-crop-hint',
            'Перетащите рамку или её края. Стрелки — сдвиг, Alt+стрелки — размер, Enter — готово.',
        );
        header.append(hint);
        const stage = make('div', 'bm-crop-stage');
        const canvas = make('div', 'bm-crop-canvas');
        const img = make('img', 'bm-crop-image');
        img.alt = '';
        img.draggable = false;
        const box = make('div', 'bm-crop-box');
        box.tabIndex = 0;
        box.setAttribute('role', 'slider');
        box.setAttribute('aria-label', 'Область кадра');
        // Затемнение — отдельным слоем: у фокусируемых элементов приложение глобально снимает тени.
        const shade = make('div', 'bm-crop-shade');
        shade.setAttribute('aria-hidden', 'true');
        const grid = make('div', 'bm-crop-grid');
        grid.setAttribute('aria-hidden', 'true');
        box.append(shade, grid);
        for (const h of HANDLES) {
            const handle = make('span', `bm-crop-handle bm-crop-handle--${h}`);
            handle.dataset.handle = h;
            handle.setAttribute('aria-hidden', 'true');
            box.append(handle);
        }
        canvas.append(img, box);
        stage.append(canvas);
        const footer = make('div', 'bm-crop-footer');
        const aspects = make('div', 'bm-segmented');
        aspects.setAttribute('role', 'radiogroup');
        aspects.setAttribute('aria-label', 'Пропорции');
        const sizeLabel = make('span', 'bm-crop-size');
        sizeLabel.setAttribute('aria-live', 'polite');
        const actions = make('div', 'bm-crop-actions');
        const resetBtn = make('button', 'bm-btn', 'Сбросить');
        const cancelBtn = make('button', 'bm-btn', 'Отмена');
        const doneBtn = make('button', 'bm-btn bm-btn--primary', 'Готово');
        for (const b of [resetBtn, cancelBtn, doneBtn]) b.type = 'button';
        actions.append(resetBtn, cancelBtn, doneBtn);
        footer.append(aspects, sizeLabel, actions);
        sheet.append(header, stage, footer);
        overlay.append(sheet);

        let ratio = knownRatio || 1;
        let rect = crop ? { ...crop } : { x: 0, y: 0, w: 1, h: 1 };
        let aspectKey = 'free';
        const aspectValue = () => {
            const found = ASPECTS.find(([k]) => k === aspectKey)?.[2];
            return found === 'original' ? ratio : found;
        };
        const aspectButtons = ASPECTS.map(([key, label]) => {
            const b = make('button', 'bm-segment', label);
            b.type = 'button';
            b.setAttribute('role', 'radio');
            b.addEventListener('click', () => {
                aspectKey = key;
                rect = fitAspect(rect, aspectValue(), ratio);
                render();
            });
            aspects.append(b);
            return [key, b];
        });

        const render = () => {
            box.style.left = `${rect.x * 100}%`;
            box.style.top = `${rect.y * 100}%`;
            box.style.width = `${rect.w * 100}%`;
            box.style.height = `${rect.h * 100}%`;
            for (const [key, b] of aspectButtons) b.setAttribute('aria-checked', String(key === aspectKey));
            const W = img.naturalWidth || 0;
            const H = img.naturalHeight || 0;
            const text = W ? `${Math.round(rect.w * W)} × ${Math.round(rect.h * H)} px` : '';
            sizeLabel.textContent = text;
            box.setAttribute('aria-valuetext', `${Math.round(rect.w * 100)} % × ${Math.round(rect.h * 100)} %`);
        };

        const fitCanvas = () => {
            // Поле вокруг холста, чтобы ручки на краях изображения не обрезались.
            const maxW = stage.clientWidth - 28;
            const maxH = stage.clientHeight - 28;
            if (maxW <= 0 || maxH <= 0) return;
            let w = maxW;
            let h = w / ratio;
            if (h > maxH) {
                h = maxH;
                w = h * ratio;
            }
            canvas.style.width = `${Math.floor(w)}px`;
            canvas.style.height = `${Math.floor(h)}px`;
        };

        let drag = null;
        const onPointerDown = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            const handle = e.target.closest?.('.bm-crop-handle')?.dataset.handle;
            const inBox = !!e.target.closest?.('.bm-crop-box');
            const bounds = canvas.getBoundingClientRect();
            if (!bounds.width) return;
            e.preventDefault();
            const px = (e.clientX - bounds.left) / bounds.width;
            const py = (e.clientY - bounds.top) / bounds.height;
            if (handle) drag = { mode: handle, start: { ...rect }, px, py, bounds };
            else if (inBox) drag = { mode: 'move', start: { ...rect }, px, py, bounds };
            else {
                // Новая рамка с точки нажатия: тянем как за юго-восточный угол.
                rect = { x: clamp(px, 0, 1 - MIN), y: clamp(py, 0, 1 - MIN), w: MIN, h: MIN };
                drag = { mode: 'se', start: { ...rect }, px, py, bounds };
            }
            overlay.classList.add('is-dragging');
            canvas.setPointerCapture?.(e.pointerId);
            box.focus({ preventScroll: true });
        };
        const onPointerMove = (e) => {
            if (!drag) return;
            const dx = (e.clientX - drag.bounds.left) / drag.bounds.width - drag.px;
            const dy = (e.clientY - drag.bounds.top) / drag.bounds.height - drag.py;
            if (drag.mode === 'move') {
                rect = {
                    ...drag.start,
                    x: clamp(drag.start.x + dx, 0, 1 - drag.start.w),
                    y: clamp(drag.start.y + dy, 0, 1 - drag.start.h),
                };
            } else rect = resizeRect(drag.start, drag.mode, dx, dy, aspectValue(), ratio);
            render();
        };
        const onPointerUp = () => {
            drag = null;
            overlay.classList.remove('is-dragging');
        };
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);

        const finish = (result) => {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', onResize);
            overlay.remove();
            try {
                previousFocus?.focus?.({ preventScroll: true });
            } catch {
                /* элемент мог исчезнуть */
            }
            resolve(result);
        };
        const done = () => {
            const full = rect.x < 0.002 && rect.y < 0.002 && rect.w > 0.998 && rect.h > 0.998;
            finish(full ? null : { ...rect });
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                finish(undefined);
                return;
            }
            if (e.key === 'Tab') {
                // Фокус остаётся внутри окна.
                const focusables = Array.from(overlay.querySelectorAll('button, [tabindex="0"]'));
                const i = focusables.indexOf(document.activeElement);
                const next = e.shiftKey ? i - 1 : i + 1;
                e.preventDefault();
                focusables[(next + focusables.length) % focusables.length]?.focus();
                e.stopImmediatePropagation();
                return;
            }
            if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') {
                e.preventDefault();
                e.stopImmediatePropagation();
                done();
                return;
            }
            if (document.activeElement !== box || !e.key.startsWith('Arrow')) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const step = e.shiftKey ? 0.05 : 0.01;
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            if (e.altKey) rect = resizeRect(rect, dx ? 'e' : 's', dx, dy, aspectValue(), ratio);
            else rect = { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.w), y: clamp(rect.y + dy, 0, 1 - rect.h) };
            render();
        };
        const onResize = () => fitCanvas();
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        resetBtn.addEventListener('click', () => {
            aspectKey = 'free';
            rect = { x: 0, y: 0, w: 1, h: 1 };
            render();
        });
        cancelBtn.addEventListener('click', () => finish(undefined));
        // Клик по затемнению намеренно ничего не делает: случайный промах не должен терять работу.
        doneBtn.addEventListener('click', done);

        img.addEventListener('load', () => {
            if (img.naturalWidth && img.naturalHeight) ratio = img.naturalWidth / img.naturalHeight;
            fitCanvas();
            render();
        });
        img.src = src;
        document.body.append(overlay);
        fitCanvas();
        render();
        requestAnimationFrame(() => {
            fitCanvas();
            box.focus({ preventScroll: true });
        });
    });
}
