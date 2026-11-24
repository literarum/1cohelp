'use strict';

/** Воркер аналитики раздела «База клиентов»: тяжёлый расчёт вне основного потока. */
import { computeInsights } from './client-analytics-insights.js';

self.onmessage = (e) => {
    const { id, records, opts } = e.data || {};
    try {
        const result = computeInsights(records || [], {
            ...(opts || {}),
            onProgress: (phase, pct) => self.postMessage({ id, progress: true, phase, pct }),
        });
        self.postMessage({ id, ok: true, result });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.stack) || err) });
    }
};
