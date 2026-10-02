import { describe, it, expect } from 'vitest';
import {
    buildReviewQueue, scheduleReview, previewIntervals, forecastDue, summarizeDeck,
    findDuplicateCard, isNewCard, countIntroducedToday, normalizeNewPerDay, formatIntervalDays,
} from './training-srs-queue.js';

const NOW = new Date(2026, 9, 2, 12, 0, 0).getTime();
const DAY = 86400000;
const card = (o) => ({ id: 1, front: 'q', back: 'a', repetitions: 0, easeFactor: 2.5, intervalDays: 1, dueAt: NOW - 1000, createdAt: '2026-01-01', ...o });

describe('training-srs-queue', () => {
    it('новая карточка определяется по отсутствию оценок', () => {
        expect(isNewCard(card({}))).toBe(true);
        expect(isNewCard(card({ repetitions: 2 }))).toBe(false);
        expect(isNewCard(card({ lastReviewedAt: NOW }))).toBe(false);
    });
    it('очередь: просроченные по приоритету, новые в пределах дневного лимита', () => {
        const cards = [
            card({ id: 1, repetitions: 3, dueAt: NOW - 5 * DAY }),
            card({ id: 2, repetitions: 3, dueAt: NOW - 1 * DAY, lapses: 4 }),
            card({ id: 3, createdAt: '2026-01-03' }),
            card({ id: 4, createdAt: '2026-01-02' }),
            card({ id: 5, createdAt: '2026-01-04' }),
            card({ id: 6, repetitions: 3, dueAt: NOW + 3 * 3600000 }),
        ];
        const q = buildReviewQueue({ cards, now: NOW, newPerDay: 2, newIntroducedToday: 0 });
        expect(q.reviews.map((c) => c.id)).toEqual([2, 1]);
        expect(q.dueReviews).toBe(2);
        expect(q.news.map((c) => c.id)).toEqual([4, 3]);
        expect(q.blockedNew).toBe(1);
        expect(q.laterToday).toBe(1);
        const q2 = buildReviewQueue({ cards, now: NOW, newPerDay: 2, newIntroducedToday: 2 });
        expect(q2.news.length).toBe(0);
    });
    it('«Заново» возвращает карточку через 10 минут, «Хорошо» — на следующие дни', () => {
        const again = scheduleReview(card({ repetitions: 3, intervalDays: 10 }), 'again', 1, NOW);
        expect(again.dueAt - NOW).toBe(10 * 60000);
        expect(again.lapses).toBe(1);
        const good = scheduleReview(card({ repetitions: 3, intervalDays: 10 }), 'good', 1, NOW);
        expect(good.dueAt).toBeGreaterThan(NOW + 5 * DAY);
        expect(good.reviewCount).toBe(1);
    });
    it('подсказки интервалов упорядочены', () => {
        const p = previewIntervals(card({ repetitions: 3, intervalDays: 10 }), 1, NOW);
        expect(p.again).toBe('<10 мин');
        expect(typeof p.good).toBe('string');
    });
    it('прогноз и сводка', () => {
        const cards = [card({ repetitions: 2, dueAt: NOW - 1 }), card({ id: 2, repetitions: 2, dueAt: NOW + DAY }), card({ id: 3 })];
        expect(forecastDue(cards, NOW, 3)[0]).toBe(1);
        expect(forecastDue(cards, NOW, 3)[1]).toBe(1);
        const s = summarizeDeck(cards, NOW);
        expect(s.total).toBe(3);
        expect(s.new).toBe(1);
    });
    it('дубликаты по источнику и по вопросу', () => {
        const ex = [card({ id: 1, sourceType: 'reglament', sourceId: 7, front: 'Что такое КЭП?' })];
        expect(findDuplicateCard(ex, { sourceType: 'reglament', sourceId: 7, front: 'другое' })).not.toBeNull();
        expect(findDuplicateCard(ex, { sourceType: 'manual', front: '  что   такое кэп? ' })).not.toBeNull();
        expect(findDuplicateCard(ex, { sourceType: 'manual', front: 'иное' })).toBeNull();
        expect(findDuplicateCard(ex, ex[0], 1)).toBeNull();
    });
    it('введено сегодня и нормализация лимита', () => {
        expect(countIntroducedToday([card({ reviewCount: 1, lastReviewedAt: NOW - 1000 }), card({ reviewCount: 1, lastReviewedAt: NOW - 3 * DAY }), card({ reviewCount: 4, lastReviewedAt: NOW })], NOW)).toBe(1);
        expect(normalizeNewPerDay('abc')).toBe(10);
        expect(normalizeNewPerDay(999)).toBe(200);
        expect(normalizeNewPerDay(-5)).toBe(0);
        expect(formatIntervalDays(45)).toBe('2 мес');
    });
});
