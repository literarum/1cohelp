'use strict';

/**
 * Текстовый конвейер аналитики обращений (без внешнего ИИ):
 *  1) нормализация символов: NBSP/узкие пробелы → пробел, удаление невидимых (ZWSP, BOM, мягкий
 *     перенос), ё → е, нижний регистр;
 *  2) исправление «смешанных» слов: латинские двойники кириллицы внутри русского слова
 *     («пpивет» с латинской p, «1C» с латинской C) — иначе одно и то же слово считается дважды;
 *  3) токенизация по буквам/цифрам с сохранением дефисных терминов («6-ндфл», «1с-эдо»);
 *  4) стоп-слова (служебные части речи + вежливые формулы, не несущие темы);
 *  5) стемминг тем же стеммером, что и в общем поиске (search-normalize.js);
 *  6) рубрикатор тем, намерения и срочности — прозрачные словарные правила.
 */

import { stemWord } from './search-normalize.js';

// ---------------------------------------------------------------------------
// Символы
// ---------------------------------------------------------------------------
const INVISIBLE_RE = /[­​-‏⁠﻿]/g;
const SPACE_LIKE_RE = /[  -   　\t\v\f]/g;

/** Очистка текста для отображения и хранения (переносы строк сохраняются). */
export function cleanDisplayText(text) {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(INVISIBLE_RE, '')
        .replace(SPACE_LIKE_RE, ' ')
        .replace(/[ ]{2,}/g, ' ')
        .replace(/ +\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const LAT_TO_CYR = {
    a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
};
const CYR_RE = /[а-яё]/;
const LAT_RE = /[a-z]/;

/** Классификация письменности слова. */
export function scriptOf(word) {
    const w = String(word).toLowerCase();
    const cyr = CYR_RE.test(w);
    const lat = LAT_RE.test(w);
    if (cyr && lat) return 'mixed';
    if (cyr) return 'cyr';
    if (lat) return 'lat';
    return 'other';
}

/**
 * Исправление смешанного слова: если кириллицы больше и все латинские буквы — двойники, заменить.
 * «1c»/«1с» (номер + c) приводится к «1с».
 * @returns {{ word: string, fixed: boolean }}
 */
export function fixHomoglyphs(word) {
    const w = String(word).toLowerCase();
    if (/^\d+c$/.test(w)) return { word: w.slice(0, -1) + 'с', fixed: true };
    if (scriptOf(w) !== 'mixed') return { word: w, fixed: false };
    let cyr = 0;
    let lat = 0;
    let latAllConvertible = true;
    for (const ch of w) {
        if (CYR_RE.test(ch)) cyr++;
        else if (LAT_RE.test(ch)) {
            lat++;
            if (!LAT_TO_CYR[ch]) latAllConvertible = false;
        }
    }
    if (cyr >= lat && latAllConvertible) {
        let out = '';
        for (const ch of w) out += LAT_TO_CYR[ch] || ch;
        return { word: out, fixed: true };
    }
    return { word: w, fixed: false };
}

/** Нормализация для анализа: нижний регистр, ё→е, без невидимых символов. */
export function normalizeForAnalysis(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(INVISIBLE_RE, '')
        .replace(SPACE_LIKE_RE, ' ')
        .replace(/ё/g, 'е');
}

// ---------------------------------------------------------------------------
// Стоп-слова
// ---------------------------------------------------------------------------
export const STOPWORDS = new Set(
    `а без более бы был была были было быть в вам вас весь во вот все всего всех вы где да даже для до
    его ее ей ему если есть еще же за здесь и из или им их к как ко когда кто ли либо мне может мы на
    над надо наш не него нее нет ни них но ну о об однако он она они оно от очень по под при с со так
    также такой там те тем то того тоже той только том ты у уже хотя чего чей чем что чтобы чье чья эта
    эти это этого этой этом эту я мой моя мое мои свой своя свое свои себя себе сам сама само сами
    который которая которое которые которого которой котором бывает будет будут было сейчас тогда
    потом теперь тут вообще просто именно лишь ведь вроде типа значит например кстати сразу снова
    опять ещё всё уж ж ль нам нами ими ею им ним нему нею мной мною тобой тебе тебя меня один одна
    одно два три раз два-три пожалуйста спасибо здравствуйте добрый день доброе утро вечер приветствую
    благодарю уважаемые уважаемый подскажите скажите помогите прошу просьба вопрос вопросы вопросу
    клиент клиента клиенту клиентом звонит звонок обратился обратилась обращается интересует интересуют
    хотел хотела хотят хочет хочу нужно нужна нужен нужны можно` .split(/\s+/).filter(Boolean),
);

// ---------------------------------------------------------------------------
// Токенизация
// ---------------------------------------------------------------------------
const TOKEN_RE = /[\p{L}\d]+(?:[-–][\p{L}\d]+)*/gu;

// Стемминг дорогой, а словарь базы обращений мал (тысячи слов на десятки тысяч записей) — кэшируем.
const stemMemo = new Map();
function stemCached(word) {
    let st = stemMemo.get(word);
    if (st === undefined) {
        if (stemMemo.size > 200000) stemMemo.clear();
        st = word.includes('-') ? word.split('-').map((p) => stemWord(p) || p).join('-') : stemWord(word) || word;
        stemMemo.set(word, st);
    }
    return st;
}

/**
 * @typedef {{ surface: string, norm: string, stem: string, start: number, end: number,
 *   stop: boolean, script: string, homoglyph: boolean, numeric: boolean }} Token
 */

/**
 * Полная токенизация с позициями (для «рентгена» записи и подсветки).
 * @param {string} text
 * @returns {Token[]}
 */
export function tokenizeDetailed(text) {
    const src = String(text ?? '');
    const out = [];
    for (const m of src.matchAll(TOKEN_RE)) {
        const surface = m[0];
        const lower = normalizeForAnalysis(surface).replace(/–/g, '-');
        const script = scriptOf(lower);
        const { word, fixed } = fixHomoglyphs(lower);
        const numeric = /^\d+$/.test(word);
        const stop = STOPWORDS.has(word);
        const stem = numeric || stop ? word : stemCached(word);
        out.push({
            surface,
            norm: word,
            stem,
            start: m.index,
            end: m.index + surface.length,
            stop,
            script,
            homoglyph: fixed && script === 'mixed',
            numeric,
        });
    }
    return out;
}

/**
 * Значимые токены (для тем и статистики): без стоп-слов, без чистых чисел, длина ≥ 2.
 * @param {string} text
 * @returns {Array<{ stem: string, norm: string }>}
 */
export function contentTokens(text) {
    const out = [];
    for (const t of tokenizeDetailed(text)) {
        if (t.stop || t.numeric) continue;
        if (t.norm.length < 2 && !/\d/.test(t.norm)) continue;
        out.push({ stem: t.stem, norm: t.norm });
    }
    return out;
}

/**
 * Шинглы из стеммов для MinHash (биграммы слов; для очень коротких текстов — униграммы).
 * @param {string[]} stems
 */
export function wordShingles(stems, k = 2) {
    if (stems.length < k) return stems.slice();
    const out = [];
    for (let i = 0; i + k <= stems.length; i++) out.push(stems.slice(i, i + k).join(' '));
    return out;
}

// ---------------------------------------------------------------------------
// Рубрикатор тем, намерений, срочности
// ---------------------------------------------------------------------------
const B = '(?<![\\p{L}\\d])';
/**
 * Правило: `re` — для поиска/подсветки (граница слова через ретроспективу),
 * `ry` — та же альтернатива в sticky-режиме: проверяется только с начал слов (в разы быстрее).
 */
const rx = (alts) => {
    const re = new RegExp(`${B}(?:${alts})`, 'u');
    re.ry = new RegExp(`(?:${alts})`, 'uy');
    return re;
};

const WORD_CHAR_RE = /[\p{L}\d]/u;
/** Позиции начала слов (буква/цифра после не-буквы). */
function wordStarts(t) {
    const out = [];
    let prevWord = false;
    for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        const isWord =
            (c >= 0x430 && c <= 0x44f) || c === 0x451 || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) ||
            (c > 0x7f && !(c >= 0x430 && c <= 0x44f) && WORD_CHAR_RE.test(t[i]));
        if (isWord && !prevWord) out.push(i);
        prevWord = isWord;
    }
    return out;
}

function matchAtStarts(t, starts, re) {
    const y = re.ry;
    for (let k = 0; k < starts.length; k++) {
        y.lastIndex = starts[k];
        if (y.test(t)) return true;
    }
    return false;
}

/** Темы обращений (одна запись может относиться к нескольким). */
export const TOPICS = [
    { id: 'sign', label: 'Электронная подпись и сертификаты', re: rx('эцп|кэп|нэп|эп(?![\\p{L}])|подпис|сертификат|криптопро|крипто про|csp|токен|рутокен|rutoken|jacarta|джакарт|контейнер|закрыт\\p{L}* ключ|носител|уц(?![\\p{L}])|удостоверяющ') },
    { id: 'mchd', label: 'МЧД и доверенности', re: rx('мчд|доверенност|полномочи|уполномоч') },
    { id: 'send', label: 'Отправка, квитанции, статусы', re: rx('отправ|квитанц|протокол|статус|принят|отклон|флк|доставл|отказ в при|не дош|не пришл') },
    { id: 'fns', label: 'ФНС, налоги, декларации', re: rx('фнс|ифнс|налогов|налог|ндс|ндфл|усн|енп|енс|декларац|рсв|уведомлен\\p{L}* об исчисл|патент') },
    { id: 'sfr', label: 'СФР (ПФР, ФСС)', re: rx('сфр|пфр|фсс|соцфонд|социальн\\p{L}* фонд|ефс|сзв|больничн|элн|пенсион') },
    { id: 'stat', label: 'Росстат и статистика', re: rx('росстат|статистик|стат(?:\\.|\\s)?отч|п-1|п-4|1-предприят') },
    { id: 'edo', label: 'ЭДО и документооборот', re: rx('эдо|документооборот|счет-фактур|счета-фактур|упд|контрагент|роуминг|диадок|сбис|входящ\\p{L}* документ') },
    { id: '1c', label: '1С: программа, база, обновления', re: rx('1с|1c|конфигурац|бухгалтери|зуп|релиз|платформ|информационн\\p{L}* баз|обновлен|обновит|переустанов') },
    { id: 'billing', label: 'Подключение, тариф, оплата', re: rx('подключ|регистрац|заявлен|тариф|лицензи|продлен|продлит|оплат|счет на оплат|стоимост|договор|абонент|купить|покупк') },
    { id: 'access', label: 'Вход, пароль, доступ', re: rx('парол|логин|вход(?!ящ)|авториз|учетн\\p{L}* запис|личн\\p{L}* кабинет|заблокир|доступ') },
    { id: 'requisites', label: 'Реквизиты и изменение данных', re: rx('реквизит|смен\\p{L}* (?:директор|руководит|адрес|кпп|наименован)|изменени\\p{L}* (?:данных|реквизит|адрес)|переезд|кпп') },
    { id: 'claims', label: 'Требования, письма, сверки', re: rx('требовани|письм|сверк|акт сверки|пояснени|вызов в налог|запрос из|ответ на требован') },
    { id: 'errors', label: 'Ошибки и сбои', re: rx('ошибк|сбой|не работа|не открыва|не запуска|завис|не отправля|не удает|не удалось|не получает|не видит|не загружа|вылета|проблем|некорректн') },
    { id: 'other_gov', label: 'Прочие ведомства (РПН, ФТС, ЦБ…)', re: rx('росприроднадзор|рпн|фтс|таможн|цб(?![\\p{L}])|банк росси|росалкоголь|фсрар|егаис|минюст|ркн|роскомнадзор') },
];

/** Намерения: первое совпадение по приоритету. */
export const INTENTS = [
    { id: 'complaint', label: 'Жалоба / претензия', re: rx('жалоб|претензи|недовол|возмущ|безобрази|верните деньги|возврат денег') },
    { id: 'problem', label: 'Проблема / ошибка', re: rx('ошибк|сбой|не работа|не открыва|не запуска|завис|не удает|не удалось|не получает|не видит|не загружа|вылета|не отправля|не прош') },
    { id: 'status', label: 'Статус / проверка', re: rx('статус|прошел ли|прошла ли|принят ли|принята ли|дошл|дошел|когда будет|когда придет|почему не (?:принят|пришл)|проверить') },
    { id: 'billing', label: 'Оплата / покупка / продление', re: rx('оплат|купить|счет(?![\\p{L}]*-фактур)|стоимост|сколько стоит|цена|продлить|продлен|тариф') },
    { id: 'change', label: 'Изменение / настройка', re: rx('сменить|изменить|поменять|добавить|удалить|настроить|настройк|установить|установк|перенести|подключить') },
    { id: 'howto', label: 'Как сделать (инструкция)', re: rx('как(?![\\p{L}])|каким образом|где (?:найти|посмотреть|взять|скачать)|инструкц|порядок|подскажите') },
    { id: 'consult', label: 'Консультация (методология)', re: rx('можно ли|нужно ли|надо ли|обязан|должен ли|срок|штраф|правомерн|законн') },
];

const URGENCY_RE = rx('срочно|немедленно|сегодня|горит|последний день|срок истека|истекает|штраф|блокировк|заблокир|как можно скорее|asap|очень нужно|не могу сдать|не можем сдать');
const NEGATIVE_RE = rx('ужас|кошмар|безобрази|отвратит|надоел|сколько можно|невозможно|бесполезн|не помог|разочаров|плох|хуже|жалоб|претензи|возмущ|недовол');
const POLITE_RE = rx('пожалуйста|спасибо|благодар|будьте добры|здравствуйте|добрый день|добрый вечер|доброе утро');

/**
 * Рубрикация одного текста.
 * @param {string} text
 */
export function classifyText(text) {
    const t = normalizeForAnalysis(text);
    const starts = wordStarts(t);
    const topics = [];
    for (const tp of TOPICS) if (matchAtStarts(t, starts, tp.re)) topics.push(tp.id);
    let intent = 'other';
    for (const it of INTENTS) {
        if (matchAtStarts(t, starts, it.re)) {
            intent = it.id;
            break;
        }
    }
    const raw = String(text ?? '');
    const letters = raw.match(/\p{L}/gu) || [];
    const upper = raw.match(/\p{Lu}/gu) || [];
    const capsRatio = letters.length >= 12 ? upper.length / letters.length : 0;
    const exclam = (raw.match(/!/g) || []).length;
    const questionMarks = (raw.match(/\?/g) || []).length;
    let urgency = 0;
    if (matchAtStarts(t, starts, URGENCY_RE)) urgency += 2;
    if (exclam >= 2) urgency += 1;
    if (capsRatio > 0.6) urgency += 1;
    let negativity = 0;
    if (matchAtStarts(t, starts, NEGATIVE_RE)) negativity += 2;
    if (exclam >= 3) negativity += 1;
    return {
        topics,
        intent,
        urgency,
        negativity,
        polite: matchAtStarts(t, starts, POLITE_RE),
        capsRatio,
        exclam,
        questionMarks,
    };
}

export const TOPIC_LABELS = Object.fromEntries(TOPICS.map((t) => [t.id, t.label]));
export const INTENT_LABELS = { ...Object.fromEntries(INTENTS.map((t) => [t.id, t.label])), other: 'Прочее / не определено' };

/** Предложения (для статистики длины). */
export function splitSentences(text) {
    return String(text ?? '')
        .split(/(?<=[.!?…])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => /\p{L}/u.test(s));
}
