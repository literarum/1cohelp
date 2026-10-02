'use strict';

/** Воркер разбора .txt раздела «База клиентов»: тяжёлый разбор вне основного потока. */
import { parseTxtIntoRecords } from './client-analytics-parse.js';

self.onmessage = (e) => {
    const { id, text, fileName } = e.data || {};
    try {
        self.postMessage({ id, ok: true, rows: parseTxtIntoRecords(String(text || ''), fileName) });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
    }
};
