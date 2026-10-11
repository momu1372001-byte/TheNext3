import type { LevelCode, Word } from '@/types';

export type DailyQueueReason =
  | 'overdue-review'
  | 'due-review'
  | 'recently-failed'
  | 'weak-word'
  | 'new-word';

export type DailyQueueCandidate = {
  word: Word;
  status?: 'new' | 'learning' | 'reviewed' | string;
  learned?: boolean;
  nextReviewAt?: string | null;
  lastReviewedAt?: string | null;
  wrongCount?: number;
  correctCount?: number;
  familiarity?: number;
  interval?: number;
};

export type DailyQueueItem = {
  wordId: string;
  reason: DailyQueueReason;
  priority: number;
  difficulty: number;
  estimatedMinutes: number;
  dueAt: string | null;
};

export type DailyQueueResult = {
  items: DailyQueueItem[];
  goal: number;
  estimatedMinutes: number;
  reviewCount: number;
  newCount: number;
  weakCount: number;
};

const MINUTES_PER_WORD = 1.5;
const clampGoal = (goal: number) =>
  [5, 10, 20, 30].includes(goal) ? goal : 10;

function dateValue(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pure adaptive queue builder. It does not mutate progress or depend on storage.
 * Candidates are deduplicated by word ID before selection.
 */
export function buildAdaptiveDailyQueue(
  candidates: readonly DailyQueueCandidate[],
  level: LevelCode,
  dailyGoal: number,
  now: Date | string | number = new Date(),
): DailyQueueResult {
  const goal = clampGoal(dailyGoal);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const unique = new Map<string, DailyQueueCandidate>();

  for (const candidate of candidates) {
    const id = candidate.word?.id;
    if (!id || unique.has(id)) continue;
    unique.set(id, candidate);
  }

  const classified = [...unique.values()].map((candidate) => {
    const { word } = candidate;
    const dueMs = dateValue(candidate.nextReviewAt);
    const hasProgress = candidate.learned || candidate.status === 'learning' ||
      candidate.status === 'reviewed' || (candidate.correctCount ?? 0) > 0 ||
      (candidate.wrongCount ?? 0) > 0;
    const isDue = hasProgress && (dueMs === null || dueMs <= nowMs);
    const overdueMinutes = dueMs === null ? 0 : Math.max(0, (nowMs - dueMs) / 60_000);
    const wrongCount = Math.max(0, candidate.wrongCount ?? 0);
    const familiarity = Math.max(0, Math.min(100, candidate.familiarity ?? 0));
    let reason: DailyQueueReason;
    let priority: number;

    if (wrongCount > 0 && candidate.interval === 0) {
      reason = 'recently-failed';
      priority = 1100 + wrongCount * 20 + (100 - familiarity);
    } else if (isDue && dueMs !== null && dueMs < nowMs) {
      reason = 'overdue-review';
      priority = 1000 + Math.min(500, overdueMinutes / 60) + wrongCount * 20 + (100 - familiarity);
    } else if (isDue && hasProgress) {
      reason = 'due-review';
      priority = 900 + wrongCount * 20 + (100 - familiarity);
    } else if (candidate.status === 'learning' || (wrongCount > 0 && !candidate.learned)) {
      reason = 'weak-word';
      priority = 700 + wrongCount * 20 + (100 - familiarity);
    } else if (word.cefrLevel === level && !hasProgress && !candidate.learned) {
      reason = 'new-word';
      priority = 300 - word.order / 1000;
    } else {
      return null;
    }

    return {
      wordId: word.id,
      reason,
      priority,
      difficulty: word.difficulty,
      estimatedMinutes: Math.round((MINUTES_PER_WORD + word.difficulty * 0.2) * 10) / 10,
      dueAt: candidate.nextReviewAt ?? null,
      level: word.cefrLevel,
      order: word.order,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const byPriority = (a: typeof classified[number], b: typeof classified[number]) =>
    b.priority - a.priority || a.order - b.order || a.wordId.localeCompare(b.wordId);
  const reviews = classified.filter((x) => x.reason === 'overdue-review' || x.reason === 'due-review').sort(byPriority);
  const failed = classified.filter((x) => x.reason === 'recently-failed').sort(byPriority);
  const weak = classified.filter((x) => x.reason === 'weak-word').sort(byPriority);
  const fresh = classified.filter((x) => x.reason === 'new-word').sort(byPriority);

  // When the review backlog is manageable, reserve a modest portion for new learning.
  // A large urgent backlog is allowed to take the whole goal.
  const urgent = reviews.length;
  const reserveNew = fresh.length > 0 && urgent < Math.ceil(goal * 0.75)
    ? Math.min(fresh.length, Math.max(1, Math.floor(goal * 0.25)))
    : 0;
  const selected: typeof classified = [];
  const selectedIds = new Set<string>();
  const add = (items: typeof classified, limit = goal) => {
    for (const item of items) {
      if (selected.length >= goal || limit <= 0) break;
      if (selectedIds.has(item.wordId)) continue;
      selected.push(item);
      selectedIds.add(item.wordId);
      limit -= 1;
    }
  };

  add(reviews);
  if (reserveNew > 0 && selected.length < goal) {
    add(failed, Math.max(0, goal - selected.length - reserveNew));
    add(weak, Math.max(0, goal - selected.length - reserveNew));
    add(fresh, reserveNew);
  }
  add(failed);
  add(weak);
  add(fresh);

  const items: DailyQueueItem[] = selected.map(({ level: _level, order: _order, ...item }) => item);
  return {
    items,
    goal,
    estimatedMinutes: Math.round(items.reduce((sum, item) => sum + item.estimatedMinutes, 0)),
    reviewCount: items.filter((x) => x.reason === 'overdue-review' || x.reason === 'due-review').length,
    newCount: items.filter((x) => x.reason === 'new-word').length,
    weakCount: items.filter((x) => x.reason === 'weak-word' || x.reason === 'recently-failed').length,
  };
}
