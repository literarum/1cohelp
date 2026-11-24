'use strict';

/** Воркер аналитики раздела «База клиентов»: тяжёлый расчёт вне основного потока. */
import { computeInsights, comparePeriods } from './client-analytics-insights.js';

self.onmessage = (e) => {
    const { id, records, opts, kind, A, B } = e.data || {};
    try {
        if (kind === 'compare') {
            self.postMessage({ id, ok: true, result: comparePeriods(records || [], A, B, opts || {}) });
            return;
        }
        const result = computeInsights(records || [], {
            ...(opts || {}),
            onProgress: (phase, pct) => self.postMessage({ id, progress: true, phase, pct }),
        });
        self.postMessage({ id, ok: true, result });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.stack) || err) });
    }
};
