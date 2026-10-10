
import { describe, expect, it } from 'vitest';
import {
  normalizeReviewSchedule,
  scheduleReview,
  selectDueReviews,
} from './reviewScheduler';

const now = '2026-10-10T12:00:00.000Z';

describe('review scheduler', () => {
  it('retries immediately after Again', () => {
    const result = scheduleReview({}, 'again', now);

    expect(result.interval).toBe(0);
    expect(result.nextReviewAt).toBe(now);
    expect(result.wrongCount).toBe(1);
    expect(result.repetitions).toBe(0);
  });

  it('uses increasing initial intervals for Hard, Good and Easy', () => {
    const hard = scheduleReview({}, 'hard', now);
    const good = scheduleReview({}, 'good', now);
    const easy = scheduleReview({}, 'easy', now);

    expect(hard.interval).toBe(10);
    expect(good.interval).toBe(1440);
    expect(easy.interval).toBe(5760);

    expect(hard.interval).toBeLessThan(good.interval);
    expect(good.interval).toBeLessThan(easy.interval);
  });

  it('preserves legacy counters and fills missing fields', () => {
    const migrated = normalizeReviewSchedule({
      correctCount: 7,
      wrongCount: 3,
    });

    expect(migrated.correctCount).toBe(7);
    expect(migrated.wrongCount).toBe(3);
    expect(migrated.ease).toBe(2.5);
    expect(migrated.repetitions).toBe(0);
  });

  it('normalizes invalid values safely', () => {
    const normalized = normalizeReviewSchedule({
      ease: Number.NaN,
      interval: -10,
      lastReviewedAt: 'not-a-date',
    });

    expect(normalized.ease).toBe(2.5);
    expect(normalized.interval).toBe(0);
    expect(normalized.lastReviewedAt).toBeNull();
  });

  it('selects due reviews and orders them deterministically', () => {
    const candidates = [
      {
        wordId: 'future',
        nextReviewAt: '2026-10-11T12:00:00.000Z',
        wrongCount: 0,
        familiarity: 50,
      },
      {
        wordId: 'beta',
        nextReviewAt: '2026-10-10T11:00:00.000Z',
        wrongCount: 1,
        familiarity: 20,
      },
      {
        wordId: 'alpha',
        nextReviewAt: '2026-10-10T11:00:00.000Z',
        wrongCount: 1,
        familiarity: 20,
      },
    ];

    const result = selectDueReviews(candidates, now);

    expect(result.map((word) => word.wordId)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('handles the UTC midnight boundary consistently', () => {
    const beforeMidnight = scheduleReview(
      {},
      'good',
      '2026-10-10T23:59:00.000Z',
    );

    expect(beforeMidnight.nextReviewAt).toBe(
      '2026-10-11T23:59:00.000Z',
    );
  });

  it('does not mutate the original schedule when reviewing repeatedly', () => {
    const original = {
      repetitions: 1,
      interval: 1440,
      ease: 2.5,
      correctCount: 1,
      wrongCount: 0,
    };

    const first = scheduleReview(original, 'good', now);
    const second = scheduleReview(first, 'good', now);

    expect(original.interval).toBe(1440);
    expect(first.interval).toBe(3600);
    expect(second.interval).toBe(9000);
  });
});