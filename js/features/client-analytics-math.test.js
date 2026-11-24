'use strict';

import { describe, it, expect } from 'vitest';
import {
    describe as describeStats,
    quantileSorted,
    robustZ,
    wilson,
    gini,
    lorenz,
    hhi,
    topShare,
    entropyBits,
    normalizedEntropy,
    mannKendall,
    chiSquareUniform,
    linearRegression,
    logLikelihoodG2,
    zipfFit,
    sphericalKMeans,
    normalizeSparse,
    minhashSignature,
    minhashSimilarity,
    jaccard,
    lshCandidatePairs,
    UnionFind,
    autocorrelation,
    dispersionIndex,
    cusumChangePoint,
    normalCdf,
    histogram,
} from './client-analytics-math.js';

describe('client-analytics-math: описательная статистика', () => {
    it('квантили типа 7 совпадают с R/Excel', () => {
        const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        expect(quantileSorted(xs, 0.25)).toBeCloseTo(3.25, 10);
        expect(quantileSorted(xs, 0.5)).toBeCloseTo(5.5, 10);
        expect(quantileSorted(xs, 0.9)).toBeCloseTo(9.1, 10);
    });

    it('среднее, σ, асимметрия симметричного ряда', () => {
        const d = describeStats([2, 4, 4, 4, 5, 5, 7, 9]);
        expect(d.mean).toBe(5);
        expect(d.sd).toBeCloseTo(2.138, 3); // несмещённая
        expect(d.median).toBe(4.5);
        expect(describeStats([1, 2, 3, 4, 5]).skew).toBeCloseTo(0, 10);
    });

    it('робастный z выделяет выброс', () => {
        const z = robustZ([10, 11, 9, 10, 12, 10, 50]);
        expect(z[6]).toBeGreaterThan(3.5);
        expect(Math.abs(z[0])).toBeLessThan(1);
    });

    it('гистограмма покрывает все точки', () => {
        const xs = Array.from({ length: 200 }, (_, i) => i % 37);
        const h = histogram(xs, { integer: true });
        expect(h.bins.reduce((s, b) => s + b.count, 0)).toBe(200);
    });
});

describe('client-analytics-math: интервалы и тесты', () => {
    it('интервал Уилсона для 0 из 10 не вырождается', () => {
        const w = wilson(0, 10);
        expect(w.lo).toBe(0);
        expect(w.hi).toBeGreaterThan(0.25);
        expect(w.hi).toBeLessThan(0.32);
    });

    it('нормальная CDF', () => {
        expect(normalCdf(0)).toBeCloseTo(0.5, 6);
        expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    });

    it('Манн — Кендалл: монотонный рост значим, шум — нет', () => {
        const up = Array.from({ length: 30 }, (_, i) => i + (i % 3));
        const r = mannKendall(up);
        expect(r.trend).toBe('рост');
        expect(r.p).toBeLessThan(0.001);
        expect(r.slope).toBeGreaterThan(0.8);
        const flat = [5, 3, 6, 4, 5, 3, 6, 4, 5, 3, 6, 4, 5, 3, 6, 4];
        expect(mannKendall(flat).trend).toBe('нет');
    });

    it('χ² равномерности', () => {
        expect(chiSquareUniform([100, 100, 100, 100, 100]).p).toBeGreaterThan(0.9);
        expect(chiSquareUniform([200, 100, 100, 100, 50]).p).toBeLessThan(0.001);
    });

    it('МНК: точная прямая', () => {
        const r = linearRegression([0, 1, 2, 3], [1, 3, 5, 7]);
        expect(r.b).toBeCloseTo(2, 10);
        expect(r.a).toBeCloseTo(1, 10);
        expect(r.r2).toBeCloseTo(1, 10);
    });

    it('автокорреляция недельного цикла и индекс дисперсии', () => {
        const xs = Array.from({ length: 70 }, (_, i) => (i % 7 < 5 ? 10 : 1));
        expect(autocorrelation(xs, 7)).toBeGreaterThan(0.8);
        expect(dispersionIndex([5, 5, 5, 5])).toBe(0);
    });

    it('CUSUM находит смену уровня', () => {
        const xs = [...Array(20).fill(5), ...Array(20).fill(15)];
        const cp = cusumChangePoint(xs);
        expect(cp.index).toBe(19);
        expect(cp.significant).toBe(true);
    });
});

describe('client-analytics-math: концентрация и информация', () => {
    it('Джини: равенство 0, один владелец → (n−1)/n', () => {
        expect(gini([5, 5, 5, 5])).toBeCloseTo(0, 10);
        expect(gini([0, 0, 0, 10])).toBeCloseTo(0.75, 10);
    });

    it('кривая Лоренца от (0,0) до (1,1)', () => {
        const l = lorenz([1, 2, 3, 4], 5);
        expect(l[0]).toEqual({ x: 0, y: 0 });
        expect(l[l.length - 1].y).toBeCloseTo(1, 10);
    });

    it('HHI и доля топа', () => {
        expect(hhi([1, 1, 1, 1])).toBeCloseTo(0.25, 10);
        expect(topShare([10, 1, 1, 1, 1, 1, 1, 1, 1, 1], 0.1)).toBeCloseTo(10 / 19, 10);
    });

    it('энтропия: 4 равных исхода = 2 бита', () => {
        expect(entropyBits([1, 1, 1, 1])).toBeCloseTo(2, 10);
        expect(normalizedEntropy([1, 1, 1, 1])).toBeCloseTo(1, 10);
        expect(normalizedEntropy([10])).toBe(0);
    });

    it('G² Даннинга: знак показывает направление', () => {
        expect(logLikelihoodG2(50, 10, 1000, 1000)).toBeGreaterThan(10.83);
        expect(logLikelihoodG2(10, 50, 1000, 1000)).toBeLessThan(-10.83);
        expect(Math.abs(logLikelihoodG2(20, 20, 1000, 1000))).toBeLessThan(1e-9);
    });

    it('Ципф: идеальный закон 1/r даёт показатель 1', () => {
        const freqs = Array.from({ length: 200 }, (_, i) => 10000 / (i + 1));
        const z = zipfFit(freqs);
        expect(z.exponent).toBeCloseTo(1, 6);
        expect(z.r2).toBeCloseTo(1, 6);
    });
});

describe('client-analytics-math: векторы, MinHash, union–find', () => {
    it('k-means разделяет две очевидные группы и детерминирован', () => {
        const mk = (idx) => normalizeSparse(Int32Array.from(idx), new Float64Array(idx.length).fill(1));
        const vecs = [];
        for (let i = 0; i < 20; i++) vecs.push(mk([0, 1, 2]));
        for (let i = 0; i < 20; i++) vecs.push(mk([5, 6, 7]));
        const a = sphericalKMeans(vecs, 8, 2, { seed: 3 });
        const b = sphericalKMeans(vecs, 8, 2, { seed: 3 });
        expect(Array.from(a.assign)).toEqual(Array.from(b.assign));
        expect(new Set(Array.from(a.assign).slice(0, 20)).size).toBe(1);
        expect(a.assign[0]).not.toBe(a.assign[39]);
    });

    it('MinHash приближает Жаккара', () => {
        const A = Array.from({ length: 100 }, (_, i) => `w${i}`);
        const B = Array.from({ length: 100 }, (_, i) => `w${i + 50}`);
        const exact = jaccard(new Set(A), new Set(B)); // 50/150
        const est = minhashSimilarity(minhashSignature(A, 256), minhashSignature(B, 256));
        expect(Math.abs(est - exact)).toBeLessThan(0.1);
    });

    it('LSH находит одинаковые сигнатуры', () => {
        const s1 = minhashSignature(['a b', 'b c', 'c d'], 64);
        const s2 = minhashSignature(['a b', 'b c', 'c d'], 64);
        const s3 = minhashSignature(['x y', 'y z'], 64);
        const pairs = lshCandidatePairs([s1, s2, s3]);
        expect(pairs).toContainEqual([0, 1]);
        expect(pairs.some(([a, b]) => b === 2 || a === 2)).toBe(false);
    });

    it('union–find', () => {
        const uf = new UnionFind(5);
        uf.union(0, 1);
        uf.union(3, 4);
        uf.union(1, 4);
        expect(uf.find(0)).toBe(uf.find(3));
        expect(uf.find(2)).not.toBe(uf.find(0));
    });
});
