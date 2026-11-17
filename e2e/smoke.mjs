#!/usr/bin/env node
/**
 * Сквозные проверки в настоящем Chromium (Playwright). Запуск: npm run e2e
 * Проверяет то, что юнит-тесты не видят: запуск страницы целиком, разделы, сохранение заметок,
 * откат/сохранение оформления, контраст (axe) в тёмной и светлой теме.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './static-server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const axeSource = readFileSync(join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
const results = [];
let failed = 0;

async function check(name, fn) {
    const t0 = Date.now();
    try {
        await fn();
        results.push(`✓ ${name} (${Date.now() - t0} мс)`);
    } catch (e) {
        failed += 1;
        results.push(`✗ ${name}: ${e?.message || e}`);
    }
}
const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
};

const server = await startStaticServer(root);
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
    window.__COPILOT_TEST_FAST_OVERLAY__ = true;
    try {
        localStorage.setItem('copilot1co:onboardingAutoOffered_v1', '1');
    } catch {
        /* ignore */
    }
});
await context.route('**/script.google.com/**', (r) => r.abort());

async function openApp() {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await page.goto(base);
    await page.waitForFunction(
        () => {
            const o = document.getElementById('custom-loading-overlay');
            return !o || getComputedStyle(o).display === 'none';
        },
        null,
        { timeout: 60000 },
    );
    await page.waitForTimeout(1200);
    const later = page.locator('#appConfirmModal:not(.hidden) button', { hasText: 'Позже' });
    if (await later.count()) await later.first().click();
    // Google заблокирован в тестовой сети: закрепляется карточка «нет связи» — закрываем уведомления.
    await page.evaluate(() => window.NotificationService?.clearAll?.(false));
    await page.evaluate(() =>
        document.querySelectorAll('.app-toast .app-toast__close, .app-toast [aria-label*="Закрыть"]').forEach((b) => b.click()),
    );
    await page.waitForTimeout(300);
    return { page, errors };
}

let app = await openApp();

await check('запуск без ошибок JavaScript', async () => {
    assert(app.errors.length === 0, app.errors.join(' | '));
    assert(await app.page.locator('#appContent').isVisible(), '#appContent не виден');
});

await check('все разделы открываются без ошибок', async () => {
    const tabs = await app.page.evaluate(() =>
        Array.from(document.querySelectorAll('.tab-content')).map((e) => e.id.replace(/Content$/, '')),
    );
    assert(tabs.length >= 10, `разделов: ${tabs.length}`);
    for (const t of tabs) {
        await app.page.evaluate((n) => window.setActiveTab(n), t);
        await app.page.waitForTimeout(250);
    }
    assert(app.errors.length === 0, app.errors.join(' | '));
});

await check('заметки сохраняются и переживают перезагрузку', async () => {
    await app.page.evaluate(() => window.setActiveTab('main'));
    await app.page.fill('#clientNotes', 'E2E: ИНН 7707083893');
    await app.page.locator('#clientNotes').press('End');
    await app.page.waitForTimeout(1500);
    await app.page.close();
    app = await openApp();
    const value = await app.page.inputValue('#clientNotes');
    assert(value === 'E2E: ИНН 7707083893', `после перезагрузки: ${JSON.stringify(value)}`);
});

await check('оформление: «Отменить» откатывает, «Сохранить» сохраняет', async () => {
    const p = app.page;
    const primaryOf = (page) =>
        page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim());
    const primary = () => primaryOf(p);
    const before = await primary();
    await p.click('#customizeUIBtn');
    await p.waitForTimeout(400);
    await p.click('#openAppCustomizationModalBtn');
    await p.waitForTimeout(500);
    await p.click('[data-look="ocean"]');
    await p.waitForTimeout(300);
    assert((await primary()) !== before, 'образ не применился в предпросмотре');
    await p.click('#appCustomizationCancelBtn');
    await p.waitForTimeout(500);
    assert((await primary()) === before, 'отмена не вернула акцент');
    await p.click('[data-look="ocean"]');
    await p.waitForTimeout(300);
    await p.click('#appCustomizationSaveBtn');
    await p.waitForTimeout(800);
    const saved = await primary();
    await p.close();
    app = await openApp();
    assert((await primaryOf(app.page)) === saved, 'акцент не сохранился после перезагрузки');
    // вернуть стандартный образ для следующих проверок
    await app.page.click('#customizeUIBtn');
    await app.page.waitForTimeout(400);
    await app.page.click('#openAppCustomizationModalBtn');
    await app.page.waitForTimeout(500);
    await app.page.click('[data-look="classic"]');
    await app.page.click('#appCustomizationSaveBtn');
    await app.page.waitForTimeout(800);
    for (let i = 0; i < 2; i++) await app.page.keyboard.press('Escape');
});

for (const theme of ['dark', 'light']) {
    await check(`контраст WCAG AA (axe), тема ${theme}`, async () => {
        const p = app.page;
        await p.evaluate(async (t) => {
            const m = await import('/js/components/theme.js');
            m.setTheme(t);
        }, theme);
        await p.waitForTimeout(700);
        await p.evaluate(axeSource);
        const bad = [];
        for (const t of ['main', 'bookmarks', 'links', 'reglaments', 'clientAnalytics', 'xmlAnalyzer']) {
            await p.evaluate((n) => window.setActiveTab(n), t);
            await p.waitForTimeout(350);
            const r = await p.evaluate(async () =>
                (await window.axe.run(document.getElementById('appContent'), { runOnly: ['color-contrast'] })).violations.flatMap((v) =>
                    v.nodes.map((n) => n.target.join(' ')),
                ),
            );
            bad.push(...r.map((s) => `${t}: ${s}`));
        }
        assert(bad.length === 0, `${bad.length} нарушений: ${bad.slice(0, 5).join('; ')}`);
    });
}

await browser.close();
server.close();
console.log(results.join('\n'));
if (failed) {
    console.error(`\nE2E: провалено проверок — ${failed}`);
    process.exit(1);
}
console.log('\nE2E: все проверки пройдены');
