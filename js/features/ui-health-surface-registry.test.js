/** @vitest-environment jsdom */
'use strict';

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
    HEALTH_SURFACE_DATA_ATTR,
    inferDomZoneLabel,
    resolveMonitoredDomIds,
    collectDataHealthSurfaceBindings,
    hasHiddenAncestor,
    hasObscuredLayoutAncestor,
    shouldSkipHealthInteractiveGeometry,
    probeVisibleInteractiveLayout,
    resolveInteractiveLayoutProbeElement,
    NO_INN_LINK_DOM_ID,
    mainStepsRequireNoInnHelpLinkInDom,
    filterDomAuditMissingIdsForConditionalMainAlgo,
    filterDomAuditMissingIdsForBirthdayMode,
    BIRTHDAY_FX_LAYER_DOM_ID,
    BIRTHDAY_GARLAND_DOM_ID,
} from './ui-health-surface-registry.js';
import { INDEX_HTML_UNIQUE_ELEMENT_ID_COUNT } from './ui-health-index-ids.js';

describe('ui-health-surface-registry', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('resolveMonitoredDomIds объединяет index, рантайм и data-health-surface', () => {
        document.body.innerHTML = `<div id="appContent" class=""></div>
            <div id="extraHealthHost" data-health-surface="plugin" data-x="1"></div>`;
        const m = resolveMonitoredDomIds(document);
        expect(m.allIds).toContain('appContent');
        expect(m.allIds).toContain('bg-status-hud');
        expect(m.allIds).toContain('extraHealthHost');
        expect(m.dynamicIds).toContain('extraHealthHost');
        expect(INDEX_HTML_UNIQUE_ELEMENT_ID_COUNT).toBeGreaterThan(200);
    });

    it('предупреждает об атрибуте без id через collectDataHealthSurfaceBindings', () => {
        document.body.innerHTML = `<span ${HEALTH_SURFACE_DATA_ATTR}="bad"></span>`;
        const { orphanAttributeNodes } = collectDataHealthSurfaceBindings(document);
        expect(orphanAttributeNodes).toBe(1);
    });

    it('inferDomZoneLabel даёт стабильные группы', () => {
        expect(inferDomZoneLabel('mainTab')).toContain('клад');
        expect(inferDomZoneLabel('dbMergeModal')).toContain('Слияние');
    });

    it('inferDomZoneLabel: noInnLink — зона главного алгоритма', () => {
        expect(inferDomZoneLabel(NO_INN_LINK_DOM_ID)).toContain('главн');
    });

    it('filterDomAuditMissingIdsForConditionalMainAlgo убирает noInnLink если ни один шаг не требует ссылки', () => {
        const raw = ['searchInput', NO_INN_LINK_DOM_ID];
        expect(
            filterDomAuditMissingIdsForConditionalMainAlgo(raw, [{ title: 'Просто шаг', showNoInnHelp: false }]),
        ).toEqual(['searchInput']);
    });

    it('filterDomAuditMissingIdsForConditionalMainAlgo оставляет noInnLink при inn_step', () => {
        const raw = [NO_INN_LINK_DOM_ID];
        expect(filterDomAuditMissingIdsForConditionalMainAlgo(raw, [{ type: 'inn_step' }])).toEqual(raw);
    });

    it('filterDomAuditMissingIdsForBirthdayMode убирает birthday-узлы, когда режим выключен', () => {
        document.documentElement.dataset.birthdayMode = 'off';
        document.documentElement.classList.remove('birthday-mode');
        const raw = [BIRTHDAY_FX_LAYER_DOM_ID, BIRTHDAY_GARLAND_DOM_ID, 'appContent'];
        expect(filterDomAuditMissingIdsForBirthdayMode(raw, document)).toEqual(['appContent']);
    });

    it('filterDomAuditMissingIdsForBirthdayMode оставляет birthday-узлы, когда режим включен', () => {
        document.documentElement.dataset.birthdayMode = 'on';
        document.documentElement.classList.add('birthday-mode');
        const raw = [BIRTHDAY_FX_LAYER_DOM_ID, BIRTHDAY_GARLAND_DOM_ID];
        expect(filterDomAuditMissingIdsForBirthdayMode(raw, document)).toEqual(raw);
    });

    it('mainStepsRequireNoInnHelpLinkInDom ложь для не-массива', () => {
        expect(mainStepsRequireNoInnHelpLinkInDom(null)).toBe(false);
        expect(mainStepsRequireNoInnHelpLinkInDom(undefined)).toBe(false);
    });

    it('inferDomZoneLabel: clearClientAnalyticsSearchBtn — зона аналитики клиентов', () => {
        expect(inferDomZoneLabel('clearClientAnalyticsSearchBtn')).toBe('Аналитика клиентов');
    });

    it('hasHiddenAncestor учитывает .hidden', () => {
        document.body.innerHTML =
            '<div id="x" class="hidden"><button id="b" type="button">x</button></div>';
        const b = document.getElementById('b');
        expect(hasHiddenAncestor(b, document)).toBe(true);
    });

    it('hasObscuredLayoutAncestor ловит родителя с display:none из CSS/inline', () => {
        document.body.innerHTML =
            '<div id="appContent"><section style="display:none"><button id="inHiddenSection" type="button">x</button></section></div>';
        const b = document.getElementById('inHiddenSection');
        expect(hasObscuredLayoutAncestor(b, document)).toBe(true);
    });

    it('probeVisibleInteractiveLayout пропускает скрытые ветки', () => {
        document.body.innerHTML = `<div id="appContent" class="">
            <div class="tab-content hidden"><button id="inHiddenTab" type="button">x</button></div>
            <button id="visibleBtn" type="button">ok</button>
        </div>`;
        const r = probeVisibleInteractiveLayout(document, ['inHiddenTab', 'visibleBtn']);
        expect(r.skippedHidden).toBeGreaterThanOrEqual(1);
    });

    it('probeVisibleInteractiveLayout не ругается на кнопки внутри родителя с display:none', () => {
        document.body.innerHTML = `<div id="appContent">
            <div class="engineering-cockpit-tab" style="display:none">
                <button id="engineeringCockpitExportLogsBtn" type="button">export</button>
                <select id="engineeringCockpitLogLevelFilter"><option>all</option></select>
            </div>
        </div>`;
        const r = probeVisibleInteractiveLayout(document, [
            'engineeringCockpitExportLogsBtn',
            'engineeringCockpitLogLevelFilter',
        ]);
        expect(r.bad.some((x) => x.includes('engineeringCockpit'))).toBe(false);
        expect(r.skippedHidden).toBeGreaterThanOrEqual(2);
    });

    it('shouldSkipHealthInteractiveGeometry пропускает overflow-tab и display:none', () => {
        document.body.innerHTML = `<div id="appContent" class="">
            <button id="overflowBtn" type="button" class="overflow-tab" style="display:none">x</button>
        </div>`;
        const b = document.getElementById('overflowBtn');
        expect(shouldSkipHealthInteractiveGeometry(b, document)).toBe(true);
    });

    it('resolveInteractiveLayoutProbeElement для app-toggle-input указывает на label', () => {
        document.body.innerHTML = `<label class="app-toggle" for="tgl"
            ><input type="checkbox" id="tgl" class="app-toggle-input" /><span class="app-toggle__track"></span
        ></label>`;
        const input = document.getElementById('tgl');
        const host = resolveInteractiveLayoutProbeElement(input);
        expect(host?.classList.contains('app-toggle')).toBe(true);
    });

    it('probeVisibleInteractiveLayout измеряет .app-toggle, а не скрытый input 0×0', () => {
        document.body.innerHTML = `<div id="appContent" class="">
            <label class="app-toggle app-toggle--compact" for="mainAlgoHeadersOnly"
                ><input type="checkbox" id="mainAlgoHeadersOnly" class="app-toggle-input" />
                <span class="app-toggle__track"></span
            ></label>
        </div>`;
        const input = document.getElementById('mainAlgoHeadersOnly');
        const label = input?.closest('.app-toggle');
        expect(label).toBeTruthy();
        const rect = {
            width: 120,
            height: 24,
            top: 0,
            left: 0,
            right: 120,
            bottom: 24,
            x: 0,
            y: 0,
            toJSON() {
                return {};
            },
        };
        const spy = vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(rect);
        const r = probeVisibleInteractiveLayout(document, ['mainAlgoHeadersOnly']);
        expect(r.bad).toHaveLength(0);
        spy.mockRestore();
    });
});
