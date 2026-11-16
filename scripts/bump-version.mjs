#!/usr/bin/env node
/**
 * Обновляет версию активов во всех местах сразу:
 *   sw.js (ASSET_QUERY_VERSION, MAIN_CSS_QUERY_VERSION, VERSION),
 *   js/constants-pwa.js (ASSET_QUERY_VERSION),
 *   index.html (?v=... у скриптов и стилей).
 *
 *   npm run bump               → версия вида 20261116-1405
 *   npm run bump -- my-label   → 20261116-my-label
 *   npm run bump -- --check    → только проверить, что версии совпадают (для CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
    sw: join(root, 'sw.js'),
    pwa: join(root, 'js/constants-pwa.js'),
    html: join(root, 'index.html'),
};

const read = (p) => readFileSync(p, 'utf8');

export function currentVersions() {
    const sw = read(files.sw);
    const pwa = read(files.pwa);
    const html = read(files.html);
    const pick = (re, s) => (s.match(re) || [])[1] || null;
    return {
        swAsset: pick(/const ASSET_QUERY_VERSION = '([^']+)'/, sw),
        swCss: pick(/const MAIN_CSS_QUERY_VERSION = '([^']+)'/, sw),
        swVersion: pick(/const VERSION = `([^`]+)`/, sw),
        pwa: pick(/export const ASSET_QUERY_VERSION = '([^']+)'/, pwa),
        html: [...new Set([...html.matchAll(/\?v=([\w.-]+)/g)].map((m) => m[1]))],
    };
}

function check() {
    const v = currentVersions();
    const all = [v.swAsset, v.swCss, v.swVersion, v.pwa, ...v.html];
    const ok = all.every((x) => x && x === v.swAsset) && v.html.length === 1;
    if (!ok) {
        console.error('Версии активов расходятся:', JSON.stringify(v, null, 2));
        process.exit(1);
    }
    console.log(`Версия активов согласована: ${v.swAsset}`);
}

function bump(label) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    const suffix = label ? label.replace(/[^\w.-]+/g, '-') : `${p(d.getHours())}${p(d.getMinutes())}`;
    const next = `${date}-${suffix}`;
    const v = currentVersions();
    let sw = read(files.sw)
        .replace(/(const ASSET_QUERY_VERSION = ')[^']+(')/, `$1${next}$2`)
        .replace(/(const MAIN_CSS_QUERY_VERSION = ')[^']+(')/, `$1${next}$2`)
        .replace(/(const VERSION = `)[^`]+(`)/, `$1${next}$2`);
    writeFileSync(files.sw, sw);
    writeFileSync(
        files.pwa,
        read(files.pwa).replace(/(export const ASSET_QUERY_VERSION = ')[^']+(')/, `$1${next}$2`),
    );
    let html = read(files.html);
    for (const old of v.html) html = html.split(`?v=${old}`).join(`?v=${next}`);
    writeFileSync(files.html, html);
    console.log(`Версия активов: ${v.swAsset} → ${next}`);
}

const args = process.argv.slice(2);
if (args.includes('--check')) check();
else bump(args.find((a) => !a.startsWith('-')));
