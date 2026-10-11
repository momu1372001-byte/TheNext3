import type { Word } from '@/types';
import { getAllWords } from '@/data/vocabularyRepository';
import { getProgress } from '@/data/progressStore';

export type AdaptiveExerciseType =
  | 'en-to-ar'
  | 'ar-to-en'
  | 'fill-blank'
  | 'recognition'
  | 'recall'
  | 'translation'
  | 'definition-match'
  | 'sentence-completion'
  | 'spelling'
  | 'context-selection'
  | 'mixed-review';

export type AdaptiveExercise = {
  id: string;
  type: AdaptiveExerciseType;
  word: Word;
  prompt: string;
  promptSub?: string;
  options: string[];
  correctAnswer: string;
  isArabicOptions: boolean;
  answerMode?: 'choice' | 'text';
};

export type AdaptiveExerciseOptions = {
  widePool?: boolean;
  maxExercises?: number;
  shuffleExercises?: boolean;
  exercisesPerWord?: number;
  adaptive?: boolean;
};

const ALL_TYPES: AdaptiveExerciseType[] = [
  'recognition', 'recall', 'translation', 'definition-match',
  'sentence-completion', 'spelling', 'context-selection', 'mixed-review',
];

const normalize = (value: string): string => value.trim().toLocaleLowerCase().replace(/[.!?,;:،؛؟]/g, '').replace(/\s+/g, ' ');

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function uniqueValues(values: string[], correct: string): string[] {
  const seen = new Set([normalize(correct)]);
  const unique: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

type ExerciseBuildContext = {
  allWords: Word[];
  progress: ReturnType<typeof getProgress>;
  distractorCache: Map<string, string[]>;
};

function getDistractors(
  word: Word,
  correct: string,
  field: 'word' | 'arabicTranslation' | 'englishDefinition',
  context: ExerciseBuildContext,
): string[] {
  const cacheKey = `${word.id}|${field}|${normalize(correct)}`;
  const cached = context.distractorCache.get(cacheKey);
  if (cached) return cached;

  const { allWords } = context;
  // The result is cached per target word/field so multiple exercise types for
  // the same word do not repeatedly scan the entire vocabulary.
  const sameCategoryAndLevel: string[] = [];
  const sameLevel: string[] = [];
  const fallback: string[] = [];

  for (const candidate of allWords) {
    if (candidate.id === word.id) continue;
    const value = candidate[field];
    if (!value?.trim()) continue;
    if (candidate.cefrLevel === word.cefrLevel && candidate.category === word.category) {
      sameCategoryAndLevel.push(value);
    } else if (candidate.cefrLevel === word.cefrLevel) {
      sameLevel.push(value);
    } else {
      fallback.push(value);
    }
  }

  const result = uniqueValues(
    [...sameCategoryAndLevel, ...sameLevel, ...fallback],
    correct,
  ).slice(0, 3);
  context.distractorCache.set(cacheKey, result);
  return result;
}

function buildOptions(word: Word, correct: string, field: 'word' | 'arabicTranslation' | 'englishDefinition', context: ExerciseBuildContext): string[] {
  return shuffle([correct, ...getDistractors(word, correct, field, context)]);
}

function getTypeHistory(wordId: string, type: AdaptiveExerciseType, progress: ExerciseBuildContext['progress']): { attempts: number; wrong: number } {
  const stats = progress.exercisePerformance?.[wordId];
  const item = stats?.byType?.[type];
  return { attempts: item?.attempts ?? 0, wrong: item?.wrong ?? 0 };
}

function chooseTypes(word: Word, count: number, adaptive: boolean, progress: ExerciseBuildContext['progress']): AdaptiveExerciseType[] {
  const wordProgress = progress.words[word.id];
  const history = progress.exercisePerformance?.[word.id];
  const weak = (wordProgress?.wrongCount ?? 0) >= 2 || (history?.wrong ?? 0) >= 2;
  const mastered = wordProgress?.status === 'reviewed' && (wordProgress?.wrongCount ?? 0) === 0;
  const candidates = [...ALL_TYPES];
  const scored = candidates.map((type, index) => {
    const stats = getTypeHistory(word.id, type, progress);
    let score = (stats.wrong * 8) - (stats.attempts * 0.15);
    if (!adaptive) score = 0;
    if (mastered) score += ['recognition', 'translation', 'mixed-review'].includes(type) ? 4 : -2;
    if (weak && ['recall', 'spelling', 'sentence-completion', 'context-selection'].includes(type)) score += 3;
    // Spread first-time practice across types without making generation random-only.
    score += ((word.order + index * 3) % 7) / 100;
    return { type, score, index };
  });
  scored.sort((a, b) => b.score - a.score || ((word.order + a.index) % 7) - ((word.order + b.index) % 7));
  const selected: AdaptiveExerciseType[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 1 && weak) {
      const varied = scored.find((entry) => !selected.includes(entry.type) && ['recall', 'spelling', 'sentence-completion', 'context-selection'].includes(entry.type));
      if (varied) { selected.push(varied.type); continue; }
    }
    const next = scored.find((entry) => !selected.includes(entry.type));
    if (next) selected.push(next.type);
  }
  return selected;
}

function makeExercise(word: Word, type: AdaptiveExerciseType, context: ExerciseBuildContext, index: number): AdaptiveExercise | null {
  const base = { id: `${word.id}:${type}:${index}`, word, options: [] as string[], isArabicOptions: false, answerMode: 'choice' as const };
  switch (type) {
    case 'en-to-ar':
    case 'recognition':
    case 'translation':
      return { ...base, type, prompt: word.word, promptSub: word.pronunciation, options: buildOptions(word, word.arabicTranslation, 'arabicTranslation', context), correctAnswer: word.arabicTranslation, isArabicOptions: true };
    case 'ar-to-en':
    case 'recall':
      return { ...base, type, prompt: word.arabicTranslation, options: buildOptions(word, word.word, 'word', context), correctAnswer: word.word, isArabicOptions: false };
    case 'definition-match':
      return { ...base, type, prompt: word.englishDefinition, promptSub: word.cefrLevel, options: buildOptions(word, word.word, 'word', context), correctAnswer: word.word, isArabicOptions: false };
    case 'fill-blank':
    case 'sentence-completion':
    case 'context-selection':
    case 'mixed-review': {
      const sentence = word.exampleSentence;
      const escaped = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blanked = sentence ? sentence.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '_____') : '';
      if (blanked && blanked !== sentence) {
        return { ...base, type, prompt: blanked, promptSub: word.arabicExampleTranslation, options: buildOptions(word, word.word, 'word', context), correctAnswer: word.word, isArabicOptions: false };
      }
      if (type === 'mixed-review' || type === 'context-selection') {
        return { ...base, type, prompt: word.englishDefinition, promptSub: 'اختر الكلمة المناسبة للسياق', options: buildOptions(word, word.word, 'word', context), correctAnswer: word.word, isArabicOptions: false };
      }
      return null;
    }
    case 'spelling':
      return { ...base, type, prompt: word.arabicTranslation, promptSub: 'اكتب الكلمة الإنجليزية', options: [], correctAnswer: word.word, isArabicOptions: false, answerMode: 'text' };
  }
}

/** Generate adaptive exercises while preserving the shape expected by ExerciseRunner. */
export function buildAdaptiveExercisesForWords(words: Word[], options: AdaptiveExerciseOptions = {}): AdaptiveExercise[] {
  if (!words.length) return [];
  // Take one consistent snapshot per generation call. Keep distractor results
  // cached during this call to avoid repeated full-catalog scans on entry.
  const context: ExerciseBuildContext = {
    allWords: getAllWords(),
    progress: getProgress(),
    distractorCache: new Map(),
  };
  const adaptive = options.adaptive ?? true;
  const exercises: AdaptiveExercise[] = [];
  const seenExerciseIds = new Set<string>();
  const seenPerWord = new Set<string>();

  words.forEach((word, wordIndex) => {
    const progress = context.progress;
    const weak = (progress.words[word.id]?.wrongCount ?? 0) >= 2 || (progress.exercisePerformance?.[word.id]?.wrong ?? 0) >= 2;
    const defaultCount = Math.max(1, Math.min(options.exercisesPerWord ?? (weak ? 3 : 2), ALL_TYPES.length));
    const preferredTypes = chooseTypes(word, ALL_TYPES.length, adaptive, progress);
    const candidateTypes = [...chooseTypes(word, defaultCount, adaptive, progress), ...preferredTypes];
    let addedForWord = 0;
    for (let typeIndex = 0; typeIndex < candidateTypes.length && addedForWord < defaultCount; typeIndex++) {
      const type = candidateTypes[typeIndex];
      if (seenPerWord.has(`${word.id}:${type}`)) continue;
      const exercise = makeExercise(word, type, context, typeIndex);
      // Skip unsupported sentence forms and try another distinct skill instead.
      if (!exercise) continue;
      const perWordKey = `${word.id}:${exercise.type}`;
      if (seenPerWord.has(perWordKey)) continue;
      seenPerWord.add(perWordKey);
      if (seenExerciseIds.has(exercise.id)) {
        exercises.push({ ...exercise, id: `${exercise.id}:${wordIndex}` });
      } else {
        seenExerciseIds.add(exercise.id);
        exercises.push(exercise);
      }
      addedForWord += 1;
    }
  });

  const ordered = options.shuffleExercises === false ? exercises : shuffle(exercises);
  return options.maxExercises === undefined ? ordered : ordered.slice(0, Math.max(0, options.maxExercises));
}

export function calculateExerciseScore(correct: number, total: number): number {
  if (total <= 0) return 0;
  const safeCorrect = Math.max(0, Math.min(Math.floor(correct), Math.floor(total)));
  return Math.round((safeCorrect / Math.floor(total)) * 100);
}

export function isAdaptiveAnswerCorrect(input: string, expected: string, type: AdaptiveExerciseType): boolean {
  if (type === 'spelling') return normalize(input) === normalize(expected);
  return input === expected;
}

export function validateAdaptiveExercise(exercise: AdaptiveExercise): string[] {
  const errors: string[] = [];
  if (!exercise.id || !exercise.word?.id) errors.push('missing-id');
  if (!exercise.prompt.trim()) errors.push('missing-prompt');
  if (!exercise.correctAnswer.trim()) errors.push('missing-answer');
  if (exercise.answerMode === 'text' || exercise.type === 'spelling') {
    if (exercise.options.length !== 0) errors.push('text-answer-has-options');
  } else {
    const normalized = exercise.options.map(normalize);
    if (!normalized.includes(normalize(exercise.correctAnswer))) errors.push('correct-answer-not-in-options');
    if (new Set(normalized).size !== normalized.length) errors.push('duplicate-options');
    if (exercise.options.length < 2) errors.push('insufficient-options');
  }
  return errors;
}
