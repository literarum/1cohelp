'use strict';

/** Экспорт базы в сжатый зашифрованный файл (палитра команд). */

import { State } from '../app/state.js';
import { buildExportDataObjectFromDb } from './import-export.js';
import { wrapBackup, promptBackupPassword } from './backup-envelope.js';
import { localFileTimestamp } from '../utils/datetime.js';

function notify(msg, type = 'info', opts = {}) {
    window.NotificationService?.add?.(msg, type, opts);
}

async function saveBlob(blob, name) {
    if (typeof window.showSaveFilePicker === 'function') {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: name,
                types: [{ description: 'Резервная копия Copilot 1СО', accept: { 'application/json': ['.json'] } }],
            });
            const w = await handle.createWritable();
            await w.write(blob);
            await w.close();
            return true;
        } catch (e) {
            if (e?.name === 'AbortError') return false;
        }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
}

export async function exportEncryptedBackup() {
    if (!State.db) {
        notify('База данных ещё не готова.', 'error');
        return false;
    }
    const password = await promptBackupPassword({ confirm: true });
    if (!password) return false;
    notify('Подготовка зашифрованной копии…', 'info', { duration: 3000, id: 'enc-export-progress' });
    const data = await buildExportDataObjectFromDb(State.db, { quiet: true, readMode: 'batch' });
    if (!data) {
        notify('Нет данных для экспорта.', 'warning');
        return false;
    }
    const wrapped = await wrapBackup(JSON.stringify(data), { compress: true, password });
    const name = `1C_Support_Guide_Encrypted_${localFileTimestamp()}.json`;
    const ok = await saveBlob(new Blob([wrapped], { type: 'application/json' }), name);
    if (ok) {
        notify(
            'Зашифрованная копия сохранена. Без пароля её открыть невозможно — храните пароль отдельно.',
            'success',
            { duration: 8000 },
        );
    }
    return ok;
}

if (typeof window !== 'undefined') window.exportEncryptedBackup = exportEncryptedBackup;
