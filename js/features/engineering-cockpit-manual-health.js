'use strict';

/**
 * Тот же контракт отчёта, что у настроек и палитры команд при сбое ручного прогона.
 * @param {unknown} err
 * @returns {object}
 */
export function buildManualDiagnosticFailureReport(err) {
    return {
        errors: [{ title: 'Ошибка', message: err?.message || String(err) }],
        warnings: [],
        checks: [],
        startedAt: new Date().toLocaleString('ru-RU'),
        finishedAt: new Date().toLocaleString('ru-RU'),
        success: false,
        error: err?.message || String(err),
    };
}

/**
 * Полный ручной прогон диагностики с показом модального отчёта (как в настройках).
 * @param {object} [opts]
 * @param {() => Promise<unknown>} [opts.runManualFullDiagnostic] — по умолчанию window.runManualFullDiagnostic
 * @param {(report: unknown) => void} [opts.showHealthReportModal] — по умолчанию window.showHealthReportModal
 */
export async function runManualHealthDiagnosticFromCockpit(opts = {}) {
    const run =
        typeof opts.runManualFullDiagnostic === 'function'
            ? opts.runManualFullDiagnostic
            : typeof window !== 'undefined' && typeof window.runManualFullDiagnostic === 'function'
              ? window.runManualFullDiagnostic.bind(window)
              : null;
    const show =
        typeof opts.showHealthReportModal === 'function'
            ? opts.showHealthReportModal
            : typeof window !== 'undefined' && typeof window.showHealthReportModal === 'function'
              ? window.showHealthReportModal.bind(window)
              : null;

    if (!run) {
        throw new Error('Ручная диагностика недоступна: runManualFullDiagnostic не загружен.');
    }
    if (!show) {
        throw new Error('Окно отчёта недоступно: showHealthReportModal не найден.');
    }

    const report = await run();
    show(report);
    return report;
}
