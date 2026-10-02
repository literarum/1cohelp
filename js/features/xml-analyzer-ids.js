'use strict';

/**
 * Валидаторы российских реквизитов и эвристика «Ключевые реквизиты» для любого XML.
 */

const digitsOnly = (s) => String(s ?? '').replace(/[\s-]/g, '');

/** ИНН: 10 (юрлицо) или 12 (физлицо/ИП) цифр с контрольными суммами. */
export function validateInn(value) {
    const s = String(value ?? '').trim();
    if (!/^\d+$/.test(s)) return { ok: false, reason: 'ИНН должен состоять только из цифр' };
    if (s.length !== 10 && s.length !== 12) {
        return { ok: false, reason: `неверная длина ${s.length} (нужно 10 или 12 цифр)` };
    }
    const d = s.split('').map(Number);
    const calc = (w) => {
        let sum = 0;
        for (let i = 0; i < w.length; i++) sum += w[i] * d[i];
        return (sum % 11) % 10;
    };
    if (s.length === 10) {
        const ok = calc([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
        return ok
            ? { ok: true, kind: 'юридическое лицо' }
            : { ok: false, reason: 'не сходится контрольная сумма' };
    }
    const ok11 = calc([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10];
    const ok12 = calc([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
    return ok11 && ok12
        ? { ok: true, kind: 'физическое лицо / ИП' }
        : { ok: false, reason: 'не сходится контрольная сумма' };
}

/** СНИЛС: 11 цифр, допускаются разделители. */
export function validateSnils(value) {
    const raw = String(value ?? '').trim();
    if (!/^[\d\s-]+$/.test(raw)) return { ok: false, reason: 'СНИЛС содержит недопустимые символы' };
    const s = digitsOnly(raw);
    if (s.length !== 11) return { ok: false, reason: `неверная длина ${s.length} (нужно 11 цифр)` };
    const num = parseInt(s.slice(0, 9), 10);
    if (num <= 1001998) {
        return { ok: true, note: 'номер не выше 001-001-998: контрольное число не проверяется' };
    }
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(s[i]) * (9 - i);
    let ctrl = sum < 100 ? sum : sum === 100 || sum === 101 ? 0 : sum % 101;
    if (ctrl === 100 || ctrl === 101) ctrl = 0;
    return ctrl === parseInt(s.slice(9), 10)
        ? { ok: true }
        : { ok: false, reason: 'не сходится контрольное число' };
}

/** ОГРН (13) / ОГРНИП (15). */
export function validateOgrn(value) {
    const s = String(value ?? '').trim();
    if (!/^\d+$/.test(s)) return { ok: false, reason: 'ОГРН должен состоять только из цифр' };
    if (s.length !== 13 && s.length !== 15) {
        return { ok: false, reason: `неверная длина ${s.length} (нужно 13 или 15 цифр)` };
    }
    const mod = s.length === 13 ? 11n : 13n;
    const check = Number(BigInt(s.slice(0, -1)) % mod) % 10;
    return check === Number(s[s.length - 1])
        ? { ok: true, kind: s.length === 13 ? 'ОГРН' : 'ОГРНИП' }
        : { ok: false, reason: 'не сходится контрольная цифра' };
}

/** КПП: NNNNPPXXX, где PP — цифры или заглавные латинские буквы. */
export function validateKpp(value) {
    const s = String(value ?? '').trim();
    if (s.length !== 9) return { ok: false, reason: `неверная длина ${s.length} (нужно 9 знаков)` };
    return /^\d{4}[0-9A-Z]{2}\d{3}$/.test(s)
        ? { ok: true }
        : { ok: false, reason: 'неверный формат (ожидается NNNNPPXXX)' };
}

/** БИК: 9 цифр, начинается с 04. */
export function validateBik(value) {
    const s = String(value ?? '').trim();
    if (!/^\d{9}$/.test(s)) return { ok: false, reason: 'БИК — ровно 9 цифр' };
    return s.startsWith('04')
        ? { ok: true }
        : { ok: false, reason: 'БИК российского банка начинается с 04' };
}

/**
 * Расчётный/корреспондентский счёт: 20 цифр; при известном БИК проверяется ключ.
 * @param {string} value
 * @param {string|null} bik
 * @param {boolean} isCorr - корреспондентский счёт (другой алгоритм)
 */
export function validateAccount(value, bik = null, isCorr = false) {
    const s = String(value ?? '').trim();
    if (!/^\d{20}$/.test(s)) return { ok: false, reason: 'счёт — ровно 20 цифр' };
    if (!bik || !/^\d{9}$/.test(bik)) return { ok: true, note: 'формат верный, ключ не проверялся (нет БИК)' };
    const prefix = isCorr ? '0' + bik.slice(4, 6) : bik.slice(6, 9);
    const str = prefix + s;
    const w = [7, 1, 3];
    let sum = 0;
    for (let i = 0; i < 23; i++) sum += (Number(str[i]) * w[i % 3]) % 10;
    return sum % 10 === 0
        ? { ok: true, note: `ключ сошёлся по БИК ${bik}` }
        : { ok: false, reason: `ключ счёта не сходится (проверено по БИК ${bik})` };
}

/** ОКТМО: 8 или 11 цифр. */
export function validateOktmo(value) {
    const s = String(value ?? '').trim();
    return /^\d{8}(\d{3})?$/.test(s)
        ? { ok: true }
        : { ok: false, reason: 'ОКТМО — 8 или 11 цифр' };
}

/** КБК: 20 знаков (цифры, допускаются буквы в 18–20 позиции у части кодов). */
export function validateKbk(value) {
    const s = String(value ?? '').trim();
    return /^[0-9A-Z]{20}$/.test(s) ? { ok: true } : { ok: false, reason: 'КБК — 20 знаков' };
}

export function validateEmail(value) {
    return /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(String(value ?? '').trim())
        ? { ok: true }
        : { ok: false, reason: 'неверный формат адреса' };
}

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function validateGuid(value) {
    return GUID_RE.test(String(value ?? '').trim())
        ? { ok: true }
        : { ok: false, reason: 'неверный формат GUID' };
}

/**
 * Разбор даты в форматах YYYY-MM-DD[Thh:mm:ss…], DD.MM.YYYY[ hh:mm[:ss]], YYYYMMDD.
 * @returns {{ok:boolean, date?:Date, reason?:string}}
 */
export function parseDateValue(value) {
    const s = String(value ?? '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    let y;
    let mo;
    let d;
    let hh = 0;
    let mi = 0;
    let ss = 0;
    if (m) {
        [y, mo, d] = [+m[1], +m[2], +m[3]];
        hh = +(m[4] || 0);
        mi = +(m[5] || 0);
        ss = +(m[6] || 0);
    } else if ((m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/))) {
        [d, mo, y] = [+m[1], +m[2], +m[3]];
        hh = +(m[4] || 0);
        mi = +(m[5] || 0);
        ss = +(m[6] || 0);
    } else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
        [y, mo, d] = [+m[1], +m[2], +m[3]];
    } else {
        return { ok: false, reason: 'неизвестный формат даты' };
    }
    const dt = new Date(y, mo - 1, d, hh, mi, ss);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || hh > 23 || mi > 59 || ss > 59) {
        return { ok: false, reason: 'несуществующая дата' };
    }
    return { ok: true, date: dt };
}

/** Сумма: 1234.56, 1 234,56, -5. */
export function parseAmount(value) {
    const s = String(value ?? '').trim().replace(/[\s ]/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/**
 * Таблица «имя поля → тип реквизита». Имена приводятся к нижнему регистру без разделителей.
 * Порядок важен: первые подходящие правила выигрывают.
 */
const NAME_RULES = [
    ['snils', /^(снилс|snils|страховойномер)/],
    ['inn', /^(инн|inn)(юл|фл|ип|организации|организация|страхователя|плательщика|получателя|абонента)?$/],
    ['ogrn', /^(огрн|ogrn)(ип)?$/],
    ['kpp', /^(кпп|kpp)(организации|страхователя|плательщика|получателя)?$/],
    ['bik', /^(бик|bik)(банка)?$/],
    ['corrAccount', /^(корсчет|корсчёт|корреспондентскийсчет|корреспондентскийсчёт|коррсчет|коррсчёт|корр?счет)$/],
    ['account', /^(расчсчет|расчсчёт|расчетныйсчет|расчётныйсчёт|рс|расчсч|номерсчета|номерсчёта|счет|счёт|account|bankaccount)$/],
    ['oktmo', /^(октмо|oktmo)$/],
    ['kbk', /^(кбк|kbk)$/],
    ['regNumber', /^(регномер|регномерпфр|регномерсфр|регномерфсс|регномерстрахователя|регистрационныйномер|регномерорганизации)/],
    ['email', /^(email|электроннаяпочта|адресэлпочты|адресэлектроннойпочты|почта|e-?mail)$/],
    ['guid', /^(guid|uuid|идентификатор|идентификатордокумента|идентификаторсообщения|идфайла|идфиас)$/],
    ['org', /^(полноенаименование|краткоенаименование|наименованиеорганизации|наименованиеюл|названиеабонента|наименование|organizationname|orgname)$/],
    ['phone', /^(телефон|телефонмобильный|телефоносновной|телефондополнительный|phone)$/],
];

const DATE_NAME_RE = /^(дата|date)|(дата|date|время|datetime|timestamp)$|датавремя|датаформирования|датазаполнения/;
const AMOUNT_NAME_RE = /^(сумма|итого|всего|стоимость|цена|sum|amount|total|price)|(сумма|итого|amount|total|sum)$/;

const LABELS = {
    inn: 'ИНН',
    snils: 'СНИЛС',
    ogrn: 'ОГРН / ОГРНИП',
    kpp: 'КПП',
    bik: 'БИК',
    account: 'Расчётный счёт',
    corrAccount: 'Корр. счёт',
    oktmo: 'ОКТМО',
    kbk: 'КБК',
    regNumber: 'Регистрационный номер',
    email: 'Email',
    guid: 'Идентификатор (GUID)',
    org: 'Наименование',
    phone: 'Телефон',
    date: 'Дата',
    amount: 'Сумма',
};

export const REQUISITE_LABELS = LABELS;

function normName(name) {
    const local = String(name).includes(':') ? String(name).slice(String(name).indexOf(':') + 1) : String(name);
    return local.toLowerCase().replace(/[\s_.\-]/g, '');
}

/** Тип реквизита по имени тега/атрибута или null. Результат кэшируется вызывающим. */
export function requisiteKindByName(name) {
    const n = normName(name);
    for (const [kind, re] of NAME_RULES) if (re.test(n)) return kind;
    if (DATE_NAME_RE.test(n)) return 'date';
    if (AMOUNT_NAME_RE.test(n)) return 'amount';
    return null;
}

/**
 * Проверка значения по типу. Возвращает {status:'ok'|'error'|'info', note}.
 */
export function checkRequisite(kind, value, ctx = {}) {
    const v = String(value ?? '').trim();
    const res = (r, okNote) =>
        r.ok
            ? { status: 'ok', note: r.note || okNote || '' }
            : { status: 'error', note: r.reason || 'некорректное значение' };
    switch (kind) {
        case 'inn': {
            const r = validateInn(v);
            return res(r, r.kind ? `контрольная сумма сошлась (${r.kind})` : 'контрольная сумма сошлась');
        }
        case 'snils':
            return res(validateSnils(v), 'контрольное число сошлось');
        case 'ogrn': {
            const r = validateOgrn(v);
            return res(r, r.ok ? `контрольная цифра сошлась (${r.kind})` : '');
        }
        case 'kpp':
            return res(validateKpp(v), 'формат верный');
        case 'bik':
            return res(validateBik(v), 'формат верный');
        case 'account':
            return res(validateAccount(v, ctx.bik || null, false), 'формат верный');
        case 'corrAccount':
            return res(validateAccount(v, ctx.bik || null, true), 'формат верный');
        case 'oktmo':
            return res(validateOktmo(v), 'формат верный');
        case 'kbk':
            return res(validateKbk(v), 'формат верный');
        case 'email':
            return res(validateEmail(v), 'формат верный');
        case 'guid':
            return GUID_RE.test(v) ? { status: 'ok', note: 'формат GUID' } : { status: 'info', note: '' };
        case 'date': {
            const r = parseDateValue(v);
            return r.ok
                ? { status: 'ok', note: r.date.toLocaleDateString('ru-RU') }
                : { status: v ? 'error' : 'info', note: r.reason };
        }
        case 'amount': {
            const a = parseAmount(v);
            return a === null ? { status: 'info', note: 'не число' } : { status: 'info', note: '' };
        }
        default:
            return { status: 'info', note: '' };
    }
}

/** Значения, которые заведомо «пустые» для обязательных реквизитов. */
export function isPlaceholderValue(v) {
    const s = String(v ?? '').trim();
    if (!s) return true;
    return /^(0+|-+|н\/д|n\/a|null|none|undefined|не указан[оаы]?|отсутствует)$/i.test(s);
}
