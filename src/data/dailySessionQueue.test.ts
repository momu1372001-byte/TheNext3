import { describe, expect, it } from 'vitest';
import type { Word } from '@/types';
import { buildAdaptiveDailyQueue, type DailyQueueCandidate } from './dailySessionQueue';
import { applySessionExercise, resolveSessionForDate, type TrackedDailySession } from './dailySessionState';

const now = '2026-10-10T12:00:00.000Z';
function word(id: string, order: number, level: Word['cefrLevel'] = 'A1'): Word {
  return {
    id, word: `word-${id}`, arabicTranslation: `ترجمة-${id}`,
    englishDefinition: `definition-${id}`, partOfSpeech: 'noun',
    cefrLevel: level, category: 'general', exampleSentence: '',
    arabicExampleTranslation: '', pronunciation: '', difficulty: 2, order,
  };
}
function candidate(id: string, extra: Partial<DailyQueueCandidate> = {}): DailyQueueCandidate {
  return { word: word(id, Number(id.replace(/\D/g, '')) || 1), ...extra };
}

describe('adaptive daily queue', () => {
  it('prioritizes recently failed and overdue reviews over new words', () => {
    const queue = buildAdaptiveDailyQueue([
      candidate('new1'),
      candidate('due1', { status: 'learning', wrongCount: 1, interval: 1440, nextReviewAt: '2026-10-09T12:00:00.000Z' }),
      candidate('failed2', { status: 'learning', wrongCount: 2, interval: 0, nextReviewAt: now }),
    ], 'A1', 5, now);

    expect(queue.items.map((item) => item.wordId)).toEqual(['due1', 'failed2', 'new1']);
    expect(queue.items[0].reason).toBe('overdue-review');
    expect(queue.items[1].reason).toBe('recently-failed');
  });

  it('returns an empty queue for an empty pool', () => {
    expect(buildAdaptiveDailyQueue([], 'A1', 10, now)).toMatchObject({
      items: [], goal: 10, estimatedMinutes: 0, reviewCount: 0, newCount: 0,
    });
  });

  it('respects the selected daily goal and does not duplicate word IDs', () => {
    const queue = buildAdaptiveDailyQueue([
      candidate('new1'), candidate('new1'), candidate('new2'), candidate('new3'),
      candidate('new4'), candidate('new5'), candidate('new6'),
    ], 'A1', 5, now);
    expect(queue.items).toHaveLength(5);
    expect(new Set(queue.items.map((item) => item.wordId)).size).toBe(5);
    expect(queue.estimatedMinutes).toBeGreaterThan(0);
  });
});

function session(): TrackedDailySession {
  const base = {
    reason: 'new-word' as const, priority: 300, difficulty: 2,
    estimatedMinutes: 2, dueAt: null, attempts: 0,
    lastAnswerCorrect: null, answeredAt: null,
  };
  return {
    date: '2026-10-10', wordIds: ['a', 'b'], completedCount: 0, done: false,
    completedExerciseIds: [], rewardClaimed: false,
    items: [
      { ...base, wordId: 'a', status: 'pending', exerciseIds: ['a:en-to-ar', 'a:ar-to-en'] },
      { ...base, wordId: 'b', status: 'pending', exerciseIds: ['b:en-to-ar'] },
    ],
  };
}

describe('daily session persistence state', () => {
  it('preserves partial progress and completes an item only after all its exercises', () => {
    const first = applySessionExercise(session(), 'a', 'a:en-to-ar', true, now);
    expect(first.completedCount).toBe(0);
    expect(first.items?.[0].attempts).toBe(1);
    const second = applySessionExercise(first, 'a', 'a:ar-to-en', false, now);
    expect(second.completedCount).toBe(1);
    expect(second.items?.[0].status).toBe('completed');
    expect(second.done).toBe(false);
  });

  it('makes repeated launches reuse the same day session and duplicate callbacks idempotent', () => {
    const existing = session();
    expect(resolveSessionForDate(existing, '2026-10-10', () => session())).toBe(existing);
    const once = applySessionExercise(existing, 'b', 'b:en-to-ar', true, now);
    const twice = applySessionExercise(once, 'b', 'b:en-to-ar', true, now);
    expect(twice).toBe(once);
    expect(twice.completedCount).toBe(1);
    expect(twice.items?.[1].attempts).toBe(1);
  });

  it('creates a fresh session when the local calendar day changes', () => {
    const existing = session();
    const nextDay = resolveSessionForDate(existing, '2026-10-11', () => ({
      ...session(), date: '2026-10-11',
    }));
    expect(nextDay).not.toBe(existing);
    expect(nextDay.date).toBe('2026-10-11');
    expect(nextDay.completedCount).toBe(0);
  });
});
