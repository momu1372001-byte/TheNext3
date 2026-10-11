import type { DailyQueueItem } from './dailySessionQueue';

export type TrackedDailySessionItem = DailyQueueItem & {
  status: 'pending' | 'completed';
  attempts: number;
  lastAnswerCorrect: boolean | null;
  answeredAt: string | null;
  exerciseIds: string[];
};

export type TrackedDailySession = {
  date: string;
  wordIds: string[];
  completedCount: number;
  done: boolean;
  items?: TrackedDailySessionItem[];
  dailyGoal?: number;
  estimatedMinutes?: number;
  completedExerciseIds?: string[];
  rewardClaimed?: boolean;
};

export function resolveSessionForDate<T extends { date: string }>(
  existing: T | null,
  today: string,
  create: () => T,
): T {
  return existing?.date === today ? existing : create();
}

export function applySessionExercise<T extends TrackedDailySession>(
  session: T,
  wordId: string,
  exerciseId: string,
  correct: boolean,
  answeredAt = new Date().toISOString(),
): T {
  const completedExerciseIds = new Set(session.completedExerciseIds ?? []);
  if (completedExerciseIds.has(exerciseId)) return session;

  completedExerciseIds.add(exerciseId);
  const items = (session.items ?? []).map((item) => {
    if (item.wordId !== wordId) return item;
    const wordComplete = item.exerciseIds.length > 0 &&
      item.exerciseIds.every((id) => completedExerciseIds.has(id));
    return {
      ...item,
      attempts: item.attempts + 1,
      lastAnswerCorrect: correct,
      answeredAt,
      status: wordComplete ? 'completed' as const : item.status,
    };
  });
  const completedCount = items.filter((item) => item.status === 'completed').length;
  const done = items.length > 0 && completedCount === items.length;
  return {
    ...session,
    items,
    completedExerciseIds: [...completedExerciseIds],
    completedCount,
    done,
  };
}
