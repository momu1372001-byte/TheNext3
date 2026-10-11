import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word } from '@/types';

const mockGetProgress = vi.fn();
const mockGetAllWords = vi.fn();

vi.mock('@/data/progressStore', () => ({ getProgress: () => mockGetProgress() }));
vi.mock('@/data/vocabularyRepository', () => ({ getAllWords: () => mockGetAllWords() }));

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
});

describe('adaptive exercise engine', () => {
  it('supports all eight requested exercise types', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 8, shuffleExercises: false });
    const expected: AdaptiveExerciseType[] = ['recognition', 'recall', 'translation', 'definition-match', 'sentence-completion', 'spelling', 'context-selection', 'mixed-review'];
    expect(new Set(exercises.map((exercise) => exercise.type))).toEqual(new Set(expected));
  });

  it('creates a correct answer and unique options for choice exercises', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0], words[1]], { exercisesPerWord: 8, shuffleExercises: false, widePool: true });
    for (const exercise of exercises) {
      expect(validateAdaptiveExercise(exercise)).toEqual([]);
      if (exercise.answerMode !== 'text') {
        const normalized = exercise.options.map((option) => option.trim().toLowerCase());
        expect(normalized).toContain(exercise.correctAnswer.trim().toLowerCase());
        expect(new Set(normalized).size).toBe(normalized.length);
      }
    }
  });

  it('never repeats exercise IDs or the same type for a word in one generated set', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0], words[1]], { exercisesPerWord: 8, shuffleExercises: false });
    expect(new Set(exercises.map((exercise) => exercise.id)).size).toBe(exercises.length);
    for (const word of [words[0], words[1]]) {
      const types = exercises.filter((exercise) => exercise.word.id === word.id).map((exercise) => exercise.type);
      expect(new Set(types).size).toBe(types.length);
    }
  });

  it('uses text input for spelling and validates spelling without case sensitivity', () => {
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 8, shuffleExercises: false });
    const spelling = exercises.find((exercise) => exercise.type === 'spelling');
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
    expect(exercises.some((exercise) => exercise.type === 'spelling')).toBe(true);
    expect(exercises.some((exercise) => ['recall', 'sentence-completion', 'context-selection'].includes(exercise.type))).toBe(true);
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
    const exercises = buildAdaptiveExercisesForWords([words[0]], { exercisesPerWord: 8, shuffleExercises: false });
    expect(['en-to-ar', 'ar-to-en', 'fill-blank', 'recognition', 'recall', 'translation', 'definition-match', 'sentence-completion', 'spelling', 'context-selection', 'mixed-review']).toContain(exercises[0].type);
  });
});
