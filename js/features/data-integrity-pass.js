'use strict';

/**
 * Второй контур проверки данных (дублирующий watchdog): ссылки, вложения PDF,
 * сироты в IndexedDB, согласованность count/getAll.
 * Профили: fast — периодический лёгкий прогон; full — полный (ручная диагностика).
 */

import { normalizeExternalHttpUrl } from '../utils/html.js';

const PREFIX = 'Целостность данных';

/** @typedef {'info'|'warn'|'error'} IntegrityLevel */

/**
 * @param {string} part
 * @returns {string}
 */
function T(part) {
    return `${PREFIX} / ${part}`;
}

/**
 * @param {unknown} algoContainer
 * @returns {Set<string>}
 */
export function collectAlgorithmIdsFromAlgorithmsStore(algoContainer) {
    const ids = new Set();
    if (!algoContainer?.data || typeof algoContainer.data !== 'object') {
        return ids;
    }
    const d = algoContainer.data;
    if (d.main && typeof d.main === 'object' && d.main.id != null) {
        ids.add(String(d.main.id));
    }
    for (const [key, val] of Object.entries(d)) {
        if (key === 'main') continue;
        if (!Array.isArray(val)) continue;
        for (const algo of val) {
            if (algo && typeof algo === 'object' && algo.id != null) {
                ids.add(String(algo.id));
            }
        }
    }
    return ids;
}

/**
 * @param {string} raw
 * @returns {boolean} true если похоже на http(s)-URL и он нормализуется
 */
export function isPlausibleHttpUrl(raw) {
    if (typeof raw !== 'string') return false;
    const t = raw.trim();
    if (!t) return true;
    const lower = t.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:')) return false;
    if (!/^https?:\/\//i.test(t) && !t.includes('://')) {
        const n = normalizeExternalHttpUrl(t);
        return Boolean(n);
    }
    const n = normalizeExternalHttpUrl(t);
    return Boolean(n);
}

/**
 * @param {object} deps
 * @param {(store: string, mode: string, fn: Function) => Promise<unknown>} deps.performDBOperation
 * @param {(store: string, key: string) => Promise<unknown>} [deps.getFromIndexedDB]
 * @param {<T>(p: Promise<T>, ms: number) => Promise<T>} deps.runWithTimeout
 * @param {object} [opts]
 * @param {'fast'|'full'} [opts.profile]
 * @returns {Promise<Array<{ level: IntegrityLevel, title: string, message: string, system: string }>>}
 */
export async function runLightDataIntegrityPass(deps, opts = {}) {
    const profile = opts.profile === 'full' ? 'full' : 'fast';
    const performDBOperation = deps.performDBOperation;
    const getFromIndexedDB = deps.getFromIndexedDB;
    const runWithTimeout = deps.runWithTimeout;

    /** @type {Array<{ level: IntegrityLevel, title: string, message: string, system: string }>} */
    const out = [];
    const add = (level, title, message) => {
        out.push({ level, title, message, system: 'data_integrity' });
    };

    if (typeof performDBOperation !== 'function' || typeof runWithTimeout !== 'function') {
        add(
            'warn',
            T('Контур'),
            'performDBOperation или runWithTimeout недоступны — проверка пропущена.',
        );
        return out;
    }

    const FAST_MAX_COUNT_CHECK = 4000;
    const FAST_URL_SAMPLE = 45;
    const FAST_PDF_CAP = 200;
    const FAST_SHOT_CAP = 250;

    const timeoutMs = profile === 'full' ? 20000 : 12000;

    /**
     * Дублирующий контур: count() против числа записей getAll() в одном readonly-проходе.
     * @param {string} storeName
     * @param {string} label
     */
    const dualContourCountVsGetAll = async (storeName, label) => {
        try {
            const n = await runWithTimeout(
                performDBOperation(storeName, 'readonly', (store) => store.count()),
                timeoutMs,
            );
            const num = typeof n === 'number' ? n : 0;
            if (profile === 'fast' && num > FAST_MAX_COUNT_CHECK) {
                add(
                    'info',
                    T(`${label} (согласованность)`),
                    `Записей ${num} — полная сверка count/getAll отложена (профиль «быстрый»). Полный прогон в ручной диагностике.`,
                );
                return;
            }
            const all = await runWithTimeout(
                performDBOperation(storeName, 'readonly', (store) => store.getAll()),
                timeoutMs,
            );
            const len = Array.isArray(all) ? all.length : 0;
            if (num !== len) {
                add(
                    'error',
                    T(`${label} (согласованность)`),
                    `Несоответствие: count()=${num}, getAll().length=${len}. Возможна порча транзакции или гонка — перезагрузите страницу и при повторе сделайте резервную копию.`,
                );
            } else {
                add(
                    'info',
                    T(`${label} (согласованность)`),
                    `Дублирующий контур: count и полное чтение совпадают (${num}).`,
                );
            }
        } catch (e) {
            add('warn', T(`${label} (согласованность)`), e?.message || String(e));
        }
    };

    const storesDualFull = [
        ['bookmarks', 'Закладки'],
        ['links', 'Ссылки 1С'],
        ['extLinks', 'Внешние ссылки'],
        ['favorites', 'Избранное'],
        ['pdfFiles', 'PDF'],
        ['screenshots', 'Скриншоты'],
        ['trainingProgress', 'Обучение — прогресс'],
        ['trainingSrsCards', 'Обучение — SRS'],
        ['trainingWeakSpots', 'Обучение — слабые места'],
        ['trainingUserCurriculum', 'Обучение — пользовательские модули'],
        ['trainingBuiltinCurriculum', 'Обучение — переопределения встроенных треков'],
        ['mentorQuizPackages', 'Обучение — квиз-пакеты наставника'],
    ];
    const storesDualFast = [
        ['favorites', 'Избранное'],
        ['pdfFiles', 'PDF'],
        ['screenshots', 'Скриншоты'],
        ['trainingProgress', 'Обучение — прогресс'],
        ['trainingUserCurriculum', 'Обучение — пользовательские модули'],
        ['trainingBuiltinCurriculum', 'Обучение — переопределения встроенных треков'],
        ['mentorQuizPackages', 'Обучение — квиз-пакеты наставника'],
    ];
    const storesToDualCheck = profile === 'full' ? storesDualFull : storesDualFast;

    for (const [sn, lab] of storesToDualCheck) {
        await dualContourCountVsGetAll(sn, lab);
    }

    /** Загрузка справочников для ссылок по FK */
    let algoContainer = null;
    try {
        if (typeof getFromIndexedDB === 'function') {
            algoContainer = await runWithTimeout(getFromIndexedDB('algorithms', 'all'), timeoutMs);
        }
    } catch {
        algoContainer = null;
    }
    const algorithmIds = collectAlgorithmIdsFromAlgorithmsStore(algoContainer);
    const hasMainAlgo = Boolean(
        algoContainer?.data?.main && typeof algoContainer.data.main === 'object',
    );

    let bookmarks = [];
    let links = [];
    let extLinks = [];
    let reglaments = [];
    let favorites = [];
    let pdfs = [];
    let shots = [];

    try {
        bookmarks =
            (await runWithTimeout(
                performDBOperation('bookmarks', 'readonly', (s) => s.getAll()),
                timeoutMs,
            )) || [];
    } catch (e) {
        add('warn', T('Закладки'), `Чтение: ${e?.message || e}`);
    }
    try {
        links =
            (await runWithTimeout(
                performDBOperation('links', 'readonly', (s) => s.getAll()),
                timeoutMs,
            )) || [];
    } catch (e) {
        add('warn', T('Ссылки 1С'), `Чтение: ${e?.message || e}`);
    }
    try {
        extLinks =
            (await runWithTimeout(
                performDBOperation('extLinks', 'readonly', (s) => s.getAll()),
                timeoutMs,
            )) || [];
    } catch (e) {
        add('warn', T('Внешние ссылки'), `Чтение: ${e?.message || e}`);
    }
    try {
        reglaments =
            (await runWithTimeout(
                performDBOperation('reglaments', 'readonly', (s) => s.getAll()),
                timeoutMs,
            )) || [];
    } catch (e) {
        add('warn', T('Регламенты'), `Чтение: ${e?.message || e}`);
    }
    try {
        favorites =
            (await runWithTimeout(
                performDBOperation('favorites', 'readonly', (s) => s.getAll()),
                timeoutMs,
            )) || [];
    } catch (e) {
        add('warn', T('Избранное'), `Чтение: ${e?.message || e}`);
    }
    try {
        pdfs =
            (await runWithTimeout(
                performDBOperation('pdfFiles', 'readonly', (s) => s.getAll()),
                timeoutMs,
            )) || [];
    } catch (e) {
        add('warn', T('PDF'), `Чтение: ${e?.message || e}`);
    }
    try {
        shots =
            (await runWithTimeout(
                performDBOperation('screenshots', 'readonly', (s) => s.getAll()),
                timeoutMs,
            )) || [];
    } catch (e) {
        add('warn', T('Скриншоты'), `Чтение: ${e?.message || e}`);
    }

    const bookmarkIds = new Set();
    for (const b of bookmarks) {
        if (b && b.id != null) bookmarkIds.add(String(b.id));
    }
    const linkIds = new Set();
    for (const l of links) {
        if (l && l.id != null) linkIds.add(String(l.id));
    }
    const extLinkIds = new Set();
    for (const x of extLinks) {
        if (x && x.id != null) extLinkIds.add(String(x.id));
    }
    const reglamentIds = new Set();
    for (const r of reglaments) {
        if (r && r.id != null) reglamentIds.add(String(r.id));
    }

    /** HTTP-ссылки в закладках / внешних ссылках */
    const auditHttpList = (rows, getUrl, label, sampleLimit) => {
        const list = Array.isArray(rows) ? rows : [];
        const use = profile === 'full' ? list : list.slice(0, sampleLimit);
        let bad = 0;
        const samples = [];
        for (const row of use) {
            const u = getUrl(row);
            if (typeof u !== 'string' || !u.trim()) continue;
            if (!isPlausibleHttpUrl(u)) {
                bad++;
                if (samples.length < 5) samples.push(String(row?.id ?? '?'));
            }
        }
        if (bad > 0) {
            add(
                'warn',
                T(`${label} (URL)`),
                `Некорректные или небезопасные URL: ${bad}${
                    profile === 'fast' && list.length > use.length
                        ? ` (проверена выборка из ${use.length})`
                        : ''
                }. Примеры id: ${samples.join(', ')}.`,
            );
        } else {
            add(
                'info',
                T(`${label} (URL)`),
                profile === 'fast' && list.length > use.length
                    ? `Проверена выборка ${use.length} из ${list.length} — подозрительных http(s) нет.`
                    : `Проверено ${use.length} записей с непустым URL — подозрительных http(s) нет.`,
            );
        }
    };

    auditHttpList(
        bookmarks,
        (b) => b?.url,
        'Закладки',
        profile === 'full' ? bookmarks.length : FAST_URL_SAMPLE,
    );
    auditHttpList(
        extLinks,
        (x) => x?.url,
        'Внешние ссылки',
        profile === 'full' ? extLinks.length : FAST_URL_SAMPLE,
    );

    /** Ссылки 1С: непустое поле link */
    let emptyCib = 0;
    for (const l of links) {
        if (!l || typeof l !== 'object') {
            emptyCib++;
            continue;
        }
        if (typeof l.link !== 'string' || !l.link.trim()) emptyCib++;
    }
    if (emptyCib > 0) {
        add(
            'warn',
            T('Ссылки 1С (поле link)'),
            `Записей с пустым или некорректным link: ${emptyCib}.`,
        );
    } else {
        add(
            'info',
            T('Ссылки 1С (поле link)'),
            `Проверено ${links.length} записей — поле link заполнено.`,
        );
    }

    /** Избранное: сироты */
    const orphanFav = [];
    const unknownFavTypes = [];
    for (const fav of favorites) {
        if (!fav || typeof fav !== 'object') {
            orphanFav.push('(невалидная запись)');
            continue;
        }
        const type = fav.itemType;
        const oid = fav.originalItemId != null ? String(fav.originalItemId) : '';
        let ok = true;
        switch (type) {
            case 'mainAlgorithm':
                ok = hasMainAlgo;
                break;
            case 'algorithm':
                ok = algorithmIds.has(oid);
                break;
            case 'bookmark':
            case 'bookmark_note':
                ok = bookmarkIds.has(oid);
                break;
            case 'link':
                ok = linkIds.has(oid);
                break;
            case 'extLink':
                ok = extLinkIds.has(oid);
                break;
            case 'reglament':
                ok = reglamentIds.has(oid);
                break;
            case 'sedoTypeSection':
                ok = true;
                break;
            default:
                unknownFavTypes.push(`${String(type)}:${oid || '?'}`);
                ok = true;
        }
        if (!ok) {
            orphanFav.push(`${type}:${oid || '?'}`);
        }
    }
    if (unknownFavTypes.length > 0) {
        add(
            'warn',
            T('Избранное (неизвестные типы)'),
            `Записи с нераспознанным itemType (не проверены на сироты): ${unknownFavTypes
                .slice(0, 8)
                .join('; ')}${unknownFavTypes.length > 8 ? ' …' : ''}.`,
        );
    }
    if (orphanFav.length > 0) {
        const sample = orphanFav.slice(0, 12).join('; ');
        const more = orphanFav.length > 12 ? ` … (+${orphanFav.length - 12})` : '';
        add(
            'error',
            T('Избранное (целостность ссылок)'),
            `Записи без соответствующего объекта в БД (${orphanFav.length}): ${sample}${more}. Удалите или восстановите объект.`,
        );
    } else {
        add(
            'info',
            T('Избранное (целостность ссылок)'),
            `Проверено ${favorites.length} — все ссылки избранного указывают на существующие сущности (или допустимый тип).`,
        );
    }

    /** PDF: blob и родитель */
    const pdfList = profile === 'full' ? pdfs : pdfs.slice(0, FAST_PDF_CAP);
    let pdfBad = 0;
    let pdfOrphan = 0;
    for (const p of pdfList) {
        if (!p || typeof p !== 'object') {
            pdfBad++;
            continue;
        }
        const blob = p.blob;
        if (!(blob instanceof Blob) || blob.size <= 0) pdfBad++;
        const pt = p.parentType;
        const pid = p.parentId != null ? String(p.parentId) : '';
        if (pt === 'bookmark') {
            if (!bookmarkIds.has(pid)) pdfOrphan++;
        } else if (pt === 'algorithm') {
            if (!algorithmIds.has(pid)) pdfOrphan++;
        } else if (pt) {
            pdfOrphan++;
        }
    }
    if (pdfBad > 0) {
        add(
            'error',
            T('PDF (вложения)'),
            `Записей с отсутствующим или пустым blob: ${pdfBad}${
                profile === 'fast' && pdfs.length > pdfList.length
                    ? ` (проверено ${pdfList.length} из ${pdfs.length})`
                    : ''
            }.`,
        );
    } else {
        add(
            'info',
            T('PDF (вложения)'),
            profile === 'fast' && pdfs.length > pdfList.length
                ? `Проверено ${pdfList.length} из ${pdfs.length} — blob присутствует.`
                : `Проверено ${pdfList.length} — у всех есть непустой blob.`,
        );
    }
    if (pdfOrphan > 0) {
        add(
            'warn',
            T('PDF (родительская сущность)'),
            `Вложений без существующего родителя (${pdfOrphan}). Возможны остатки после удаления — проверьте список PDF в карточках.`,
        );
    } else {
        add('info', T('PDF (родительская сущность)'), 'Родители bookmark/algorithm найдены в БД.');
    }

    /** Скриншоты */
    const shotList = profile === 'full' ? shots : shots.slice(0, FAST_SHOT_CAP);
    let shotBad = 0;
    let shotOrphan = 0;
    for (const s of shotList) {
        if (!s || typeof s !== 'object') {
            shotBad++;
            continue;
        }
        if (!(s.blob instanceof Blob) || s.blob.size <= 0) shotBad++;
        const pt = s.parentType;
        const pid = s.parentId != null ? String(s.parentId) : '';
        if (pt === 'bookmark') {
            if (!bookmarkIds.has(pid)) shotOrphan++;
        } else if (pt === 'algorithm') {
            if (!algorithmIds.has(pid)) shotOrphan++;
        } else if (pt) {
            shotOrphan++;
        }
    }
    if (shotBad > 0) {
        add(
            'warn',
            T('Скриншоты (данные)'),
            `Записей с отсутствующим или пустым изображением: ${shotBad}${
                profile === 'fast' && shots.length > shotList.length
                    ? ` (проверено ${shotList.length} из ${shots.length})`
                    : ''
            }.`,
        );
    } else {
        add(
            'info',
            T('Скриншоты (данные)'),
            profile === 'fast' && shots.length > shotList.length
                ? `Проверено ${shotList.length} из ${shots.length} — blob непустой.`
                : `Проверено ${shotList.length} — у всех есть непустой blob.`,
        );
    }
    if (shotOrphan > 0) {
        add(
            'warn',
            T('Скриншоты (родитель)'),
            `Скриншотов с отсутствующим родителем: ${shotOrphan}.`,
        );
    } else {
        add('info', T('Скриншоты (родитель)'), 'Родители algorithm/bookmark найдены в БД.');
    }

    add(
        'info',
        T('Профиль прогона'),
        profile === 'full'
            ? 'Полный контур: все доступные записи и сверки count/getAll (в пределах таймаута).'
            : 'Быстрый контур: выборки по URL/PDF/скриншотам; крупные сторы — сверка count/getAll при числе записей ниже порога.',
    );

    return out;
}
