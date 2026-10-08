'use strict';

import {
    getGoogleScriptUrl,
    hasCustomGoogleScriptUrl,
    setGoogleScriptUrl,
    isValidGoogleScriptUrl,
    testGoogleScriptConnection,
    syncGoogleDocsNow,
} from '../features/google-docs.js';

function setStatus(box, kind, title, hint) {
    box.textContent = '';
    box.dataset.kind = kind;
    if (!title) return;
    const t = document.createElement('div');
    t.className = 'gs-status__title';
    t.textContent = title;
    box.appendChild(t);
    if (hint) {
        const h = document.createElement('div');
        h.className = 'gs-status__hint';
        h.textContent = hint;
        box.appendChild(h);
    }
}

export function initGoogleScriptSettingsUI() {
    const input = document.getElementById('googleScriptUrlInput');
    const testBtn = document.getElementById('googleScriptTestBtn');
    const saveBtn = document.getElementById('googleScriptSaveBtn');
    const resetBtn = document.getElementById('googleScriptResetBtn');
    const status = document.getElementById('googleScriptUrlStatus');
    if (!input || !testBtn || !saveBtn || !resetBtn || !status || input.dataset.gsBound) return;
    input.dataset.gsBound = '1';

    const fill = () => {
        input.value = hasCustomGoogleScriptUrl() ? getGoogleScriptUrl() : '';
        setStatus(status, '', '', '');
    };
    fill();
    // при каждом открытии окна настроек поле показывает актуальное значение
    const modal = document.getElementById('customizeUIModal');
    if (modal) {
        new MutationObserver(() => {
            if (!modal.classList.contains('hidden')) fill();
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    const candidate = () => input.value.trim() || getGoogleScriptUrl();

    testBtn.addEventListener('click', async () => {
        const url = candidate();
        if (!isValidGoogleScriptUrl(url)) {
            setStatus(status, 'error', 'Адрес не похож на веб-приложение Apps Script', 'Ожидается https://script.google.com/macros/s/…/exec');
            return;
        }
        testBtn.disabled = true;
        setStatus(status, 'busy', 'Проверяю…', '');
        try {
            const r = await testGoogleScriptConnection(url);
            setStatus(status, r.ok ? 'ok' : 'error', `${r.title} (${r.ms} мс)`, r.hint);
        } finally {
            testBtn.disabled = false;
        }
    });

    saveBtn.addEventListener('click', () => {
        const v = input.value.trim();
        if (v && !isValidGoogleScriptUrl(v)) {
            setStatus(status, 'error', 'Адрес не принят', 'Допустимы только адреса вида https://script.google.com/macros/s/…/exec');
            return;
        }
        if (!setGoogleScriptUrl(v)) {
            setStatus(status, 'error', 'Не удалось сохранить адрес', '');
            return;
        }
        setStatus(status, 'ok', v ? 'Адрес сохранён' : 'Используется встроенный адрес', 'Запускаю обновление данных…');
        syncGoogleDocsNow({ reason: 'manual', force: true, interactive: true }).catch(() => {});
    });

    resetBtn.addEventListener('click', () => {
        setGoogleScriptUrl('');
        input.value = '';
        setStatus(status, 'ok', 'Используется встроенный адрес', '');
        syncGoogleDocsNow({ reason: 'manual', force: true, interactive: true }).catch(() => {});
    });
}
