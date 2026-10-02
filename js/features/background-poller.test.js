import { describe, expect, it } from 'vitest';
import { createBackgroundPoller } from './background-poller.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('background-poller', () => {
    it('выполняет штатные циклы по интервалу и не накладывает запросы', async () => {
        let calls = 0;
        let concurrent = 0;
        let maxConcurrent = 0;
        const p = createBackgroundPoller({
            intervalMs: 1000,
            bindEvents: false,
            task: async () => {
                calls += 1;
                concurrent += 1;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await sleep(50);
                concurrent -= 1;
            },
        });
        p.start();
        await sleep(2300);
        p.stop();
        expect(calls).toBe(2);
        expect(maxConcurrent).toBe(1);
    });

    it('trigger дедуплицируется с текущим запросом', async () => {
        let calls = 0;
        const p = createBackgroundPoller({
            intervalMs: 60000,
            bindEvents: false,
            task: async () => {
                calls += 1;
                await sleep(30);
            },
        });
        await Promise.all([p.trigger('a'), p.trigger('b')]);
        expect(calls).toBe(1);
    });

    it('офлайн: цикл пропускается без запроса', async () => {
        let calls = 0;
        let skips = 0;
        const p = createBackgroundPoller({
            intervalMs: 1000,
            bindEvents: false,
            isOnline: () => false,
            onSkip: () => (skips += 1),
            task: async () => {
                calls += 1;
            },
        });
        p.start();
        await sleep(1300);
        p.stop();
        expect(calls).toBe(0);
        expect(skips).toBe(1);
    });
});
