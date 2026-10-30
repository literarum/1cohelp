import { DEFAULT_SEDO_DATA } from './sedo.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const present = (value) => value !== null && value !== undefined && value !== '';
const errorItems = (value) =>
    !present(value) || value === false ? [] : Array.isArray(value) ? value : [value];
const messageLike = (value) =>
    object(value) &&
    'type' in value &&
    ['date', 'received_at', 'processed_at', 'delivered_at', 'title', 'sender_id'].some(
        (key) => key in value,
    );
const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
};
const field = (label, value) => {
    const row = node('div', 'xa-kv');
    row.append(
        node('span', 'xa-k', label),
        node('span', 'xa-v', present(value) ? value : 'Не указано'),
    );
    return row;
};

/** Retain the supplied records: a flat message does not acquire an invented cycle UID. */
export function normalizeSedoPayload(source) {
    let entries;
    if (object(source) && Array.isArray(source.docflows)) entries = source.docflows;
    else if (object(source) && Array.isArray(source.messages)) entries = [source];
    else if (
        Array.isArray(source) &&
        source.some((item) => object(item) && (Array.isArray(item.messages) || messageLike(item)))
    )
        entries = source;
    else return null;
    const summary = {
        records: entries.length,
        messages: 0,
        identifiedCycles: 0,
        processed: 0,
        received: 0,
        delivered: 0,
        statusMissing: 0,
        errors: 0,
        invalid: 0,
    };
    const types = new Map();
    const records = entries.map((raw, index) => {
        const cycle = object(raw) && Array.isArray(raw.messages);
        const messages = cycle ? raw.messages : messageLike(raw) ? [raw] : [];
        const errors = cycle ? [...errorItems(raw.errors), ...errorItems(raw.error)] : [];
        const uid = cycle ? (raw.uid ?? raw.guid ?? raw.id ?? '') : '';
        if (present(uid)) summary.identifiedCycles++;
        if (!cycle && !messages.length) summary.invalid++;
        summary.errors += errors.length;
        for (const message of messages) {
            summary.messages++;
            if (!object(message)) {
                summary.invalid++;
                continue;
            }
            for (const [key, counter] of [
                ['processed_at', 'processed'],
                ['received_at', 'received'],
                ['delivered_at', 'delivered'],
            ])
                if (present(message[key])) summary[counter]++;
            if (!present(message.status)) summary.statusMissing++;
            summary.errors += errorItems(message.errors).length + errorItems(message.error).length;
            const code = String(message.type ?? 'Не указан');
            const item = types.get(code) || {
                code,
                title: message.title || '',
                count: 0,
            };
            item.count++;
            types.set(code, item);
        }
        return { raw, index, cycle, uid, messages, errors };
    });
    return { source, records, summary, types: [...types.values()] };
}

const timestampPattern =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
/** Display server clock readings as supplied; never silently shift an unspecified timezone. */
export function formatSedoTimestamp(value) {
    if (!present(value)) return 'Не указано';
    const m = String(value).match(timestampPattern);
    return m
        ? `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]}:${m[6]}${m[7] || ''}${m[8] ? ' ' + (m[8] === 'Z' ? 'UTC' : m[8]) : ''}`
        : String(value);
}
function timestamp(value) {
    const m = String(value ?? '').match(timestampPattern);
    if (!m) return null;
    const year = Number(m[1]),
        month = Number(m[2]),
        day = Number(m[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > days[month - 1] ||
        Number(m[4]) > 23 ||
        Number(m[5]) > 59 ||
        Number(m[6]) > 59
    )
        return null;
    const ms = Date.parse(
        `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${(m[7] || '').slice(0, 4)}${m[8] || 'Z'}`,
    );
    return Number.isFinite(ms) ? { ms, zoned: !!m[8] } : null;
}
function duration(a, b) {
    const start = timestamp(a),
        end = timestamp(b);
    if (!start || !end || start.zoned !== end.zoned) return null;
    const seconds = (end.ms - start.ms) / 1000;
    if (seconds < 0) return 'Отметки идут в обратном порядке — проверьте время в источнике';
    if (seconds < 60) return `${Number(seconds.toFixed(3))} с`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)} мин ${Number((seconds % 60).toFixed(3))} с`;
    return `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`;
}

const labels = {
    id: 'Идентификатор',
    uid: 'UID цикла',
    guid: 'GUID',
    type: 'Тип сообщения',
    title: 'Заголовок',
    status: 'Статус',
    date: 'Создано',
    received_at: 'Получено',
    processed_at: 'Обработано',
    delivered_at: 'Доставлено',
    error: 'Ошибка',
    errors: 'Ошибки',
    sender_id: 'Отправитель',
    insurant: 'Страхователь',
    regnum: 'Регистрационный номер',
    description: 'Описание',
    code: 'Код',
    message: 'Сообщение',
};
export function renderStructuredValue(value, label = 'Дополнительные данные', depth = 0) {
    if (value === null || typeof value !== 'object')
        return field(
            label,
            value === null
                ? 'Не указано (null)'
                : typeof value === 'boolean'
                  ? value
                      ? 'Да'
                      : 'Нет'
                  : value,
        );
    const entries = Array.isArray(value)
        ? value.map((item, index) => [String(index + 1), item])
        : Object.entries(value);
    const details = node('details', 'xa-structured');
    details.open = depth < 1;
    details.append(
        node(
            'summary',
            '',
            `${label} · ${entries.length} ${Array.isArray(value) ? 'элементов' : 'полей'}`,
        ),
    );
    const body = node('div', 'xa-structured-body');
    details.append(body);
    let rendered = false;
    const paint = () => {
        if (rendered) return;
        rendered = true;
        if (!entries.length) {
            body.append(node('p', 'xa-sub', Array.isArray(value) ? 'Массив пуст' : 'Объект пуст'));
            return;
        }
        if (depth >= 8) {
            body.append(node('pre', 'xa-raw-json', JSON.stringify(value, null, 2)));
            return;
        }
        let offset = 0;
        const more = node('button', 'xa-btn');
        more.type = 'button';
        more.dataset.structuredMore = '';
        const append = () => {
            for (const [key, item] of entries.slice(offset, offset + 50))
                body.insertBefore(
                    renderStructuredValue(
                        item,
                        Object.hasOwn(labels, key) ? labels[key] : key,
                        depth + 1,
                    ),
                    more,
                );
            offset += 50;
            if (offset >= entries.length) more.remove();
            else more.textContent = `Показать ещё · осталось ${entries.length - offset}`;
        };
        body.append(more);
        more.addEventListener('click', append);
        append();
    };
    details.addEventListener('toggle', () => {
        if (details.open) paint();
    });
    if (depth < 2) paint();
    return details;
}

const reference = new Map();
for (const table of DEFAULT_SEDO_DATA.tables) {
    for (const item of table.items) {
        const code = String(item[table.codeField] ?? item.code ?? '');
        if (!code) continue;
        const values = reference.get(code) || [];
        (table.fields || ['code', 'name', 'in1C']).forEach((key, index) => {
            if (key !== 'code' && present(item[key]))
                values.push({
                    label: table.columns[index] || key,
                    value: String(item[key]),
                });
        });
        reference.set(code, values);
    }
}
function errorSection(errors, label) {
    if (!errors.length) return null;
    const section = node('section', 'xa-sedo-errors');
    section.append(node('h5', 'xa-det-h', label));
    errors.forEach((error, index) =>
        section.append(renderStructuredValue(error, `Ошибка ${index + 1}`)),
    );
    return section;
}
function renderMessage(message, index) {
    const section = node('article', 'xa-sedo-message');
    section.dataset.sedoMessage = '';
    if (!object(message)) {
        section.append(
            renderStructuredValue(message, `Некорректная запись сообщения ${index + 1}`),
        );
        return section;
    }
    const code = String(message.type ?? 'Не указан');
    const known = reference.get(code) || [];
    const fallback = known.find((item) =>
        /Описание|Наименование|Сообщение/.test(item.label),
    )?.value;
    const head = node('div', 'xa-sedo-message-head');
    head.append(
        node(
            'h4',
            'xa-det-title',
            `${code} · ${message.title || fallback || 'Название не указано'}`,
        ),
        node('span', 'xa-badge', present(message.status) ? message.status : 'Статус не указан'),
    );
    section.append(head);
    const meta = node('div', 'xa-stats');
    meta.append(field('Идентификатор сообщения', message.id));
    if ('sender_id' in message) meta.append(field('Отправитель из файла', message.sender_id));
    section.append(meta);
    const stages = node('div', 'xa-sedo-stages');
    for (const [key, label] of [
        ['date', 'Создано'],
        ['received_at', 'Получено'],
        ['processed_at', 'Обработано'],
        ['delivered_at', 'Доставлено'],
    ]) {
        const stage = node('div', 'xa-sedo-stage');
        stage.append(
            node('span', 'xa-k', label),
            node('span', 'xa-v', formatSedoTimestamp(message[key])),
        );
        stages.append(stage);
    }
    section.append(stages);
    const intervals = node('div', 'xa-sedo-intervals');
    for (const [from, to, label] of [
        ['date', 'received_at', 'От создания до получения'],
        ['received_at', 'processed_at', 'От получения до обработки'],
        ['processed_at', 'delivered_at', 'От обработки до доставки'],
    ]) {
        const elapsed = duration(message[from], message[to]);
        if (elapsed !== null) intervals.append(field(label, elapsed));
    }
    if (intervals.childElementCount) section.append(intervals);
    const errors = errorSection(
        [...errorItems(message.errors), ...errorItems(message.error)],
        'Ошибки сообщения',
    );
    if (errors) section.append(errors);
    if (known.length) {
        const details = node('details', 'xa-structured');
        details.append(node('summary', '', 'Расшифровка типа по справочнику приложения'));
        const body = node('div', 'xa-structured-body');
        for (const item of known) body.append(field(item.label, item.value));
        details.append(body);
        section.append(details);
    }
    const rendered = new Set([
        'type',
        'title',
        'status',
        'id',
        'sender_id',
        'date',
        'received_at',
        'processed_at',
        'delivered_at',
        'error',
        'errors',
    ]);
    const extra = Object.fromEntries(Object.entries(message).filter(([key]) => !rendered.has(key)));
    if (Object.keys(extra).length)
        section.append(renderStructuredValue(extra, 'Другие поля сообщения'));
    return section;
}
function sourceSection(data) {
    const section = node('details', 'xa-structured xa-sedo-source');
    section.append(node('summary', '', 'Исходные данные JSON'));
    const serialized = JSON.stringify(data, null, 2);
    const download = node('button', 'xa-btn', 'Скачать исходный JSON');
    download.type = 'button';
    download.addEventListener('click', () => {
        const url = URL.createObjectURL(
            new Blob([serialized], { type: 'application/json;charset=utf-8' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sfr-exchange.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    section.append(download, node('pre', 'xa-raw-json', serialized));
    return section;
}
function renderMessages(messages) {
    const list = node('div', 'xa-sedo-messages');
    const more = node('button', 'xa-btn');
    more.type = 'button';
    more.dataset.sedoMoreMessages = '';
    list.append(more);
    let offset = 0;
    const append = () => {
        messages
            .slice(offset, offset + 50)
            .forEach((message, index) =>
                list.insertBefore(renderMessage(message, offset + index), more),
            );
        offset += 50;
        if (offset >= messages.length) more.remove();
        else more.textContent = `Показать ещё сообщения · осталось ${messages.length - offset}`;
    };
    more.addEventListener('click', append);
    append();
    return list;
}
export function renderSedoSummary(data) {
    const parsed = data?.records && data?.summary ? data : normalizeSedoPayload(data);
    if (!parsed) return null;
    const section = node('section', 'xa-card xa-sedo-summary');
    const head = node('div', 'xa-card-head');
    head.append(node('h3', 'xa-card-title', 'Обмен с СФР / СЭДО'));
    section.append(head);
    const body = node('div', 'xa-card-body');
    const stats = node('div', 'xa-stats');
    const s = parsed.summary;
    for (const [label, value] of [
        ['Записей обмена', s.records],
        ['Сообщений', s.messages],
        ['Циклов с идентификатором', s.identifiedCycles],
        ['С отметкой получения', s.received],
        ['С отметкой обработки', s.processed],
        ['С отметкой доставки', s.delivered],
        ['Без указанного статуса', s.statusMissing],
        ['Записей об ошибках', s.errors],
    ])
        stats.append(field(label, value));
    if (s.invalid) stats.append(field('Записей нестандартной формы', s.invalid));
    body.append(stats);
    const types = node('div', 'xa-sedo-types');
    for (const type of parsed.types)
        types.append(field(`${type.code} · ${type.title || 'Название не указано'}`, type.count));
    body.append(types);
    body.append(
        node(
            'p',
            'xa-sub',
            'Пустая отметка доставки или статус null означают, что этих сведений в файле нет. Наличие отметки обработки само по себе не подтверждает приём документа Фондом. Время без часового пояса показано как в источнике; интервалы рассчитаны между его отметками с точностью до миллисекунд.',
        ),
    );
    section.append(body);
    return section;
}
export function renderSedoReport(data) {
    const parsed = normalizeSedoPayload(data);
    if (!parsed) return renderStructuredValue(data, 'Данные');
    const wrapper = node('div', 'xa-sedo-report');
    wrapper.append(renderSedoSummary(parsed));
    if (object(data) && Array.isArray(data.docflows)) {
        const envelope = Object.fromEntries(
            Object.entries(data).filter(([key]) => key !== 'docflows'),
        );
        if (Object.keys(envelope).length)
            wrapper.append(renderStructuredValue(envelope, 'Другие поля выгрузки'));
    }
    const records = node('div', 'xa-sedo-records');
    wrapper.append(records);
    let offset = 0;
    const more = node('button', 'xa-btn');
    more.type = 'button';
    more.dataset.sedoMore = '';
    wrapper.append(more);
    const append = () => {
        for (const record of parsed.records.slice(offset, offset + 50)) {
            const card = node('section', 'xa-card xa-sedo-record');
            const head = node('div', 'xa-card-head');
            head.append(
                node(
                    'h3',
                    'xa-card-title',
                    record.cycle
                        ? `Цикл ${record.index + 1}${present(record.uid) ? ' · ' + record.uid : ''}`
                        : `Отдельное сообщение ${record.index + 1}`,
                ),
            );
            card.append(head);
            const body = node('div', 'xa-card-body');
            if (record.cycle) {
                const meta = Object.fromEntries(
                    Object.entries(record.raw).filter(
                        ([key]) => !['messages', 'errors', 'error'].includes(key),
                    ),
                );
                if (Object.keys(meta).length)
                    body.append(renderStructuredValue(meta, 'Сведения о цикле'));
            }
            const errors = errorSection(record.errors, 'Ошибки цикла');
            if (errors) body.append(errors);
            if (record.messages.length) body.append(renderMessages(record.messages));
            else
                body.append(
                    record.cycle
                        ? node('p', 'xa-sub', 'В этом цикле сообщений нет.')
                        : renderStructuredValue(record.raw, 'Запись нестандартной формы'),
                );
            card.append(body);
            records.append(card);
        }
        offset += 50;
        if (offset >= parsed.records.length) more.remove();
        else more.textContent = `Показать ещё записи · осталось ${parsed.records.length - offset}`;
    };
    more.addEventListener('click', append);
    append();
    wrapper.append(sourceSection(data));
    return wrapper;
}
