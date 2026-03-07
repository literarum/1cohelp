/* eslint-disable no-dupe-keys, no-dupe-class-members, no-control-regex, no-empty, no-case-declarations, no-unused-vars -- ported from external XML analyzer app */
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
        if (this.themeToggle) {
            this.initTheme();
        } else {
            console.warn('Элемент #theme-toggle не найден. Переключение темы не будет работать.');
        }

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

        if (this.dropZone) {
            this.dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.dropZone.classList.add('drag-over');
            });
            this.dropZone.addEventListener('dragleave', (e) => {
                if (!this.dropZone.contains(e.relatedTarget)) {
                    this.dropZone.classList.remove('drag-over');
                }
            });
            this.dropZone.addEventListener('drop', (e) => this.handleFileDrop(e));
        }

        const openFilePicker = () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.xml,.zip,.txt,.json';
            fileInput.style.display = 'none';
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
            document.body.appendChild(fileInput);
            fileInput.click();
            document.body.removeChild(fileInput);
        };
        if (this.loadFileBtn) {
            this.loadFileBtn.addEventListener('click', openFilePicker);
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

        if (window.electronAPI) {
            if (this.minimizeBtn) {
                this.minimizeBtn.addEventListener('click', () =>
                    window.electronAPI.minimizeWindow(),
                );
            }
            if (this.maximizeBtn) {
                this.maximizeBtn.addEventListener('click', () =>
                    window.electronAPI.maximizeWindow(),
                );
            }
            if (this.closeBtn) {
                this.closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
            }
        }
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

    clearInput() {
        if (this.dataInputTextarea) {
            this.dataInputTextarea.value = '';
        }
        this.updateAnalyzeButtonState();
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

    initTheme() {
        const applyTheme = (theme) => {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        const toggleTheme = () => {
            const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        };

        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', toggleTheme);
        }

        const savedTheme =
            localStorage.getItem('theme') ||
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        applyTheme(savedTheme);
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.readFileAndAnalyze(file);
        }
    }

    handleFileDrop(event) {
        event.preventDefault();
        this.dropZone.classList.remove('drag-over');
        const file = event.dataTransfer.files[0];
        if (file) {
            this.readFileAndAnalyze(file);
        }
    }

    async readFileAndAnalyze(file) {
        if (this.isAnalysisDone) {
            this.clearAnalysis();
        }

        const analyzeBtnContent = this.getEl('analyze-btn-content');
        const spinnerIcon = `<svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

        if (analyzeBtnContent) {
            analyzeBtnContent.innerHTML = `${spinnerIcon} <span>Чтение файла...</span>`;
        }

        try {
            const content = await window.electronAPI.readFileContent(file.path || file);

            if (content.error) {
                throw new Error(content.error);
            }

            this.dataInputTextarea.value = content.data;
            this.updateAnalyzeButtonState();
            this.analyzeData();
        } catch (error) {
            this.showNotification(`Ошибка чтения файла: ${error.message}`, 'error');
            console.error('Ошибка при чтении файла через основной процесс:', error);
            if (analyzeBtnContent) {
                analyzeBtnContent.innerHTML = '<span>Анализировать</span>';
            }
        }
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

        this.certificates.clear();
        this.isAnalysisDone = false;

        if (this.inputArea) {
            this.inputArea.value = '';
            this.inputArea.readOnly = false;
        }

        if (this.dataInputTextarea) {
            this.dataInputTextarea.value = '';
        }

        if (this.outputArea) {
            this.outputArea.innerHTML = '';
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

        const valueHtml = `<div class="font-mono text-xs break-all">${this.sanitizeText(thumbprint)}<span class="font-sans">${this.sanitizeText(statusText)}</span></div>`;

        return this.createField('Отпечаток:', valueHtml, statusType);
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
        titleEl.textContent = this.sanitizeText(title);

        if (typeof content === 'string') {
            contentEl.innerHTML = content;
        } else if (content.nodeType) {
            contentEl.appendChild(content);
        }

        return clone;
    }

    sanitizeText(text) {
        const element = document.createElement('div');
        element.innerText = text;
        return element.innerHTML;
    }

    getText(parent, tagName, namespace = null) {
        const elements = namespace
            ? parent.getElementsByTagNameNS(namespace, tagName)
            : parent.getElementsByTagName(tagName);
        return elements[0] ? elements[0].textContent.trim() : '';
    }

    createField(label, value, type = 'default') {
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

        keyEl.textContent = this.sanitizeText(label);

        const valueIsHtml = /<[a-z][\s\S]*>/i.test(String(value));
        if (valueIsHtml) {
            valueEl.innerHTML = String(value);
        } else {
            valueEl.textContent = this.sanitizeText(String(value));
        }

        if (type === 'success') valueEl.classList.add('text-green-600', 'dark:text-green-400');
        if (type === 'error')
            valueEl.classList.add('text-red-600', 'dark:text-red-400', 'font-semibold');
        if (type === 'warning') valueEl.classList.add('text-amber-600', 'dark:text-amber-400');

        return clone;
    }

    async downloadFileFromBase64(base64Data, fileName, mimeType = 'application/octet-stream') {
        try {
            const cleanBase64 = base64Data.replace(/\s/g, '');
            const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
            const response = await fetch(dataUrl);
            if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
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

    parseRegistrationFileData(xmlDoc) {
        const root = xmlDoc.documentElement;
        const владелец = root.querySelector('ВладелецЭЦП');
        const фио = владелец?.querySelector('ФИО');

        const certData = {
            thumbprint: this.getText(владелец, 'Отпечаток'),
            orgName: this.getText(root, 'ПолноеНаименование'),
            inn: this.getText(root, 'ИНН'),
            kpp: this.getText(root, 'КПП'),
            ownerFio: фио
                ? `${фио.getAttribute('Фамилия')} ${фио.getAttribute('Имя')} ${фио.getAttribute('Отчество')}`.trim()
                : '',
            base64: null,
        };

        if (certData.thumbprint) {
            this.addOrUpdateCertificate(certData);
            return certData.thumbprint;
        }
        return null;
    }

    async parseStatementData(xmlDoc) {
        const root = xmlDoc.documentElement;
        const base64Cert = this.getText(
            root.querySelector('ВладельцыЭЦП ВладелецЭЦП'),
            'СертификатСУЦ',
        );

        if (!base64Cert) {
            console.error('В файле Заявления не найдено тело сертификата (тег СертификатСУЦ).');
            return null;
        }

        const parsed = await window.electronAPI.parseCertificate(base64Cert);

        if (parsed.error) {
            console.error('Ошибка парсинга сертификата:', parsed.error);
        }

        const subject = (parsed.certObject && parsed.certObject.subject) || parsed.subject || {};
        const issuer = (parsed.certObject && parsed.certObject.issuer) || parsed.issuer || {};

        const certData = {
            thumbprint: parsed.thumbprint,
            base64: base64Cert,
            source: parsed.isParsed ? 'Заявление' : 'Заявление (неполный парсинг)',
            subject,
            issuer,
            ownerFio: subject.CN || subject.SN || 'Не найден',
            orgName: subject.O || 'Не найдена',
            inn: subject.INN || this.getText(root, 'ИНН'),
        };

        this.addOrUpdateCertificate(certData);
        return certData.thumbprint;
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

    buildCertificateChain(targetCert) {
        let chain = [targetCert];
        let currentCert = targetCert;
        const MAX_DEPTH = 10;
        let depth = 0;

        while (depth < MAX_DEPTH) {
            if (currentCert.issuer.hash === currentCert.subject.hash) {
                break;
            }

            const authorityKeyIdExt = currentCert.extensions.find(
                (e) => e.name === 'authorityKeyIdentifier',
            );
            const authorityKeyId = authorityKeyIdExt ? authorityKeyIdExt.keyIdentifier : null;

            let issuerCert = null;
            if (authorityKeyId) {
                for (const [, certData] of this.certificates.entries()) {
                    if (certData.certObject) {
                        const subjectKeyIdExt = certData.certObject.extensions.find(
                            (e) => e.name === 'subjectKeyIdentifier',
                        );
                        if (
                            subjectKeyIdExt &&
                            subjectKeyIdExt.subjectKeyIdentifier === authorityKeyId
                        ) {
                            issuerCert = certData.certObject;
                            break;
                        }
                    }
                }
            }

            if (!issuerCert) {
                for (const [, certData] of this.certificates.entries()) {
                    if (
                        certData.certObject &&
                        certData.certObject.subject.hash === currentCert.issuer.hash
                    ) {
                        issuerCert = certData.certObject;
                        break;
                    }
                }
            }

            if (issuerCert) {
                chain.push(issuerCert);
                currentCert = issuerCert;
            } else {
                break;
            }
            depth++;
        }
        return chain;
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

    async analyzeData() {
        let rawData = this.dataInputTextarea.value.trim();
        if (!rawData) {
            this.clearAnalysis();
            return;
        }

        const analyzeBtn = this.getEl('analyze-btn');
        const analyzeBtnContent = this.getEl('analyze-btn-content');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            if (analyzeBtnContent) {
                analyzeBtnContent.innerHTML = '<span>Анализировать</span>';
            }
        }
        if (this.placeholder) this.placeholder.style.display = 'none';
        this.outputArea.innerHTML = '';

        let analysisResultNode = null;
        const warnings = [];

        try {
            try {
                const jsonData = JSON.parse(rawData);
                if (jsonData && typeof jsonData === 'object' && 'messages' in jsonData) {
                    analysisResultNode = this.renderSedoLog(jsonData);
                    this.finalizeAnalysis(analysisResultNode);
                    return;
                }
            } catch (jsonError) {}

            let xmlStartIndex = rawData.indexOf('<?xml');
            if (xmlStartIndex === -1) xmlStartIndex = rawData.indexOf('<');
            if (xmlStartIndex > 0) {
                rawData = rawData.substring(xmlStartIndex);
                this.dataInputTextarea.value = rawData;
            }

            const { fixedXml, wasFixed } = this._fixBrokenUriEncoding(rawData);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(fixedXml, 'application/xml');

            if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
                const errorNode = xmlDoc.getElementsByTagName('parsererror')[0];
                throw new Error(
                    `Ошибка разбора XML: ${errorNode ? errorNode.textContent : 'Неверный формат.'}`,
                );
            }

            const signatureCertData = await this._tryParseSignatureCertificate(xmlDoc);
            const basicInfo = this._tryParseBasicInfo(xmlDoc);

            try {
                const rootTag = xmlDoc.documentElement.tagName;
                switch (rootTag) {
                    case 'ТипОтчет':
                        const diagnosticData = this._parseDiagnosticReportData(xmlDoc);
                        analysisResultNode = this._renderDiagnosticReport(diagnosticData);
                        break;
                    case 'РегистрационныйФайл':
                        const regFileData = await this._parseRegistrationFile(xmlDoc);
                        analysisResultNode = this._renderRegistrationFileReport(regFileData);
                        break;
                    case 'Заявление':
                        const { data: statementData, cert: certObject } =
                            await this._parseStatement(xmlDoc);
                        analysisResultNode = this._renderStatementReport(statementData, certObject);
                        break;
                    case 'ЭДПФР':
                        if (xmlDoc.querySelector('ЕФС-1')) {
                            const efs1Data = await this._parseEfs1(xmlDoc);
                            analysisResultNode = this._renderEfs1Report(efs1Data);
                        } else if (xmlDoc.querySelector('СЗВ-ТД')) {
                            const szvTdData = await this._parseSzvTd(xmlDoc);
                            analysisResultNode = this._renderSzvTdReport(szvTdData);
                        } else if (xmlDoc.querySelector('ЗПЭД')) {
                            const zpedData = this._parseZped(xmlDoc);
                            analysisResultNode = this._renderZpedReport(
                                zpedData,
                                signatureCertData,
                            );
                        } else {
                            const knownTags = Array.from(xmlDoc.documentElement.children)
                                .map((node) => node.tagName)
                                .join(', ');
                            warnings.push(
                                `Этот файл формата ЭДПФР содержит тип отчета, который пока не поддерживается для детального анализа (найдены теги: ${knownTags}). Отображена только базовая информация и сертификат подписи.`,
                            );
                        }
                        break;
                    default:
                        warnings.push(
                            `Обнаружен неизвестный или неподдерживаемый тип отчета с корневым элементом <${rootTag}>. Отображена только базовая информация и сертификат подписи.`,
                        );
                        break;
                }
            } catch (deepParseException) {
                console.warn('Ошибка детального анализа:', deepParseException);
                warnings.push(
                    `При углубленном анализе отчета произошла ошибка: ${deepParseException.message}`,
                );
            }

            if (!analysisResultNode) {
                analysisResultNode = this._renderGenericReport(
                    basicInfo,
                    signatureCertData,
                    warnings,
                );
            } else if (warnings.length > 0) {
                const warningsNode = this._createWarningsNode(warnings);
                analysisResultNode.prepend(warningsNode);
            }
        } catch (e) {
            console.error('Критическая ошибка анализа:', e);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'content-card text-red-700 dark:text-red-300 border-red-400';
            errorDiv.innerHTML = `<h3 class="text-h3 text-red-800 dark:text-red-200">Критическая ошибка анализа</h3><p>${this.sanitizeText(e.message)}</p><p>Пожалуйста, проверьте, что данные являются корректным XML или JSON файлом.</p>`;
            analysisResultNode = errorDiv;
        } finally {
            this.finalizeAnalysis(analysisResultNode);
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
            reportDate = ` от ${new Date(data.serviceInfo.dateTime).toLocaleDateString('ru-RU')}`;
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
                const element = root.getElementsByTagName(tagName)[0];
                if (element && element.textContent) {
                    const value = element.textContent.trim();
                    if (value) {
                        info[key] = value;
                        break;
                    }
                }
            }
        }
        return info;
    }

    _renderGenericReport(basicInfo, signatureCert, warnings) {
        const wrapper = document.createElement('div');
        wrapper.className = 'analysis-container space-y-4';
        wrapper.id = 'generic-report';

        if (warnings && warnings.length > 0) {
            wrapper.appendChild(this._createWarningsNode(warnings));
        }

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
                const element = root.getElementsByTagName(tagName)[0];
                if (element && element.textContent) {
                    const value = element.textContent.trim();
                    if (value) {
                        info[key] = value;
                        break;
                    }
                }
            }
        }
        return info;
    }

    _renderGenericReport(basicInfo, signatureCert, warnings) {
        const wrapper = document.createElement('div');
        wrapper.className = 'analysis-container space-y-4';
        wrapper.id = 'generic-report';

        if (warnings && warnings.length > 0) {
            wrapper.appendChild(this._createWarningsNode(warnings));
        }

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

    finalizeAnalysis(analysisResultNode) {
        const mainElement = this.root.querySelector('.xml-analyzer-shell');

        if (analysisResultNode) {
            this.outputArea.appendChild(analysisResultNode);
        } else {
            throw new Error('Не удалось сформировать узел для отображения результата.');
        }

        if (mainElement) {
            mainElement.classList.add('analysis-done');
            if (this.certificates.size > 0) {
                mainElement.classList.add('show-cert-manager');
            }
        }

        this.renderCertificateManager();
        this.isAnalysisDone = true;
        this.inputArea.readOnly = true;

        const analyzeBtn = this.getEl('analyze-btn');
        const analyzeBtnContent = this.getEl('analyze-btn-content');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
        }
        if (analyzeBtnContent) {
            analyzeBtnContent.innerHTML = '<span>Анализировать</span>';
        } else if (analyzeBtn) {
            analyzeBtn.textContent = 'Анализировать';
        }
        this.updateAnalyzeButtonState();
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
            item.textContent = this.sanitizeText(msg);
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
        titleElement.textContent = `Анализ отчета ЕФС-1${data.fillDate ? ' от ' + new Date(data.fillDate).toLocaleDateString('ru-RU') : ''}`;
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
        return elements[0] ? elements[0].textContent.trim() : '';
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
                uuid: this.getText(eventNode, 'UUID: '),
                date: this.getText(eventNode, 'Дата: '),
                type:
                    eventTypeMap[this.getText(eventNode, 'Вид: ')] ||
                    `Вид ${this.getText(eventNode, 'Вид: ')}`,
                position: this.getText(eventNode, 'Должность'),
                isPartTime: this.getText(eventNode, 'ЯвляетсяСовместителем: ') === '1',
                department: this.getText(eventNode, 'СтруктурноеПодразделение: '),
                okzCode: this.getText(eventNode, 'КодВФпоОКЗ: '),
                baseDocument: baseNode
                    ? {
                          name: this.getText(baseNode, 'Наименование: '),
                          date: this.getText(baseNode, 'Дата: '),
                          number: this.getText(baseNode, 'Номер: '),
                      }
                    : null,
            });
        });

        // Руководитель
        const managerNode = szvTdNode.querySelector('Руководитель: ');
        if (managerNode) {
            const fioNode = managerNode.querySelector('ФИО: ');
            data.manager = {
                fio: fioNode
                    ? {
                          lastName: this._getTextNs(fioNode, 'Фамилия: ', nsUt2),
                          firstName: this._getTextNs(fioNode, 'Имя: ', nsUt2),
                          middleName: this._getTextNs(fioNode, 'Отчество: ', nsUt2),
                      }
                    : {},
                position: this._getTextNs(managerNode, 'Должность: ', nsUt2),
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
        titleElement.textContent = `Анализ отчета СЗВ-ТД от ${new Date(data.fillDate).toLocaleDateString('ru-RU')}`;
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
                    ? `${baseDoc.name} №${baseDoc.number} от ${new Date(baseDoc.date).toLocaleDateString('ru-RU')}`
                    : '—';

                tr.innerHTML = `
                    <td class="p-2 align-top">${new Date(event.date).toLocaleDateString('ru-RU')}</td>
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

    _renderDiagnosticReport(data, systemInfo) {
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
            this.createField('Дата отчета:', new Date(data.meta.dateTime).toLocaleString('ru-RU')),
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
                    `${new Date(data.subscriber.account.licenseStart).toLocaleDateString()} - ${new Date(data.subscriber.account.licenseEnd).toLocaleDateString()}`,
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
                const isExpired = new Date(cert.validUntil) < new Date();
                let status = `Годен до: ${new Date(cert.validUntil).toLocaleDateString()}`;
                if (isExpired) status += ' (ИСТЁК)';

                const certItem = document.createElement('div');
                certItem.className = 'p-2 rounded-md bg-slate-100 dark:bg-slate-800';
                certItem.appendChild(this.createField('Субъект', cert.subjectName));
                certItem.appendChild(
                    this.createField(
                        'Отпечаток',
                        `<div class="font-mono text-xs">${cert.thumbprint}</div>`,
                    ),
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

    prepareUIForAnalysis() {
        this.placeholder.style.display = 'none';
        this.outputArea.innerHTML = '<div class="text-center py-10">Анализ данных...</div>';
        this.analyzeBtn.textContent = 'Анализ...';
    }

    resetUI() {
        this.clearAnalysis();
    }

    resetAnalysisButton() {
        this.analyzeBtn.textContent = 'Анализировать';
        this.analyzeBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
    }

    renderRegistrationFile(cert, xmlDoc) {
        const root = xmlDoc.documentElement;
        const владелец = root.querySelector('ВладелецЭЦП');
        const фио = владелец?.querySelector('ФИО');

        let html = `<div class="content-card space-y-4"><h2 class="text-2xl font-bold mb-4 text-slate-900 dark:text-white">Регистрационный файл абонента</h2>`;

        html +=
            '<h3 class="text-lg font-semibold text-sky-700 dark:text-sky-400 mt-4 mb-2">Информация об организации</h3>';
        html += this.createField('Полное наименование', this.getText(root, 'ПолноеНаименование'));
        html += this.createField(
            'ИНН/КПП',
            `${this.getText(root, 'ИНН')} / ${this.getText(root, 'КПП')}`,
        );

        if (владелец && фио) {
            html +=
                '<h3 class="text-lg font-semibold text-sky-700 dark:text-sky-400 mt-6 mb-2">Владелец ЭЦП</h3>';
            html += this.createField(
                'ФИО',
                `${фио.getAttribute('Фамилия')} ${фио.getAttribute('Имя')} ${фио.getAttribute('Отчество')}`,
            );
            html += this.createField('Должность', this.getText(владелец, 'Должность'));
            html += this.createField('E-mail', this.getText(владелец, 'Email'));
        }

        html += this.renderControllingAuthorities(xmlDoc);

        html +=
            '<h3 class="text-lg font-semibold text-sky-700 dark:text-sky-400 mt-6 mb-2">Статус сертификата</h3>';
        html += this.createField('Отпечаток сертификата', cert.thumbprint, 'success');

        if (cert.base64) {
            html += this.createField(
                'Тело сертификата',
                'Найдено (готово к скачиванию)',
                'success',
            );
            html += `
            <div class="mt-6 text-center">
                <button
                    class="download-cert-btn w-full md:w-auto px-6 py-2 rounded-lg font-bold text-white bg-blue-500 hover:bg-blue-600 active:bg-blue-700 transition-colors"
                    data-cert-thumbprint="${this.sanitizeText(cert.thumbprint)}"
                    title="Скачать сертификат (${cert.inn || cert.thumbprint}.cer)">
                    Скачать сертификат
                </button>
            </div>`;
        } else {
            html += this.createField(
                'Тело сертификата',
                'Не найдено. Для скачивания проанализируйте файл Заявления.',
                'warning',
            );
        }
        html += '</div>';
        return html;
    }

    renderControllingAuthorities(xmlDoc) {
        const directions = xmlDoc.querySelectorAll('НапрПрин');
        if (directions.length === 0) return '';

        const authorityMap = this.controllingAuthorityMap;

        let directionsHtml =
            '<h3 class="text-lg font-semibold text-sky-700 dark:text-sky-400 mt-6 mb-2">Подключения к контролирующим органам</h3><div class="space-y-3">';

        directions.forEach((dir) => {
            const code = dir.getAttribute('Код');
            const name = authorityMap[code] || `Неизвестный орган(${code})`;
            const subCode =
                dir.querySelector('КодНО')?.textContent ||
                dir.querySelector('КодТОГС')?.textContent ||
                dir.querySelector('КодПФР')?.textContent ||
                'Н/Д';
            const subName =
                dir.querySelector('НаименованиеНО')?.textContent ||
                dir.querySelector('НаименованиеТОГС')?.textContent ||
                dir.querySelector('НаименованиеПФР')?.textContent ||
                'Детали не указаны';

            directionsHtml += `
            <div class="p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 bg-slate-50 dark:bg-slate-800/50">
                <p class="font-semibold text-slate-800 dark:text-slate-200">${this.sanitizeText(name)}</p>
                <p class="text-sm text-slate-600 dark:text-slate-400">Код: ${this.sanitizeText(subCode)}</p>
                <p class="text-sm text-slate-600 dark:text-slate-400">Наименование: ${this.sanitizeText(subName)}</p>
            </div>`;
        });

        directionsHtml += '</div>';
        return directionsHtml;
    }

    renderStatement(cert) {
        if (!cert) {
            return `<div class="content-card text-red-700 dark:text-red-400"><h2 class="text-xl font-bold mb-2 text-slate-900 dark:text-white">Ошибка</h2><p>Не удалось найти данные для отображения отчета по Заявлению.</p></div>`;
        }

        let html = `<div class="content-card"><h2 class="text-2xl font-bold mb-4 text-slate-900 dark:text-white">Анализ файла выгрузки заявления</h2>`;
        html +=
            '<h3 class="text-lg font-semibold text-sky-700 dark:text-sky-400 mt-4 mb-2">Общая информация из файла</h3>';
        html += this.createField('ИНН организации', cert.inn);
        html +=
            '<h3 class="text-lg font-semibold text-sky-700 dark:text-sky-400 mt-6 mb-2">Данные из сертификата</h3>';

        if (cert.thumbprint && !cert.thumbprint.startsWith('unknown_')) {
            html += this.createField('Отпечаток (вычислен)', cert.thumbprint, 'success');
        } else {
            html += this.createField('Отпечаток', 'Не удалось вычислить', 'error');
        }

        html += this.createField('Владелец (из поля CN)', cert.ownerFio);
        html += this.createField('Организация (из поля O)', cert.orgName);

        if (cert.base64) {
            html += this.createField(
                'Тело сертификата',
                'Найдено и готово к скачиванию',
                'success',
            );
            html += `
        <div class="mt-6 text-center">
            ${this._createDownloadButtonForThumbprint(cert.thumbprint, 'Скачать сертификат', 'w-full md:w-auto px-6 py-2')}
        </div>`;
        } else {
            html += this.createField('Тело сертификата', 'Отсутствует', 'error');
        }
        if (!cert.orgName || !cert.ownerFio) {
            html += `<p class="mt-4 p-3 text-sm rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300"><b>Примечание:</b> Для получения полной информации (например, должность, подключения к КО) проанализируйте соответствующий <b>Регистрационный файл</b>.</p>`;
        }
        html += '</div>';
        return html;
    }

    renderDiagnosticReport(xmlDoc, namespace) {
        return `<div class="content-card text-slate-900 dark:text-white">Отчет 1С пока не парсится на сертификаты.</div>`;
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
            const sortedMessages = [...data.messages].sort(
                (a, b) => new Date(a.date) - new Date(b.date),
            );
            sortedMessages.forEach((msg) => {
                const clone = rowTemplate.content.cloneNode(true);
                const row = clone.querySelector('.sedo-message-row');

                row.dataset.rawJson = JSON.stringify(msg, null, 2);

                const senderEl = clone.querySelector('.sedo-sender');
                senderEl.textContent = this.sanitizeText(msg.sender_id || '—');
                if (msg.sender_id === 'Фонд')
                    senderEl.classList.add('text-blue-600', 'dark:text-blue-400');
                else if (msg.sender_id === 'Страхователь')
                    senderEl.classList.add('text-green-600', 'dark:text-green-400');
                else senderEl.classList.add('text-purple-600', 'dark:text-purple-400');

                const statusEl = clone.querySelector('.sedo-status');
                if (msg.status) {
                    statusEl.textContent = this.sanitizeText(msg.status);
                    if (msg.status.toLowerCase().includes('ошибк')) {
                        statusEl.classList.add('text-red-600', 'dark:text-red-400');
                    } else {
                        statusEl.classList.add('text-slate-500', 'dark:text-slate-400');
                    }
                }

                clone.querySelector('.sedo-type').textContent = this.sanitizeText(msg.type || '—');
                clone.querySelector('.sedo-title').textContent = this.sanitizeText(
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
                `Сообщения документооборота (${data.messages.length} шт.)`,
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

            item.dataset.thumbprint = this.sanitizeText(cert.thumbprint);

            const orgEl = clone.querySelector('.cert-org');
            const orgText = cert.recipientType
                ? `${cert.orgName} [${cert.recipientType}]`
                : cert.orgName || 'Организация не указана';
            orgEl.textContent = this.sanitizeText(orgText);
            orgEl.title = orgEl.textContent;
            orgEl.classList.add('font-semibold', 'truncate');

            const fioEl = clone.querySelector('.cert-fio');
            fioEl.textContent = this.sanitizeText(cert.ownerFio || 'ФИО не указано');
            fioEl.title = fioEl.textContent;
            fioEl.classList.add('text-sm', 'text-slate-500', 'dark:text-slate-400', 'truncate');

            const thumbprintEl = clone.querySelector('.cert-thumbprint');
            thumbprintEl.textContent = this.sanitizeText(cert.thumbprint);
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
                    } catch (e) {
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

    _renderSection(title, contentElement, isOpen = false) {
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
        titleEl.textContent = this.sanitizeText(title);

        if (contentElement && contentElement.nodeType) {
            contentEl.appendChild(contentElement);
        }

        const iconContainer = clone.querySelector('.accordion-toggle-container');
        if (iconContainer) {
            const updateIconState = () =>
                iconContainer.classList.toggle('rotate-180', details.open);
            details.addEventListener('toggle', updateIconState);
            if (isOpen) {
                setTimeout(updateIconState, 0);
            }
        }

        return clone;
    }

    _formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    _formatPlatform(platform, arch, release) {
        let osName = 'Неизвестная ОС';
        if (platform === 'win32') {
            const majorVersion = parseInt(release.split('.')[0], 10);
            osName = majorVersion >= 10 ? 'Windows 10/11' : 'Windows';
        } else if (platform === 'darwin') {
            osName = 'macOS';
        } else if (platform === 'linux') {
            osName = 'Linux';
        }
        return `${osName} (${arch})`;
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

            clone.querySelector('.log-event').textContent = this.sanitizeText(log.event);
            clone.querySelector('.log-date').textContent = new Date(log.date).toLocaleString(
                'ru-RU',
            );

            const levelEl = clone.querySelector('.log-level');
            levelEl.textContent = this.sanitizeText(log.level);
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
                } catch (e) {
                    const p = document.createElement('p');
                    p.className = 'text-sm text-slate-600 dark:text-slate-400 mt-1';
                    p.textContent = this.sanitizeText(log.comment);
                    commentWrapper.appendChild(p);
                }
            } else {
                const p = document.createElement('p');
                p.className = 'text-sm text-slate-600 dark:text-slate-400 mt-1';
                p.textContent = this.sanitizeText(log.comment);
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
                        `<li><span class="font-semibold">${authorityMap[dir.recipientType] || dir.recipientType}</span> (Код: ${this.sanitizeText(dir.recipientCode)}, КПП: ${this.sanitizeText(dir.kpp)})</li>`,
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
            <p><strong>Дата:</strong> ${new Date(msg.transportDate).toLocaleString('ru-RU')}</p>
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
                    `Неизвестный (${data.general.statementType})`,
            ),
        );
        generalContent.appendChild(
            this.createField(
                'Дата формирования: ',
                new Date(data.general.dateTime).toLocaleString('ru-RU'),
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
                    : 'Индивидуальный предприниматель',
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

    async _processRegistrationFile(xmlDoc) {
        const data = await this._parseRegistrationFile(xmlDoc);
        return this._renderRegistrationFileReport(data);
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
                new Date(data.meta.creationTimestamp).toLocaleString('ru-RU'),
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
                title.textContent = this.sanitizeText(
                    this.controllingAuthorityMap[rec.type] ||
                        rec.name ||
                        `Неизвестный орган: ${rec.type}`,
                );
                recipientCard.appendChild(title);

                if (rec.code) {
                    const code = document.createElement('p');
                    code.className = 'text-sm text-slate-600 dark:text-slate-400';
                    code.textContent = `Код органа: ${this.sanitizeText(rec.code)}`;
                    recipientCard.appendChild(code);
                }

                if (rec.name) {
                    const nameEl = document.createElement('p');
                    nameEl.className = 'text-sm text-slate-600 dark:text-slate-400';
                    nameEl.textContent = `Наименование: ${this.sanitizeText(rec.name)}`;
                    recipientCard.appendChild(nameEl);
                }

                if (rec.kppList.length > 0) {
                    const kppEl = document.createElement('p');
                    kppEl.className = 'text-sm text-slate-600 dark:text-slate-400';
                    kppEl.textContent = `Перечень КПП: ${this.sanitizeText(rec.kppList.join(', '))}`;
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
                this.createField(
                    'Отпечаток серт. ЭДО',
                    `<div class="font-mono text-xs break-all">${data.servers.edo.thumbprint}</div>`,
                ),
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
                this.createField(
                    'Отпечаток серт.',
                    `<div class="font-mono text-xs break-all">${data.servers.onlineCheck.thumbprint}</div>`,
                ),
            );
            onlineCard.appendChild(
                this.createField(
                    'WSDL',
                    `<div class="text-xs break-all">${data.servers.onlineCheck.resource.definition}</div>`,
                ),
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
                    `<div class="font-mono text-xs break-all">${data.signature.thumbprint}</div>`,
                ),
            );
            signatureContent.appendChild(
                this.createField(
                    'Значение подписи (Base64)',
                    `<div class="text-xs break-all text-slate-500">${data.signature.value.substring(0, 100)}...</div>`,
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

        button.dataset.certThumbprint = this.sanitizeText(thumbprint);
        button.title = buttonTitle;
        button.disabled = isDisabled;
        button.textContent = this.sanitizeText(text);

        return button;
    }
}

export function createXmlAnalyzerApp(root) {
    return new ReportAnalyzerApp(root);
}
