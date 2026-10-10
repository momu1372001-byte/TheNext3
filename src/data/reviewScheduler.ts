
/**
 * Pure spaced-repetition scheduling engine.
 *
 * No dependency on localStorage, React, Supabase, or the progress store.
 * This keeps scheduling deterministic and easy to test.
 *
 * `interval` is measured in minutes.
 */

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export type ReviewSchedule = {
  familiarity: number;
  repetitions: number;
  interval: number;
  ease: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  wrongCount: number;
  correctCount: number;
};

/**
 * Backward-compatible candidate:
 * old records may not contain the new scheduling fields.
 */
export type ReviewCandidate = Partial<ReviewSchedule> & {
  wordId: string;
  status?: string;
};

export type ScheduledReview = ReviewCandidate & ReviewSchedule & {
  overdueMinutes: number;
  priority: number;
};

export const REVIEW_DEFAULTS: Readonly<ReviewSchedule> = {
  familiarity: 0,
  repetitions: 0,
  interval: 0,
  ease: 2.5,
  lastReviewedAt: null,
  nextReviewAt: null,
  wrongCount: 0,
  correctCount: 0,
};

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validDate(value: Date | string | number): Date {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(
      'Review scheduler received an invalid date.',
    );
  }

  return date;
}

function toIso(date: Date): string {
  return date.toISOString();
}

/**
 * Fills missing fields from older progress records.
 * Preserves valid existing counters and schedule values.
 */
export function normalizeReviewSchedule(
  value?: Partial<ReviewSchedule> | null,
): ReviewSchedule {
  const input = value ?? {};

  const numberOr = (
    candidate: unknown,
    fallback: number,
    min: number,
    max = Number.MAX_SAFE_INTEGER,
  ): number => {
    if (
      typeof candidate !== 'number' ||
      !Number.isFinite(candidate)
    ) {
      return fallback;
    }

    return clamp(candidate, min, max);
  };

  const dateOrNull = (candidate: unknown): string | null => {
    if (
      typeof candidate !== 'string' ||
      candidate.length === 0
    ) {
      return null;
    }

    const timestamp = Date.parse(candidate);

    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : null;
  };

  return {
    familiarity: numberOr(input.familiarity, 0, 0, 100),
    repetitions: Math.floor(
      numberOr(input.repetitions, 0, 0),
    ),
    interval: numberOr(input.interval, 0, 0),
    ease: numberOr(input.ease, 2.5, MIN_EASE, MAX_EASE),
    lastReviewedAt: dateOrNull(input.lastReviewedAt),
    nextReviewAt: dateOrNull(input.nextReviewAt),
    wrongCount: Math.floor(
      numberOr(input.wrongCount, 0, 0),
    ),
    correctCount: Math.floor(
      numberOr(input.correctCount, 0, 0),
    ),
  };
}

/**
 * Computes the next schedule without mutating the previous one.
 *
 * Again: retry immediately and reset the repetition streak.
 * Hard: short initial interval, then conservative growth.
 * Good: one day initially, then growth based on ease.
 * Easy: four days initially, then faster growth.
 *
 * `now` is injectable for deterministic tests.
 */
export function scheduleReview(
  previous: Partial<ReviewSchedule> | null | undefined,
  rating: ReviewRating,
  now: Date | string | number = new Date(),
): ReviewSchedule {
  const current = normalizeReviewSchedule(previous);
  const reviewedAt = validDate(now);

  let repetitions = current.repetitions;
  let interval = current.interval;
  let ease = current.ease;
  let familiarity = current.familiarity;
  let correctCount = current.correctCount;
  let wrongCount = current.wrongCount;

  switch (rating) {
    case 'again': {
      wrongCount += 1;
      repetitions = 0;
      interval = 0;
      ease = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
      familiarity *= 0.65;
      break;
    }

    case 'hard': {
      correctCount += 1;
      repetitions += 1;

      interval =
        current.repetitions === 0 || current.interval === 0
          ? 10
          : Math.max(
              10,
              Math.ceil(current.interval * 1.2),
            );

      ease = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
      familiarity += 5;
      break;
    }

    case 'good': {
      correctCount += 1;
      repetitions += 1;

      interval =
        current.repetitions === 0 || current.interval === 0
          ? DAY_MINUTES
          : Math.ceil(current.interval * ease);

      familiarity += 15;
      break;
    }

    case 'easy': {
      correctCount += 1;
      repetitions += 1;

      interval =
        current.repetitions === 0 || current.interval === 0
          ? 4 * DAY_MINUTES
          : Math.ceil(current.interval * ease * 1.3);

      ease = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
      familiarity += 25;
      break;
    }

    default: {
      const exhaustive: never = rating;
      throw new Error(
        `Unsupported review rating: ${exhaustive}`,
      );
    }
  }

  const nextReview = new Date(
    reviewedAt.getTime() + interval * MINUTE_MS,
  );

  return {
    familiarity:
      Math.round(clamp(familiarity, 0, 100) * 100) / 100,
    repetitions,
    interval,
    ease: Math.round(ease * 100) / 100,
    lastReviewedAt: toIso(reviewedAt),
    nextReviewAt: toIso(nextReview),
    wrongCount,
    correctCount,
  };
}

/**
 * Returns reviews due at `now`.
 *
 * Ordering:
 * 1. Most overdue first.
 * 2. Highest wrong-answer count first.
 * 3. Lowest familiarity first.
 * 4. Word ID alphabetically for deterministic ties.
 *
 * Records without a valid nextReviewAt are treated as due now,
 * allowing legacy records to remain reviewable during migration.
 */
export function selectDueReviews(
  candidates: readonly ReviewCandidate[],
  now: Date | string | number = new Date(),
): ScheduledReview[] {
  const nowMs = validDate(now).getTime();

  return candidates
    .map((candidate): ScheduledReview | null => {
      if (!candidate.wordId) {
        return null;
      }

      const schedule = normalizeReviewSchedule(candidate);

      const nextMs = schedule.nextReviewAt
        ? Date.parse(schedule.nextReviewAt)
        : Number.NEGATIVE_INFINITY;

      if (nextMs > nowMs) {
        return null;
      }

      const overdueMinutes = Number.isFinite(nextMs)
        ? Math.max(
            0,
            Math.floor((nowMs - nextMs) / MINUTE_MS),
          )
        : 0;

      const priority =
        overdueMinutes +
        schedule.wrongCount * 60 +
        (100 - schedule.familiarity) * 0.1;

      return {
        ...candidate,
        ...schedule,
        overdueMinutes,
        priority,
      };
    })
    .filter(
      (entry): entry is ScheduledReview => entry !== null,
    )
    .sort(
      (a, b) =>
        b.overdueMinutes - a.overdueMinutes ||
        b.wrongCount - a.wrongCount ||
        a.familiarity - b.familiarity ||
        a.wordId.localeCompare(b.wordId),
    );
}

