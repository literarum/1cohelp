/* eslint-disable no-dupe-keys, no-dupe-class-members, no-control-regex, no-case-declarations -- ported from external XML analyzer app */
import { jsonToXmlString, parseXml, yieldToUi } from './xml-analyzer-model.js';
import { buildFindings, collectRequisites } from './xml-analyzer-insights.js';
import { analyzeBlob, base64ToBytes, findSignatures } from './xml-analyzer-crypto.js';
import { createExplorerView, fmtSize, h } from './xml-analyzer-explorer.js';

const XML_ANALYZER_ID_MAP = {
    'data-input': 'xmlAnalyzerDataInput',
    output: 'xmlAnalyzerOutput',
    'analyze-btn': 'xmlAnalyzerAnalyzeBtn',
    'drop-zone': 'xmlAnalyzerDropZone',
    placeholder: 'xmlAnalyzerPlaceholder',
    'certificate-manager-wrapper': 'xmlAnalyzerCertManagerWrapper',
    'cert-search-input': 'xmlAnalyzerCertSearch',
    'cert-list': 'xmlAnalyzerCertList',
    'cert-list-placeholder': 'xmlAnalyzerCertPlaceholder',
    'export-zip-btn': 'xmlAnalyzerExportZipBtn',
    'cert-details-modal-overlay': 'xmlAnalyzerCertModalOverlay',
    'modal-close-btn': 'xmlAnalyzerModalClose',
    'modal-content-target': 'xmlAnalyzerModalContent',
    'analyze-btn-content': 'xmlAnalyzerAnalyzeBtnContent',
    'reset-btn': 'xmlAnalyzerResetBtn',
    'load-file-btn': 'xmlAnalyzerLoadFileBtn',
    'notification-container': 'xmlAnalyzerNotificationContainer',
    'sedo-raw-json-viewer': 'xmlAnalyzerSedoRawJsonViewer',
    'accordion-section-template': 'xmlAnalyzerAccordionSectionTemplate',
    'info-row-template': 'xmlAnalyzerInfoRowTemplate',
    'sedo-row-template': 'xmlAnalyzerSedoRowTemplate',
    'cert-list-item-template': 'xmlAnalyzerCertListItemTemplate',
    'log-entry-template': 'xmlAnalyzerLogEntryTemplate',
};

function xmlAnalyzerGetEl(root, id) {
    const mapped = XML_ANALYZER_ID_MAP[id];
    return mapped ? root.querySelector('#' + mapped) : null;
}

class ReportAnalyzerApp {
    constructor(root) {
        this.root = root || document;
        const getEl = (id) => xmlAnalyzerGetEl(this.root, id);

        this.certificates = new Map();
        this.isAnalysisDone = false;
        this.docs = [];
        this.activeRecord = null;
        this._busy = false;
        this._docSeq = 0;
        this._pickMode = null;

        this.controllingAuthorityMap = {
            FNS: 'Федеральная налоговая служба (ФНС)',
            PFR: 'Социальный фонд России (СФР, бывш. ПФР)',
            FSS: 'Социальный фонд России (СФР, бывш. ФСС)',
            ROSSTAT: 'Федеральная служба государственной статистики (Росстат)',
            RARP: 'Росалкогольрегулирование (ФСРАР)',
            RPN: 'Росприроднадзор (РПН)',

            ФНС: 'Федеральная налоговая служба',
            СФР: 'Социальный фонд России',
            ПФР: 'Социальный фонд России (СФР, бывш. ПФР)',
            ФСС: 'Социальный фонд России (СФР, бывш. ФСС)',
            ФСГС: 'Федеральная служба государственной статистики (Росстат)',
            РПН: 'Федеральная служба по надзору в сфере природопользования (Росприроднадзор)',
            ФТС: 'Федеральная таможенная служба',
            ЦБ: 'Центральный банк РФ',
        };

        this.additionalInfoKeyMap = {
            ЖурналРегистрации: 'Журнал системных событий',
            Нерасшифрованные: 'Нерасшифрованные сообщения',
            ПодключенныеНаправления: 'Направления обмена с контролирующими органами',
            ИмяКонфигурации: 'Конфигурация 1С',
            ВерсияОС: 'Версия операционной системы',
            РазрядностьОС: 'Разрядность ОС',
            ВерсияIE: 'Версия Internet Explorer',
            ВерсияОС: 'Версия ОС (клиент)',
            'Сервер.ВерсияОС': 'Версия ОС (сервер)',
            РазрядностьОС: 'Разрядность ОС',
            ВерсияIE: 'Версия Internet Explorer',
            Процессор: 'Процессор (клиент)',
            'Сервер.Процессор': 'Процессор (сервер)',
            ОперативнаяПамять: 'ОЗУ (клиент), МБ',
            'Сервер.ОперативнаяПамять': 'ОЗУ (сервер), МБ',
            ТипПлатформы: 'Тип платформы',
            АвтонастройкаПриСтартеПричина: 'Причина ошибки автонастройки',
            ПродолжительностьПроверкиСекунд: 'Продолжительность проверки, сек',
            ВнешнийМодульВерсия: 'Версия внешнего модуля',
            ВнешнийМодульИспользуется: 'Внешний модуль используется',
            ТипКлиентскогоПодключения: 'Тип клиента',
            ТипКлиентскогоПодключенияЧислом: 'Тип клиента (код)',
            АвтонастройкаПриСтарте: 'Результат автонастройки',
            ВерсияПриложения: 'Версия платформы 1С',
            УровеньЛогированияЖурнала: 'Уровень логирования',
            ИнициализированныйКриптопровайдерКК: 'Инициализированный криптопровайдер',
            РежимИБ: 'Режим работы ИБ',
            'Криптокомпонента.Версия': 'Версия криптокомпоненты',
            Экран0: 'Разрешение экрана',
            'Метаданные.Синоним': 'Синоним конфигурации',
            'Метаданные.Версия': 'Версия конфигурации',
            КаталогВременныхФайлов: 'Каталог временных файлов',
            ЧасовойПояс: 'Часовой пояс',
            'ЖурналРегистрации.Начало': 'Журнал: начало периода',
            'ЖурналРегистрации.Окончание': 'Журнал: окончание периода',
            'ЖурналРегистрации.ЗатраченоСек': 'Журнал: затрачено на выгрузку, сек',
            'ЖурналРегистрации.Получен': 'Журнал: успешно получен',
        };

        this.inputArea = getEl('data-input');
        this.outputArea = getEl('output');
        this.analyzeBtn = getEl('analyze-btn');
        this.dropZone = getEl('drop-zone');
        this.placeholder = getEl('placeholder');

        this.dataInputTextarea = getEl('data-input');
        this.loadFileBtn = getEl('load-file-btn');
        this.resetBtn = getEl('reset-btn');

        this.themeToggle = getEl('theme-toggle');
        this.reloadBtn = getEl('reload-btn');
        this.minimizeBtn = getEl('minimize-btn');
        this.maximizeBtn = getEl('maximize-btn');
        this.closeBtn = getEl('close-btn');

        this.certManagerWrapper = getEl('certificate-manager-wrapper');
        this.certSearchInput = getEl('cert-search-input');
        this.certList = getEl('cert-list');
        this.certListPlaceholder = getEl('cert-list-placeholder');
        this.exportZipBtn = getEl('export-zip-btn');

        this.modalOverlay = getEl('cert-details-modal-overlay');
        this.modalCloseBtn = getEl('modal-close-btn');
        this.modalContentTarget = getEl('modal-content-target');

        this.getEl = getEl;

        this.init();
    }

    init() {
        if (this.analyzeBtn) {
            this.analyzeBtn.addEventListener('click', () => this.handleAnalyzeButtonClick());
        } else {
            console.error(
                'КРИТИЧЕСКАЯ ОШИБКА: Кнопка анализатора #analyze-btn не найдена в DOM! Основная функция не будет работать.',
            );
        }

        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', () => this.clearAnalysis());
        }

        if (this.reloadBtn) {
            this.reloadBtn.addEventListener('click', () => this.clearAnalysis());
        }

        this._initDragAndDrop();
        this._initRecent();

        if (this.loadFileBtn) {
            this.loadFileBtn.addEventListener('click', () => this.openFilePicker());
        }

        if (this.dataInputTextarea) {
            this.dataInputTextarea.addEventListener('input', () => this.updateAnalyzeButtonState());
            this.dataInputTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.handleAnalyzeButtonClick();
                }
            });
        }

        this.updateAnalyzeButtonState();

        if (this.certSearchInput) {
            this.certSearchInput.addEventListener(
                'input',
                this.debounce(() => this.renderCertificateManager(), 300),
            );
        }

        if (this.exportZipBtn) {
            this.exportZipBtn.addEventListener('click', () => this.handleExportAllCerts());
        }

        if (this.modalCloseBtn) {
            this.modalCloseBtn.addEventListener('click', () => this.hideCertificateDetails());
        }

        this.root.addEventListener('click', (e) => this.handleAppClicks(e));

        if (this.modalOverlay) {
            this.modalOverlay.addEventListener('click', (e) => {
                if (e.target === this.modalOverlay) this.hideCertificateDetails();
            });
            this.modalOverlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.hideCertificateDetails();
            });
        }
    }

    /** Перетаскивание нескольких файлов на всю вкладку анализатора. */
    _initDragAndDrop() {
        const shell = this.root.querySelector('.xml-analyzer-shell');
        if (!shell) return;
        if (!shell.querySelector('.xa-drop-overlay')) {
            shell.appendChild(
                h('div', { class: 'xa-drop-overlay', 'aria-hidden': 'true' }, 'Отпустите файлы XML, JSON или ZIP для анализа'),
            );
        }
        let depth = 0;
        const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
        this.root.addEventListener('dragenter', (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth++;
            shell.classList.add('xa-dragging');
        });
        this.root.addEventListener('dragover', (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        this.root.addEventListener('dragleave', (e) => {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (!depth) shell.classList.remove('xa-dragging');
        });
        this.root.addEventListener('drop', (e) => {
            if (!hasFiles(e)) return;
            depth = 0;
            shell.classList.remove('xa-dragging');
            this.handleFileDrop(e);
        });
    }

    _initRecent() {
        const view = this.root.querySelector('#xmlAnalyzerInitialView');
        if (!view) return;
        this._recentEl = h('div', { class: 'xa-recent', hidden: true });
        view.appendChild(this._recentEl);
        this._renderRecent();
    }

    debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    updateAnalyzeButtonState() {
        if (!this.dataInputTextarea) return;
        const hasContent = this.dataInputTextarea.value.trim().length > 0;
        if (this.resetBtn) {
            this.resetBtn.disabled = !hasContent && !this.isAnalysisDone;
        }
        if (!this.analyzeBtn) return;
        if (this.isAnalysisDone) {
            this.analyzeBtn.disabled = true;
            return;
        }
        this.analyzeBtn.disabled = !hasContent;
    }

    _fixBrokenUriEncoding(xmlString) {
        const mojibakeMap = {
            'Ð': 'А',
            'Ð‘': 'Б',
            'Ð’': 'В',
            'Ð“': 'Г',
            'Ð”': 'Д',
            'Ð•': 'Е',
            'Ð†': 'Ж',
            'Ð‡': 'З',
            'Ð˜': 'И',
            'Ð™': 'Й',
            Ðš: 'К',
            'Ð›': 'Л',
            Ðœ: 'М',
            'Ð': 'Н',
            Ðž: 'О',
            ÐŸ: 'П',
            'Ð ': 'Р',
            'Ð¡': 'С',
            'Ð¢': 'Т',
            'Ð£': 'У',
            'Ð¤': 'Ф',
            'Ð¥': 'Х',
            'Ð¦': 'Ц',
            'Ð§': 'Ч',
            'Ð¨': 'Ш',
            'Ð©': 'Щ',
            Ðª: 'Ъ',
            'Ð«': 'Ы',
            'Ð¬': 'Ь',
            Ð: 'Э',
            'Ð®': 'Ю',
            'Ð¯': 'Я',
            'Ð°': 'а',
            'Ð±': 'б',
            'Ð²': 'в',
            'Ð³': 'г',
            'Ð´': 'д',
            Ðµ: 'е',
            'Ñ‘': 'ж',
            'Ð·': 'з',
            'Ð¸': 'и',
            'Ð¹': 'й',
            Ðº: 'к',
            'Ð»': 'л',
            'Ð¼': 'м',
            'Ð½': 'н',
            'Ð¾': 'о',
            'Ð¿': 'п',
            'Ñ€': 'р',
            'Ñ': 'с',
            'Ñ‚': 'т',
            Ñƒ: 'у',
            'Ñ„': 'ф',
            'Ñ…': 'х',
            'Ñ†': 'ц',
            'Ñ‡': 'ч',
            Ñˆ: 'ш',
            'Ñ‰': 'щ',
            ÑŠ: 'ъ',
            'Ñ‹': 'ы',
            ÑŒ: 'ь',
            'Ñ': 'э',
            ÑŽ: 'ю',
            'Ñ': 'я',
            'Ñ‘': 'ё',
            'Ð€': 'Ђ',
            'Ð‚': '‚',
            Ðƒ: 'ƒ',
            'Ð„': '„',
            'Ð…': '…',
            'Ð†': '†',
            'Ð‡': '‡',
            Ðˆ: '€',
            'Ð‰': '‰',
            ÐŠ: 'Š',
            'Ð‹': '‹',
            ÐŒ: 'Œ',
            ÐŽ: 'Ž',
            'Ð': '',
            'Ð': 'ђ',
            'Ð‘': '‘',
            'Ð’': '’',
            'Ð“': '“',
            'Ð”': '”',
            'Ð•': '•',
            'Ð–': '–',
            'Ð—': '—',
            'Ð˜': '˜',
            'Ð™': '™',
            Ðš: 'š',
            'Ð›': '›',
            Ðœ: 'œ',
            'Ð': 'ž',
            Ðž: 'Ÿ',
            ÐŸ: '¡',
            'Ð ': '¢',
            'Ð¡': '£',
            'Ð¤': '¤',
            'Ð¥': '¥',
            'Ð¦': '¦',
            'Ð§': '§',
            'Ð¨': '¨',
            'Ð©': '©',
            Ðª: 'ª',
            'Ð«': '«',
            'Ð¬': '¬',
            Ð: '',
            'Ð®': '®',
            'Ð¯': '¯',
            'Â«': '«',
            'Â»': '»',
            'â„–': '№',
        };

        let fixedXml = xmlString;
        let wasFixed = false;

        const mojibakeRegex = new RegExp(Object.keys(mojibakeMap).join('|'), 'g');

        if (mojibakeRegex.test(fixedXml)) {
            mojibakeRegex.lastIndex = 0;

            fixedXml = fixedXml.replace(mojibakeRegex, (matched) => mojibakeMap[matched]);
            wasFixed = true;
        }

        fixedXml = fixedXml.replace(
            /(xmlns(?::[^=]*)?\s*=\s*["'])(https?:\/\/[^"']+)(["'])/g,
            (match, p1, p2, p3) => {
                if (/[^\x00-\x7F]/.test(p2)) {
                    try {
                        const url = new URL(p2);
                        wasFixed = true;
                        return p1 + url.href + p3;
                    } catch (e) {
                        console.warn(
                            `Не удалось обработать URL "${p2}" через new URL API, используется encodeURI. Ошибка: ${e.message}`,
                        );
                        wasFixed = true;
                        return p1 + encodeURI(p2) + p3;
                    }
                }
                return match;
            },
        );
        return { fixedXml, wasFixed };
    }

    _slugify(str) {
        return String(str || '')
            .toLowerCase()
            .replace(/["'«»]/g, '')
            .replace(/[^a-z0-9а-яё]+/gi, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '');
    }

    handleFileSelect(event) {
        const input = event.target;
        const files = input.files ? Array.from(input.files) : [];
        const compare = this._pickMode === 'compare';
        this._pickMode = null;
        if (files.length) {
            this.ingestFiles(files, { compare });
        }
        // Сброс: повторный выбор того же файла (после «Очистить») должен снова вызывать change.
        try {
            input.value = '';
        } catch {
            // ignore
        }
    }

    handleFileDrop(event) {
        event.preventDefault();
        const files = event.dataTransfer && event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
        if (files.length) {
            this.ingestFiles(files, { compare: false });
        }
    }

    /** Совместимость: чтение одного файла. */
    async readFileAndAnalyze(file) {
        return this.ingestFiles([file]);
    }

    openFilePicker(mode = null) {
        this._pickMode = mode;
        if (!this._fileInput) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.multiple = true;
            fileInput.accept =
                '.xml,.zip,.txt,.json,.p7s,.sig,.cer,.crt,.pem,application/xml,text/xml,application/zip,application/json,text/plain';
            fileInput.hidden = true;
            fileInput.setAttribute('aria-hidden', 'true');
            fileInput.tabIndex = -1;
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
            this.root.appendChild(fileInput);
            this._fileInput = fileInput;
        }
        this._fileInput.click();
    }

    // ---------- Загрузка, прогресс и список документов ----------

    _ensureProgressEl() {
        if (!this._progressEl) {
            this._progressText = h('div', { class: 'xa-progress-text' });
            this._progressFill = h('i');
            this._progressEl = h(
                'div',
                { class: 'xa-progress', role: 'status', 'aria-live': 'polite' },
                this._progressText,
                h('div', { class: 'xa-progress-bar' }, this._progressFill),
            );
        }
        return this._progressEl;
    }

    _setProgress(text, ratio) {
        const el = this._ensureProgressEl();
        const host = this.isAnalysisDone
            ? this.outputArea
            : this.root.querySelector('#xmlAnalyzerInitialView');
        if (host && el.parentNode !== host) host.prepend(el);
        this._progressText.textContent = text;
        this._progressFill.style.width = `${Math.max(0, Math.min(1, ratio || 0)) * 100}%`;
    }

    _hideProgress() {
        if (this._progressEl) this._progressEl.remove();
    }

    _setBusyUi(on) {
        const content = this.getEl('analyze-btn-content');
        if (this.loadFileBtn) this.loadFileBtn.disabled = on;
        if (!content) return;
        if (on) {
            content.replaceChildren();
            const spin = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            spin.setAttribute('class', 'animate-spin -ml-1 mr-2 h-5 w-5 text-white');
            spin.setAttribute('fill', 'none');
            spin.setAttribute('viewBox', '0 0 24 24');
            spin.innerHTML =
                '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>';
            content.append(spin, h('span', { text: ' Анализ…' }));
            if (this.analyzeBtn) this.analyzeBtn.disabled = true;
        } else {
            content.replaceChildren(h('span', { text: 'Анализировать' }));
            this.updateAnalyzeButtonState();
        }
    }

    /** Читает файлы (в т.ч. все XML внутри ZIP), разбирает их и показывает результат. */
    async ingestFiles(files, { compare = false } = {}) {
        if (!files || !files.length) return;
        if (this._busy) {
            this.showNotification('Дождитесь окончания текущей загрузки.', 'error');
            return;
        }
        this._busy = true;
        this._setBusyUi(true);
        const added = [];
        try {
            for (let fi = 0; fi < files.length; fi++) {
                const file = files[fi];
                const prefix = files.length > 1 ? `Файл ${fi + 1} из ${files.length}: ` : '';
                this._setProgress(`${prefix}чтение «${file.name}»…`, 0.02);
                let r;
                try {
                    r = await window.electronAPI.readFileEntries(file, {
                        onProgress: (p) =>
                            this._setProgress(`${prefix}чтение «${file.name}»…`, p * 0.25),
                    });
                } catch (e) {
                    r = { error: e.message };
                }
                if (r.error) {
                    this.showNotification(`«${file.name}»: ${r.error}`, 'error');
                    continue;
                }
                for (const entry of r.entries) {
                    try {
                        const d = await entry.read();
                        if (!d.text || !d.text.trim()) {
                            this.showNotification(`«${entry.name}»: файл пуст.`, 'error');
                            continue;
                        }
                        const display =
                            entry.name === file.name ? file.name : `${file.name} → ${entry.name}`;
                        const rec = await this._createRecord(
                            {
                                name: display,
                                size: entry.size || d.text.length,
                                text: d.text,
                                encoding: d.encoding,
                                note: d.note,
                            },
                            (p) =>
                                this._setProgress(`${prefix}разбор «${entry.name}»…`, 0.25 + p * 0.65),
                        );
                        added.push(rec);
                    } catch (e) {
                        console.error('[xml-analyzer] ошибка обработки файла', e);
                        this.showNotification(`«${entry.name}»: ${e.message}`, 'error');
                    }
                }
            }
            if (added.length) await this._adoptRecords(added, compare);
        } finally {
            this._busy = false;
            this._hideProgress();
            this._setBusyUi(false);
        }
    }

    async _adoptRecords(added, compare) {
        const hadActive = this.isAnalysisDone && this.activeRecord;
        this.docs.push(...added);
        this._trimDocs();
        this._rememberRecent(added);
        if (compare && hadActive) {
            this._presentRecord(this.activeRecord);
            this.showNotification(
                `Добавлено для сравнения: ${added.map((r) => r.name).join(', ')}`,
                'success',
            );
            return;
        }
        await this._activateRecord(added[0]);
        if (added.length > 1) {
            this.showNotification(
                `Загружено документов: ${added.length}. Переключайтесь между ними сверху, различия — на вкладке «Сравнение».`,
                'success',
            );
        }
    }

    _trimDocs() {
        const MAX_DOCS = 10;
        let total = this.docs.reduce((s, r) => s + (r.doc ? r.doc.src.length : 0), 0);
        while (this.docs.length > 1 && (this.docs.length > MAX_DOCS || total > 400_000_000)) {
            const idx = this.docs.findIndex((r) => r !== this.activeRecord);
            if (idx < 0) break;
            const [gone] = this.docs.splice(idx, 1);
            total -= gone.doc ? gone.doc.src.length : 0;
            this._disposeRecord(gone);
        }
    }

    _disposeRecord(rec) {
        try {
            if (rec.view && rec.view.destroy) rec.view.destroy();
        } catch {
            // ignore
        }
        rec.view = null;
        rec.doc = null;
        rec.json = null;
    }

    _buildDocBar() {
        if (this.docs.length < 2) return null;
        const bar = h('div', {
            class: 'xa-docbar',
            role: 'group',
            'aria-label': 'Загруженные документы',
        });
        for (const rec of this.docs) {
            const on = rec === this.activeRecord;
            bar.appendChild(
                h(
                    'span',
                    {
                        class: 'xa-doc-chip' + (on ? ' xa-doc-chip-on' : ''),
                        title: `${rec.name} (${fmtSize(rec.size)})`,
                    },
                    h('button', {
                        type: 'button',
                        class: 'xa-doc-name',
                        style: { background: 'none', border: '0', cursor: 'pointer', color: 'inherit', padding: '0' },
                        'aria-pressed': on ? 'true' : 'false',
                        onclick: () => this._activateRecord(rec),
                        text: rec.name,
                    }),
                    h('button', {
                        type: 'button',
                        class: 'xa-doc-x',
                        'aria-label': `Закрыть «${rec.name}»`,
                        title: 'Закрыть документ',
                        onclick: () => this._closeRecord(rec),
                        text: '×',
                    }),
                ),
            );
        }
        bar.appendChild(
            h(
                'button',
                { type: 'button', class: 'xa-btn', onclick: () => this.openFilePicker('compare') },
                h('i', { class: 'fas fa-plus', 'aria-hidden': 'true' }),
                h('span', { text: 'Добавить файл' }),
            ),
        );
        return bar;
    }

    _closeRecord(rec) {
        const idx = this.docs.indexOf(rec);
        if (idx < 0) return;
        this.docs.splice(idx, 1);
        const wasActive = rec === this.activeRecord;
        this._disposeRecord(rec);
        if (!this.docs.length) {
            this.clearAnalysis();
            return;
        }
        if (wasActive) this._activateRecord(this.docs[Math.min(idx, this.docs.length - 1)]);
        else this._presentRecord(this.activeRecord);
    }

    async _activateRecord(rec) {
        this.activeRecord = rec;
        if (!rec.view) {
            const wasBusy = this._busy;
            this._busy = true;
            try {
                await this._renderRecord(rec);
            } finally {
                this._busy = wasBusy;
                this._hideProgress();
            }
        }
        this._presentRecord(rec);
    }

    _presentRecord(rec) {
        if (!rec.view) return;
        this.certificates = rec.certs || new Map();
        const wrapper = h('div', { class: 'xa-session' }, this._buildDocBar(), rec.view.element);
        this.outputArea.replaceChildren(wrapper);
        if (this.placeholder) this.placeholder.style.display = 'none';
        const mainElement = this.root.querySelector('.xml-analyzer-shell');
        if (mainElement) {
            mainElement.classList.add('analysis-done');
            mainElement.classList.toggle('show-cert-manager', this.certificates.size > 0);
        }
        if (this.certList) this.certList.replaceChildren();
        this.renderCertificateManager();
        this.isAnalysisDone = true;
        if (this.inputArea) this.inputArea.readOnly = true;
        const content = this.getEl('analyze-btn-content');
        if (content) content.replaceChildren(h('span', { text: 'Анализировать' }));
        this.updateAnalyzeButtonState();
        if (rec.view.refreshCompare) rec.view.refreshCompare();
    }

    _loadRecent() {
        try {
            const v = JSON.parse(localStorage.getItem('xmlAnalyzerRecent') || '[]');
            return Array.isArray(v)
                ? v.filter((x) => x && typeof x.name === 'string').slice(0, 8)
                : [];
        } catch {
            return [];
        }
    }

    /** Запоминает только имена, размеры и тип — содержимое файлов не сохраняется. */
    _rememberRecent(recs) {
        try {
            let list = this._loadRecent();
            for (const r of recs) {
                list = list.filter((x) => !(x.name === r.name && x.size === r.size));
                list.unshift({ name: r.name, size: r.size, type: r.typeLabel || '', at: Date.now() });
            }
            localStorage.setItem('xmlAnalyzerRecent', JSON.stringify(list.slice(0, 8)));
        } catch {
            // хранилище недоступно
        }
        this._renderRecent();
    }

    _renderRecent() {
        const host = this._recentEl;
        if (!host) return;
        const list = this._loadRecent();
        if (!list.length) {
            host.hidden = true;
            host.replaceChildren();
            return;
        }
        host.hidden = false;
        host.replaceChildren(
            h(
                'div',
                { class: 'xa-recent-title' },
                h('span', { text: 'Недавно открывали' }),
                h('button', {
                    type: 'button',
                    class: 'xa-link-btn',
                    onclick: () => {
                        try {
                            localStorage.removeItem('xmlAnalyzerRecent');
                        } catch {
                            // ignore
                        }
                        this._renderRecent();
                    },
                    text: 'очистить',
                }),
            ),
            h(
                'div',
                { class: 'xa-recent-list' },
                list.map((x) =>
                    h('button', {
                        type: 'button',
                        class: 'xa-recent-item',
                        title: `${x.name}${x.type ? ' · ' + x.type : ''} · ${fmtSize(x.size || 0)} · ${new Date(x.at).toLocaleString('ru-RU')}\nСодержимое файлов не хранится: выберите файл снова.`,
                        onclick: () => {
                            this.showNotification(
                                `Выберите файл «${x.name}» — содержимое не хранится в приложении.`,
                                'success',
                            );
                            this.openFilePicker();
                        },
                        text: x.name,
                    }),
                ),
            ),
        );
    }

    // ---------- Разбор документа ----------

    /** Подготавливает запись документа: определяет формат (XML/JSON/сертификат) и разбирает структуру. */
    async _createRecord({ name, size, text, encoding, note }, onProgress) {
        const rec = {
            id: `d${++this._docSeq}`,
            name,
            size,
            encoding: encoding || '',
            note: note || '',
            kind: 'xml',
            typeLabel: '',
            doc: null,
            json: null,
            blob: null,
            preview: '',
            view: null,
            certs: new Map(),
        };
        const t = text;
        const lead = t.search(/\S/);
        const head = lead >= 0 ? t.slice(lead, lead + 80) : '';
        let xmlText = null;

        if ((head.startsWith('{') || head.startsWith('[')) && t.length < 60_000_000) {
            try {
                const json = JSON.parse(t);
                if (json && typeof json === 'object') {
                    rec.json = json;
                    rec.kind = !Array.isArray(json) && Array.isArray(json.messages) ? 'sedo' : 'json';
                    xmlText = jsonToXmlString(json, Array.isArray(json) ? 'array' : 'json');
                }
            } catch {
                // не JSON — пробуем как XML/текст
            }
        }
        if (xmlText === null && head && !head.includes('<') && t.length < 20_000_000) {
            const bytes = base64ToBytes(t.slice(lead));
            if (bytes && bytes.length > 100) {
                const r = await analyzeBlob(bytes);
                if (r.type !== 'unknown') {
                    rec.kind = 'blob';
                    rec.blob = r;
                    rec.typeLabel = r.type === 'cms' ? 'Подпись CMS' : 'Сертификат X.509';
                    return rec;
                }
            }
        }
        if (xmlText === null) {
            const xi = t.indexOf('<');
            if (xi < 0) {
                rec.kind = 'text';
                rec.preview = t.slice(0, 800);
                return rec;
            }
            xmlText = xi > 0 ? t.slice(xi) : t;
        }
        const doc = await parseXml(xmlText, { onProgress });
        if (doc.rootElement < 0) {
            rec.kind = 'text';
            rec.preview = xmlText.slice(0, 800);
            return rec;
        }
        rec.doc = doc;
        return rec;
    }

    _knownReportTitle(rootLocal) {
        const map = {
            ТипОтчет: 'Диагностический отчёт 1С',
            РегистрационныйФайл: 'Регистрационный файл абонента',
            Заявление: 'Заявление на подключение',
            ЭДПФР: 'Документ ЭДПФР/СФР',
        };
        return map[rootLocal] || '';
    }

    /** Строит подробный отчёт по известным типам (DOM-разбор небольших документов). */
    async _buildKnownReport(xmlDoc, signatureCertData) {
        const warnings = [];
        let node = null;
        const rootTag = xmlDoc.documentElement.localName;
        switch (rootTag) {
            case 'ТипОтчет':
                node = this._renderDiagnosticReport(this._parseDiagnosticReportData(xmlDoc));
                break;
            case 'РегистрационныйФайл':
                node = this._renderRegistrationFileReport(await this._parseRegistrationFile(xmlDoc));
                break;
            case 'Заявление': {
                const { data, cert } = await this._parseStatement(xmlDoc);
                node = this._renderStatementReport(data, cert);
                break;
            }
            case 'ЭДПФР':
                if (xmlDoc.querySelector('ЕФС-1')) {
                    node = this._renderEfs1Report(await this._parseEfs1(xmlDoc));
                } else if (xmlDoc.querySelector('СЗВ-ТД')) {
                    node = this._renderSzvTdReport(await this._parseSzvTd(xmlDoc));
                } else if (xmlDoc.querySelector('ЗПЭД')) {
                    node = this._renderZpedReport(this._parseZped(xmlDoc), signatureCertData);
                } else {
                    const knownTags = Array.from(xmlDoc.documentElement.children)
                        .map((n) => n.tagName)
                        .join(', ');
                    warnings.push(
                        `Тип отчёта ЭДПФР не поддерживается для детального разбора (теги: ${knownTags}) — используйте разделы «Обзор» и «Дерево».`,
                    );
                }
                break;
            default:
                break;
        }
        return { node, warnings };
    }

    /** Полный анализ записи: отчёт известного типа, реквизиты, подписи, быстрые выводы, представление. */
    async _renderRecord(rec) {
        const DOM_LIMIT = 8_000_000;
        this._setProgress(`Анализ «${rec.name}»…`, 0.92);
        await yieldToUi();
        this.certificates = rec.certs;
        const warnings = [];
        let reportNode = null;
        let reportType = '';
        const doc = rec.doc;
        const fatal = [];

        try {
            if (rec.kind === 'sedo') {
                reportNode = this.renderSedoLog(rec.json);
                reportType = 'Лог СЭДО (JSON)';
            } else if (rec.kind === 'json') {
                reportType = 'JSON-документ';
            } else if (doc) {
                const rootLocal = doc.localName(doc.rootElement);
                const title = this._knownReportTitle(rootLocal);
                if (title) {
                    reportType = title;
                    if (rec.size <= DOM_LIMIT) {
                        let xmlString = doc.src;
                        if (doc.doctype) {
                            xmlString =
                                xmlString.slice(0, doc.doctype.start) + xmlString.slice(doc.doctype.end);
                        }
                        const { fixedXml } = this._fixBrokenUriEncoding(xmlString);
                        const safe = fixedXml.replace(
                            /<!ENTITY\s+[^>]*?\b(?:SYSTEM|PUBLIC)\b[^>]*>/gi,
                            '',
                        );
                        const xmlDom = new DOMParser().parseFromString(safe, 'application/xml');
                        const perr = xmlDom.getElementsByTagName('parsererror')[0];
                        if (perr) {
                            warnings.push(
                                `Детальный разбор типового отчёта недоступен: ${this._describeXmlParseError(perr.textContent)}`,
                            );
                        } else {
                            try {
                                const sig = await this._tryParseSignatureCertificate(xmlDom);
                                const built = await this._buildKnownReport(xmlDom, sig);
                                reportNode = built.node;
                                warnings.push(...built.warnings);
                            } catch (e) {
                                console.warn('Ошибка детального анализа:', e);
                                warnings.push(
                                    `При углублённом анализе отчёта произошла ошибка: ${e.message}`,
                                );
                            }
                        }
                    } else {
                        warnings.push(
                            'Документ крупный: детальный разбор типового отчёта пропущен, доступны обзор, дерево и таблицы.',
                        );
                    }
                    if (reportNode && warnings.length) {
                        reportNode.prepend(this._createWarningsNode(warnings));
                    }
                } else {
                    reportType = 'Произвольный XML';
                }
            }
        } catch (e) {
            console.error('Критическая ошибка анализа:', e);
            fatal.push(`Ошибка при построении отчёта: ${e.message}`);
        }

        if (rec.kind === 'text') {
            rec.view = this._buildProblemView(rec);
            rec.typeLabel = 'не XML';
            return;
        }

        let requisites = {
            items: [],
            empty: [],
            hiddenCount: 0,
            bik: null,
            amountTotal: null,
            amountCount: 0,
        };
        let sign = { signatures: [], certificates: [], cms: [], blobs: 0, issues: [] };
        if (doc) {
            requisites = collectRequisites(doc);
            sign = await findSignatures(doc);
        } else if (rec.blob) {
            if (rec.blob.type === 'certificate') {
                sign.certificates.push({ ...rec.blob.cert, source: 'вставленные данные' });
            } else if (rec.blob.type === 'cms') {
                sign.cms.push({ ...rec.blob.cms, source: 'вставленные данные' });
                rec.blob.cms.certs
                    .filter((c) => !c.error)
                    .forEach((c) => sign.certificates.push({ ...c, source: 'подпись CMS' }));
            }
        }
        for (const c of sign.certificates) {
            if (c.base64) {
                this.addOrUpdateCertificate({ ...c, source: c.source || 'Подпись документа' });
            }
        }
        const named = reportType && reportType !== 'Произвольный XML';
        const meta = {
            fileName: rec.name,
            size: rec.size,
            encodingUsed: rec.encoding,
            encodingNote: rec.note,
            reportType,
            title: named ? reportType : rec.name,
            subtitle: named ? rec.name : reportType,
        };
        rec.typeLabel =
            reportType || (rec.blob ? (rec.blob.type === 'cms' ? 'Подпись CMS' : 'Сертификат X.509') : '');
        if (rec.blob) {
            meta.title = rec.typeLabel;
            meta.subtitle = 'Данные распознаны как base64 (DER)';
        }
        const findings = buildFindings({ doc, requisites, sign, meta });
        const extra = [...fatal, ...(reportNode ? [] : warnings)].map((text) => ({
            level: 'warn',
            text,
        }));
        if (extra.length) findings.unshift(...extra);

        rec.view = createExplorerView({
            doc,
            meta,
            requisites,
            sign,
            findings,
            reportNode,
            notify: (m, type) => this.showNotification(m, type || 'success'),
            getOtherDocs: () =>
                this.docs
                    .filter((r) => r.doc && r !== rec)
                    .map((r) => ({ id: r.id, name: r.name, doc: r.doc })),
            requestSecondFile: () => this.openFilePicker('compare'),
            showCertificate: (cert) => {
                this.addOrUpdateCertificate(cert);
                this.showCertificateDetails(cert.thumbprint);
            },
        });
    }

    _buildProblemView(rec) {
        const prev = rec.preview || '';
        const reasons = [];
        if (/^\s*<!doctype html|<html[\s>]/i.test(prev)) {
            reasons.push(
                'Это HTML-страница, а не XML — возможно, сохранена страница ошибки или авторизации вместо выгрузки.',
            );
        }
        if (/^\s*[[{]/.test(prev)) {
            reasons.push('Похоже на JSON, но он повреждён или оборван — проверьте, что файл скопирован целиком.');
        }
        if (!prev.includes('<')) {
            reasons.push(
                'В тексте нет ни одного XML-тега. Если это base64 подписи или сертификата — вставьте его без лишних символов.',
            );
        }
        if (!reasons.length) reasons.push('В тексте не найден корневой элемент XML.');
        const card = h(
            'div',
            { class: 'xa-error-card', role: 'alert' },
            h('h3', { text: 'Не удалось распознать XML или JSON' }),
            h('p', {
                text: 'Анализатор принимает XML любого отчёта, JSON из СЭДО, ZIP с такими файлами, а также base64 сертификата или подписи.',
            }),
            h('ul', null, reasons.map((r) => h('li', { text: r }))),
            prev ? h('pre', { text: prev }) : null,
        );
        return { element: card, destroy() {}, refreshCompare() {} };
    }

    handleAnalyzeButtonClick() {
        if (this.isAnalysisDone) {
            this.clearAnalysis();
        } else {
            this.analyzeData();
        }
    }

    showNotification(message, type = 'error') {
        const container = this.getEl('notification-container');
        if (!container) {
            console.error(
                'Критическая ошибка: Контейнер для уведомлений #notification-container не найден в DOM!',
            );
            return;
        }

        const notificationElement = document.createElement('div');
        const colorClass = type === 'error' ? 'bg-red-500' : 'bg-green-500';
        notificationElement.className = `p-4 text-white rounded-lg shadow-lg transition-all duration-300 transform-gpu animate-fade-in-out ${colorClass}`;
        notificationElement.textContent = message;
        notificationElement.style.pointerEvents = 'auto';
        notificationElement.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        closeButton.className =
            'absolute top-1 right-2 text-white font-bold text-xl hover:text-gray-200';
        closeButton.onclick = () => {
            notificationElement.classList.add('opacity-0', 'scale-90');
            setTimeout(() => notificationElement.remove(), 300);
        };
        notificationElement.classList.add('relative', 'pr-8');

        notificationElement.appendChild(closeButton);
        container.appendChild(notificationElement);

        setTimeout(() => {
            if (notificationElement.parentElement) {
                notificationElement.classList.add('opacity-0', 'scale-90');
                setTimeout(() => notificationElement.remove(), 300);
            }
        }, 5000);
    }

    clearAnalysis() {
        const mainElement = this.root.querySelector('.xml-analyzer-shell');
        if (mainElement) {
            mainElement.classList.remove('analysis-done', 'show-cert-manager');
        }

        this.docs.forEach((r) => this._disposeRecord(r));
        this.docs = [];
        this.activeRecord = null;
        this.certificates = new Map();
        this.isAnalysisDone = false;
        this._hideProgress();

        if (this.inputArea) {
            this.inputArea.value = '';
            this.inputArea.readOnly = false;
        }

        if (this.dataInputTextarea) {
            this.dataInputTextarea.value = '';
        }

        if (this.outputArea) {
            this.outputArea.replaceChildren();
        }
        if (this.placeholder) {
            this.placeholder.style.display = 'flex';
        }

        const analyzeBtnContent = this.getEl('analyze-btn-content');
        if (this.analyzeBtn) {
            if (analyzeBtnContent) {
                analyzeBtnContent.innerHTML = '<span>Анализировать</span>';
            } else {
                this.analyzeBtn.textContent = 'Анализировать';
            }
            this.analyzeBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
        }

        if (this.certSearchInput) {
            this.certSearchInput.value = '';
        }
        if (this.certList) {
            this.certList.innerHTML = '';
        }
        if (this.certListPlaceholder) {
            this.certListPlaceholder.innerHTML = 'Сертификаты не найдены.';
            this.certListPlaceholder.style.display = 'flex';
        }
        if (this.exportZipBtn) {
            this.exportZipBtn.disabled = true;
        }
        this.updateAnalyzeButtonState();
    }

    _createCertificateStatusField(certData) {
        if (!certData || !certData.thumbprint) {
            return this.createField('Отпечаток:', 'Сертификат не найден в данных', 'error');
        }

        const { thumbprint, validity } = certData;
        let statusText = '';
        let statusType = 'success';

        if (validity && validity.notAfter) {
            const now = new Date();
            const expiryDate = new Date(validity.notAfter);

            const isExpired = now > expiryDate;
            const formattedDate = expiryDate.toLocaleDateString('ru-RU');

            if (isExpired) {
                statusText = ` (истек ${formattedDate})`;
                statusType = 'error';
            } else {
                statusText = ` (действует до ${formattedDate})`;
            }
        } else {
            statusText = ' (срок действия неизвестен)';
            statusType = 'warning';
        }

        return this.createField('Отпечаток:', `${thumbprint}${statusText}`, statusType, { mono: true });
    }

    async handleAppClicks(event) {
        const downloadButton = event.target.closest('.download-cert-btn');
        if (downloadButton && !downloadButton.disabled) {
            event.preventDefault();
            event.stopPropagation();

            const thumbprint = downloadButton.dataset.certThumbprint;
            const cert = this.certificates.get(thumbprint.toUpperCase());

            if (cert && cert.base64) {
                const fileName = `certificate_${this._slugify(cert.orgName || cert.ownerFio || thumbprint)}.cer`;
                this.downloadFileFromBase64(cert.base64, fileName, 'application/x-x509-ca-cert');
            } else {
                this.showNotification(
                    'Критическая ошибка: данные сертификата для скачивания не найдены.',
                );
            }
            return;
        }

        const detailsLink = event.target.closest('.cert-list-item');
        if (detailsLink) {
            event.preventDefault();
            const thumbprint = detailsLink.dataset.thumbprint;
            if (thumbprint) {
                this.showCertificateDetails(thumbprint);
            }
            return;
        }

        const sedoRow = event.target.closest('.sedo-message-row');
        if (sedoRow) {
            event.preventDefault();
            const rawJson = sedoRow.dataset.rawJson;
            const viewer = this.getEl('sedo-raw-json-viewer');
            const pre = viewer?.querySelector('pre');

            if (viewer && pre && rawJson) {
                if (sedoRow.classList.contains('bg-sky-100')) {
                    viewer.style.display = 'none';
                    sedoRow.classList.remove('bg-sky-100', 'dark:bg-sky-900/50');
                } else {
                    this.root.querySelectorAll('.sedo-message-row.bg-sky-100').forEach((row) => {
                        row.classList.remove('bg-sky-100', 'dark:bg-sky-900/50');
                    });

                    sedoRow.classList.add('bg-sky-100', 'dark:bg-sky-900/50');

                    pre.textContent = rawJson;
                    viewer.style.display = 'block';
                    viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
            return;
        }
    }

    _createAccordion(title, content, isOpen = false) {
        if (
            !content ||
            (typeof content === 'string' && !content.trim()) ||
            (content.nodeType && !content.hasChildNodes())
        ) {
            return document.createDocumentFragment();
        }

        const template = this.getEl('accordion-section-template');
        if (!template) {
            console.error('Критическая ошибка: шаблон #accordion-section-template не найден!');
            return document.createDocumentFragment();
        }

        const clone = template.content.cloneNode(true);
        const details = clone.querySelector('details');
        const titleEl = clone.querySelector('.accordion-title');
        const contentEl = clone.querySelector('.accordion-content');

        details.open = isOpen;
        titleEl.textContent = this._raw(title).replace(/\s*:\s*$/, '');

        if (typeof content === 'string') {
            contentEl.textContent = content;
        } else if (content.nodeType) {
            contentEl.appendChild(content);
        }

        return clone;
    }

    /** Сырой текст для textContent/dataset (без HTML-экранирования, чтобы не было двойного экранирования) */
    _raw(text) {
        return text == null ? '' : String(text);
    }

    /** Экранированный HTML — ТОЛЬКО для подстановки в innerHTML */
    sanitizeText(text) {
        const element = document.createElement('div');
        element.textContent = text === null || text === undefined ? '' : String(text);
        return element.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Человекочитаемое описание ошибки парсера XML (вместо англоязычного текста <parsererror> браузера).
     * @param {string} rawText
     * @returns {string}
     */
    _describeXmlParseError(rawText) {
        const raw = String(rawText || '').replace(/\s+/g, ' ').trim();
        const m = raw.match(/error on line (\d+) at column (\d+):\s*(.*?)(?:\s*Below is a rendering.*)?$/i);
        const where = m ? `строка ${m[1]}, позиция ${m[2]}` : '';
        const detail = m ? m[3] : raw;
        let reason = detail;
        if (/entity amplification|entity.*(loop|depth)|Detected an entity reference loop/i.test(detail)) {
            reason = 'слишком большое раскрытие XML-сущностей (возможная XML-бомба), документ отклонён';
        } else if (/Opening and ending tag mismatch/i.test(detail)) {
            reason = 'не совпадают открывающий и закрывающий теги';
        } else if (/Extra content at the end/i.test(detail)) {
            reason = 'лишнее содержимое после корневого элемента';
        } else if (/Document is empty|Start tag expected/i.test(detail)) {
            reason = 'документ пуст или не начинается с XML-тега';
        } else if (/Premature end of data/i.test(detail)) {
            reason = 'документ оборван (неожиданный конец данных)';
        } else if (/Entity '.*' not defined/i.test(detail)) {
            reason = 'используется неопределённая сущность (например, &nbsp;)';
        } else if (/Encoding|encoding/i.test(detail)) {
            reason = 'не удалось обработать кодировку документа';
        }
        return `Некорректный XML${where ? ` (${where})` : ''}: ${reason || 'неверный формат.'}`;
    }

    /** Дата/время для отчёта: пусто и невалидное значение → '' (поле скрывается), не 01.01.1970 и не «Invalid Date». */
    _fmtDateTime(value) {
        if (value === null || value === undefined || String(value).trim() === '') return '';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('ru-RU');
    }

    getText(parent, tagName, namespace = null) {
        if (!parent) return '';
        let elements = namespace
            ? parent.getElementsByTagNameNS(namespace, tagName)
            : parent.getElementsByTagName(tagName);
        if (!elements[0] && !namespace && parent.getElementsByTagNameNS) {
            // Документ с префиксом пространства имён: ищем по локальному имени.
            elements = parent.getElementsByTagNameNS('*', tagName);
        }
        return elements[0] ? elements[0].textContent.trim() : '';
    }

    _fmtDateOnly(value) {
        if (!value) return '—';
        const d = new Date(value);
        return isNaN(d) ? String(value) : d.toLocaleDateString('ru-RU');
    }

    createField(label, value, type = 'default', { html = false, mono = false } = {}) {
        if (value === null || value === undefined || String(value).trim() === '') {
            return document.createDocumentFragment();
        }

        const template = this.getEl('info-row-template');
        if (!template) {
            console.error('Критическая ошибка: шаблон #info-row-template не найден!');
            return document.createDocumentFragment();
        }

        const clone = template.content.cloneNode(true);
        const keyEl = clone.querySelector('.info-key');
        const valueEl = clone.querySelector('.info-value');

        keyEl.textContent = this._raw(label).replace(/\s*:\s*$/, '');
        if (mono) valueEl.classList.add('xa-mono-val');

        if (html) {
            valueEl.innerHTML = String(value);
        } else {
            valueEl.textContent = this._raw(value);
        }

        if (type === 'success') valueEl.classList.add('text-green-600', 'dark:text-green-400');
        if (type === 'error')
            valueEl.classList.add('text-red-600', 'dark:text-red-400', 'font-semibold');
        if (type === 'warning') valueEl.classList.add('text-amber-600', 'dark:text-amber-400');

        return clone;
    }

    async downloadFileFromBase64(base64Data, fileName, mimeType = 'application/octet-stream') {
        try {
            const bytes = base64ToBytes(String(base64Data));
            if (!bytes) throw new Error('данные не являются корректным base64');
            const blob = new Blob([bytes], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (e) {
            console.error('Ошибка при скачивании файла:', e);
            this.showNotification(
                `Не удалось скачать файл. Данные сертификата могут быть повреждены. Ошибка: ${e.message}`,
            );
        }
    }

    addOrUpdateCertificate(certData) {
        if (!certData || !certData.thumbprint) {
            console.warn('Пропущен сертификат без отпечатка', certData);
            return;
        }

        const thumbprint = certData.thumbprint.toUpperCase();
        const existingCert = this.certificates.get(thumbprint) || {};

        const updatedCert = { ...existingCert, ...certData };

        this.certificates.set(thumbprint, updatedCert);
    }

    showCertificateDetails(thumbprint) {
        const certData = this.certificates.get(thumbprint.toUpperCase());
        if (!certData) {
            this.showNotification(
                'Не удалось найти данные для сертификата с отпечатком: ' + thumbprint,
            );
            return;
        }

        const container = document.createElement('div');
        container.className = 'space-y-4 text-sm';

        const formatDate = (dateValue) => {
            if (!dateValue) return 'Не указана';
            const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
            return !isNaN(date.getTime())
                ? date.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'medium' })
                : 'Неверная дата';
        };

        const cert = certData.certObject || {
            thumbprint: certData.thumbprint,
            subject: certData.subject || { CN: certData.ownerFio, O: certData.orgName },
            issuer: certData.issuer || {},
            serialNumber: certData.serialNumber || 'N/A',
            validity: certData.validity || { notBefore: null, notAfter: null },
            extensions: certData.extensions || [],
            version: certData.version || 'N/A',
        };

        if (certData.parseError) {
            const errorDiv = document.createElement('div');
            errorDiv.className =
                'p-3 mb-4 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300';
            errorDiv.innerHTML = `<p class="font-bold">Внимание!</p><p>${this.sanitizeText(certData.parseError)}</p>`;
            container.appendChild(errorDiv);
        }

        const createSection = (title, fields, isOpen = true) => {
            if (!fields || fields.length === 0) return null;

            const details = document.createElement('details');
            details.open = isOpen;

            const summary = document.createElement('summary');
            summary.className =
                'font-bold text-lg mb-2 text-slate-800 dark:text-slate-100 cursor-pointer list-none';
            summary.innerHTML = `<span class="flex items-center gap-2">${this.sanitizeText(title)} <svg class="w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>`;
            summary.onclick = (e) => {
                e.preventDefault();
                details.open = !details.open;
                summary.querySelector('svg').classList.toggle('rotate-180', details.open);
            };

            const contentDiv = document.createElement('div');
            contentDiv.className =
                'pl-4 border-l-2 border-slate-300 dark:border-slate-700 space-y-1';

            fields.forEach((fieldFragment) => {
                if (fieldFragment.hasChildNodes()) {
                    contentDiv.appendChild(fieldFragment);
                }
            });

            if (contentDiv.hasChildNodes()) {
                details.appendChild(summary);
                details.appendChild(contentDiv);
                return details;
            }
            return null;
        };

        // Секция "Общая информация"
        const generalFields = [
            this.createField('Отпечаток (SHA-1)', cert.thumbprint),
            this.createField(
                'Серийный номер',
                cert.serialNumber.replace(/(.{2})/g, '$1:').slice(0, -1),
            ),
            this.createField('Версия', cert.version),
            this.createField('Действителен с', formatDate(cert.validity.notBefore)),
            this.createField('Действителен по', formatDate(cert.validity.notAfter)),
        ];
        const generalSection = createSection('Общая информация', generalFields, true);
        if (generalSection) container.appendChild(generalSection);

        // Секция "Субъект"
        const subjectFieldsData = certData.certObject
            ? cert.subject.attributes
            : Object.entries(cert.subject).map(([key, value]) => ({ shortName: key, value }));
        const subjectFields = subjectFieldsData.map((attr) =>
            this.createField(attr.shortName || attr.type, attr.value),
        );
        const subjectSection = createSection('Субъект (Кому выдан)', subjectFields, true);
        if (subjectSection) container.appendChild(subjectSection);

        // Секция "Издатель"
        const issuerFieldsData = certData.certObject
            ? cert.issuer.attributes
            : Object.entries(cert.issuer).map(([key, value]) => ({ shortName: key, value }));
        const issuerFields = issuerFieldsData.map((attr) =>
            this.createField(attr.shortName || attr.type, attr.value),
        );
        const issuerSection = createSection('Издатель (Кем выдан)', issuerFields, true);
        if (issuerSection) container.appendChild(issuerSection);

        this.modalContentTarget.innerHTML = '';
        this.modalContentTarget.appendChild(container);

        this.modalOverlay.classList.remove('hidden');
        this.modalOverlay.classList.add('flex');
    }

    hideCertificateDetails() {
        this.modalOverlay.classList.add('hidden');
        this.modalOverlay.classList.remove('flex');
        this.modalContentTarget.innerHTML = '';
    }

    async handleExportAllCerts() {
        this.exportZipBtn.disabled = true;
        this.exportZipBtn.textContent = 'Экспорт...';

        try {
            const certsToExport = [];
            this.certificates.forEach((certData, thumbprint) => {
                if (certData.base64) {
                    const orgName = certData.orgName || 'no_org';
                    const ownerFio = certData.ownerFio || 'no_fio';

                    let fileName = `${this._slugify(orgName)}_${this._slugify(ownerFio)}_${thumbprint.substring(0, 8)}.cer`;

                    fileName = fileName.replace(/^_|_$/g, '').replace(/__+/g, '_');
                    if (fileName.startsWith('_')) {
                        fileName = fileName.substring(1);
                    }
                    if (fileName === '_.cer' || fileName.length < 12) {
                        fileName = `certificate_${thumbprint.substring(0, 8)}.cer`;
                    }

                    certsToExport.push({
                        fileName: fileName,
                        base64: certData.base64,
                    });
                }
            });

            if (certsToExport.length === 0) {
                this.showNotification(
                    'Нет сертификатов для экспорта. Проанализируйте файлы, содержащие сертификаты.',
                    'error',
                );
                return;
            }

            const result = await window.electronAPI.exportCertsToZip(certsToExport);
            if (result.success) {
                const msg = result.path
                    ? `Сертификаты (${certsToExport.length} шт.) успешно экспортированы в:\n${result.path}`
                    : `Сертификаты (${certsToExport.length} шт.) успешно экспортированы.`;
                this.showNotification(msg, 'success');
            } else if (!result.message.includes('canceled')) {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Ошибка экспорта:', error);
            this.showNotification(
                `Не удалось экспортировать сертификаты: ${error.message}`,
                'error',
            );
        } finally {
            this.exportZipBtn.disabled = false;
            this.exportZipBtn.textContent = 'Экспортировать все в ZIP';
        }
    }

    /** Анализ текста из поля ввода (вставка из буфера). */
    async analyzeData() {
        const raw = this.dataInputTextarea.value;
        if (!raw.trim()) {
            this.clearAnalysis();
            return;
        }
        if (this._busy) return;
        this._busy = true;
        this._setBusyUi(true);
        try {
            this._setProgress('Разбор вставленного текста…', 0.05);
            const rec = await this._createRecord(
                { name: 'Вставленный текст', size: new Blob([raw]).size, text: raw },
                (p) => this._setProgress('Разбор вставленного текста…', 0.05 + p * 0.85),
            );
            await this._adoptRecords([rec], false);
        } catch (e) {
            console.error('Критическая ошибка анализа:', e);
            this.showNotification(`Не удалось выполнить анализ: ${e.message}`, 'error');
        } finally {
            this._busy = false;
            this._hideProgress();
            this._setBusyUi(false);
        }
    }

    _parseZped(xmlDoc) {
        const data = {
            insurer: {},
            operator: {},
            representative: {},
            serviceInfo: {},
        };

        const getText = (parent, selector) =>
            parent?.querySelector(selector)?.textContent.trim() || '';

        const getFio = (parent) => {
            if (!parent) return '';
            // Внутри ФИО теги не имеют префиксов в данном XML
            const lastName = getText(parent, 'Фамилия');
            const firstName = getText(parent, 'Имя');
            const middleName = getText(parent, 'Отчество');
            return `${lastName} ${firstName} ${middleName}`.trim();
        };

        // Страхователь
        const insurerNode = xmlDoc.querySelector('*|ЗПЭД > *|Страхователь > *|ЮЛ');
        if (insurerNode) {
            data.insurer = {
                regNum: getText(insurerNode, '*|РегНомер'),
                name: getText(insurerNode, '*|Наименование'),
                shortName: getText(insurerNode, '*|НаименованиеКраткое'),
                inn: getText(insurerNode, '*|ИНН'),
                kpp: getText(insurerNode, '*|КПП'),
                phone: getText(insurerNode, '*|Телефон'),
                email: getText(insurerNode, '*|АдресЭлПочты'),
            };
        }

        // Оператор
        const operatorNode = xmlDoc.querySelector('*|ЗПЭД > *|Оператор');
        if (operatorNode) {
            data.operator = {
                regNum: getText(operatorNode, '*|РегНомер'),
                shortName: getText(operatorNode, '*|НаименованиеКраткое'),
                inn: getText(operatorNode, '*|ИНН'),
                kpp: getText(operatorNode, '*|КПП'),
            };
        }

        // Представитель
        const repNode = xmlDoc.querySelector('*|ЗПЭД > *|ПредставительСотрудник');
        if (repNode) {
            data.representative = {
                fio: getFio(repNode.querySelector(`*|ФИО`)),
                position: getText(repNode, '*|Должность'),
            };
        }

        // Служебная информация
        const serviceNode = xmlDoc.querySelector('*|СлужебнаяИнформация');
        if (serviceNode) {
            data.serviceInfo = {
                guid: getText(serviceNode, '*|GUID'),
                dateTime: getText(serviceNode, '*|ДатаВремя'),
            };
        }

        return data;
    }

    _renderZpedReport(data, signatureCertData) {
        const wrapper = document.createElement('div');
        wrapper.className = 'analysis-container space-y-4';
        wrapper.id = 'zped-report';

        const titleElement = document.createElement('h2');
        titleElement.className = 'text-2xl font-bold text-slate-900 dark:text-white';
        let reportDate = '';
        if (data.serviceInfo.dateTime) {
            reportDate = ` от ${this._fmtDateOnly(data.serviceInfo.dateTime)}`;
        }
        titleElement.textContent = `Анализ заявления на подключение к ЭДО (ЗПЭД)${reportDate}`;
        wrapper.appendChild(titleElement);

        // --- СТРАХОВАТЕЛЬ ---
        const insurerContent = document.createDocumentFragment();
        insurerContent.appendChild(this.createField('Наименование:', data.insurer.name));
        insurerContent.appendChild(
            this.createField('ИНН / КПП:', `${data.insurer.inn} / ${data.insurer.kpp}`),
        );
        insurerContent.appendChild(this.createField('Рег. номер в СФР:', data.insurer.regNum));
        insurerContent.appendChild(this.createField('Телефон:', data.insurer.phone));
        insurerContent.appendChild(this.createField('Email:', data.insurer.email));
        wrapper.appendChild(this._createAccordion('Страхователь', insurerContent, true));

        // --- ПРЕДСТАВИТЕЛЬ ---
        const repContent = document.createDocumentFragment();
        repContent.appendChild(this.createField('ФИО:', data.representative.fio));
        repContent.appendChild(this.createField('Должность:', data.representative.position));
        wrapper.appendChild(this._createAccordion('Представитель страхователя', repContent, true));

        // --- ОПЕРАТОР СВЯЗИ ---
        const operatorContent = document.createDocumentFragment();
        operatorContent.appendChild(this.createField('Наименование:', data.operator.shortName));
        operatorContent.appendChild(
            this.createField('ИНН / КПП:', `${data.operator.inn} / ${data.operator.kpp}`),
        );
        operatorContent.appendChild(this.createField('Рег. номер:', data.operator.regNum));
        wrapper.appendChild(this._createAccordion('Оператор связи', operatorContent, false));

        // --- ПОДПИСЬ ---
        const signatureContent = document.createDocumentFragment();
        if (signatureCertData) {
            if (signatureCertData.parseFailed) {
                signatureContent.appendChild(
                    this.createField('Ошибка сертификата:', signatureCertData.error, 'error'),
                );
            } else {
                signatureContent.appendChild(this._createCertificateStatusField(signatureCertData));

                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'text-left mt-2';
                buttonContainer.appendChild(
                    this._createDownloadButtonForThumbprint(
                        signatureCertData.thumbprint,
                        'Скачать сертификат подписи',
                    ),
                );
                signatureContent.appendChild(buttonContainer);
            }
        } else {
            signatureContent.appendChild(
                this.createField('Сертификат подписи:', 'Не найден в файле', 'warning'),
            );
        }
        wrapper.appendChild(
            this._createAccordion('Сертификат электронной подписи', signatureContent, true),
        );

        return wrapper;
    }

    _createWarningsNode(warnings) {
        if (!warnings || warnings.length === 0) return document.createDocumentFragment();

        const container = document.createElement('div');
        container.className =
            'p-4 mb-4 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300';

        const title = document.createElement('h4');
        title.className = 'font-bold mb-2';
        title.textContent = 'Предупреждения при анализе:';
        container.appendChild(title);

        const list = document.createElement('ul');
        list.className = 'list-disc list-inside space-y-1 text-sm';
        warnings.forEach((msg) => {
            const item = document.createElement('li');
            item.textContent = String(msg);
            list.appendChild(item);
        });
        container.appendChild(list);

        return container;
    }

    async _tryParseSignatureCertificate(xmlDoc) {
        let certNode = null;

        try {
            certNode = xmlDoc.querySelector('Signature X509Certificate');
        } catch (e) {
            console.warn("Простой селектор 'Signature X509Certificate' не сработал:", e.message);
        }

        if (!certNode) {
            try {
                const allCertElements = xmlDoc.getElementsByTagNameNS('*', 'X509Certificate');

                for (let i = 0; i < allCertElements.length; i++) {
                    const el = allCertElements[i];
                    if (el.parentElement && el.parentElement.localName === 'Signature') {
                        certNode = el;
                        break;
                    }
                }
            } catch (e) {
                console.warn(
                    'Поиск сертификата через getElementsByTagNameNS не сработал:',
                    e.message,
                );
            }
        }

        if (certNode && certNode.textContent) {
            const base64Cert = certNode.textContent.trim();
            if (base64Cert) {
                const parsed = await window.electronAPI.parseCertificate(base64Cert);
                if (!parsed.error) {
                    const certData = {
                        thumbprint: parsed.thumbprint,
                        base64: base64Cert,
                        source: 'XML-подпись документа',
                        ...parsed,
                    };
                    this.addOrUpdateCertificate(certData);
                    return certData;
                } else {
                    console.error('Не удалось распарсить сертификат из подписи:', parsed.error);
                    return { error: parsed.error, parseFailed: true };
                }
            }
        }

        return null;
    }

    _tryParseBasicInfo(xmlDoc) {
        const root = xmlDoc.documentElement;
        const info = {};

        const selectors = {
            inn: ['ИНН', 'ИННЮЛ', 'ИННФЛ'],
            kpp: ['КПП'],
            regNumPFR: ['РегНомер', 'РегНомерПФР', 'РегНомерСтрахователя'],
            orgName: ['Наименование', 'НаименованиеОрганизации', 'КраткоеНаименование'],
            fillDate: ['ДатаЗаполнения', 'ДатаВремяФормирования'],
        };

        for (const key in selectors) {
            for (const tagName of selectors[key]) {
                const value = this.getText(root, tagName);
                if (value) {
                    info[key] = value;
                    break;
                }
            }
        }
        return info;
    }

    _renderGenericReport(basicInfo, signatureCert, warnings) {
        const wrapper = document.createElement('div');
        wrapper.className = 'analysis-container space-y-4';
        wrapper.id = 'generic-report';

        wrapper.appendChild(this._createWarningsNode(warnings));

        const titleElement = document.createElement('h2');
        titleElement.className = 'text-2xl font-bold text-slate-900 dark:text-white';
        titleElement.textContent = 'Общая информация из документа';
        wrapper.appendChild(titleElement);

        const content = document.createDocumentFragment();

        let hasBasicInfo = false;
        if (basicInfo.orgName) {
            content.appendChild(this.createField('Наименование:', basicInfo.orgName));
            hasBasicInfo = true;
        }
        if (basicInfo.inn) {
            content.appendChild(this.createField('ИНН:', basicInfo.inn));
            hasBasicInfo = true;
        }
        if (basicInfo.kpp) {
            content.appendChild(this.createField('КПП:', basicInfo.kpp));
            hasBasicInfo = true;
        }
        if (basicInfo.regNumPFR) {
            content.appendChild(this.createField('Рег. номер в СФР/ПФР:', basicInfo.regNumPFR));
            hasBasicInfo = true;
        }
        if (basicInfo.fillDate) {
            const date = new Date(basicInfo.fillDate);
            if (!isNaN(date)) {
                content.appendChild(
                    this.createField('Дата документа:', date.toLocaleDateString('ru-RU')),
                );
                hasBasicInfo = true;
            }
        }

        if (!hasBasicInfo) {
            const p = document.createElement('p');
            p.className = 'text-sm text-slate-500 p-4 text-center';
            p.textContent =
                'Не удалось извлечь базовую информацию (ИНН, Наименование) из документа.';
            content.appendChild(p);
        }

        wrapper.appendChild(this._createAccordion('Основные реквизиты', content, true));

        const certContent = document.createDocumentFragment();
        if (signatureCert) {
            if (signatureCert.parseFailed) {
                certContent.appendChild(
                    this.createField('Ошибка сертификата:', signatureCert.error, 'error'),
                );
            } else {
                certContent.appendChild(this._createCertificateStatusField(signatureCert));

                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'text-left mt-2';
                buttonContainer.appendChild(
                    this._createDownloadButtonForThumbprint(
                        signatureCert.thumbprint,
                        'Скачать сертификат подписи',
                    ),
                );
                certContent.appendChild(buttonContainer);
            }
        } else {
            certContent.appendChild(
                this.createField('Сертификат подписи:', 'Не найден в файле', 'warning'),
            );
        }

        wrapper.appendChild(
            this._createAccordion('Сертификат электронной подписи', certContent, true),
        );

        return wrapper;
    }

    async _parseEfs1(xmlDoc) {
        const efs1Node = xmlDoc.querySelector('ЕФС-1');
        if (!efs1Node) {
            throw new Error('Не найден обязательный тег <ЕФС-1> в файле.');
        }

        const data = {
            insurer: {},
            oss: null,
            manager: {},
            fillDate: efs1Node.querySelector('ДатаЗаполнения')?.textContent.trim() || '',
            signatureCert: null,
        };

        const getText = (node, selector) => node?.querySelector(selector)?.textContent.trim() || '';

        const insurerNode = efs1Node.querySelector('Страхователь');
        if (insurerNode) {
            data.insurer = {
                regNum: getText(insurerNode, 'РегНомер'),
                name: getText(insurerNode, 'Наименование'),
                inn: getText(insurerNode, 'ИНН'),
                okved: getText(insurerNode, 'КодПоОКВЭД'),
                ogrnip: getText(insurerNode, 'ОГРНИП'),
                phone: getText(insurerNode, 'Телефон'),
                email: getText(insurerNode, 'АдресЭлПочты'),
                katStrh: getText(insurerNode, 'КодКатСтрахФЛ'),
            };
        }

        const ossNode = efs1Node.querySelector('ОСС');
        if (ossNode) {
            data.oss = {
                period: getText(ossNode, 'Период Год') + ' / ' + getText(ossNode, 'Период Код'),
                employeeCount: getText(ossNode, 'Численность Среднесписочная'),
                tariff: getText(ossNode, 'РССВ ТарифУчСкидНадб'),
                calcBase: getText(ossNode, 'РССВ БазаИсч ВсегоСНачала'),
                calcContributions: getText(ossNode, 'РССВ ИсчислСтрахВзн ВсегоСНачала'),
            };
        }

        const managerNode = efs1Node.querySelector('Руководитель');
        if (managerNode) {
            const fioNode = managerNode.querySelector('ФИО');
            const lastName = getText(fioNode, 'Фамилия');
            const firstName = getText(fioNode, 'Имя');
            const middleName = getText(fioNode, 'Отчество');

            data.manager = {
                fio: `${lastName} ${firstName} ${middleName}`.trim(),
                position: getText(managerNode, 'Должность'),
            };
        }

        const certNode = xmlDoc.querySelector('Signature X509Certificate');
        if (certNode) {
            const base64Cert = certNode.textContent.trim();
            if (base64Cert) {
                const parsed = await window.electronAPI.parseCertificate(base64Cert);
                if (!parsed.error) {
                    const certData = {
                        thumbprint: parsed.thumbprint,
                        base64: base64Cert,
                        source: 'ЕФС-1 (подпись)',
                        ...parsed,
                    };
                    this.addOrUpdateCertificate(certData);
                    data.signatureCert = certData;
                } else {
                    data.signatureCert = { error: parsed.error, parseFailed: true };
                }
            }
        }

        return data;
    }

    _renderEfs1Report(data) {
        const wrapper = document.createElement('div');
        wrapper.className = 'analysis-container space-y-4';
        wrapper.id = 'efs1-report';

        const titleElement = document.createElement('h2');
        titleElement.className = 'text-2xl font-bold text-slate-900 dark:text-white';
        titleElement.textContent = `Анализ отчета ЕФС-1${data.fillDate ? ' от ' + this._fmtDateOnly(data.fillDate) : ''}`;
        wrapper.appendChild(titleElement);

        // --- СТРАХОВАТЕЛЬ ---
        const insurerContent = document.createDocumentFragment();
        insurerContent.appendChild(this.createField('Наименование:', data.insurer.name));
        insurerContent.appendChild(this.createField('ИНН:', data.insurer.inn));
        insurerContent.appendChild(this.createField('Рег. номер в СФР:', data.insurer.regNum));
        insurerContent.appendChild(this.createField('ОГРНИП:', data.insurer.ogrnip));
        insurerContent.appendChild(this.createField('ОКВЭД:', data.insurer.okved));
        insurerContent.appendChild(this.createField('Телефон:', data.insurer.phone));
        insurerContent.appendChild(this.createField('Email:', data.insurer.email));
        wrapper.appendChild(this._createAccordion('Страхователь', insurerContent, true));

        // --- СВЕДЕНИЯ О ВЗНОСАХ (если есть) ---
        if (data.oss) {
            const ossContent = document.createDocumentFragment();
            ossContent.appendChild(this.createField('Отчетный период:', data.oss.period));
            ossContent.appendChild(
                this.createField('Среднесписочная численность:', data.oss.employeeCount),
            );
            ossContent.appendChild(
                this.createField('База для исчисления взносов:', data.oss.calcBase),
            );
            ossContent.appendChild(
                this.createField('Исчислено взносов:', data.oss.calcContributions),
            );
            ossContent.appendChild(this.createField('Тариф:', data.oss.tariff));
            wrapper.appendChild(
                this._createAccordion(
                    'Сведения о взносах на травматизм (Раздел 2)',
                    ossContent,
                    true,
                ),
            );
        } else {
            const warningFragment = document.createDocumentFragment();
            const p = document.createElement('p');
            p.className = 'text-sm text-slate-500 p-4';
            p.textContent =
                'Раздел 2 (сведения о взносах на травматизм) в данном отчете отсутствует.';
            warningFragment.appendChild(p);
            wrapper.appendChild(
                this._createAccordion(
                    'Сведения о взносах на травматизм (Раздел 2)',
                    warningFragment,
                    false,
                ),
            );
        }

        // --- ПОДПИСАНТ И СЕРТИФИКАТ ---
        const managerContent = document.createDocumentFragment();
        managerContent.appendChild(this.createField('ФИО:', data.manager.fio));
        managerContent.appendChild(this.createField('Должность:', data.manager.position));

        if (data.signatureCert) {
            if (data.signatureCert.parseFailed) {
                managerContent.appendChild(
                    this.createField('Ошибка сертификата:', data.signatureCert.error, 'error'),
                );
            } else {
                managerContent.appendChild(this._createCertificateStatusField(data.signatureCert));

                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'text-left mt-2';
                buttonContainer.appendChild(
                    this._createDownloadButtonForThumbprint(
                        data.signatureCert.thumbprint,
                        'Скачать сертификат подписи',
                    ),
                );
                managerContent.appendChild(buttonContainer);
            }
        } else {
            managerContent.appendChild(
                this.createField('Сертификат подписи:', 'Не найден в XML-файле', 'warning'),
            );
        }
        wrapper.appendChild(this._createAccordion('Подписант отчета', managerContent, true));

        return wrapper;
    }

    _getTextNs(parent, tagName, namespace) {
        if (!parent) return '';
        const elements = parent.getElementsByTagNameNS(namespace, tagName);
        if (elements[0]) return elements[0].textContent.trim();
        // версия схемы могла сменить пространство имён — ищем по локальному имени
        return this.getText(parent, tagName);
    }

    async _parseSzvTd(xmlDoc) {
        const szvTdNode = xmlDoc.querySelector('СЗВ-ТД');
        if (!szvTdNode) throw new Error('Не найден обязательный тег <СЗВ-ТД> в файле.');

        const nsUt2 = 'http://xn--p1ai/УТ/2017-08-21';
        const nsDsig = 'http://www.w3.org/2000/09/xmldsig#';

        const data = {
            employer: {},
            employee: {},
            events: [],
            manager: {},
            fillDate: this.getText(szvTdNode, 'ДатаЗаполнения'),
            signatureCert: null,
        };

        // Работодатель
        const employerNode = szvTdNode.querySelector('Работодатель');
        if (employerNode) {
            data.employer = {
                regNum: this._getTextNs(employerNode, 'РегНомер', nsUt2),
                name: this.getText(employerNode, 'НаименованиеОрганизации'),
                inn: this._getTextNs(employerNode, 'ИНН', nsUt2),
                kpp: this._getTextNs(employerNode, 'КПП', nsUt2),
            };
        }

        // Застрахованное лицо (сотрудник)
        const employeeNode = szvTdNode.querySelector('ЗЛ');
        if (employeeNode) {
            const fioNode = employeeNode.querySelector('ФИО');
            data.employee = {
                fio: fioNode
                    ? {
                          lastName: this._getTextNs(fioNode, 'Фамилия', nsUt2),
                          firstName: this._getTextNs(fioNode, 'Имя', nsUt2),
                          middleName: this._getTextNs(fioNode, 'Отчество', nsUt2),
                      }
                    : {},
                birthDate: this.getText(employeeNode, 'ДатаРождения'),
                snils: this._getTextNs(employeeNode, 'СНИЛС', nsUt2),
            };
        }

        // Мероприятия
        const eventNodes = szvTdNode.querySelectorAll('ТрудоваяДеятельность Мероприятие');
        const eventTypeMap = { 1: 'ПРИЕМ', 2: 'ПЕРЕВОД', 5: 'УВОЛЬНЕНИЕ' };

        eventNodes.forEach((eventNode) => {
            const baseNode = eventNode.querySelector('Основание');
            data.events.push({
                uuid: this.getText(eventNode, 'UUID'),
                date: this.getText(eventNode, 'Дата'),
                type:
                    eventTypeMap[this.getText(eventNode, 'Вид')] ||
                    `Вид ${this.getText(eventNode, 'Вид')}`,
                position: this.getText(eventNode, 'Должность'),
                isPartTime: this.getText(eventNode, 'ЯвляетсяСовместителем') === '1',
                department: this.getText(eventNode, 'СтруктурноеПодразделение'),
                okzCode: this.getText(eventNode, 'КодВФпоОКЗ'),
                baseDocument: baseNode
                    ? {
                          name: this.getText(baseNode, 'Наименование'),
                          date: this.getText(baseNode, 'Дата'),
                          number: this.getText(baseNode, 'Номер'),
                      }
                    : null,
            });
        });

        // Руководитель
        const managerNode = szvTdNode.querySelector('Руководитель');
        if (managerNode) {
            const fioNode = managerNode.querySelector('ФИО');
            data.manager = {
                fio: fioNode
                    ? {
                          lastName: this._getTextNs(fioNode, 'Фамилия', nsUt2),
                          firstName: this._getTextNs(fioNode, 'Имя', nsUt2),
                          middleName: this._getTextNs(fioNode, 'Отчество', nsUt2),
                      }
                    : {},
                position: this._getTextNs(managerNode, 'Должность', nsUt2),
            };
        }

        // Сертификат из подписи
        const certNode = xmlDoc.getElementsByTagNameNS(nsDsig, 'X509Certificate')[0];
        if (certNode) {
            const base64Cert = certNode.textContent.trim();
            const parsed = await window.electronAPI.parseCertificate(base64Cert);
            if (!parsed.error) {
                const certData = {
                    thumbprint: parsed.thumbprint,
                    base64: base64Cert,
                    source: 'СЗВ-ТД (подпись)',
                    ...parsed,
                };
                this.addOrUpdateCertificate(certData);
                data.signatureCert = certData;
            } else {
                data.signatureCert = { error: parsed.error };
            }
        }

        return data;
    }

    _renderSzvTdReport(data) {
        const wrapper = document.createElement('div');
        wrapper.className = 'analysis-container space-y-4';
        wrapper.id = 'szv-td-report';

        const titleElement = document.createElement('h2');
        titleElement.className = 'text-2xl font-bold text-slate-900 dark:text-white';
        titleElement.textContent = `Анализ отчета СЗВ-ТД${data.fillDate ? ' от ' + this._fmtDateOnly(data.fillDate) : ''}`;
        wrapper.appendChild(titleElement);

        // --- РАБОТОДАТЕЛЬ ---
        const employerContent = document.createDocumentFragment();
        employerContent.appendChild(this.createField('Наименование: ', data.employer.name));
        employerContent.appendChild(
            this.createField('ИНН / КПП: ', `${data.employer.inn} / ${data.employer.kpp}`),
        );
        employerContent.appendChild(
            this.createField('Рег. номер в ПФР/СФР: ', data.employer.regNum),
        );
        wrapper.appendChild(this._createAccordion('Работодатель: ', employerContent, true));

        // --- СОТРУДНИК ---
        const employeeContent = document.createDocumentFragment();
        const employeeFio =
            `${data.employee.fio.lastName || ''} ${data.employee.fio.firstName || ''} ${data.employee.fio.middleName || ''}`.trim();
        employeeContent.appendChild(this.createField('ФИО: ', employeeFio));
        employeeContent.appendChild(
            this.createField(
                'Дата рождения: ',
                data.employee.birthDate
                    ? new Date(data.employee.birthDate).toLocaleDateString('ru-RU')
                    : '',
            ),
        );
        employeeContent.appendChild(this.createField('СНИЛС: ', data.employee.snils));
        wrapper.appendChild(this._createAccordion('Сотрудник: ', employeeContent, false));

        // --- ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ ---
        if (data.events.length > 0) {
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'overflow-x-auto';

            const table = document.createElement('table');
            table.className = 'w-full text-sm border-collapse';
            table.innerHTML = `
                <thead class="text-left">
                    <tr class="border-b-2 border-slate-300 dark:border-slate-600">
                        <th class="p-2">Дата: </th>
                        <th class="p-2">Мероприятие: </th>
                        <th class="p-2">Должность / Подразделение: </th>
                        <th class="p-2">Основание: </th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = table.querySelector('tbody');

            data.events.forEach((event) => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-200 dark:border-slate-700';

                const baseDoc = event.baseDocument;
                const baseText = baseDoc
                    ? `${baseDoc.name} №${baseDoc.number} от ${this._fmtDateOnly(baseDoc.date)}`
                    : '—';

                tr.innerHTML = `
                    <td class="p-2 align-top">${this.sanitizeText(this._fmtDateOnly(event.date))}</td>
                    <td class="p-2 align-top"><span class="font-semibold">${this.sanitizeText(event.type)}</span></td>
                    <td class="p-2 align-top">
                        <p>${this.sanitizeText(event.position)}</p>
                        <p class="text-xs text-slate-500">${this.sanitizeText(event.department)}</p>
                    </td>
                    <td class="p-2 align-top text-xs">${this.sanitizeText(baseText)}</td>
                `;
                tbody.appendChild(tr);
            });

            eventsContainer.appendChild(table);
            wrapper.appendChild(
                this._createAccordion(
                    `Трудовая деятельность (${data.events.length} мероприятий)`,
                    eventsContainer,
                    false,
                ),
            );
        }

        // --- ПОДПИСАНТ ---
        const managerContent = document.createDocumentFragment();
        const managerFio =
            `${data.manager.fio.lastName || ''} ${data.manager.fio.firstName || ''} ${data.manager.fio.middleName || ''}`.trim();
        managerContent.appendChild(this.createField('ФИО: ', managerFio));
        managerContent.appendChild(this.createField('Должность: ', data.manager.position));

        if (data.signatureCert) {
            if (data.signatureCert.error) {
                managerContent.appendChild(
                    this.createField('Ошибка сертификата', data.signatureCert.error, 'error'),
                );
            } else {
                managerContent.appendChild(this._createCertificateStatusField(data.signatureCert));

                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'text-left mt-2';
                buttonContainer.appendChild(
                    this._createDownloadButtonForThumbprint(
                        data.signatureCert.thumbprint,
                        'Скачать сертификат подписи',
                    ),
                );
                managerContent.appendChild(buttonContainer);
            }
        } else {
            managerContent.appendChild(
                this.createField('Сертификат подписи', 'Не найден в XML-подписи', 'warning'),
            );
        }
        wrapper.appendChild(this._createAccordion('Подписант отчета', managerContent, true));

        return wrapper;
    }

    _renderDiagnosticReport(data, _systemInfo) {
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-4';

        const mainTitle = document.createElement('h2');
        mainTitle.className = 'text-2xl font-bold mb-4 text-slate-900 dark:text-white';
        mainTitle.textContent = 'Диагностический отчет 1С';
        wrapper.appendChild(mainTitle);

        // --- Общая информация об отчете ---
        const metaContent = document.createDocumentFragment();
        metaContent.appendChild(this.createField('Источник:', data.meta.programVersion));
        metaContent.appendChild(
            this.createField('Дата отчета:', this._fmtDateTime(data.meta.dateTime)),
        );
        metaContent.appendChild(this.createField('Версия формата:', data.meta.formatVersion));
        wrapper.appendChild(this._createAccordion('Общая информация', metaContent, true));

        // --- Абонент ---
        const subscriberContent = document.createDocumentFragment();
        subscriberContent.appendChild(this.createField('Название:', data.subscriber.name));
        subscriberContent.appendChild(
            this.createField('ИНН/КПП:', `${data.subscriber.inn}/${data.subscriber.kpp}`),
        );
        if (data.subscriber.account.licenseType) {
            subscriberContent.appendChild(
                this.createField(
                    'Лицензия:',
                    data.subscriber.account.licenseType,
                    data.subscriber.account.licenseType === 'Тестовая' ? 'warning' : 'default',
                ),
            );
            subscriberContent.appendChild(
                this.createField(
                    'Срок действия:',
                    `${this._fmtDateOnly(data.subscriber.account.licenseStart)} — ${this._fmtDateOnly(data.subscriber.account.licenseEnd)}`,
                ),
            );
            subscriberContent.appendChild(
                this.createField('Криптопровайдер:', data.subscriber.account.cryptoProvider),
            );
        }
        wrapper.appendChild(this._createAccordion('Абонент', subscriberContent, true));

        // --- Окружение 1С ---
        const envContent = document.createDocumentFragment();
        const info = data.additionalInfo;

        const osVersion = info['Сервер.ВерсияОС'] || info['ВерсияОС'] || '—';
        const processor = info['Сервер.Процессор'] || info['Процессор'] || '—';
        let ram = info['Сервер.ОперативнаяПамять'] || info['ОперативнаяПамять'];
        ram = ram ? `${ram} МБ` : '—';

        envContent.appendChild(this.createField('Режим работы:', info['РежимИБ']));
        envContent.appendChild(this.createField('Тип клиента:', info['ТипКлиентскогоПодключения']));
        envContent.appendChild(this.createField('Версия платформы:', info['ВерсияПриложения']));
        envContent.appendChild(
            this.createField(
                'Версия конфигурации:',
                `${info['Метаданные.Синоним'] || 'N/A'} (${info['Метаданные.Версия'] || 'N/A'})`,
            ),
        );
        envContent.appendChild(this.createField('Версия ОС:', osVersion));
        envContent.appendChild(this.createField('Процессор:', processor));
        envContent.appendChild(this.createField('ОЗУ:', ram));
        envContent.appendChild(
            this.createField(
                'Внешний модуль:',
                info['ВнешнийМодульИспользуется'] === 'true'
                    ? `Да (версия: ${info['ВнешнийМодульВерсия'] || 'не указана'})`
                    : 'Нет',
            ),
        );
        wrapper.appendChild(this._createAccordion('Окружение 1С', envContent, true));

        const checksContent = document.createElement('div');
        checksContent.className = 'space-y-3';

        if (data.checks.account) {
            const { isActive, detailsMatch, powerOfAttorney } = data.checks.account;
            const accountCheckCard = document.createElement('div');
            accountCheckCard.className =
                'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-1';
            const h4 = document.createElement('h4');
            h4.className = 'font-semibold';
            h4.textContent = 'Учетная запись';
            accountCheckCard.appendChild(h4);
            accountCheckCard.appendChild(
                this.createField(
                    'Активна',
                    isActive ? 'Да' : 'Нет',
                    isActive ? 'success' : 'error',
                ),
            );
            accountCheckCard.appendChild(
                this.createField(
                    'Сведения совпадают',
                    detailsMatch ? 'Да' : 'Нет',
                    detailsMatch ? 'success' : 'error',
                ),
            );
            if (powerOfAttorney) {
                const poaState =
                    powerOfAttorney.state === '2'
                        ? 'error'
                        : powerOfAttorney.state === '1'
                          ? 'warning'
                          : 'default';
                accountCheckCard.appendChild(
                    this.createField(
                        'Доверенность',
                        `${powerOfAttorney.description} (${powerOfAttorney.errors[0]?.description || 'OK'})`,
                        poaState,
                    ),
                );
            }
            checksContent.appendChild(accountCheckCard);
        }
        if (data.checks.resources.length > 0) {
            const resourcesCard = document.createElement('div');
            resourcesCard.className =
                'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-1 mt-2';
            const h4 = document.createElement('h4');
            h4.className = 'font-semibold';
            h4.textContent = 'Доступность ресурсов';
            resourcesCard.appendChild(h4);
            data.checks.resources.forEach((res) => {
                resourcesCard.appendChild(
                    this.createField(
                        res.host,
                        res.isAvailable ? 'Доступен' : 'Недоступен',
                        res.isAvailable ? 'success' : 'error',
                    ),
                );
            });
            checksContent.appendChild(resourcesCard);
        }
        if (data.checks.certificates.length > 0) {
            const certsCard = document.createElement('div');
            certsCard.className =
                'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2 mt-2';
            const h4 = document.createElement('h4');
            h4.className = 'font-semibold';
            h4.textContent = 'Сертификаты';
            certsCard.appendChild(h4);

            data.checks.certificates.forEach((cert) => {
                const validUntil = new Date(cert.validUntil);
                const hasDate = !Number.isNaN(validUntil.getTime());
                const isExpired = hasDate && validUntil < new Date();
                let status = hasDate
                    ? `Годен до: ${validUntil.toLocaleDateString('ru-RU')}`
                    : 'Срок действия не указан';
                if (isExpired) status += ' (ИСТЁК)';

                const certItem = document.createElement('div');
                certItem.className = 'p-2 rounded-md bg-slate-100 dark:bg-slate-800';
                certItem.appendChild(this.createField('Субъект', cert.subjectName));
                certItem.appendChild(
                    this.createField('Отпечаток', cert.thumbprint, 'default', { mono: true }),
                );
                certItem.appendChild(
                    this.createField('Статус', status, isExpired ? 'error' : 'success'),
                );
                certsCard.appendChild(certItem);
            });
            checksContent.appendChild(certsCard);
        }
        if (data.checks.cryptoOps.length > 0) {
            const opsCard = document.createElement('div');
            opsCard.className =
                'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-1 mt-2';
            const h4 = document.createElement('h4');
            h4.className = 'font-semibold';
            h4.textContent = 'Криптооперации';
            opsCard.appendChild(h4);
            data.checks.cryptoOps.forEach((op) => {
                opsCard.appendChild(
                    this.createField(
                        op.description,
                        op.isSuccess ? 'Успешно' : 'Ошибка',
                        op.isSuccess ? 'success' : 'error',
                    ),
                );
            });
            checksContent.appendChild(opsCard);
        }

        wrapper.appendChild(
            this._createAccordion('Результаты автоматических проверок', checksContent, true),
        );

        const additionalContent = document.createDocumentFragment();
        const renderedKeys = new Set([
            'Сервер.ВерсияОС',
            'ВерсияОС',
            'Сервер.Процессор',
            'Процессор',
            'Сервер.ОперативнаяПамять',
            'ОперативнаяПамять',
            'РежимИБ',
            'ТипКлиентскогоПодключения',
            'ВерсияПриложения',
            'Метаданные.Синоним',
            'Метаданные.Версия',
            'ВнешнийМодульИспользуется',
            'ВнешнийМодульВерсия',
        ]);

        for (const [key, value] of Object.entries(data.additionalInfo)) {
            if (renderedKeys.has(key)) continue;

            const title = this.additionalInfoKeyMap[key] || key;

            if (
                value === null ||
                value === undefined ||
                (typeof value === 'string' && value.trim() === '')
            )
                continue;

            if (Array.isArray(value) && value.length > 0) {
                let subAccordionContent;
                switch (key) {
                    case 'ЖурналРегистрации':
                        subAccordionContent = this._renderLogEntries(value);
                        break;
                    case 'ПодключенныеНаправления':
                        const directionsEl = document.createElement('div');
                        directionsEl.innerHTML = this._renderDirections(value);
                        subAccordionContent = directionsEl;
                        break;
                    case 'Нерасшифрованные':
                        const undecryptedEl = document.createElement('div');
                        undecryptedEl.innerHTML = this._renderUndecrypted(value);
                        subAccordionContent = undecryptedEl;
                        break;
                    default:
                        continue;
                }
                if (
                    subAccordionContent &&
                    (subAccordionContent.hasChildNodes() || subAccordionContent.innerHTML)
                ) {
                    additionalContent.appendChild(
                        this._createAccordion(title, subAccordionContent, false),
                    );
                }
            } else if (!Array.isArray(value)) {
                additionalContent.appendChild(this.createField(title, value));
            }
        }

        if (additionalContent.hasChildNodes()) {
            wrapper.appendChild(this._createAccordion('Прочие сведения', additionalContent, false));
        }

        return wrapper;
    }

    renderSedoLog(data) {
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-4';

        if (!data || !Array.isArray(data.messages)) {
            const errorCard = document.createElement('div');
            errorCard.className = 'content-card';
            errorCard.innerHTML = `<h2 class="text-xl font-bold mb-2">Лог СЭДО</h2><p class="text-red-600 dark:text-red-400">Неверный формат или отсутствие массива 'messages' в JSON-логе.</p>`;
            wrapper.appendChild(errorCard);
            return wrapper;
        }

        const formatDate = (dateString) => {
            if (!dateString) return '—';
            const date = new Date(dateString);
            if (Number.isNaN(date.getTime())) return String(dateString);
            return date.toLocaleString('ru-RU', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        };

        // --- Карточка 1: Общая информация ---
        const messages = data.messages.filter((m) => m && typeof m === 'object');
        const infoGrid = document.createElement('div');
        infoGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm';
        infoGrid.appendChild(this.createField('ID документооборота', data.id));
        infoGrid.appendChild(this.createField('GUID', data.guid));
        infoGrid.appendChild(this.createField('UID', data.uid));
        infoGrid.appendChild(this.createField('Тип', data.type));
        infoGrid.appendChild(this.createField('Рег. номер страхователя', data.insurant?.regnum));
        infoGrid.appendChild(this.createField('Дата создания', formatDate(data.date)));
        infoGrid.appendChild(this.createField('Дата получения', formatDate(data.received_at)));
        infoGrid.appendChild(this.createField('Дата обработки', formatDate(data.processed_at)));
        infoGrid.appendChild(this.createField('Дата доставки', formatDate(data.delivered_at)));

        wrapper.appendChild(
            this._createAccordion('Общая информация о документообороте', infoGrid, true),
        );

        // --- Карточка 2: Сообщения документооборота ---
        const messagesCardContent = document.createElement('div');
        messagesCardContent.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse">
                    <thead>
                        <tr class="border-b-2 border-slate-400 dark:border-slate-600">
                            <th class="text-left p-2">Тип</th>
                            <th class="text-left p-2">Отправитель</th>
                            <th class="text-left p-2">Содержание</th>
                            <th class="text-left p-2">Временные метки (Создано / Доставлено)</th>
                        </tr>
                    </thead>
                    <tbody id="sedo-table-body"></tbody>
                </table>
            </div>
            <div id="sedo-raw-json-viewer" class="mt-4 hidden">
                <h3 class="text-lg font-semibold mb-2">Полные данные сообщения:</h3>
                <pre class="w-full p-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs overflow-auto max-h-96"></pre>
            </div>`;

        const tableBody = messagesCardContent.querySelector('#sedo-table-body');
        const rowTemplate = this.getEl('sedo-row-template');

        if (tableBody && rowTemplate) {
            const ts = (m) => {
                const t = new Date(m.date).getTime();
                return Number.isNaN(t) ? 0 : t;
            };
            const MAX_ROWS = 500;
            const sortedMessages = [...messages].sort((a, b) => ts(a) - ts(b));
            sortedMessages.slice(0, MAX_ROWS).forEach((msg) => {
                const clone = rowTemplate.content.cloneNode(true);
                const row = clone.querySelector('.sedo-message-row');

                row.dataset.rawJson = JSON.stringify(msg, null, 2);

                const senderEl = clone.querySelector('.sedo-sender');
                senderEl.textContent = this._raw(msg.sender_id || '—');
                if (msg.sender_id === 'Фонд')
                    senderEl.classList.add('text-blue-600', 'dark:text-blue-400');
                else if (msg.sender_id === 'Страхователь')
                    senderEl.classList.add('text-green-600', 'dark:text-green-400');
                else senderEl.classList.add('text-purple-600', 'dark:text-purple-400');

                const statusEl = clone.querySelector('.sedo-status');
                if (msg.status) {
                    statusEl.textContent = this._raw(msg.status);
                    if (String(msg.status).toLowerCase().includes('ошибк')) {
                        statusEl.classList.add('text-red-600', 'dark:text-red-400');
                    } else {
                        statusEl.classList.add('text-slate-500', 'dark:text-slate-400');
                    }
                }

                clone.querySelector('.sedo-type').textContent = this._raw(msg.type || '—');
                clone.querySelector('.sedo-title').textContent = this._raw(
                    msg.title || 'Без заголовка',
                );
                clone.querySelector('.sedo-date').textContent = formatDate(msg.date);
                clone.querySelector('.sedo-delivered-at').textContent = formatDate(
                    msg.delivered_at,
                );

                tableBody.appendChild(clone);
            });
        }

        wrapper.appendChild(
            this._createAccordion(
                `Сообщения документооборота (${messages.length} шт.${messages.length > 500 ? ', показаны первые 500' : ''})`,
                messagesCardContent,
                true,
            ),
        );

        return wrapper;
    }

    renderCertificateManager() {
        if (
            !this.certManagerWrapper ||
            !this.certSearchInput ||
            !this.certList ||
            !this.certListPlaceholder
        ) {
            console.warn(
                'Один или несколько элементов менеджера сертификатов не найдены в DOM. Функциональность будет ограничена.',
            );
            return;
        }

        const hasCerts = this.certificates.size > 0;
        const hasCertsWithBase64 = Array.from(this.certificates.values()).some((c) => !!c.base64);

        if (this.exportZipBtn) {
            this.exportZipBtn.disabled = !hasCertsWithBase64;
        }

        if (!hasCerts) return;

        const searchTerm = this.certSearchInput.value.toLowerCase().trim();

        const filteredCerts = Array.from(this.certificates.values()).filter((cert) => {
            if (!searchTerm) return true;
            return [
                cert.thumbprint,
                cert.orgName,
                cert.inn,
                cert.ownerFio,
                cert.recipientType,
            ].some((field) => field && field.toLowerCase().includes(searchTerm));
        });

        this.certList.innerHTML = '';

        if (filteredCerts.length === 0) {
            this.certListPlaceholder.style.display = 'block';
            this.certListPlaceholder.textContent = searchTerm
                ? 'Сертификаты, соответствующие поиску, не найдены.'
                : 'Сертификаты не найдены.';
            return;
        }

        this.certListPlaceholder.style.display = 'none';

        const template = this.getEl('cert-list-item-template');
        if (!template) {
            console.error('Критическая ошибка: шаблон #cert-list-item-template не найден!');
            return;
        }

        const fragment = document.createDocumentFragment();

        filteredCerts.forEach((cert) => {
            const clone = template.content.cloneNode(true);
            const item = clone.querySelector('.cert-list-item');

            item.dataset.thumbprint = this._raw(cert.thumbprint);

            const orgEl = clone.querySelector('.cert-org');
            const orgText = cert.recipientType
                ? `${cert.orgName} [${cert.recipientType}]`
                : cert.orgName || 'Организация не указана';
            orgEl.textContent = this._raw(orgText);
            orgEl.title = orgEl.textContent;
            orgEl.classList.add('font-semibold', 'truncate');

            const fioEl = clone.querySelector('.cert-fio');
            fioEl.textContent = this._raw(cert.ownerFio || 'ФИО не указано');
            fioEl.title = fioEl.textContent;
            fioEl.classList.add('text-sm', 'text-slate-500', 'dark:text-slate-400', 'truncate');

            const thumbprintEl = clone.querySelector('.cert-thumbprint');
            thumbprintEl.textContent = this._raw(cert.thumbprint);
            thumbprintEl.title = `Отпечаток: ${thumbprintEl.textContent}`;
            thumbprintEl.classList.add(
                'text-xs',
                'font-mono',
                'text-slate-400',
                'dark:text-slate-500',
                'truncate',
            );

            const buttonContainer = clone.querySelector('.download-button-container');
            const downloadButton = this._createDownloadButtonForThumbprint(
                cert.thumbprint,
                'Скачать',
            );
            buttonContainer.appendChild(downloadButton);

            fragment.appendChild(clone);
        });

        this.certList.appendChild(fragment);
    }

    _parseDiagnosticReportData(xmlDoc) {
        const data = {
            meta: {},
            subscriber: { account: {} },
            checks: {
                account: null,
                resources: [],
                crypto: null,
                certificates: [],
                cryptoOps: [],
            },
            additionalInfo: {},
        };

        const root = xmlDoc.documentElement;

        // --- Метаданные ---
        data.meta = {
            programVersion:
                root.getAttribute('d1p1:ВерсияПрограммы') || root.getAttribute('ВерсияПрограммы'),
            dateTime: root.getAttribute('d1p1:ДатаВремя') || root.getAttribute('ДатаВремя'),
            formatVersion:
                root.getAttribute('d1p1:ВерсияФормата') || root.getAttribute('ВерсияФормата'),
        };

        // --- Абонент ---
        const abonent = root.querySelector('Абонент');
        if (abonent) {
            const acc = abonent.querySelector('УчетнаяЗапись');
            data.subscriber = {
                name: this.getText(abonent, 'НазваниеАбонента'),
                inn: this.getText(abonent, 'ИНН'),
                kpp: this.getText(abonent, 'КПП'),
                pfrRegNum: this.getText(abonent, 'РегНомерПФР'),
                fssRegNum: this.getText(abonent, 'РегНомерФСС'),
                account: acc
                    ? {
                          id: this.getText(acc, 'ИдентификаторАбонента'),
                          licenseType: this.getText(acc, 'ТипЛицензии'),
                          licenseStart: this.getText(acc, 'НачалоДействияЛицензии'),
                          licenseEnd: this.getText(acc, 'ОкончаниеДействияЛицензии'),
                          cloudKey: this.getText(acc, 'ЭПВоблаке') === 'true',
                          keyStorageModel: this.getText(acc, 'МодельХраненияЗакрытогоКлюча'),
                          cryptoProvider: this.getText(acc, 'Криптопровайдер'),
                      }
                    : {},
            };
        }

        // --- Проверки ---
        const checks = root.querySelector('Проверки');
        if (checks) {
            const accCheck = checks.querySelector('ПроверкаУчетнойЗаписи');
            if (accCheck) {
                const pda = accCheck.querySelector('ИнформацияДоверенности Доверенность');
                data.checks.account = {
                    isActive: this.getText(accCheck, 'Активна') === 'true',
                    validityDays: this.getText(accCheck, 'СрокГодности'),
                    detailsMatch:
                        this.getText(accCheck.querySelector('СведенияСовпадают'), 'Состояние') ===
                        'true',
                    isRepresentativeCert:
                        this.getText(accCheck, 'СертификатВыданНаПредставителя') === 'true',
                    powerOfAttorney: pda
                        ? {
                              kpp: this.getText(pda, 'КПП'),
                              ifnsCode: this.getText(pda, 'КодОрганаИФНС'),
                              description: this.getText(pda, 'ОписаниеКратко'),
                              state: this.getText(pda, 'Состояние'),
                              errors: Array.from(pda.querySelectorAll('Ошибки Ошибка')).map(
                                  (e) => ({
                                      code: this.getText(e, 'Код'),
                                      description: this.getText(e, 'Описание'),
                                  }),
                              ),
                          }
                        : null,
                };
            }
            data.checks.resources = Array.from(
                checks.querySelectorAll('ПроверкаДоступностиРесурсов Ресурс'),
            ).map((r) => ({
                host: this.getText(r, 'Хост'),
                port: this.getText(r, 'Порт'),
                isAvailable: this.getText(r, 'Доступен') === 'true',
            }));
            const cryptoCheck = checks.querySelector('ПроверкаКриптографии');
            if (cryptoCheck) {
                data.checks.crypto = {
                    cryptoComponent: this.getText(
                        cryptoCheck.querySelector('КомпонентКриптографии'),
                        'Состояние',
                    ),
                    compatibleCSP: this.getText(
                        cryptoCheck.querySelector('СовместимыйCSP'),
                        'Состояние',
                    ),
                    fileExtension: this.getText(
                        cryptoCheck.querySelector('РасширениеРаботыСФайлами'),
                        'Состояние',
                    ),
                };
            }
            data.checks.certificates = Array.from(
                checks.querySelectorAll('ПроверкаСертификатов Сертификат'),
            ).map((c) => {
                const certData = {
                    thumbprint: this.getText(c, 'Отпечаток').toUpperCase(),
                    store: this.getText(c, 'Хранилище'),
                    subjectName: this.getText(c, 'НаименованиеПолучателя'),
                    issued: this.getText(c, 'Выдан'),
                    validUntil: this.getText(c, 'ГоденДо'),
                    isFound: this.getText(c, 'Найден') === 'true',
                };
                this.addOrUpdateCertificate({
                    ...certData,
                    orgName: certData.subjectName,
                    base64: null,
                });
                return certData;
            });
            data.checks.cryptoOps = Array.from(
                checks.querySelectorAll('ПроверкаКриптоопераций Криптооперация'),
            ).map((o) => ({
                code: this.getText(o, 'Код'),
                description: this.getText(o, 'Описание'),
                isSuccess: this.getText(o, 'Успешно') === 'true',
            }));
        }

        // --- Дополнительная информация ---
        const infoRoot = root.querySelector('ДополнительнаяИнформация');
        if (infoRoot) {
            infoRoot.querySelectorAll('Инфо').forEach((infoNode) => {
                const key = this.getText(infoNode, 'Вид');
                if (!key) return;

                const valueNode = infoNode.querySelector('Значение');
                const valuesNode = infoNode.querySelector('Значения');
                let value;

                if (valuesNode) {
                    if (key === 'ЖурналРегистрации') {
                        value = Array.from(valuesNode.querySelectorAll('ЗаписьЖурнала')).map(
                            (log) => ({
                                level: this.getText(log, 'Уровень'),
                                date: this.getText(log, 'Дата'),
                                event: this.getText(log, 'Событие'),
                                comment: this.getText(log, 'Комментарий'),
                            }),
                        );
                    } else if (key === 'Нерасшифрованные') {
                        value = Array.from(valuesNode.querySelectorAll('Сообщение')).map((msg) => ({
                            id: this.getText(msg, 'ИдентификаторСообщения'),
                            docflowId: this.getText(msg, 'ИдентификаторДокументооборота'),
                            transportDate: this.getText(msg, 'ДатаТранспорта'),
                            subject: this.getText(msg, 'Тема'),
                            from: this.getText(msg, 'Отправитель'),
                        }));
                    } else if (key === 'ПодключенныеНаправления') {
                        value = Array.from(valuesNode.querySelectorAll('Направление')).map(
                            (dir) => ({
                                recipientType: this.getText(dir, 'ТипПолучателя'),
                                recipientCode: this.getText(dir, 'КодПолучателя'),
                                kpp: this.getText(dir, 'КПП'),
                            }),
                        );
                    }
                } else if (valueNode) {
                    const rawValue = valueNode.textContent.trim();
                    try {
                        value = JSON.parse(rawValue);
                    } catch {
                        value = rawValue;
                    }
                }

                if (value !== undefined) {
                    data.additionalInfo[key] = value;
                }
            });
        }

        return data;
    }

    async _parseStatement(xmlDoc) {
        const root = xmlDoc.documentElement;

        const data = {
            general: {},
            programInfo: {},
            owner: {},
            recipients: [],
            legalAddress: {},
            actualAddress: {},
        };

        data.general = {
            formVersion: root.getAttribute('ВерсФорм'),
            dateTime: root.getAttribute('ДатаВремяФормирования'),
            programVersionString: root.getAttribute('ВерсПрог'),
            statementType: this.getText(root, 'ТипЗаявления'),
            multiUserMode: this.getText(root, 'ПоддерживаетсяМногопользовательскийРежим'),
            inn: this.getText(root, 'ИНН'),
            ogrn: this.getText(root, 'ОГРН'),
            orgName: this.getText(root, 'КраткоеНаименование'),
            isJuridical: this.getText(root, 'ПризнакЮридическогоЛица'),
            isSeparateDivision: this.getText(root, 'ПризнакОбособленногоПодразделения'),
            phone: this.getText(root, 'ТелефонОсновной'),
            email: this.getText(root, 'ЭлектроннаяПочта'),
        };

        data.programInfo = {
            name: this.getText(root, 'ИмяПрограммы'),
            version: this.getText(root, 'НомерВерсииПрограммы'),
            platform: this.getText(root, 'ВерсияПлатформы'),
        };

        data.legalAddress = this._parseAddress(root.querySelector('АдресЮридический'));
        data.actualAddress = this._parseAddress(root.querySelector('АдресФактический'));

        const ownerNode = root.querySelector('ВладельцыЭЦП ВладелецЭЦП');
        if (ownerNode) {
            const cp = ownerNode.querySelector('Криптопровайдер');
            data.owner = {
                cryptoProviderName: cp ? this.getText(cp, 'ИмяКриптопровайдера') : 'Н/Д',
                cryptoProviderType: cp ? this.getText(cp, 'ТипКриптопровайдера') : 'Н/Д',
                wantsSmsNotify: this.getText(ownerNode, 'ПолучатьСМСУведомления'),
                email: this.getText(ownerNode, 'ЭлектроннаяПочта'),
                mobilePhone: this.getText(ownerNode, 'ТелефонМобильный'),
            };
        }

        root.querySelectorAll('Получатели Получатель').forEach((recNode) => {
            data.recipients.push({
                type: this.getText(recNode, 'ТипПолучателя'),
                code: this.getText(recNode, 'КодПолучателя'),
            });
        });

        const base64Cert = this.getText(ownerNode, 'СертификатСУЦ');
        let cert = null;
        if (base64Cert) {
            const parsed = await window.electronAPI.parseCertificate(base64Cert);
            if (parsed.error) {
                cert = {
                    thumbprint: `unknown_${Date.now()}`,
                    base64: base64Cert,
                    source: 'Заявление (ошибка парсинга)',
                    parseError: parsed.error,
                    isParsed: false,
                };
            } else {
                cert = {
                    thumbprint: parsed.thumbprint,
                    base64: base64Cert,
                    certObject: parsed.certObject,
                    ownerFio: parsed.ownerFio,
                    orgName: parsed.orgName,
                    inn: parsed.subject?.INN || data.general.inn,
                    source: 'Заявление',
                    isParsed: parsed.isParsed,
                    validity: parsed.validity,
                    serialNumber: parsed.serialNumber,
                    subject: parsed.subject,
                    issuer: parsed.issuer,
                    extensions: parsed.extensions,
                    version: parsed.version,
                };
            }
            this.addOrUpdateCertificate(cert);
        }
        return { data, cert };
    }

    _renderLogEntries(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            const p = document.createElement('p');
            p.className = 'text-sm text-slate-500';
            p.textContent = 'Записи в журнале отсутствуют.';
            return p;
        }

        const container = document.createElement('div');
        container.className = 'log-entries-container space-y-3';

        const template = this.getEl('log-entry-template');
        if (!template) {
            console.error('Критическая ошибка: шаблон #log-entry-template не найден!');
            return container;
        }

        entries.forEach((log) => {
            const clone = template.content.cloneNode(true);

            clone.querySelector('.log-event').textContent = this._raw(log.event);
            clone.querySelector('.log-date').textContent = this._fmtDateTime(log.date) || '—';

            const levelEl = clone.querySelector('.log-level');
            levelEl.textContent = this._raw(log.level);
            if (log.level === 'Ошибка') levelEl.classList.add('text-red-500', 'font-bold');
            if (log.level === 'Предупреждение') levelEl.classList.add('text-amber-500');

            const commentWrapper = clone.querySelector('.log-comment-wrapper');
            if (log.comment.startsWith('{') && log.comment.endsWith('}')) {
                try {
                    const pre = document.createElement('pre');
                    pre.className =
                        'mt-1 p-2 bg-slate-100 dark:bg-slate-900 rounded-md text-xs whitespace-pre-wrap break-all';
                    pre.textContent = JSON.stringify(JSON.parse(log.comment), null, 2);
                    commentWrapper.appendChild(pre);
                } catch {
                    const p = document.createElement('p');
                    p.className = 'text-sm text-slate-600 dark:text-slate-400 mt-1';
                    p.textContent = this._raw(log.comment);
                    commentWrapper.appendChild(p);
                }
            } else {
                const p = document.createElement('p');
                p.className = 'text-sm text-slate-600 dark:text-slate-400 mt-1';
                p.textContent = this._raw(log.comment);
                commentWrapper.appendChild(p);
            }

            container.appendChild(clone);
        });

        return container;
    }

    _renderDirections(directions) {
        if (!Array.isArray(directions) || directions.length === 0) {
            return '<p class="text-sm text-slate-500">Подключенные направления отсутствуют.</p>';
        }
        const authorityMap = this.controllingAuthorityMap || {
            ФНС: 'Федеральная налоговая служба',
            СФР: 'Социальный фонд России',
        };
        return (
            `<ul class="list-disc list-inside space-y-1">` +
            directions
                .map(
                    (dir) =>
                        `<li><span class="font-semibold">${this.sanitizeText(authorityMap[dir.recipientType] || dir.recipientType)}</span> (Код: ${this.sanitizeText(dir.recipientCode)}, КПП: ${this.sanitizeText(dir.kpp)})</li>`,
                )
                .join('') +
            `</ul>`
        );
    }

    _renderUndecrypted(messages) {
        if (!Array.isArray(messages) || messages.length === 0) {
            return '<p class="text-sm text-slate-500">Нерасшифрованные сообщения отсутствуют.</p>';
        }
        return (
            `<div class="space-y-2">` +
            messages
                .map(
                    (msg) =>
                        `<div class="p-2 rounded-md border dark:border-slate-700">
            <p><strong>ID:</strong> <span class="font-mono text-xs">${this.sanitizeText(msg.id)}</span></p>
            <p><strong>От:</strong> ${this.sanitizeText(msg.from)}</p>
            <p><strong>Тема:</strong> ${this.sanitizeText(msg.subject)}</p>
            <p><strong>Дата:</strong> ${this.sanitizeText(this._fmtDateTime(msg.transportDate) || '—')}</p>
        </div>`,
                )
                .join('') +
            `</div>`
        );
    }

    _renderStatementReport(data, certData) {
        const wrapper = document.createElement('div');
        wrapper.className = 'analysis-container space-y-4';
        wrapper.id = 'statement-report';

        const titleElement = document.createElement('h2');
        titleElement.className = 'text-2xl font-bold text-slate-900 dark:text-white';
        titleElement.textContent = 'Анализ файла выгрузки заявления';
        wrapper.appendChild(titleElement);

        // --- ОБЩАЯ ИНФОРМАЦИЯ ---
        const generalContent = document.createDocumentFragment();
        const statementTypeMap = { 1: 'Первичное подключение', 2: 'Продление/изменение' };
        generalContent.appendChild(
            this.createField(
                'Тип заявления: ',
                statementTypeMap[data.general.statementType] ||
                    (data.general.statementType
                        ? `Неизвестный (${data.general.statementType})`
                        : 'Не указан'),
            ),
        );
        generalContent.appendChild(
            this.createField(
                'Дата формирования: ',
                this._fmtDateTime(data.general.dateTime),
            ),
        );
        generalContent.appendChild(this.createField('Версия формата: ', data.general.formVersion));
        wrapper.appendChild(
            this._createAccordion('Информация о заявлении: ', generalContent, true),
        );

        // --- ИНФОРМАЦИЯ ОБ ОРГАНИЗАЦИИ ---
        const orgContent = document.createDocumentFragment();
        orgContent.appendChild(this.createField('Наименование: ', data.general.orgName));
        orgContent.appendChild(this.createField('ИНН: ', data.general.inn));
        orgContent.appendChild(this.createField('ОГРН/ОГРНИП: ', data.general.ogrn));
        orgContent.appendChild(
            this.createField(
                'Тип: ',
                data.general.isJuridical === 'true'
                    ? 'Юридическое лицо'
                    : data.general.isJuridical === 'false'
                      ? 'Индивидуальный предприниматель'
                      : '',
            ),
        );
        orgContent.appendChild(this.createField('Телефон: ', data.general.phone));
        orgContent.appendChild(this.createField('Email организации: ', data.general.email));
        wrapper.appendChild(
            this._createAccordion('Информация об организации/ИП: ', orgContent, true),
        );

        // --- АДРЕСА ---
        const addressContent = document.createDocumentFragment();
        addressContent.appendChild(
            this.createField('Юридический адрес: ', data.legalAddress.formatted),
        );
        addressContent.appendChild(
            this.createField('Фактический адрес: ', data.actualAddress.formatted),
        );
        wrapper.appendChild(this._createAccordion('Адресная информация: ', addressContent));

        // --- ВЛАДЕЛЕЦ ЭЦП И СЕРТИФИКАТ ---
        const ownerContentContainer = document.createDocumentFragment();
        if (data.owner) {
            ownerContentContainer.appendChild(
                this.createField('Email для уведомлений: ', data.owner.email),
            );
            ownerContentContainer.appendChild(
                this.createField('Мобильный телефон: ', data.owner.mobilePhone),
            );
            ownerContentContainer.appendChild(
                this.createField(
                    'Получать СМС: ',
                    data.owner.wantsSmsNotify === 'true' ? 'Да' : 'Нет',
                ),
            );
            ownerContentContainer.appendChild(
                this.createField('Криптопровайдер: ', data.owner.cryptoProviderName),
            );
        }
        if (certData) {
            if (certData.parseError) {
                ownerContentContainer.appendChild(
                    this.createField('Статус сертификата: ', certData.parseError, 'error'),
                );
            } else {
                ownerContentContainer.appendChild(
                    this.createField('Владелец (из CN): ', certData.ownerFio),
                );

                ownerContentContainer.appendChild(this._createCertificateStatusField(certData));

                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'text-left mt-2';
                buttonContainer.appendChild(
                    this._createDownloadButtonForThumbprint(
                        certData.thumbprint,
                        'Скачать сертификат',
                    ),
                );
                ownerContentContainer.appendChild(buttonContainer);
            }
        } else {
            ownerContentContainer.appendChild(
                this.createField('Сертификат', 'Не найден в файле', 'error'),
            );
        }
        wrapper.appendChild(
            this._createAccordion('Владелец ЭЦП и сертификат', ownerContentContainer, true),
        );

        // --- ПОЛУЧАТЕЛИ ---
        if (data.recipients.length > 0) {
            const recipientsContainer = document.createDocumentFragment();
            const recipientsList = document.createElement('div');
            recipientsList.className = 'space-y-2';
            data.recipients.forEach((rec) => {
                const name =
                    this.controllingAuthorityMap[rec.type] || `Неизвестный орган (${rec.type})`;
                const code = rec.code ? ` (Код: ${rec.code})` : '';
                const p = document.createElement('p');
                p.textContent = `${name}${code}`;
                recipientsList.appendChild(p);
            });
            recipientsContainer.appendChild(recipientsList);
            wrapper.appendChild(
                this._createAccordion(
                    `Направления сдачи отчетности (${data.recipients.length})`,
                    recipientsContainer,
                ),
            );
        }

        // --- ИНФОРМАЦИЯ О ПРОГРАММЕ ---
        const programContent = document.createDocumentFragment();
        programContent.appendChild(
            this.createField('Источник: ', data.general.programVersionString),
        );
        programContent.appendChild(this.createField('Имя конфигурации: ', data.programInfo.name));
        programContent.appendChild(
            this.createField('Версия конфигурации: ', data.programInfo.version),
        );
        programContent.appendChild(
            this.createField('Версия платформы: ', data.programInfo.platform),
        );
        wrapper.appendChild(
            this._createAccordion('Информация о программе-отправителе: ', programContent),
        );

        return wrapper;
    }

    _renderRegistrationFileReport(data) {
        const wrapper = document.createElement('div');
        wrapper.id = 'registration-file-report';
        wrapper.className = 'analysis-container space-y-4';

        const titleElement = document.createElement('h2');
        titleElement.className = 'text-2xl font-bold text-slate-900 dark:text-white';
        titleElement.textContent = 'Анализ регистрационного файла';
        wrapper.appendChild(titleElement);

        // --- МЕТАДАННЫЕ ФАЙЛА ---
        const metaContent = document.createDocumentFragment();
        metaContent.appendChild(this.createField('Версия формата: ', data.meta.formatVersion));
        metaContent.appendChild(
            this.createField(
                'Дата формирования: ',
                this._fmtDateTime(data.meta.creationTimestamp),
            ),
        );
        metaContent.appendChild(this.createField('Версия программы: ', data.meta.programVersion));
        wrapper.appendChild(this._createAccordion('Метаданные файла', metaContent, false));

        // --- ИНФОРМАЦИЯ ОБ ОРГАНИЗАЦИИ ---
        const generalContent = document.createDocumentFragment();
        generalContent.appendChild(this.createField('Полное наименование: ', data.general.orgName));
        generalContent.appendChild(
            this.createField('Краткое наименование: ', data.general.shortOrgName),
        );
        generalContent.appendChild(
            this.createField('ИНН / КПП: ', `${data.general.inn} / ${data.general.kpp}`),
        );
        generalContent.appendChild(this.createField('ОГРН', data.general.ogrn));
        generalContent.appendChild(this.createField('Email (внутренний): ', data.general.email));
        generalContent.appendChild(
            this.createField('Email (публичный): ', data.general.publicEmail),
        );
        generalContent.appendChild(this.createField('Основной телефон: ', data.general.phoneMain));
        generalContent.appendChild(this.createField('Доп. телефон: ', data.general.phoneExtra));
        generalContent.appendChild(
            this.createField('Мобильный телефон: ', data.general.phoneMobile),
        );
        generalContent.appendChild(
            this.createField('Рег. номер ПФР/СФР: ', data.general.pfrRegNum),
        );
        generalContent.appendChild(this.createField('Рег. номер ФСС: ', data.general.fssRegNum));
        wrapper.appendChild(
            this._createAccordion('Информация об организации', generalContent, true),
        );

        // --- ЛИЦЕНЗИЯ ---
        if (data.license && data.license.name) {
            const licenseContent = document.createDocumentFragment();
            licenseContent.appendChild(this.createField('Наименование: ', data.license.name));
            licenseContent.appendChild(
                this.createField('Признак ИТС: ', data.license.its === 'true' ? 'Да' : 'Нет'),
            );
            licenseContent.appendChild(
                this.createField(
                    'Дата начала: ',
                    new Date(data.license.startDate).toLocaleDateString('ru-RU'),
                ),
            );
            licenseContent.appendChild(
                this.createField(
                    'Дата окончания: ',
                    new Date(data.license.endDate).toLocaleDateString('ru-RU'),
                ),
            );
            licenseContent.appendChild(
                this.createField(
                    'Дата блокировки: ',
                    new Date(data.license.blockDate).toLocaleDateString('ru-RU'),
                ),
            );
            wrapper.appendChild(this._createAccordion('Лицензия', licenseContent, false));
        }

        // --- ВЛАДЕЛЬЦЫ ЭЦП ---
        if (data.owners.length > 0) {
            const ownersContainer = document.createDocumentFragment();
            const ownersList = document.createElement('div');
            ownersList.className = 'space-y-3';
            data.owners.forEach((owner) => {
                const ownerCard = document.createElement('div');
                ownerCard.className =
                    'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 bg-slate-50 dark:bg-slate-800/50 space-y-1';
                ownerCard.appendChild(this.createField('ФИО: ', owner.fio));
                ownerCard.appendChild(this.createField('Должность: ', owner.position));
                ownerCard.appendChild(this.createField('ИНН физ. лица: ', owner.inn));
                ownerCard.appendChild(this.createField('СНИЛС: ', owner.snils));
                ownerCard.appendChild(
                    this.createField('Криптопровайдер: ', owner.cryptoProvider.name),
                );

                const certData = this.certificates.get(owner.thumbprint?.toUpperCase());

                ownerCard.appendChild(
                    this._createCertificateStatusField(
                        certData || { thumbprint: owner.thumbprint },
                    ),
                );

                const downloadButtonContainer = document.createElement('div');
                downloadButtonContainer.className = 'text-left pt-2';
                downloadButtonContainer.appendChild(
                    this._createDownloadButtonForThumbprint(
                        owner.thumbprint,
                        'Скачать сертификат владельца',
                    ),
                );
                ownerCard.appendChild(downloadButtonContainer);

                ownersList.appendChild(ownerCard);
            });
            ownersContainer.appendChild(ownersList);
            wrapper.appendChild(
                this._createAccordion(
                    `Владельцы ЭЦП (${data.owners.length} шт.)`,
                    ownersContainer,
                    true,
                ),
            );
        }

        // --- ПОДКЛЮЧЕНИЯ К КОНТРОЛИРУЮЩИМ ОРГАНАМ ---
        if (data.recipients.length > 0) {
            const recipientsContainer = document.createDocumentFragment();
            const recipientsList = document.createElement('div');
            recipientsList.className = 'space-y-3';
            data.recipients.forEach((rec) => {
                const recipientCard = document.createElement('div');
                recipientCard.className =
                    'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 bg-slate-50 dark:bg-slate-800/50';

                const title = document.createElement('p');
                title.className = 'font-semibold text-slate-800 dark:text-slate-200';
                title.textContent = this._raw(
                    this.controllingAuthorityMap[rec.type] ||
                        rec.name ||
                        `Неизвестный орган: ${rec.type}`,
                );
                recipientCard.appendChild(title);

                if (rec.code) {
                    const code = document.createElement('p');
                    code.className = 'text-sm text-slate-600 dark:text-slate-400';
                    code.textContent = `Код органа: ${this._raw(rec.code)}`;
                    recipientCard.appendChild(code);
                }

                if (rec.name) {
                    const nameEl = document.createElement('p');
                    nameEl.className = 'text-sm text-slate-600 dark:text-slate-400';
                    nameEl.textContent = `Наименование: ${this._raw(rec.name)}`;
                    recipientCard.appendChild(nameEl);
                }

                if (rec.kppList.length > 0) {
                    const kppEl = document.createElement('p');
                    kppEl.className = 'text-sm text-slate-600 dark:text-slate-400';
                    kppEl.textContent = `Перечень КПП: ${this._raw(rec.kppList.join(', '))}`;
                    recipientCard.appendChild(kppEl);
                }

                if (rec.thumbprints && rec.thumbprints.length > 0) {
                    const thumbprintsTitle = document.createElement('p');
                    thumbprintsTitle.className =
                        'text-sm font-semibold mt-2 text-slate-700 dark:text-slate-300';
                    thumbprintsTitle.textContent = 'Сертификаты шифрования органа:';
                    recipientCard.appendChild(thumbprintsTitle);

                    const thumbprintsList = document.createElement('div');
                    thumbprintsList.className = 'space-y-1 pl-';
                    rec.thumbprints.forEach((thumbprint) => {
                        const thumbprintItem = document.createElement('div');
                        thumbprintItem.className = 'flex items-center justify-between gap-2';

                        const thumbprintText = document.createElement('a');
                        thumbprintText.href = '#';
                        thumbprintText.className = 'font-mono text-xs hover:underline';
                        thumbprintText.textContent = thumbprint;
                        thumbprintText.onclick = (e) => {
                            e.preventDefault();
                            this.showCertificateDetails(thumbprint);
                        };
                        thumbprintItem.appendChild(thumbprintText);

                        thumbprintItem.appendChild(
                            this._createDownloadButtonForThumbprint(thumbprint, 'Скачать'),
                        );
                        thumbprintsList.appendChild(thumbprintItem);
                    });
                    recipientCard.appendChild(thumbprintsList);
                }
                recipientsList.appendChild(recipientCard);
            });
            recipientsContainer.appendChild(recipientsList);
            wrapper.appendChild(
                this._createAccordion(
                    `Подключения к КО (${data.recipients.length} шт.)`,
                    recipientsContainer,
                    false,
                ),
            );
        }

        // --- НАСТРОЙКИ СЕРВЕРОВ ---
        const serversContent = document.createDocumentFragment();
        const serversList = document.createElement('div');
        serversList.className = 'space-y-3';

        // POP3
        if (data.servers.pop3.address) {
            const pop3Card = document.createElement('div');
            pop3Card.className =
                'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50';
            pop3Card.appendChild(
                this.createField(
                    'Сервер входящей почты (POP3)',
                    `${data.servers.pop3.address}:${data.servers.pop3.port}`,
                ),
            );
            pop3Card.appendChild(
                this.createField(
                    'Требуется авторизация',
                    data.servers.pop3.auth === 'true' ? 'Да' : 'Нет',
                ),
            );
            serversList.appendChild(pop3Card);
        }

        // SMTP
        if (data.servers.smtp.address) {
            const smtpCard = document.createElement('div');
            smtpCard.className =
                'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50';
            smtpCard.appendChild(
                this.createField(
                    'Сервер исходящей почты (SMTP)',
                    `${data.servers.smtp.address}:${data.servers.smtp.port}`,
                ),
            );
            smtpCard.appendChild(
                this.createField(
                    'Требуется авторизация',
                    data.servers.smtp.auth === 'true' ? 'Да' : 'Нет',
                ),
            );
            serversList.appendChild(smtpCard);
        }

        // EDO
        if (data.servers.edo.name) {
            const edoCard = document.createElement('div');
            edoCard.className =
                'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-1';
            edoCard.appendChild(this.createField('Сервер ЭДО', data.servers.edo.name));
            edoCard.appendChild(
                this.createField('Отпечаток серт. ЭДО', data.servers.edo.thumbprint, 'default', {
                    mono: true,
                }),
            );

            if (data.servers.edo.emails) {
                edoCard.appendChild(this.createField('Email ФНС', data.servers.edo.emails.fns));
                edoCard.appendChild(this.createField('Email ПФР/СФР', data.servers.edo.emails.pfr));
                edoCard.appendChild(this.createField('Email ФСГС', data.servers.edo.emails.fgs));
            }
            serversList.appendChild(edoCard);
        }

        // Online Check
        if (data.servers.onlineCheck.name) {
            const onlineCard = document.createElement('div');
            onlineCard.className =
                'p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50';
            onlineCard.appendChild(
                this.createField('Сервер онлайн-проверки', data.servers.onlineCheck.name),
            );
            onlineCard.appendChild(
                this.createField('Отпечаток серт.', data.servers.onlineCheck.thumbprint, 'default', {
                    mono: true,
                }),
            );
            onlineCard.appendChild(
                this.createField('WSDL', data.servers.onlineCheck.resource?.definition, 'default', {
                    mono: true,
                }),
            );
            serversList.appendChild(onlineCard);
        }

        serversContent.appendChild(serversList);
        wrapper.appendChild(this._createAccordion('Настройки серверов', serversContent));

        // --- ПОДПИСЬ ---
        if (data.signature.thumbprint) {
            const signatureContent = document.createDocumentFragment();
            signatureContent.appendChild(
                this.createField(
                    'Отпечаток сертификата подписи',
                    data.signature.thumbprint,
                    'default',
                    { mono: true },
                ),
            );
            signatureContent.appendChild(
                this.createField(
                    'Значение подписи (Base64)',
                    data.signature.value.length > 100
                        ? `${data.signature.value.substring(0, 100)}…`
                        : data.signature.value,
                    'default',
                    { mono: true },
                ),
            );
            wrapper.appendChild(this._createAccordion('Подпись файла', signatureContent));
        }

        return wrapper;
    }

    _parseAddress(addressNode) {
        if (!addressNode) {
            return { raw: {}, formatted: 'Адрес не указан' };
        }

        const raw = {
            region: this.getText(addressNode, 'СубъектРФ'),
            city: this.getText(addressNode, 'Город'),
            street: this.getText(addressNode, 'Улица'),
            fiasId: this.getText(addressNode, 'ИдФиас'),
            additional: [],
        };

        const parts = [raw.region, raw.city, raw.street].filter(Boolean);

        addressNode.querySelectorAll('ДопАдрЭл').forEach((el) => {
            const type = el.getAttribute('ТипАдрЭл');
            const value = el.getAttribute('Значение');

            if (type && value) {
                raw.additional.push({ type, value });
                if (type === '10100000') {
                    parts.unshift(value);
                }
            } else {
                const numberNode = el.querySelector('Номер');
                if (numberNode) {
                    const numberType = numberNode.getAttribute('Тип');
                    const numberValue = numberNode.getAttribute('Значение');
                    if (numberType === '1010') {
                        parts.push(`д. ${numberValue}`);
                    } else {
                        parts.push(`тип ${numberType}, зн. ${numberValue}`);
                    }
                    raw.additional.push({ type: `Номер (${numberType})`, value: numberValue });
                }
            }
        });

        return {
            raw,
            formatted: parts.join(', ') || 'Адрес не удалось разобрать',
        };
    }

    async _parseRegistrationFile(xmlDoc) {
        const root = xmlDoc.documentElement;

        const data = {
            meta: {},
            general: {},
            flags: {},
            license: {},
            owners: [],
            servers: { pop3: {}, smtp: {}, edo: {}, other: [], onlineCheck: {} },
            recipients: [],
            allCertificates: [],
            signature: {},
        };

        // --- МЕТАДАННЫЕ ФАЙЛА ---
        data.meta = {
            formatVersion: root.getAttribute('ВерсФорм'),
            creationTimestamp: root.getAttribute('ДатаВремяФормирования'),
            programVersion: root.getAttribute('ВерсПрог'),
        };

        // --- ОБЩАЯ ИНФОРМАЦИЯ И ФЛАГИ ---
        data.general = {
            orgName: this.getText(root, 'ПолноеНаименование'),
            shortOrgName: this.getText(root, 'КраткоеНаименование'),
            inn: this.getText(root, 'ИНН'),
            kpp: this.getText(root, 'КПП'),
            ogrn: this.getText(root, 'ОГРН'),
            email: this.getText(root, 'ЭлектроннаяПочта'),
            publicEmail: this.getText(root, 'АдресЭлектроннойПочты'),
            phoneMain: this.getText(root, 'ТелефонОсновной'),
            phoneExtra: this.getText(root, 'ТелефонДополнительный'),
            phoneMobile: this.getText(root, 'ТелефонМобильный'),
            subscriberId: this.getText(root, 'ИдентификаторАбонента'),
            specialOperatorId: this.getText(root, 'ИдентификаторСпецоператора'),
            mainSupply1c: this.getText(root, 'НомерОсновнойПоставки1с'),
            pfrRegNum: this.getText(root, 'РегНомерПФР'),
            pfrSenderSystemId: this.getText(root, 'ИдентификаторСистемыОтправителяПФР'),
            fssRegNum: this.getText(root, 'РегНомерФСС'),
            fgsSenderSystemId: this.getText(root, 'ИдентификаторСистемыОтправителяФСГС'),
            multiUserMode: this.getText(root, 'ЭтоМногопользовательскийРежим'),
            lkConnected: this.getText(root, 'ЛичныйКабинетПодключен'),
        };

        data.flags = {
            isSeparateDivision: this.getText(root, 'ПризнакОбособленногоПодразделения'),
            isAuthRepresentative: this.getText(root, 'ПризнакУполномоченногоПредставителя'),
            isJuridical: this.getText(root, 'ПризнакЮридическогоЛица'),
            isPhysical: this.getText(root, 'ПризнакФизическогоЛица'),
        };

        // --- ЛИЦЕНЗИЯ ---
        const lic = root.querySelector('Лицензия');
        if (lic) {
            data.license = {
                name: lic.getAttribute('Наименование'),
                its: lic.getAttribute('ИТС'),
                startDate: lic.getAttribute('ДатаНачала'),
                endDate: lic.getAttribute('ДатаОкончания'),
                blockDate: lic.getAttribute('ДатаБлокировки'),
            };
        }

        // --- ВЛАДЕЛЬЦЫ ЭЦП ---
        root.querySelectorAll('ВладельцыЭЦП ВладелецЭЦП').forEach((node) => {
            const fioNode = node.querySelector('ФИО');
            const cryptoNode = node.querySelector('Криптопровайдер');
            const owner = {
                fio: fioNode
                    ? `${fioNode.getAttribute('Фамилия')} ${fioNode.getAttribute('Имя')} ${fioNode.getAttribute('Отчество')}`.trim()
                    : 'Н/Д',
                position: this.getText(node, 'Должность'),
                snils: this.getText(node, 'СНИЛС'),
                inn: this.getText(node, 'ИНН'),
                email: this.getText(node, 'ЭлектроннаяПочта'),
                mobile: this.getText(node, 'ТелефонМобильный'),
                thumbprint: this.getText(node, 'Отпечаток')?.toUpperCase(),
                wantsSms: this.getText(node, 'ПолучатьСМСУведомления'),
                cryptoProLicenseInCert: this.getText(node, 'ЛицензияКриптоПроВключенаВСертификат'),
                cryptoProvider: cryptoNode
                    ? {
                          type: this.getText(cryptoNode, 'ТипКриптопровайдера'),
                          name: this.getText(cryptoNode, 'ИмяКриптопровайдера'),
                      }
                    : {},
            };
            data.owners.push(owner);

            if (owner.thumbprint) {
                this.addOrUpdateCertificate({
                    thumbprint: owner.thumbprint,
                    source: 'Рег. файл (Владелец ЭЦП)',
                    ownerFio: owner.fio,
                    orgName: data.general.shortOrgName || data.general.orgName,
                });
            }
        });

        // --- СЕРВЕРЫ ---
        const pop3 = root.querySelector('СерверPOP3');
        if (pop3)
            data.servers.pop3 = {
                port: this.getText(pop3, 'Порт'),
                address: this.getText(pop3, 'Адрес'),
                auth: this.getText(pop3, 'ТребуетсяАвторизация'),
            };

        const smtp = root.querySelector('СерверSMTP');
        if (smtp)
            data.servers.smtp = {
                port: this.getText(smtp, 'Порт'),
                address: this.getText(smtp, 'Адрес'),
                auth: this.getText(smtp, 'ТребуетсяАвторизация'),
            };

        const edo = root.querySelector('СерверЭДО');
        if (edo) {
            data.servers.edo = {
                name: this.getText(edo, 'Наименование'),
                thumbprint: this.getText(edo, 'Отпечаток')?.toUpperCase(),
                emails: {
                    fns: this.getText(edo, 'АдресЭлектроннойПочтыФНС'),
                    pfr: this.getText(edo, 'АдресЭлектроннойПочтыПФР'),
                    fgs: this.getText(edo, 'АдресЭлектроннойПочтыФСГС'),
                },
            };
            if (data.servers.edo.thumbprint) {
                this.addOrUpdateCertificate({
                    thumbprint: data.servers.edo.thumbprint,
                    source: 'Рег. файл (Сервер ЭДО)',
                    orgName: data.servers.edo.name || 'Сервер ЭДО',
                });
            }
        }

        const online = root.querySelector('ПрочиеСерверы СерверОнлайнПроверки');
        if (online) {
            const res = online.querySelector('Ресурс');
            data.servers.onlineCheck = {
                name: this.getText(online, 'Наименование'),
                type: this.getText(online, 'ТипРеализации'),
                thumbprint: this.getText(online, 'Отпечаток')?.toUpperCase(),
                resource: res
                    ? {
                          definition: res.getAttribute('Определение'),
                          namespace: res.getAttribute('URIПространстваИменСервиса'),
                          serviceName: res.getAttribute('ИмяСервиса'),
                          endpointName: res.getAttribute('ИмяТочкиПодключения'),
                      }
                    : {},
            };
            if (data.servers.onlineCheck.thumbprint) {
                this.addOrUpdateCertificate({
                    thumbprint: data.servers.onlineCheck.thumbprint,
                    source: 'Рег. файл (Сервер онлайн-проверки)',
                    orgName: data.servers.onlineCheck.name || 'Сервер онлайн-проверки',
                });
            }
        }

        // --- ПОЛУЧАТЕЛИ ---
        root.querySelectorAll(
            'Получатели Получатель, ДополнительныеПолучатели ДополнительныйПолучатель',
        ).forEach((r) => {
            const rec = {
                type: this.getText(r, 'ТипПолучателя'),
                code: this.getText(r, 'КодПолучателя'),
                name: this.getText(r, 'НаименованиеПолучателя'),
                kppList: Array.from(r.querySelectorAll('ПереченьКПП КПП'))
                    .map((k) => k.textContent.trim())
                    .filter(Boolean),
                thumbprints: Array.from(r.querySelectorAll('ОтпечаткиСертификатов Отпечаток'))
                    .map((t) => t.textContent.trim().toUpperCase())
                    .filter(Boolean),
            };
            data.recipients.push(rec);

            rec.thumbprints.forEach((thumbprint) => {
                this.addOrUpdateCertificate({
                    thumbprint: thumbprint,
                    source: 'Рег. файл (Сертификат шифрования КО)',
                    orgName: rec.name || `Орган: ${rec.type}`,
                    recipientType: rec.type,
                });
            });
        });

        // --- ПОДПИСЬ И КОНФИДЕНЦИАЛЬНАЯ ИНФОРМАЦИЯ ---
        const signNode = root.querySelector('Подписи Подпись');
        if (signNode) {
            data.signature = {
                thumbprint: signNode.getAttribute('Отпечаток')?.toUpperCase(),
                value: signNode.textContent.trim(),
            };
            if (data.signature.thumbprint) {
                this.addOrUpdateCertificate({
                    thumbprint: data.signature.thumbprint,
                    source: 'Рег. файл (Подпись файла)',
                    orgName: `Подпись файла (${data.general.shortOrgName || data.general.orgName})`,
                });
            }
        }

        // --- СЕРТИФИКАТЫ ---
        const certsContainer = root.querySelector('Сертификаты');
        const certNodes = certsContainer ? certsContainer.querySelectorAll('Сертификат') : [];

        const parsedCertsPromises = Array.from(certNodes).map(async (certNode) => {
            const base64 = certNode.textContent.trim();
            if (!base64) return null;

            const parsed = await window.electronAPI.parseCertificate(base64);

            const certData = {
                thumbprint:
                    certNode.getAttribute('Отпечаток')?.toUpperCase() ||
                    parsed.thumbprint ||
                    `unknown_${Date.now()}`,
                base64,
                store: certNode.getAttribute('Хранилище'),
                isParsed: parsed.isParsed,
                source: 'Рег. файл (блок <Сертификаты>)',
                ...parsed,
            };

            this.addOrUpdateCertificate(certData);
            return certData;
        });

        data.allCertificates = (await Promise.all(parsedCertsPromises)).filter(Boolean);

        return data;
    }

    _createDownloadButtonForThumbprint(thumbprint, text = 'Скачать', extraClasses = '') {
        if (!thumbprint) {
            return document.createDocumentFragment();
        }

        const cert = this.certificates.get(thumbprint.toUpperCase());
        const isDisabled = !cert || !cert.base64;

        const buttonTitle = isDisabled
            ? 'Тело сертификата не найдено в проанализированных данных'
            : `Скачать сертификат (${this._slugify((cert && (cert.orgName || cert.ownerFio)) || thumbprint)}.cer)`;

        const button = document.createElement('button');

        const baseClasses =
            'bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

        const activeClasses =
            'bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
        const disabledClasses =
            'bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

        button.className = `download-cert-btn ${baseClasses} ${isDisabled ? disabledClasses : activeClasses} ${extraClasses}`;

        if (!extraClasses.includes('px-') && !extraClasses.includes('py-')) {
            button.classList.add('px-3', 'py-1');
        }

        button.dataset.certThumbprint = this._raw(thumbprint);
        button.title = buttonTitle;
        button.disabled = isDisabled;
        button.textContent = this._raw(text);

        return button;
    }
}

export function createXmlAnalyzerApp(root) {
    return new ReportAnalyzerApp(root);
}
