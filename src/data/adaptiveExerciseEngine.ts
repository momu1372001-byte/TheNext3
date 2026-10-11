import type { Word } from '@/types';
import { getAllWords } from '@/data/vocabularyRepository';
import { getProgress } from '@/data/progressStore';
import { hasEmojiForWord, getEmojiForWord } from '@/data/wordEmoji';

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
  | 'mixed-review'
  | 'sentence-assembly'
  | 'matching-pairs'
  | 'listening'
  | 'picture-selection'
  | 'speaking'
  | 'word-translation';

export type AdaptiveExercise = {
  id: string;
  type: AdaptiveExerciseType;
  word: Word;
  prompt: string;
  promptSub?: string;
  options: string[];
  correctAnswer: string;
  isArabicOptions: boolean;
  answerMode?: 'choice' | 'text' | 'tiles' | 'matching' | 'speaking';
  /** For matching-pairs: the right-column items paired with options by index. */
  matchPairs?: string[];
  /** For sentence-assembly: the correct word order as space-separated tokens. */
  correctSentence?: string;
  /** For picture-selection: emoji strings parallel to options. */
  emojis?: string[];
  /** For word-translation: word-level token data. */
  tokens?: Array<{ text: string; translation: string }>;
  /** Additional words for multi-word exercises (e.g. matching pairs). */
  relatedWords?: Word[];
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
  'listening', 'speaking', 'word-translation',
];

const CONDITIONAL_TYPES: AdaptiveExerciseType[] = [
  'sentence-assembly', 'picture-selection', 'matching-pairs',
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

function getRelatedWords(word: Word, count: number, context: ExerciseBuildContext): Word[] {
  const { allWords } = context;
  const sameLevel = allWords.filter(
    (w) => w.id !== word.id && w.cefrLevel === word.cefrLevel,
  );
  return shuffle(sameLevel).slice(0, count);
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
    if (mastered) score += ['recognition', 'translation', 'mixed-review', 'listening'].includes(type) ? 4 : -2;
    if (weak && ['recall', 'spelling', 'sentence-completion', 'context-selection', 'speaking'].includes(type)) score += 3;
    score += ((word.order + index * 3) % 7) / 100;
    return { type, score, index };
  });
  scored.sort((a, b) => b.score - a.score || ((word.order + a.index) % 7) - ((word.order + b.index) % 7));
  const selected: AdaptiveExerciseType[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 1 && weak) {
      const varied = scored.find((entry) => !selected.includes(entry.type) && ['recall', 'spelling', 'sentence-completion', 'context-selection', 'speaking'].includes(entry.type));
      if (varied) { selected.push(varied.type); continue; }
    }
    const next = scored.find((entry) => !selected.includes(entry.type));
    if (next) selected.push(next.type);
  }
  return selected;
}

/** Build a sentence-assembly exercise from the word's example sentence. */
function buildSentenceAssembly(word: Word, context: ExerciseBuildContext, index: number): AdaptiveExercise | null {
  const sentence = word.exampleSentence?.trim();
  if (!sentence || sentence.split(/\s+/).length < 3 || sentence.split(/\s+/).length > 10) return null;

  const tokens = sentence.split(/\s+/);
  const distractorWords = getDistractors(word, word.word, 'word', context).slice(0, 2);
  const allTiles = shuffle([...tokens, ...distractorWords]);

  return {
    id: `${word.id}:sentence-assembly:${index}`,
    type: 'sentence-assembly',
    word,
    prompt: word.arabicExampleTranslation || word.arabicTranslation,
    promptSub: 'رتّب الكلمات لتكوين الجملة الصحيحة',
    options: allTiles,
    correctAnswer: sentence,
    isArabicOptions: false,
    answerMode: 'tiles',
    correctSentence: sentence,
  };
}

/** Build a matching-pairs exercise using the word and 3 related words. */
function buildMatchingPairs(word: Word, context: ExerciseBuildContext, index: number): AdaptiveExercise | null {
  const related = getRelatedWords(word, 3, context);
  if (related.length < 3) return null;

  const allWords = [word, ...related];
  const englishCol = shuffle(allWords.map((w) => w.word));
  const arabicCol = allWords.map((w) => w.arabicTranslation);
  const matchPairs = englishCol.map((en) =>
    allWords.find((w) => w.word === en)?.arabicTranslation ?? '',
  );

  return {
    id: `${word.id}:matching-pairs:${index}`,
    type: 'matching-pairs',
    word,
    prompt: 'طابق الكلمات الإنجليزية مع ترجمتها العربية',
    promptSub: undefined,
    options: englishCol,
    correctAnswer: '',
    isArabicOptions: true,
    answerMode: 'matching',
    matchPairs,
    relatedWords: allWords,
  };
}

/** Build a listening comprehension exercise. */
function buildListening(word: Word, _context: ExerciseBuildContext, index: number): AdaptiveExercise | null {
  return {
    id: `${word.id}:listening:${index}`,
    type: 'listening',
    word,
    prompt: 'استمع واختر الكلمة الصحيحة',
    promptSub: word.arabicTranslation,
    options: [],
    correctAnswer: word.word,
    isArabicOptions: false,
    answerMode: 'choice',
  };
}

/** Build a picture-selection exercise if emoji is available. */
function buildPictureSelection(word: Word, context: ExerciseBuildContext, index: number): AdaptiveExercise | null {
  if (!hasEmojiForWord(word.word)) return null;

  const related = getRelatedWords(word, 3, context).filter((w) => hasEmojiForWord(w.word));
  if (related.length < 3) return null;

  const allWords = [word, ...related];
  const emojis = allWords.map((w) => getEmojiForWord(w.word)!);
  const shuffled = shuffle(allWords.map((w, i) => ({ word: w.word, emoji: emojis[i] })));
  const shuffledWords = shuffled.map((s) => s.word);
  const shuffledEmojis = shuffled.map((s) => s.emoji);

  return {
    id: `${word.id}:picture-selection:${index}`,
    type: 'picture-selection',
    word,
    prompt: word.arabicTranslation,
    promptSub: 'اختر الصورة الصحيحة',
    options: shuffledEmojis,
    correctAnswer: getEmojiForWord(word.word)!,
    isArabicOptions: false,
    answerMode: 'choice',
    emojis: shuffledEmojis,
  };
}

/** Build a speaking/pronunciation exercise. */
function buildSpeaking(word: Word, _context: ExerciseBuildContext, index: number): AdaptiveExercise | null {
  return {
    id: `${word.id}:speaking:${index}`,
    type: 'speaking',
    word,
    prompt: word.word,
    promptSub: word.arabicTranslation,
    options: [],
    correctAnswer: word.word,
    isArabicOptions: false,
    answerMode: 'speaking',
  };
}

/** Build a word-by-word sentence translation exercise. */
function buildWordTranslation(word: Word, context: ExerciseBuildContext, index: number): AdaptiveExercise | null {
  const sentence = word.exampleSentence?.trim();
  if (!sentence || sentence.split(/\s+/).length < 2) return null;

  const tokens = sentence.split(/\s+/);
  const tokenData = tokens.map((token) => {
    const cleanToken = token.replace(/[.!?,;:]/g, '');
    const matchWord = context.allWords.find(
      (w) => w.word.toLowerCase() === cleanToken.toLowerCase(),
    );
    return {
      text: token,
      translation: matchWord?.arabicTranslation ?? '',
    };
  });

  return {
    id: `${word.id}:word-translation:${index}`,
    type: 'word-translation',
    word,
    prompt: sentence,
    promptSub: word.arabicExampleTranslation,
    options: [],
    correctAnswer: '',
    isArabicOptions: false,
    answerMode: 'choice',
    tokens: tokenData,
  };
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
    case 'sentence-assembly':
      return buildSentenceAssembly(word, context, index);
    case 'matching-pairs':
      return buildMatchingPairs(word, context, index);
    case 'listening':
      return buildListening(word, context, index);
    case 'picture-selection':
      return buildPictureSelection(word, context, index);
    case 'speaking':
      return buildSpeaking(word, context, index);
    case 'word-translation':
      return buildWordTranslation(word, context, index);
  }
}

/**
 * Determine which conditional types are available for a word.
 * These are injected as bonus exercises alongside the standard adaptive types.
 */
function availableConditionalTypes(word: Word, context: ExerciseBuildContext): AdaptiveExerciseType[] {
  const available: AdaptiveExerciseType[] = [];
  if (word.exampleSentence && word.exampleSentence.split(/\s+/).length >= 3 && word.exampleSentence.split(/\s+/).length <= 10) {
    available.push('sentence-assembly');
  }
  if (hasEmojiForWord(word.word) && getRelatedWords(word, 3, context).filter((w) => hasEmojiForWord(w.word)).length >= 3) {
    available.push('picture-selection');
  }
  if (getRelatedWords(word, 3, context).length >= 3) {
    available.push('matching-pairs');
  }
  return available;
}

/** Generate adaptive exercises while preserving the shape expected by ExerciseRunner. */
export function buildAdaptiveExercisesForWords(words: Word[], options: AdaptiveExerciseOptions = {}): AdaptiveExercise[] {
  if (!words.length) return [];
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
    const defaultCount = Math.max(1, Math.min(options.exercisesPerWord ?? (weak ? 3 : 2), ALL_TYPES.length + CONDITIONAL_TYPES.length));
    const preferredTypes = chooseTypes(word, ALL_TYPES.length, adaptive, progress);
    const candidateTypes = [...chooseTypes(word, defaultCount, adaptive, progress), ...preferredTypes];

    // Inject conditional types as bonus candidates — they add variety without
    // displacing the core adaptive selection.
    const conditional = availableConditionalTypes(word, context);
    const fullCandidates = [...candidateTypes, ...conditional];

    let addedForWord = 0;
    for (let typeIndex = 0; typeIndex < fullCandidates.length && addedForWord < defaultCount; typeIndex++) {
      const type = fullCandidates[typeIndex];
      if (seenPerWord.has(`${word.id}:${type}`)) continue;
      const exercise = makeExercise(word, type, context, typeIndex);
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
  if (type === 'sentence-assembly') return normalize(input) === normalize(expected);
  return input === expected;
}

export function validateAdaptiveExercise(exercise: AdaptiveExercise): string[] {
  const errors: string[] = [];
  if (!exercise.id || !exercise.word?.id) errors.push('missing-id');
  if (!exercise.prompt.trim()) errors.push('missing-prompt');

  // Types with no single correct answer to validate against options
  if (exercise.type === 'matching-pairs' || exercise.type === 'word-translation') {
    if (exercise.type === 'matching-pairs') {
      if (!exercise.matchPairs || exercise.matchPairs.length < 4) errors.push('insufficient-match-pairs');
      if (!exercise.options || exercise.options.length < 4) errors.push('insufficient-match-options');
    }
    return errors;
  }

  // Listening exercises get their options populated at render time (distractors
  // are added by the component), so skip option validation here.
  if (exercise.type === 'listening' || exercise.type === 'speaking') {
    return errors;
  }

  // Picture-selection validates emojis rather than text options
  if (exercise.type === 'picture-selection') {
    if (!exercise.emojis || exercise.emojis.length < 4) errors.push('insufficient-emojis');
    if (!exercise.emojis?.includes(exercise.correctAnswer)) errors.push('correct-emoji-not-in-options');
    if (exercise.emojis && new Set(exercise.emojis).size !== exercise.emojis.length) errors.push('duplicate-emojis');
    return errors;
  }

  // Sentence-assembly validates tile uniqueness
  if (exercise.type === 'sentence-assembly') {
    if (!exercise.options || exercise.options.length < 3) errors.push('insufficient-tiles');
    if (exercise.correctSentence && exercise.options) {
      const sentenceTokens = exercise.correctSentence.split(/\s+/);
      for (const token of sentenceTokens) {
        if (!exercise.options.includes(token)) {
          errors.push('missing-tokens');
          break;
        }
      }
    }
    return errors;
  }

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
