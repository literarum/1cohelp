/** @vitest-environment jsdom */
'use strict';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
    classifySearchPanelContent,
    detectSearchDropdownVerticalClip,
    runFullSurfaceDomAudit,
    runFullSurfaceDomAuditAsync,
    runSearchUiDualContourCheck,
    runUiSurfaceHealthSuite,
} from './ui-surface-health-suite.js';
import { inferSystemFromTitle } from './health-report-format.js';
import * as uiHealthSurfaceRegistry from './ui-health-surface-registry.js';

describe('ui-surface-health-suite', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.style.overflowY = '';
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('classifySearchPanelContent', () => {
        it('отклоняет слишком короткую разметку', () => {
            const r = classifySearchPanelContent('<div></div>', null);
            expect(r.ok).toBe(false);
        });
        it('принимает «ничего не найдено»', () => {
            expect(classifySearchPanelContent('<p>ничего не найдено</p>', null).ok).toBe(true);
        });
        it('принимает спиннер поиска', () => {
            expect(classifySearchPanelContent('<span>Идет поиск</span>', null).ok).toBe(true);
        });
        it('принимает список результатов по li', () => {
            const ul = document.createElement('ul');
            ul.innerHTML = '<li>x</li>';
            expect(classifySearchPanelContent('достаточно длинная строка', ul).ok).toBe(true);
        });
    });

    describe('detectSearchDropdownVerticalClip', () => {
        it('ok при отсутствии overflow-y hidden по цепочке', () => {
            document.body.innerHTML =
                '<div id="p" style="overflow-y: visible"><div id="searchResults"></div></div>';
            const panel = document.getElementById('searchResults');
            expect(detectSearchDropdownVerticalClip(panel).ok).toBe(true);
        });
        it('ошибка при overflow-y:hidden у предка', () => {
            document.body.innerHTML =
                '<div style="overflow-y: hidden"><div id="searchResults"></div></div>';
            const panel = document.getElementById('searchResults');
            const r = detectSearchDropdownVerticalClip(panel);
            expect(r.ok).toBe(false);
            expect(r.blocker).toMatch(/overflow-y/i);
        });
    });

    describe('runFullSurfaceDomAudit', () => {
        it('сообщает об ошибке если обязательные id отсутствуют', () => {
            document.body.innerHTML = '<div id="x"></div>';
            const report = vi.fn();
            runFullSurfaceDomAudit(report);
            const err = report.mock.calls.find((c) => c[0] === 'error');
            expect(err).toBeDefined();
            expect(err[2]).toMatch(/Отсутствуют/);
        });

        it('не считает ошибкой только отсутствие noInnLink если шаги не требуют ссылки', () => {
            document.body.innerHTML = '';
            const report = vi.fn();
            const spy = vi
                .spyOn(uiHealthSurfaceRegistry, 'resolveMonitoredDomIds')
                .mockReturnValue({
                    allIds: [uiHealthSurfaceRegistry.NO_INN_LINK_DOM_ID],
                    indexCount: 1,
                    runtimeExtraCount: 0,
                    dynamicIds: [],
                    dataHealthAttributeOrphans: 0,
                });
            try {
                runFullSurfaceDomAudit(report, { getMainAlgorithmSteps: () => [{ title: 'Шаг' }] });
                const err = report.mock.calls.find((c) => c[0] === 'error');
                expect(err).toBeUndefined();
                const ok = report.mock.calls.find(
                    (c) =>
                        c[0] === 'info' && typeof c[2] === 'string' && c[2].includes('все в DOM'),
                );
                expect(ok).toBeDefined();
            } finally {
                spy.mockRestore();
            }
        });

        it('не считает ошибкой отсутствие birthday-узлов, когда режим дня рождения выключен', () => {
            document.body.innerHTML = '';
            document.documentElement.dataset.birthdayMode = 'off';
            document.documentElement.classList.remove('birthday-mode');
            const report = vi.fn();
            const spy = vi
                .spyOn(uiHealthSurfaceRegistry, 'resolveMonitoredDomIds')
                .mockReturnValue({
                    allIds: ['birthdayFxLayer', 'birthdayGarland'],
                    indexCount: 2,
                    runtimeExtraCount: 0,
                    dynamicIds: [],
                    dataHealthAttributeOrphans: 0,
                });
            try {
                runFullSurfaceDomAudit(report);
                const err = report.mock.calls.find((c) => c[0] === 'error');
                expect(err).toBeUndefined();
            } finally {
                spy.mockRestore();
            }
        });
    });

    describe('runFullSurfaceDomAuditAsync', () => {
        it('при document.complete вызывает report (тот же контур отчёта, что и sync)', async () => {
            document.body.innerHTML = '<div id="x"></div>';
            const report = vi.fn();
            await runFullSurfaceDomAuditAsync(report);
            const err = report.mock.calls.find((c) => c[0] === 'error');
            expect(err).toBeDefined();
            expect(err[2]).toMatch(/Отсутствуют/);
        });
    });

    describe('runSearchUiDualContourCheck', () => {
        it('оба контура ok при симулированной связке input → performSearch', async () => {
            document.body.innerHTML = `<div style="overflow:visible">
                <input id="searchInput" value="" />
                <div id="searchResults" class="hidden"></div>
            </div>`;
            const input = document.getElementById('searchInput');
            const panel = document.getElementById('searchResults');
            const performSearch = async (q) => {
                if (!q) {
                    panel.innerHTML = '';
                    panel.classList.add('hidden');
                    return;
                }
                panel.innerHTML = '<div class="p-2">ничего не найдено</div>';
                panel.classList.remove('hidden');
            };
            input.addEventListener('input', () => {
                void performSearch(input.value);
            });
            const report = vi.fn();
            await runSearchUiDualContourCheck({ performSearch }, report, (p) => p, {
                intrusive: true,
            });
            const errors = report.mock.calls.filter((c) => c[0] === 'error');
            expect(errors.length).toBe(0);
        }, 20000);

        it('при intrusive: false не вызывает performSearch и не трогает значение поля', async () => {
            document.body.innerHTML = `<div style="overflow:visible">
                <input id="searchInput" value="keep-me" />
                <div id="searchResults" class="hidden"></div>
            </div>`;
            const performSearch = vi.fn(async () => {});
            const report = vi.fn();
            await runSearchUiDualContourCheck({ performSearch }, report, (p) => p, {
                intrusive: false,
            });
            expect(performSearch).not.toHaveBeenCalled();
            expect(document.getElementById('searchInput').value).toBe('keep-me');
            const passive = report.mock.calls.find(
                (c) => c[2] && String(c[2]).includes('Пассивный режим'),
            );
            expect(passive).toBeDefined();
        });

        it('без options не вызывает performSearch (безопасный дефолт)', async () => {
            document.body.innerHTML = `<div style="overflow:visible">
                <input id="searchInput" value="keep" />
                <div id="searchResults" class="hidden"></div>
            </div>`;
            const performSearch = vi.fn(async () => {});
            const report = vi.fn();
            await runSearchUiDualContourCheck({ performSearch }, report, (p) => p);
            expect(performSearch).not.toHaveBeenCalled();
        });

        it('ошибка при расхождении: API ок, input не обновляет панель', async () => {
            document.body.innerHTML = `<div style="overflow:visible">
                <input id="searchInput" value="" />
                <div id="searchResults" class="hidden"></div>
            </div>`;
            const panel = document.getElementById('searchResults');
            const performSearch = async (q) => {
                if (!q) {
                    panel.innerHTML = '';
                    panel.classList.add('hidden');
                    return;
                }
                panel.innerHTML = '<div>ничего не найдено</div>';
                panel.classList.remove('hidden');
            };
            // Нет слушателя input — контур B провалится
            const report = vi.fn();
            await runSearchUiDualContourCheck({ performSearch }, report, (p) => p, {
                intrusive: true,
            });
            const mismatch = report.mock.calls.find(
                (c) => c[1] && String(c[1]).includes('расхождение контуров'),
            );
            expect(mismatch).toBeDefined();
        }, 20000);
    });

    describe('runUiSurfaceHealthSuite', () => {
        it('по умолчанию не запускает полный зонд геометрии (сообщение о пассивном режиме)', async () => {
            document.body.innerHTML = '<div id="appContent"></div>';
            const report = vi.fn();
            await runUiSurfaceHealthSuite({ loadingOverlayManager: {} }, report, (p) => p, {});
            const passiveGeo = report.mock.calls.find(
                (c) =>
                    typeof c[2] === 'string' &&
                    c[2].includes('зонд геометрии интерактивов отключён'),
            );
            expect(passiveGeo).toBeDefined();
            const coverage = report.mock.calls.find(
                (c) => c[1] === 'Поверхность UI / геометрия (охват)',
            );
            expect(coverage).toBeUndefined();
        });

        it('при intrusiveUi: true выполняет зонд геометрии (отчёт об охвате)', async () => {
            document.body.innerHTML = '<div id="appContent"></div>';
            const report = vi.fn();
            await runUiSurfaceHealthSuite({ loadingOverlayManager: {} }, report, (p) => p, {
                intrusiveUi: true,
            });
            const passiveGeo = report.mock.calls.find(
                (c) =>
                    typeof c[2] === 'string' &&
                    c[2].includes('зонд геометрии интерактивов отключён'),
            );
            expect(passiveGeo).toBeUndefined();
            const coverage = report.mock.calls.find(
                (c) => c[1] === 'Поверхность UI / геометрия (охват)',
            );
            expect(coverage).toBeDefined();
        });
    });
});

describe('health-report-format + ui_surface', () => {
    it('inferSystemFromTitle относит «Поверхность UI» к ui_surface', () => {
        expect(inferSystemFromTitle('Поверхность UI / поиск (контур API)')).toBe('ui_surface');
    });
});
