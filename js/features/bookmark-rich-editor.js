import {
    BOOKMARK_FONTS,
    BOOKMARK_SIZES,
    bookmarkDescriptionHtml,
    bookmarkHtmlToText,
    bookmarkLink,
    sanitizeBookmarkHtml,
} from './bookmark-rich-text.js';

const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
};

/** One editor per bookmark form. Hidden fields preserve the existing save/search/dirty contracts. */
export function mountBookmarkRichEditor(form) {
    if (form._bookmarkEditor) return form._bookmarkEditor;
    const plain = form.elements.bookmarkDescription;
    if (!plain) return null;
    const host = make('div', 'bookmark-rich-editor');
    const rich = document.createElement('input');
    rich.type = 'hidden';
    rich.name = 'bookmarkDescriptionHtml';
    rich.id = 'bookmarkDescriptionHtml';
    rich.dataset.formSnapshot = 'true';
    const toolbar = make('div', 'bookmark-format-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Форматирование текста закладки');
    const editable = make('div', 'bookmark-rich-content bookmark-rich-editable');
    editable.id = 'bookmarkDescriptionEditor';
    editable.contentEditable = 'true';
    editable.setAttribute('role', 'textbox');
    editable.setAttribute('aria-label', 'Текст закладки');
    editable.setAttribute('aria-multiline', 'true');
    editable.dataset.placeholder = 'Описание закладки или текст заметки';
    const panel = make('div', 'bookmark-format-panel');
    panel.hidden = true;
    const status = make(
        'div',
        'bookmark-editor-status',
        'Ctrl+B — жирный · Ctrl+I — курсив · Ctrl+U — подчёркивание · Ctrl+K — ссылка',
    );
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    host.append(toolbar, panel, editable, status);
    plain.after(rich, host);
    plain.hidden = true;
    form.querySelector('label[for="bookmarkDescription"]')?.setAttribute('for', editable.id);
    let range = null,
        syncing = false,
        activePanelButton = null,
        refreshingControls = false;
    let paragraphControl, fontControl, sizeControl;
    const toggles = new Map(),
        tableButtons = [];
    const remember = () => {
        const selection = document.getSelection();
        if (
            selection?.rangeCount &&
            editable.contains(selection.getRangeAt(0).commonAncestorContainer)
        )
            range = selection.getRangeAt(0).cloneRange();
    };
    const restore = () => {
        editable.focus();
        const selection = document.getSelection();
        if (!selection) return;
        if (!range || !editable.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(editable);
            range.collapse(false);
        }
        selection.removeAllRanges();
        selection.addRange(range);
    };
    const sync = (emit = true) => {
        rich.value = sanitizeBookmarkHtml(editable.innerHTML);
        plain.value = bookmarkHtmlToText(rich.value);
        editable.removeAttribute('aria-invalid');
        if (emit) {
            syncing = true;
            plain.dispatchEvent(new Event('input', { bubbles: true }));
            syncing = false;
        }
    };
    const selectedElement = () => {
        const anchor = range?.startContainer;
        return anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    };
    const selectedCell = () => {
        const cell = selectedElement()?.closest('td,th');
        return cell && editable.contains(cell) ? cell : null;
    };
    const refresh = () => {
        remember();
        for (const [command, button] of toggles) {
            let pressed = false;
            try {
                pressed = !!document.queryCommandState?.(command);
            } catch {}
            button.setAttribute('aria-pressed', String(pressed));
        }
        for (const button of tableButtons) button.disabled = !selectedCell();
        const current = selectedElement();
        if (current && editable.contains(current)) {
            const update = (control, value) => {
                if (!control || control.value === value) return;
                control.value = value;
                refreshingControls = true;
                control.dispatchEvent(new Event('change'));
                refreshingControls = false;
            };
            const block = current.closest('h2,h3,h4,pre,blockquote,p');
            update(paragraphControl, block?.tagName.toLowerCase() || 'p');
            let styled = current,
                font = '',
                size = '';
            while (styled && styled !== editable) {
                font ||= styled.style?.fontFamily;
                size ||= styled.style?.fontSize;
                styled = styled.parentElement;
            }
            font = String(font).replace(/["']/g, '');
            update(fontControl, BOOKMARK_FONTS.includes(font) ? font : 'system-ui');
            const named = {
                'xx-small': '1',
                'x-small': '2',
                small: '2',
                medium: '3',
                large: '4',
                'x-large': '5',
                'xx-large': '6',
                '-webkit-xxx-large': '7',
            };
            update(
                sizeControl,
                Object.hasOwn(named, size)
                    ? named[size]
                    : Object.entries(BOOKMARK_SIZES).find(
                          ([, n]) => String(n) + 'px' === size,
                      )?.[0] || '3',
            );
        }
    };
    const command = (name, value = null) => {
        restore();
        try {
            if (typeof document.execCommand !== 'function')
                throw new Error('В этом браузере визуальное форматирование недоступно.');
            document.execCommand('styleWithCSS', false, true);
            document.execCommand(name, false, value);
            remember();
            sync();
            refresh();
        } catch (error) {
            status.textContent = error.message || 'Не удалось применить форматирование.';
        }
    };
    const closePanel = () => {
        panel.hidden = true;
        panel.replaceChildren();
        activePanelButton?.setAttribute('aria-expanded', 'false');
        activePanelButton = null;
    };
    const button = (label, icon, fn, group = toolbar, toggle = null) => {
        const el = make('button', 'bookmark-format-button');
        el.type = 'button';
        el.title = label;
        el.setAttribute('aria-label', label);
        const glyph = make('i', `fas ${icon}`);
        glyph.setAttribute('aria-hidden', 'true');
        el.append(glyph);
        el.addEventListener('mousedown', (event) => {
            remember();
            event.preventDefault();
        });
        el.addEventListener('click', fn);
        group.append(el);
        if (toggle) {
            toggles.set(toggle, el);
            el.setAttribute('aria-pressed', 'false');
        }
        return el;
    };
    const group = (label) => {
        const g = make('div', 'bookmark-format-group');
        g.setAttribute('role', 'group');
        g.setAttribute('aria-label', label);
        toolbar.append(g);
        return g;
    };
    const select = (label, items, fn, g) => {
        const control = make('select', 'bookmark-format-select');
        control.setAttribute('aria-label', label);
        control.title = label;
        items.forEach(([value, title]) => {
            const option = make('option', '', title);
            option.value = value;
            control.append(option);
        });
        control.addEventListener('mousedown', remember);
        control.addEventListener('change', () => {
            if (refreshingControls) return;
            closePanel();
            fn(control.value);
        });
        g.append(control);
        return control;
    };
    const showPanel = (owner, title, build) => {
        if (activePanelButton === owner) {
            closePanel();
            restore();
            return;
        }
        remember();
        closePanel();
        activePanelButton = owner;
        owner.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', title);
        build();
    };
    const input = (label, type, value) => {
        const wrap = make('label', 'bookmark-format-field');
        wrap.append(make('span', '', label));
        const el = make('input');
        el.type = type;
        el.value = value;
        wrap.append(el);
        panel.append(wrap);
        return el;
    };
    const panelAction = (label, fn) => {
        const el = make('button', 'bookmark-format-apply', label);
        el.type = 'button';
        el.addEventListener('click', fn);
        panel.append(el);
        return el;
    };
    const colorPanel = (label, icon, property, g) => {
        let owner;
        owner = button(
            label,
            icon,
            () =>
                showPanel(owner, label, () => {
                    const palette = make('div', 'bookmark-format-palette');
                    palette.setAttribute('role', 'group');
                    palette.setAttribute('aria-label', label + ' — палитра');
                    panel.append(palette);
                    const colors = [
                        ['#c53030', 'Красный'],
                        ['#b45309', 'Оранжевый'],
                        ['#166534', 'Зелёный'],
                        ['#1d4ed8', 'Синий'],
                        ['#7e22ce', 'Фиолетовый'],
                        ['#111827', 'Тёмный'],
                        ['#ffffff', 'Белый'],
                        ['#fff59d', 'Жёлтый маркер'],
                    ];
                    const apply = (value) => {
                        closePanel();
                        command(property, value);
                    };
                    for (const [value, name] of colors) {
                        const swatch = make('button', 'bookmark-format-swatch');
                        swatch.type = 'button';
                        swatch.title = name;
                        swatch.setAttribute('aria-label', name);
                        swatch.style.backgroundColor = value;
                        swatch.addEventListener('click', () => apply(value));
                        palette.append(swatch);
                    }
                    const hex = input(
                        'Цвет HEX',
                        'text',
                        property === 'foreColor' ? '#1d4ed8' : '#fff59d',
                    );
                    hex.maxLength = 7;
                    hex.spellcheck = false;
                    const picker = input('Свой цвет', 'color', hex.value);
                    picker.addEventListener('input', () => {
                        hex.value = picker.value;
                    });
                    panelAction('Применить цвет', () => {
                        if (!/^#[\da-f]{6}$/i.test(hex.value)) {
                            status.textContent = 'Введите цвет в формате #RRGGBB.';
                            hex.focus();
                            return;
                        }
                        apply(hex.value);
                    });
                    panelAction('По умолчанию', () => {
                        restore();
                        command(property, property === 'foreColor' ? 'inherit' : 'transparent');
                        closePanel();
                    });
                }),
            g,
        );
        owner.setAttribute('aria-expanded', 'false');
    };
    const typography = group('Стиль и размер текста');
    paragraphControl = select(
        'Стиль абзаца',
        [
            ['p', 'Обычный текст'],
            ['h2', 'Заголовок 1'],
            ['h3', 'Заголовок 2'],
            ['h4', 'Заголовок 3'],
            ['blockquote', 'Цитата'],
            ['pre', 'Блок кода'],
        ],
        (v) => command('formatBlock', v),
        typography,
    );
    fontControl = select(
        'Шрифт',
        BOOKMARK_FONTS.map((v) => [v, v === 'system-ui' ? 'Шрифт приложения' : v]),
        (v) => command('fontName', v),
        typography,
    );
    sizeControl = select(
        'Размер текста',
        Object.entries(BOOKMARK_SIZES).map(([value, size]) => [value, String(size)]),
        (v) => command('fontSize', v),
        typography,
    );
    sizeControl.value = '3';
    sizeControl.querySelector('option[value="3"]').defaultSelected = true;
    const inline = group('Оформление символов');
    for (const [label, icon, name] of [
        ['Жирный (Ctrl+B)', 'fa-bold', 'bold'],
        ['Курсив (Ctrl+I)', 'fa-italic', 'italic'],
        ['Подчёркнутый (Ctrl+U)', 'fa-underline', 'underline'],
        ['Зачёркнутый', 'fa-strikethrough', 'strikeThrough'],
        ['Нижний индекс', 'fa-subscript', 'subscript'],
        ['Верхний индекс', 'fa-superscript', 'superscript'],
    ])
        button(
            label,
            icon,
            () => {
                closePanel();
                command(name);
            },
            inline,
            name,
        );
    const colors = group('Цвета');
    colorPanel('Цвет текста', 'fa-font', 'foreColor', colors);
    colorPanel('Цвет выделения', 'fa-highlighter', 'hiliteColor', colors);
    const paragraphs = group('Выравнивание и списки');
    for (const [label, icon, name] of [
        ['По левому краю', 'fa-align-left', 'justifyLeft'],
        ['По центру', 'fa-align-center', 'justifyCenter'],
        ['По правому краю', 'fa-align-right', 'justifyRight'],
        ['По ширине', 'fa-align-justify', 'justifyFull'],
        ['Маркированный список', 'fa-list-ul', 'insertUnorderedList'],
        ['Нумерованный список', 'fa-list-ol', 'insertOrderedList'],
        ['Уменьшить отступ', 'fa-outdent', 'outdent'],
        ['Увеличить отступ', 'fa-indent', 'indent'],
    ])
        button(
            label,
            icon,
            () => {
                closePanel();
                command(name);
            },
            paragraphs,
        );
    const insert = group('Вставка');
    let linkButton;
    linkButton = button(
        'Вставить или изменить ссылку (Ctrl+K)',
        'fa-link',
        () =>
            showPanel(linkButton, 'Настройки ссылки', () => {
                const current = selectedElement()?.closest('a');
                const address = input(
                    'Адрес ссылки',
                    'url',
                    current?.getAttribute('href') || 'https://',
                );
                const text = input(
                    'Текст ссылки',
                    'text',
                    range?.toString() || current?.textContent || '',
                );
                panelAction('Применить ссылку', () => {
                    const href = bookmarkLink(address.value);
                    if (!href) {
                        status.textContent =
                            'Укажите безопасную ссылку https://, http://, mailto: или tel:.';
                        address.focus();
                        return;
                    }
                    const selectedText = range?.toString() || current?.textContent || '';
                    if (text.value === selectedText && selectedText) {
                        if (current && editable.contains(current)) {
                            range = document.createRange();
                            range.selectNodeContents(current);
                        }
                        closePanel();
                        command('createLink', href);
                        return;
                    }
                    if (current && editable.contains(current)) {
                        range = document.createRange();
                        range.selectNode(current);
                    }
                    const a = make('a', '', text.value || href);
                    a.href = href;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    closePanel();
                    command('insertHTML', sanitizeBookmarkHtml(a.outerHTML));
                });
                panelAction('Отмена', () => {
                    closePanel();
                    restore();
                });
                address.focus();
            }),
        insert,
    );
    linkButton.setAttribute('aria-expanded', 'false');
    button(
        'Убрать ссылку',
        'fa-unlink',
        () => {
            closePanel();
            command('unlink');
        },
        insert,
    );
    button(
        'Код в строке',
        'fa-code',
        () => {
            closePanel();
            const code = make('code', '', range?.toString() || 'код');
            command('insertHTML', code.outerHTML);
        },
        insert,
    );
    button(
        'Горизонтальный разделитель',
        'fa-minus',
        () => {
            closePanel();
            command('insertHorizontalRule');
        },
        insert,
    );
    let tableButton;
    tableButton = button(
        'Вставить таблицу',
        'fa-table',
        () =>
            showPanel(tableButton, 'Размер таблицы', () => {
                const rows = input('Строки', 'number', '3');
                rows.min = '1';
                rows.max = '20';
                const cols = input('Столбцы', 'number', '3');
                cols.min = '1';
                cols.max = '10';
                panelAction('Вставить таблицу', () => {
                    const r = Number(rows.value),
                        c = Number(cols.value);
                    if (
                        !Number.isInteger(r) ||
                        !Number.isInteger(c) ||
                        r < 1 ||
                        r > 20 ||
                        c < 1 ||
                        c > 10
                    ) {
                        status.textContent = 'Выберите от 1 до 20 строк и от 1 до 10 столбцов.';
                        return;
                    }
                    const table = make('table');
                    const body = make('tbody');
                    table.append(body);
                    for (let i = 0; i < r; i++) {
                        const tr = make('tr');
                        for (let j = 0; j < c; j++) {
                            const td = make(i === 0 ? 'th' : 'td');
                            td.append(make('br'));
                            tr.append(td);
                        }
                        body.append(tr);
                    }
                    closePanel();
                    command('insertHTML', table.outerHTML + '<p><br></p>');
                });
                panelAction('Отмена', () => {
                    closePanel();
                    restore();
                });
                rows.focus();
            }),
        insert,
    );
    tableButton.setAttribute('aria-expanded', 'false');
    const tables = group('Изменение таблицы');
    const tableAction = (action) => {
        const cell = selectedCell();
        if (!cell) return;
        const original = cell.closest('table'),
            table = original.cloneNode(true),
            row = cell.parentElement.rowIndex,
            column = cell.cellIndex;
        if (action === 'delete') {
            range = document.createRange();
            range.selectNode(original);
            closePanel();
            command('insertHTML', '<p><br></p>');
            return;
        }
        if (
            Array.from(table.querySelectorAll('td,th')).some((c) => c.colSpan > 1 || c.rowSpan > 1)
        ) {
            status.textContent =
                'Для изменения структуры используйте таблицу без объединённых ячеек.';
            return;
        }
        const width = Math.max(...Array.from(table.rows, (tr) => tr.cells.length));
        if (
            (action === 'row' && table.rows.length >= 100) ||
            (action === 'column' && width >= 20)
        ) {
            status.textContent = 'Достигнут предел: 100 строк или 20 столбцов.';
            return;
        }
        for (const tr of table.rows)
            while (tr.cells.length < width) {
                const td = make('td');
                td.append(make('br'));
                tr.append(td);
            }
        if (action === 'row') {
            const tr = make('tr');
            for (let j = 0; j < table.rows[row].cells.length; j++) {
                const td = make('td');
                td.append(make('br'));
                tr.append(td);
            }
            table.rows[row].after(tr);
        }
        if (action === 'column')
            for (const tr of table.rows) {
                const td = make(tr.cells[column]?.tagName === 'TH' ? 'th' : 'td');
                td.append(make('br'));
                tr.cells[column].after(td);
            }
        range = document.createRange();
        range.selectNode(original);
        closePanel();
        command(
            'insertHTML',
            action === 'delete' ? '<p><br></p>' : sanitizeBookmarkHtml(table.outerHTML),
        );
    };
    for (const [label, icon, action] of [
        ['Добавить строку таблицы', 'fa-plus', 'row'],
        ['Добавить столбец таблицы', 'fa-columns', 'column'],
        ['Удалить таблицу', 'fa-table-cells', 'delete'],
    ])
        tableButtons.push(button(label, icon, () => tableAction(action), tables));
    const history = group('История и очистка');
    button(
        'Отменить (Ctrl+Z)',
        'fa-undo',
        () => {
            closePanel();
            command('undo');
        },
        history,
    );
    button(
        'Повторить (Ctrl+Y)',
        'fa-redo',
        () => {
            closePanel();
            command('redo');
        },
        history,
    );
    button(
        'Очистить оформление',
        'fa-remove-format',
        () => {
            closePanel();
            restore();
            if (document.getSelection()?.isCollapsed) {
                range = document.createRange();
                range.selectNodeContents(editable);
                const text = bookmarkHtmlToText(editable.innerHTML);
                command(
                    'insertHTML',
                    bookmarkDescriptionHtml({ description: text }) || '<p><br></p>',
                );
            } else {
                command('removeFormat');
                command('unlink');
            }
        },
        history,
    );
    editable.addEventListener('input', () => {
        sync();
        refresh();
    });
    editable.addEventListener('paste', (event) => {
        event.preventDefault();
        remember();
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain') || '';
        const clean = html
            ? sanitizeBookmarkHtml(html)
            : bookmarkDescriptionHtml({ description: text });
        if (clean) command('insertHTML', clean);
    });
    editable.addEventListener('drop', (event) => {
        event.preventDefault();
        status.textContent =
            'Вставляйте текст через Ctrl+V, изображения добавляйте в блок скриншотов.';
    });
    editable.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
            event.preventDefault();
            event.stopPropagation();
            closePanel();
            restore();
            return;
        }
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        const commands = { b: 'bold', i: 'italic', u: 'underline' };
        if (commands[key]) {
            event.preventDefault();
            command(commands[key]);
        }
        if (key === 'k') {
            event.preventDefault();
            linkButton.click();
        }
    });
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closePanel();
            restore();
        }
    });
    document.addEventListener('selectionchange', refresh);
    plain.addEventListener('input', () => {
        if (!syncing) api.setContent({ description: plain.value });
    });
    rich.addEventListener('input', () => {
        if (!syncing) api.setContent({ descriptionHtml: rich.value, description: plain.value });
    });
    const onReset = () =>
        queueMicrotask(() => {
            if (form.isConnected)
                api.setContent({ description: plain.value, descriptionHtml: rich.value });
        });
    form.addEventListener('reset', onReset);
    const api = {
        editable,
        setContent(bookmark = {}) {
            closePanel();
            status.textContent =
                'Ctrl+B — жирный · Ctrl+I — курсив · Ctrl+U — подчёркивание · Ctrl+K — ссылка';
            editable.innerHTML = bookmarkDescriptionHtml(bookmark) || '<p><br></p>';
            range = null;
            sync(false);
            refresh();
        },
        focus() {
            editable.focus();
        },
        destroy() {
            document.removeEventListener('selectionchange', refresh);
            form.removeEventListener('reset', onReset);
            host.remove();
            rich.remove();
            plain.hidden = false;
            delete form._bookmarkEditor;
        },
    };
    form._bookmarkEditor = api;
    api.setContent({ description: plain.value });
    return api;
}
