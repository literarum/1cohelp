'use strict';

/** Секция «Анимация загрузки» во вкладке «Движение» студии оформления + предпросмотр. */

import { readOverlaySettings, writeOverlaySettings } from './overlay-settings.js';
import { createSphereRenderer } from './sphere-renderer.js';

const FIELDS = { overlayDuration: 'duration', overlayFinale: 'finale', overlayPalette: 'palette' };

function sync(root) {
    const s = readOverlaySettings();
    for (const [name, key] of Object.entries(FIELDS)) {
        root.querySelectorAll(`input[name="${name}"]`).forEach((i) => {
            i.checked = i.value === s[key];
        });
    }
}

/** Полноэкранный предпросмотр: ~3 с работы и финал по текущим настройкам. */
export function playOverlayPreview() {
    if (document.getElementById('overlayPreviewLayer')) return;
    const layer = document.createElement('div');
    layer.id = 'overlayPreviewLayer';
    layer.setAttribute('role', 'presentation');
    layer.innerHTML = '<canvas></canvas><button type="button" class="ovp-skip">Пропустить</button>';
    document.body.appendChild(layer);
    const renderer = createSphereRenderer(layer.querySelector('canvas'));
    renderer.setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    renderer.start();
    let finished = false;
    const finish = async () => {
        if (finished) return;
        finished = true;
        layer.classList.add('is-exiting');
        await renderer.finish();
        renderer.stop();
        layer.remove();
    };
    const t = setTimeout(finish, 3200);
    layer.querySelector('.ovp-skip').addEventListener('click', () => {
        clearTimeout(t);
        void finish();
    });
}

export function initOverlaySettingsUI() {
    const root = document.getElementById('acOverlaySettings');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    sync(root);
    root.addEventListener('change', (e) => {
        const t = e.target;
        const key = t instanceof HTMLInputElement ? FIELDS[t.name] : null;
        if (!key) return;
        writeOverlaySettings({ [key]: t.value });
        e.stopPropagation(); // не помечаем оформление «не сохранённым» — настройка сохраняется сразу
    });
    document.getElementById('acOverlayPreviewBtn')?.addEventListener('click', playOverlayPreview);
}
