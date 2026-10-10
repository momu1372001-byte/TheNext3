import type { LevelCode, Word } from '@/types';
import { getWordsByLevel, getAllLevels, getWordById } from '@/data/vocabularyRepository';
import { ACHIEVEMENTS } from '@/data/achievements';
import {
  normalizeReviewSchedule,
  scheduleReview,
  selectDueReviews,
  type ReviewRating,
  type ReviewSchedule,
} from '@/data/reviewScheduler';
const LEGACY_STORAGE_KEY = 'words-app-progress-v1';
const LEGACY_SESSION_KEY = 'words-app-session-v1';

/**
 * Each authenticated user has a separate local progress store.
 * Guest progress is stored separately from authenticated users.
 */
let activeUserId: string | null = null;

function getStorageKey(): string {
  return activeUserId
    ? `${LEGACY_STORAGE_KEY}:${activeUserId}`
    : `${LEGACY_STORAGE_KEY}:guest`;
}

function getSessionStorageKey(): string {
  return activeUserId
    ? `${LEGACY_SESSION_KEY}:${activeUserId}`
    : `${LEGACY_SESSION_KEY}:guest`;
}

/**
 * Per-account marker indicating local progress still needs cloud sync.
 */
function getPendingSyncKey(): string {
  return `${getStorageKey()}:pending-sync`;
}

export type WordStatus = 'new' | 'learning' | 'reviewed';

export type LessonProgress = {
  completed: boolean;
  bestScore: number;
  completedAt: string | null;
};


export type WordProgress = ReviewSchedule & {
  status: WordStatus;
};
/** Map of YYYY-MM-DD -> count of words learned that day. */
export type ActivityLog = Record<string, number>;

export type PlacementResult = {
  recommendedLevel: LevelCode;
  score: number;
  completedAt: string;
};

export type ProgressState = {
  lessons: Record<string, LessonProgress>;
  learnedWordIds: string[];
  streak: number;
  lastActiveDate: string | null;
  words: Record<string, WordProgress>;
  xp: number;
  activityLog: ActivityLog;
  unlockedAchievements: string[];
  placement: PlacementResult | null;
  bestSessionAccuracy: number;
  dailyGoalsCompleted: number;
};

const INITIAL_STATE: ProgressState = {
  lessons: {},
  learnedWordIds: [],
  streak: 0,
  lastActiveDate: null,
  words: {},
  xp: 0,
  activityLog: {},
  unlockedAchievements: [],
  placement: null,
  bestSessionAccuracy: 0,
  dailyGoalsCompleted: 0,
};

function load(): ProgressState {
  try {
    const raw = localStorage.getItem(getStorageKey());

    if (!raw) {
      return { ...INITIAL_STATE };
    }

    const parsed = JSON.parse(raw) as Partial<ProgressState>;

    return {
      ...INITIAL_STATE,
      ...parsed,
      lessons: parsed.lessons ?? {},
      learnedWordIds: parsed.learnedWordIds ?? [],
      streak: parsed.streak ?? 0,
      lastActiveDate: parsed.lastActiveDate ?? null,
      words: parsed.words ?? {},
      xp: parsed.xp ?? 0,
      activityLog: parsed.activityLog ?? {},
      unlockedAchievements: parsed.unlockedAchievements ?? [],
      placement: parsed.placement ?? null,
      bestSessionAccuracy: parsed.bestSessionAccuracy ?? 0,
      dailyGoalsCompleted: parsed.dailyGoalsCompleted ?? 0,
    };
  } catch (error) {
    console.error('Failed to load local progress:', error);
    return { ...INITIAL_STATE };
  }
}

/**
 * Persist progress locally before attempting cloud synchronization.
 *
 * Normal local mutations mark the account as needing synchronization.
 * Cloud imports call save(state, false), because downloading cloud data
 * is not itself a new local mutation.
 */
function save(state: ProgressState, markPendingSync = true): void {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(state));

    if (markPendingSync) {
      localStorage.setItem(getPendingSyncKey(), 'true');
    }
  } catch (error) {
    console.error('Failed to save local progress:', error);
  }
}

/**
 * Check whether the active account has progress waiting to be synchronized.
 *
 * If the storage flag cannot be read, conservatively return true to avoid
 * overwriting potentially unsynchronized local progress with cloud data.
 */
export function hasPendingProgressSync(): boolean {
  try {
    return localStorage.getItem(getPendingSyncKey()) === 'true';
  } catch (error) {
    console.error('Failed to read pending progress sync flag:', error);
    return true;
  }
}

/**
 * Clear the pending-sync marker only if the current local snapshot still
 * matches the snapshot confirmed as uploaded.
 *
 * If the user changed progress while the upload was in flight, the marker
 * remains so the newer snapshot can be uploaded afterward.
 */
export function markProgressSyncComplete(syncedJson: string): boolean {
  try {
    if (JSON.stringify(currentState) !== syncedJson) {
      return false;
    }

    localStorage.removeItem(getPendingSyncKey());
    return true;
  } catch (error) {
    console.error('Failed to clear pending progress sync flag:', error);
    return false;
  }
}

const listeners = new Set<() => void>();

let currentState: ProgressState = load();

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error('Progress listener failed:', error);
    }
  });
}

/**
 * Switch the active local progress store.
 *
 * Call this when authentication changes, before loading the user's
 * profile from Supabase. Passing null selects the guest store.
 *
 * This function deliberately does not merge progress between accounts.
 */
export function setProgressUser(userId: string | null): void {
  const nextUserId = userId || null;

  if (activeUserId === nextUserId) {
    return;
  }

  activeUserId = nextUserId;
  currentState = load();

  notify();
}

export function getProgress(): ProgressState {
  return currentState;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isLessonCompleted(lessonId: string): boolean {
  return Boolean(currentState.lessons[lessonId]?.completed);
}

export function getLessonProgress(lessonId: string): LessonProgress | undefined {
  return currentState.lessons[lessonId];
}

export function getCompletedLessonsForLevel(
  _level: LevelCode,
  lessonIds: string[],
): number {
  return lessonIds.filter((id) => currentState.lessons[id]?.completed).length;
}

export function getLearnedWordCount(): number {
  return currentState.learnedWordIds.length;
}

export function getWordStatus(wordId: string): WordStatus {
  return currentState.words[wordId]?.status ?? 'new';
}

export function getWordProgress(wordId: string): WordProgress | undefined {
  return currentState.words[wordId];
}

function bumpActivity(
  state: ProgressState,
  today: string,
  newlyLearned: number,
): ActivityLog {
  if (newlyLearned <= 0) return state.activityLog;

  const prev = state.activityLog[today] ?? 0;
  return { ...state.activityLog, [today]: prev + newlyLearned };
}


export function recordWordAnswer(
  wordId: string,
  correct: boolean,
): void {
  const existing = currentState.words[wordId];

  const correctCount =
    (existing?.correctCount ?? 0) + (correct ? 1 : 0);

  const wrongCount =
    (existing?.wrongCount ?? 0) + (correct ? 0 : 1);

  const status: WordStatus =
    correctCount >= 2 ? 'reviewed' : 'learning';

  // Preserve existing scheduling data while updating answer counters.
  const schedule = normalizeReviewSchedule(existing);

  currentState = {
    ...currentState,
    words: {
      ...currentState.words,
      [wordId]: {
        ...schedule,
        status,
        correctCount,
        wrongCount,
      },
    },
    xp: currentState.xp + (correct ? 5 : 1),
  };

  save(currentState);
  notify();
}

/**
 * Records an explicit spaced-repetition rating.
 * Existing progress counters and XP rules remain unchanged.
 */
export function recordWordReviewRating(
  wordId: string,
  rating: ReviewRating,
): void {
  const existing = currentState.words[wordId];
  const previousSchedule = normalizeReviewSchedule(existing);
  const now = new Date();

  const schedule = scheduleReview(
    previousSchedule,
    rating,
    now,
  );

  const correct =
    rating !== 'again';

  const correctCount =
    (existing?.correctCount ?? 0) + (correct ? 1 : 0);

  const wrongCount =
    (existing?.wrongCount ?? 0) + (correct ? 0 : 1);

  const status: WordStatus =
    correctCount >= 2 ? 'reviewed' : 'learning';

  currentState = {
    ...currentState,
    words: {
      ...currentState.words,
      [wordId]: {
        ...schedule,
        status,
        correctCount,
        wrongCount,
      },
    },
    xp: currentState.xp + (correct ? 5 : 1),
  };

  save(currentState);
  notify();
}


export function markLessonComplete(
  lessonId: string,
  score: number,
  wordIds: string[],
): void {
  const existing = currentState.lessons[lessonId];
  const today = new Date().toISOString().slice(0, 10);

  const prevLearned = new Set(currentState.learnedWordIds);
  wordIds.forEach((id) => prevLearned.add(id));

  const newlyLearned = prevLearned.size - currentState.learnedWordIds.length;

  const streak =
    currentState.lastActiveDate === today
      ? currentState.streak
      : currentState.lastActiveDate
        ? currentState.streak + 1
        : 1;

  currentState = {
    ...currentState,
    lessons: {
      ...currentState.lessons,
      [lessonId]: {
        completed: true,
        bestScore: Math.max(existing?.bestScore ?? 0, score),
        completedAt: today,
      },
    },
    learnedWordIds: [...prevLearned],
    streak,
    lastActiveDate: today,
    xp: currentState.xp + 25 + Math.round(score / 4),
    activityLog: bumpActivity(currentState, today, newlyLearned),
  };

  save(currentState);
  notify();
}

export type ReviewEntry = {
  wordId: string;
  wrongCount: number;
  correctCount: number;
  status: WordStatus;
  weight: number;
};

/**
 * Returns words that are due for review, sorted by priority:
 * - Words with wrong answers appear first (more wrongs = higher priority)
 * - Words still in "learning" status are next
 * - "reviewed" words with zero wrongs are excluded (they're mastered)
 */

export function getReviewWords(): ReviewEntry[] {
  const candidates = Object.entries(currentState.words)
    .map(([wordId, progress]) => ({
      wordId,
      ...normalizeReviewSchedule(progress),
      status: progress.status,
    }));

  const dueReviews = selectDueReviews(
    candidates,
    new Date(),
  );

  return dueReviews
    .filter((review) => {
      const progress = currentState.words[review.wordId];

      if (!progress) return false;

      return (
        progress.wrongCount > 0 ||
        progress.status === 'learning'
      );
    })
    .map((review) => {
      const progress = currentState.words[review.wordId];

      return {
        wordId: review.wordId,
        wrongCount: progress.wrongCount,
        correctCount: progress.correctCount,
        status: progress.status,
        weight: Math.max(
          1,
          (progress.wrongCount + 1) *
            (progress.status === 'learning' ? 2 : 1),
        ),
      };
    });
}

/* ------------------------------------------------------------------ */
/* Daily session — generates a mixed set of new + due review words    */
/* based on the user's level and daily goal.                           */
/* ------------------------------------------------------------------ */

export type DailySession = {
  date: string;
  wordIds: string[];
  completedCount: number;
  done: boolean;
};

function loadSession(): DailySession | null {
  try {
    const raw = localStorage.getItem(getSessionStorageKey());
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DailySession;
    const today = dateKey(new Date());

    if (parsed.date !== today) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: DailySession): void {
  try {
    localStorage.setItem(getSessionStorageKey(), JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save daily session:', error);
  }
}

function pickNewWords(level: LevelCode, count: number): string[] {
  const levelWords = getWordsByLevel(level);
  const learnedSet = new Set(currentState.learnedWordIds);

  const fresh = levelWords.filter(
    (w) =>
      !learnedSet.has(w.id) &&
      currentState.words[w.id]?.status !== 'learning',
  );

  const pool =
    fresh.length >= count
      ? fresh
      : levelWords.filter((w) => !learnedSet.has(w.id));

  return shuffleIds(pool.map((w) => w.id)).slice(0, count);
}

function pickReviewWords(count: number): string[] {
  const review = getReviewWords();
  return shuffleIds(review.map((r) => r.wordId)).slice(0, count);
}

function shuffleIds<T>(arr: T[]): T[] {
  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

export function getOrCreateDailySession(
  level: LevelCode,
  dailyGoal: number,
): DailySession {
  const existing = loadSession();
  if (existing) return existing;

  const reviewBudget = Math.min(
    Math.floor(dailyGoal * 0.4),
    getReviewWords().length,
  );

  const newBudget = dailyGoal - reviewBudget;

  const newIds = pickNewWords(level, newBudget);
  const reviewIds = pickReviewWords(reviewBudget);

  const seen = new Set<string>();
  const wordIds: string[] = [];

  for (const id of [...reviewIds, ...newIds]) {
    if (!seen.has(id)) {
      seen.add(id);
      wordIds.push(id);
    }
  }

  const session: DailySession = {
    date: dateKey(new Date()),
    wordIds,
    completedCount: 0,
    done: wordIds.length === 0,
  };

  saveSession(session);
  return session;
}

export function getDailySession(): DailySession | null {
  return loadSession();
}

export function recordSessionWord(
  wordId: string,
  correct: boolean,
): DailySession {
  recordWordAnswer(wordId, correct);

  const session = loadSession();

  if (!session) {
    return {
      date: dateKey(new Date()),
      wordIds: [],
      completedCount: 0,
      done: true,
    };
  }

  const isLearned =
    currentState.learnedWordIds.includes(wordId) ||
    currentState.words[wordId]?.status === 'reviewed' ||
    correct;

  const completedCount = isLearned
    ? session.completedCount + 1
    : session.completedCount;

  const done = completedCount >= session.wordIds.length;

  const updated: DailySession = { ...session, completedCount, done };
  saveSession(updated);

  return updated;
}

export function completeDailySession(): {
  xpGained: number;
  newStreak: number;
} {
  const session = loadSession();

  if (!session || session.done) {
    return { xpGained: 0, newStreak: currentState.streak };
  }

  const today = dateKey(new Date());

  const newWordIds = session.wordIds.filter(
    (id) => !currentState.learnedWordIds.includes(id),
  );

  const learnedSet = new Set(currentState.learnedWordIds);
  newWordIds.forEach((id) => learnedSet.add(id));

  let streak = currentState.streak;

  if (currentState.lastActiveDate !== today) {
    streak = currentState.lastActiveDate
      ? currentState.streak + 1
      : 1;
  }

  const xpGained = 25 + session.wordIds.length * 5;
  const newlyLearned = learnedSet.size - currentState.learnedWordIds.length;

  currentState = {
    ...currentState,
    learnedWordIds: [...learnedSet],
    streak,
    lastActiveDate: today,
    xp: currentState.xp + xpGained,
    activityLog: bumpActivity(
      currentState,
      today,
      Math.max(newlyLearned, session.wordIds.length),
    ),
  };

  save(currentState);

  const updatedSession: DailySession = {
    ...session,
    done: true,
    completedCount: session.wordIds.length,
  };

  saveSession(updatedSession);
  notify();

  return { xpGained, newStreak: streak };
}

export function isDailySessionDone(): boolean {
  const session = loadSession();
  return !session || session.done;
}

export function getDailySessionProgress(): {
  completed: number;
  total: number;
} {
  const session = loadSession();

  if (!session) return { completed: 0, total: 0 };

  return {
    completed: session.completedCount,
    total: session.wordIds.length,
  };
}

export function resetProgress(): void {
  currentState = { ...INITIAL_STATE };
  save(currentState);

  try {
    localStorage.removeItem(getSessionStorageKey());
  } catch {
    // Ignore storage errors.
  }

  notify();
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

export function getUnlockedAchievements(): string[] {
  return [...currentState.unlockedAchievements];
}

export function checkAndUnlockAchievements(): string[] {
  const newlyUnlocked: string[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (currentState.unlockedAchievements.includes(achievement.id)) continue;

    let value = 0;

    switch (achievement.category) {
      case 'streak':
        value = currentState.streak;
        break;
      case 'xp':
        value = currentState.xp;
        break;
      case 'words':
        value = currentState.learnedWordIds.length;
        break;
      case 'lessons':
        value = Object.values(currentState.lessons).filter(
          (lesson) => lesson.completed,
        ).length;
        break;
      case 'accuracy':
        value = currentState.bestSessionAccuracy;
        break;
      case 'milestone':
        value = currentState.dailyGoalsCompleted;
        break;
    }

    if (value >= achievement.threshold) {
      newlyUnlocked.push(achievement.id);
    }
  }

  if (newlyUnlocked.length > 0) {
    const bonusXp = newlyUnlocked.reduce((sum, id) => {
      const achievement = ACHIEVEMENTS.find((a) => a.id === id);
      return sum + (achievement?.xpReward ?? 0);
    }, 0);

    currentState = {
      ...currentState,
      unlockedAchievements: [
        ...currentState.unlockedAchievements,
        ...newlyUnlocked,
      ],
      xp: currentState.xp + bonusXp,
    };

    save(currentState);
    notify();
  }

  return newlyUnlocked;
}

/* ------------------------------------------------------------------ */
/* Placement test                                                      */
/* ------------------------------------------------------------------ */

export function savePlacementResult(result: PlacementResult): void {
  currentState = {
    ...currentState,
    placement: result,
  };

  save(currentState);
  notify();
}

export function getPlacementResult(): PlacementResult | null {
  return currentState.placement;
}

/* ------------------------------------------------------------------ */
/* Session accuracy tracking                                           */
/* ------------------------------------------------------------------ */

export function recordSessionAccuracy(accuracy: number): void {
  if (accuracy > currentState.bestSessionAccuracy) {
    currentState = {
      ...currentState,
      bestSessionAccuracy: Math.round(accuracy),
    };

    save(currentState);
    checkAndUnlockAchievements();
    notify();
  }
}

export function recordDailyGoalCompleted(): void {
  currentState = {
    ...currentState,
    dailyGoalsCompleted: currentState.dailyGoalsCompleted + 1,
  };

  save(currentState);
  checkAndUnlockAchievements();
  notify();
}

/* ------------------------------------------------------------------ */
/* Strengths & weaknesses analysis                                     */
/* ------------------------------------------------------------------ */

export type SkillAnalysis = {
  categoryId: string;
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
  strength: 'strong' | 'medium' | 'weak';
};

export function getStrengthsAndWeaknesses(): SkillAnalysis[] {
  const state = currentState;
  const results: SkillAnalysis[] = [];
  const categoryMap = new Map<
    string,
    { correct: number; total: number }
  >();

  for (const [wordId, progress] of Object.entries(state.words)) {
    const word = getWordById(wordId);
    if (!word) continue;

    const category = word.category;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { correct: 0, total: 0 });
    }

    const entry = categoryMap.get(category)!;
    entry.total += progress.correctCount + progress.wrongCount;
    entry.correct += progress.correctCount;
  }

  for (const [categoryId, data] of categoryMap) {
    const accuracy =
      data.total > 0
        ? Math.round((data.correct / data.total) * 100)
        : 0;

    let strength: 'strong' | 'medium' | 'weak' = 'medium';

    if (accuracy >= 80) strength = 'strong';
    else if (accuracy < 50) strength = 'weak';

    results.push({
      categoryId,
      totalAnswers: data.total,
      correctAnswers: data.correct,
      accuracy,
      strength,
    });
  }

  results.sort((a, b) => a.accuracy - b.accuracy);
  return results;
}

export function getWeakWords(limit = 10): Word[] {
  const state = currentState;

  const weakIds = Object.entries(state.words)
    .filter(([, progress]) => progress.wrongCount > 0)
    .sort((a, b) => b[1].wrongCount - a[1].wrongCount)
    .slice(0, limit)
    .map(([id]) => id);

  return weakIds
    .map((id) => getWordById(id))
    .filter((word): word is Word => Boolean(word));
}

/* ------------------------------------------------------------------ */
/* Derived selectors (read-only, used by the Progress screen)          */
/* ------------------------------------------------------------------ */

export type ProgressSummary = {
  totalLearned: number;
  masteredCount: number;
  inProgressCount: number;
  streak: number;
  xp: number;
  dailyGoal: number;
  learnedToday: number;
  perLevel: Array<{ code: LevelCode; learned: number; total: number }>;
  weeklyActivity: Array<{ date: string; label: string; count: number }>;
  unlockedAchievements: string[];
  bestSessionAccuracy: number;
  placement: PlacementResult | null;
};

const ARABIC_DAY_LABELS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

function dateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getProgressSummary(dailyGoal: number): ProgressSummary {
  const state = currentState;
  const today = dateKey(new Date());

  const learnedSet = new Set(state.learnedWordIds);
  let masteredCount = 0;
  let inProgressCount = 0;

  for (const id of learnedSet) {
    const progress = state.words[id];

    if (progress?.status === 'reviewed') masteredCount++;
    else inProgressCount++;
  }

  const allLevels = getAllLevels();

  const perLevel = allLevels.map((level) => {
    const levelWords = getWordsByLevel(level.code);
    const learned = levelWords.filter((word: Word) =>
      learnedSet.has(word.id),
    ).length;

    return { code: level.code, learned, total: levelWords.length };
  });

  const weeklyActivity: Array<{
    date: string;
    label: string;
    count: number;
  }> = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const key = dateKey(date);

    weeklyActivity.push({
      date: key,
      label: ARABIC_DAY_LABELS[date.getDay()],
      count: state.activityLog[key] ?? 0,
    });
  }

  return {
    totalLearned: learnedSet.size,
    masteredCount,
    inProgressCount,
    streak: state.streak,
    xp: state.xp,
    dailyGoal,
    learnedToday: state.activityLog[today] ?? 0,
    perLevel,
    weeklyActivity,
    unlockedAchievements: [...state.unlockedAchievements],
    bestSessionAccuracy: state.bestSessionAccuracy,
    placement: state.placement,
  };
}

/* ------------------------------------------------------------------ */
/* Cloud sync — export/import full progress state for cross-device sync */
/* ------------------------------------------------------------------ */

export function exportProgress(): ProgressState {
  return JSON.parse(JSON.stringify(currentState)) as ProgressState;
}

/**
 * Replace the current user's local progress with the cloud snapshot.
 *
 * Do not merge with the previous local state here: merging could leak
 * progress between different accounts on the same browser.
 */
export function importProgress(external: Partial<ProgressState>): void {
  const incoming: ProgressState = {
    ...INITIAL_STATE,
    ...external,
    lessons: external.lessons ?? {},
    learnedWordIds: external.learnedWordIds ?? [],
    streak: external.streak ?? 0,
    lastActiveDate: external.lastActiveDate ?? null,
    words: external.words ?? {},
    xp: external.xp ?? 0,
    activityLog: external.activityLog ?? {},
    unlockedAchievements: external.unlockedAchievements ?? [],
    placement: external.placement ?? null,
    bestSessionAccuracy: external.bestSessionAccuracy ?? 0,
    dailyGoalsCompleted: external.dailyGoalsCompleted ?? 0,
  };

  currentState = incoming;

  // Cloud-to-local restore must not create a new pending-sync marker.
  // Any existing pending marker is intentionally preserved.
  save(currentState, false);
  notify();
}
