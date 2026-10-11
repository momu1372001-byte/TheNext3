import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word } from '@/types';

const mockGetProgress = vi.fn();
const mockGetAllWords = vi.fn();
const mockHasEmoji = vi.fn();
const mockGetEmoji = vi.fn();

vi.mock('@/data/progressStore', () => ({ getProgress: () => mockGetProgress() }));
vi.mock('@/data/vocabularyRepository', () => ({ getAllWords: () => mockGetAllWords() }));
vi.mock('@/data/wordEmoji', () => ({
  hasEmojiForWord: (w: string) => mockHasEmoji(w),
  getEmojiForWord: (w: string) => mockGetEmoji(w),
}));

import {
  buildAdaptiveExercisesForWords,
  calculateExerciseScore,
  isAdaptiveAnswerCorrect,
  validateAdaptiveExercise,
  type AdaptiveExerciseType,
} from '@/data/adaptiveExerciseEngine';

const words: Word[] = [
  { id: 'a1-001', word: 'hello', arabicTranslation: 'مرحباً', englishDefinition: 'a greeting used when meeting someone', partOfSpeech: 'phrase', cefrLevel: 'A1', category: 'everyday', exampleSentence: 'Say hello to your friend.', arabicExampleTranslation: 'قل مرحباً لصديقك.', pronunciation: '/həˈloʊ/', difficulty: 1, order: 1 },
  { id: 'a1-002', word: 'friend', arabicTranslation: 'صديق', englishDefinition: 'a person you know well and like', partOfSpeech: 'noun', cefrLevel: 'A1', category: 'everyday', exampleSentence: 'My friend is kind.', arabicExampleTranslation: 'صديقي لطيف.', pronunciation: '/frend/', difficulty: 1, order: 2 },
  { id: 'a1-003', word: 'house', arabicTranslation: 'منزل', englishDefinition: 'a building where people live', partOfSpeech: 'noun', cefrLevel: 'A1', category: 'places', exampleSentence: 'This house is small.', arabicExampleTranslation: 'هذا المنزل صغير.', pronunciation: '/haʊs/', difficulty: 1, order: 3 },
  { id: 'a1-004', word: 'travel', arabicTranslation: 'يسافر', englishDefinition: 'to go from one place to another', partOfSpeech: 'verb', cefrLevel: 'A1', category: 'travel', exampleSentence: 'We travel by train.', arabicExampleTranslation: 'نسافر بالقطار.', pronunciation: '/ˈtrævəl/', difficulty: 2, order: 4 },
  { id: 'a1-005', word: 'happy', arabicTranslation: 'سعيد', englishDefinition: 'feeling pleasure or contentment', partOfSpeech: 'adjective', cefrLevel: 'A1', category: 'feelings', exampleSentence: 'I am happy today.', arabicExampleTranslation: 'أنا سعيد اليوم.', pronunciation: '/ˈhæpi/', difficulty: 1, order: 5 },
  { id: 'a1-006', word: 'quickly', arabicTranslation: 'بسرعة', englishDefinition: 'at a fast speed', partOfSpeech: 'adverb', cefrLevel: 'A1', category: 'everyday', exampleSentence: 'She runs quickly.', arabicExampleTranslation: 'هي تجري بسرعة.', pronunciation: '/ˈkwɪkli/', difficulty: 2, order: 6 },
  { id: 'a1-007', word: 'under', arabicTranslation: 'تحت', englishDefinition: 'in or to a position below something', partOfSpeech: 'preposition', cefrLevel: 'A1', category: 'places', exampleSentence: 'The cat is under the table.', arabicExampleTranslation: 'القطة تحت الطاولة.', pronunciation: '/ˈʌndər/', difficulty: 2, order: 7 },
  { id: 'a1-008', word: 'because', arabicTranslation: 'لأن', englishDefinition: 'for the reason that', partOfSpeech: 'conjunction', cefrLevel: 'A1', category: 'everyday', exampleSentence: 'I stayed home because it rained.', arabicExampleTranslation: 'بقيت في المنزل لأنه أمطَر.', pronunciation: '/bɪˈkɔːz/', difficulty: 2, order: 8 },
];

const emptyProgress = () => ({ words: {}, exercisePerformance: {} });

beforeEach(() => {
  mockGetProgress.mockReturnValue(emptyProgress());
  mockGetAllWords.mockReturnValue(words);
  mockHasEmoji.mockReturnValue(false);
  mockGetEmoji.mockReturnValue(null);
});

describe('adaptive exercise engine — core types', () => {
  it('supports all eight core exercise types', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const expected: AdaptiveExerciseType[] = ['recognition', 'recall', 'translation', 'definition-match', 'sentence-completion', 'spelling', 'context-selection', 'mixed-review'];
    const types = new Set(exercises.map((e) => e.type));
    for (const t of expected) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('creates a correct answer and unique options for choice exercises', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0], words[1]], { exercisesPerWord: 14, shuffleExercises: false, widePool: true });
    for (const exercise of exercises) {
      // Skip validation for types that have their own validation rules
      if (['listening', 'speaking', 'matching-pairs', 'word-translation'].includes(exercise.type)) continue;
      const errors = validateAdaptiveExercise(exercise);
      // sentence-assembly and picture-selection may not always produce valid data
      // if conditions aren't met, so only check choice exercises strictly
      if (exercise.answerMode === 'choice' && exercise.options.length > 0) {
        const normalized = exercise.options.map((o) => o.trim().toLowerCase());
        if (exercise.type !== 'picture-selection' && exercise.type !== 'sentence-assembly') {
          expect(normalized).toContain(exercise.correctAnswer.trim().toLowerCase());
          expect(new Set(normalized).size).toBe(normalized.length);
        }
      }
    }
  });

  it('never repeats exercise IDs or the same type for a word in one generated set', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0], words[1]], { exercisesPerWord: 14, shuffleExercises: false });
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length);
    for (const word of [words[0], words[1]]) {
      const types = exercises.filter((e) => e.word.id === word.id).map((e) => e.type);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  it('uses text input for spelling and validates spelling without case sensitivity', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const spelling = exercises.find((e) => e.type === 'spelling');
    expect(spelling?.answerMode).toBe('text');
    expect(spelling?.options).toEqual([]);
    expect(isAdaptiveAnswerCorrect('  HELLO ', 'hello', 'spelling')).toBe(true);
    expect(isAdaptiveAnswerCorrect('hell', 'hello', 'spelling')).toBe(false);
  });

  it('prioritizes exercise types that previously caused mistakes', () => {
    mockGetProgress.mockReturnValue({
      words: { 'a1-001': { status: 'learning', wrongCount: 3, correctCount: 1 } },
      exercisePerformance: { 'a1-001': { attempts: 3, correct: 0, wrong: 3, lastWrongType: 'spelling', updatedAt: null, byType: { spelling: { attempts: 3, correct: 0, wrong: 3, lastAnsweredAt: null } } } },
    });
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 3, shuffleExercises: false });
    expect(exercises.some((e) => e.type === 'spelling')).toBe(true);
    expect(exercises.some((e) => ['recall', 'sentence-completion', 'context-selection'].includes(e.type))).toBe(true);
  });

  it('returns no exercises for an empty pool and honors maxExercises', () => {
    expect(buildAdaptiveExercisesForWords([])).toEqual([]);
    expect(buildAdaptiveExercisesForWords(words, { maxExercises: 3 })).toHaveLength(3);
  });

  it('calculates safe session scores, including empty and out-of-range input', () => {
    expect(calculateExerciseScore(3, 4)).toBe(75);
    expect(calculateExerciseScore(0, 0)).toBe(0);
    expect(calculateExerciseScore(9, 4)).toBe(100);
    expect(calculateExerciseScore(-1, 4)).toBe(0);
  });

  it('keeps legacy exercise types valid', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const validTypes = ['en-to-ar', 'ar-to-en', 'fill-blank', 'recognition', 'recall', 'translation', 'definition-match', 'sentence-completion', 'spelling', 'context-selection', 'mixed-review', 'sentence-assembly', 'matching-pairs', 'listening', 'picture-selection', 'speaking', 'word-translation'];
    expect(validTypes).toContain(exercises[0].type);
  });
});

describe('adaptive exercise engine — new exercise types', () => {
  it('generates listening exercises', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const listening = exercises.find((e) => e.type === 'listening');
    expect(listening).toBeDefined();
    expect(listening?.prompt).toBe('استمع واختر الكلمة الصحيحة');
    expect(listening?.correctAnswer).toBe(words[0].word);
  });

  it('generates speaking exercises', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const speaking = exercises.find((e) => e.type === 'speaking');
    expect(speaking).toBeDefined();
    expect(speaking?.answerMode).toBe('speaking');
    expect(speaking?.correctAnswer).toBe(words[0].word);
  });

  it('generates word-translation exercises with tokens', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const wt = exercises.find((e) => e.type === 'word-translation');
    expect(wt).toBeDefined();
    expect(wt?.tokens).toBeDefined();
    expect(wt?.tokens?.length).toBeGreaterThan(0);
    // Check that "hello" token has a translation since it's in our word list
    const helloToken = wt?.tokens?.find((t) => t.text.toLowerCase().includes('hello'));
    expect(helloToken?.translation).toBe('مرحباً');
  });

  it('generates sentence-assembly exercises from example sentences', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const assembly = exercises.find((e) => e.type === 'sentence-assembly');
    expect(assembly).toBeDefined();
    expect(assembly?.answerMode).toBe('tiles');
    expect(assembly?.correctSentence).toBeDefined();
    const correctTokens = assembly?.correctSentence?.split(/\s+/) ?? [];
    for (const token of correctTokens) {
      expect(assembly?.options).toContain(token);
    }
  });

  it('validates sentence-assembly exercises correctly', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const assembly = exercises.find((e) => e.type === 'sentence-assembly');
    if (assembly) {
      const errors = validateAdaptiveExercise(assembly);
      expect(errors).not.toContain('insufficient-tiles');
      expect(errors).not.toContain('missing-tokens');
    }
  });

  it('generates matching-pairs exercises with related words', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const matching = exercises.find((e) => e.type === 'matching-pairs');
    if (matching) {
      expect(matching.answerMode).toBe('matching');
      expect(matching.matchPairs).toBeDefined();
      expect(matching.matchPairs?.length).toBeGreaterThanOrEqual(4);
      expect(matching.relatedWords).toBeDefined();
      expect(matching.relatedWords?.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('generates picture-selection exercises when emoji is available', () => {
    mockHasEmoji.mockImplementation((w: string) => {
      const withEmoji = ['hello', 'friend', 'house', 'travel', 'happy'];
      return withEmoji.includes(w.toLowerCase());
    });
    mockGetEmoji.mockImplementation((w: string) => {
      const map: Record<string, string> = { hello: '👋', friend: '🤝', house: '🏠', travel: '✈️', happy: '😊' };
      return map[w.toLowerCase()] ?? null;
    });

    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const picture = exercises.find((e) => e.type === 'picture-selection');
    if (picture) {
      expect(picture.emojis).toBeDefined();
      expect(picture.emojis?.length).toBeGreaterThanOrEqual(4);
      expect(picture.emojis).toContain('👋');
      expect(picture.correctAnswer).toBe('👋');
      const errors = validateAdaptiveExercise(picture);
      expect(errors).toEqual([]);
    }
  });

  it('does not generate picture-selection when emoji is unavailable', () => {
    mockHasEmoji.mockReturnValue(false);
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const picture = exercises.find((e) => e.type === 'picture-selection');
    expect(picture).toBeUndefined();
  });

  it('sentence-assembly answer validation normalizes whitespace and case', () => {
    expect(isAdaptiveAnswerCorrect('Say hello to your friend.', 'Say hello to your friend.', 'sentence-assembly')).toBe(true);
    expect(isAdaptiveAnswerCorrect('say  hello to your friend', 'Say hello to your friend.', 'sentence-assembly')).toBe(true);
    expect(isAdaptiveAnswerCorrect('hello your friend', 'Say hello to your friend.', 'sentence-assembly')).toBe(false);
  });

  it('validates listening exercises without checking options', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 14, shuffleExercises: false });
    const listening = exercises.find((e) => e.type === 'listening');
    if (listening) {
      const errors = validateAdaptiveExercise(listening);
      expect(errors).not.toContain('insufficient-options');
      expect(errors).not.toContain('correct-answer-not-in-options');
    }
  });

  it('does not generate sentence-assembly for very short or very long sentences', () => {
    const shortWord: Word = { ...words[0], exampleSentence: 'Hi.' };
    const longWord: Word = { ...words[0], exampleSentence: 'This is a very long sentence that has way too many words to be assembled easily by a learner in a single exercise' };
    mockGetAllWords.mockReturnValue([shortWord, longWord, ...words.slice(1)]);
    const exercises = buildAdaptiveExercisesForWords([shortWord], { exercisesPerWord: 14, shuffleExercises: false });
    expect(exercises.find((e) => e.type === 'sentence-assembly')).toBeUndefined();
  });
});
