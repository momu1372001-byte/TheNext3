import { useState, useCallback } from 'react';
import { ChevronLeft, Check, X, Volume2, Star, Trophy, RotateCcw } from 'lucide-react';
import { Screen, ProgressBar, Button } from '@/components/ui';
import { recordExercisePerformance, recordWordAnswer, recordWordReviewRating } from '@/data/progressStore';
import { buildAdaptiveExercisesForWords, calculateExerciseScore, isAdaptiveAnswerCorrect, type AdaptiveExercise, type AdaptiveExerciseOptions, type AdaptiveExerciseType } from '@/data/adaptiveExerciseEngine';
import type { ReviewRating } from '@/data/reviewScheduler';
import type { Word } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExerciseType = AdaptiveExerciseType;
export type Exercise = AdaptiveExercise;

export type ExerciseSessionResult = {
  total: number;
  correct: number;
  wrongWords: Word[];
  score: number;
  stars: number;
};

type ExerciseRunnerProps = {
  exercises: Exercise[];
  title: string;
  badge?: string;
  onBack: () => void;
  onComplete?: (result: ExerciseSessionResult) => void;
  /** Called for every answer so external systems (session tracking) can react. */
  onAnswer?: (word: Word, correct: boolean) => void;
  /** Stable per-exercise callback for resumable sessions. */
  onExerciseAnswer?: (exercise: Exercise, correct: boolean) => void;
  /** Hide the done screen and let the parent handle it (e.g. daily session). */
  hideDoneScreen?: boolean;
  /** Custom done screen content rendered below the score */
  doneExtra?: React.ReactNode;
  doneTitle?: string;
  doneSubtitle?: string;
  restartLabel?: string;
  backLabel?: string;
  onRestart?: () => void;
  /** Enable spaced-repetition ratings for the smart review flow. */
  reviewMode?: boolean;
};

// ---------------------------------------------------------------------------
// Exercise builder (shared) — delegates to the adaptive engine while keeping
// the legacy function signature compatible with existing screens.
// ---------------------------------------------------------------------------

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  'en-to-ar': 'اختر المعنى العربي الصحيح',
  'ar-to-en': 'اختر الكلمة الإنجليزية الصحيحة',
  'fill-blank': 'أكمل الفراغ بالكلمة الصحيحة',
  recognition: 'تعرّف على معنى الكلمة',
  recall: 'استدعِ الكلمة من معناها',
  translation: 'ترجم الكلمة',
  'definition-match': 'طابق التعريف مع الكلمة',
  'sentence-completion': 'أكمل الجملة',
  spelling: 'اكتب الكلمة من الذاكرة',
  'context-selection': 'اختر الكلمة المناسبة للسياق',
  'mixed-review': 'مراجعة مختلطة',
};

export function buildExercisesForWords(
  words: Word[],
  options?: AdaptiveExerciseOptions,
): Exercise[] {
  return buildAdaptiveExercisesForWords(words, options);
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExerciseRunner({
  exercises,
  title,
  badge,
  onBack,
  onComplete,
  onAnswer,
  onExerciseAnswer,
  hideDoneScreen = false,
  doneExtra,
  doneTitle = 'أحسنت!',
  doneSubtitle,
  restartLabel = 'تمرين آخر',
  backLabel = 'العودة',
  onRestart,
  reviewMode = false,
}: ExerciseRunnerProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongWords, setWrongWords] = useState<Word[]>([]);
  const [phase, setPhase] = useState<'practice' | 'done'>('practice');
  const [reviewRating, setReviewRating] = useState<ReviewRating | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');

  const current = exercises[currentIdx];
const isLastReviewQuestionForWord =
  reviewMode &&
  Boolean(current) &&
  !exercises
    .slice(currentIdx + 1)
    .some((exercise) => exercise.word.id === current.word.id);
  const handleAnswer = useCallback(
    (option: string) => {
      if (answered || !current) return;
      setSelected(option);
      setAnswered(true);
      const correct = isAdaptiveAnswerCorrect(option, current.correctAnswer, current.type);
      recordExercisePerformance(current.word.id, current.type, correct);
      if (correct) {
        setCorrectCount((c) => c + 1);
      } else {
        setWrongWords((w) => [...w, current.word]);
      }
      // In smart-review mode, the user's spaced-repetition rating is recorded
      // separately below. Avoid recording the same answer twice.
      if (!reviewMode) {
        recordWordAnswer(current.word.id, correct);
      }
      onAnswer?.(current.word, correct);
      onExerciseAnswer?.(current, correct);
    },
    [answered, current, onAnswer, onExerciseAnswer, reviewMode],
  );

  const handleContinue = useCallback(() => {
    if (currentIdx + 1 >= exercises.length) {
      const total = exercises.length;
      const score = calculateExerciseScore(correctCount, total);
      const stars = Math.max(1, Math.round(score / 33.3));
      const result: ExerciseSessionResult = { total, correct: correctCount, wrongWords, score, stars };
      onComplete?.(result);
      if (!hideDoneScreen) setPhase('done');
    } else {
      setCurrentIdx((i) => i + 1);
      setSelected(null);
      setAnswered(false);
      setReviewRating(null);
      setTypedAnswer('');
    }
  }, [currentIdx, exercises.length, correctCount, wrongWords, onComplete, hideDoneScreen]);

  const handleRestart = useCallback(() => {
    if (onRestart) {
      onRestart();
    }
    setCurrentIdx(0);
    setSelected(null);
    setAnswered(false);
    setCorrectCount(0);
    setWrongWords([]);
    setReviewRating(null);
    setTypedAnswer('');
    setPhase('practice');
  }, [onRestart]);

  if (exercises.length === 0 || !current) {
    return (
      <Screen scroll={false}>
        <div className="flex items-center gap-3 px-5 pt-6 pb-3 shrink-0">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-pill bg-white/5 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="رجوع"
          >
            <ChevronLeft size={18} className="rotate-180" />
          </button>
          <h1 className="text-sm font-bold text-text-primary">{title}</h1>
        </div>
        <div className="flex items-center justify-center flex-1 text-text-muted text-sm px-5 text-center">
          لا توجد كلمات متاحة لهذا التمرين.
        </div>
      </Screen>
    );
  }

  // --- Done phase ---
  if (phase === 'done') {
    const total = exercises.length;
    const score = calculateExerciseScore(correctCount, total);
    const stars = Math.max(1, Math.round(score / 33.3));

    return (
      <Screen scroll={false}>
        <div className="flex flex-col items-center justify-center flex-1 px-6 gap-6 animate-scale-in">
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-primary-500/30 blur-2xl animate-pulse-glow" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-400 to-accent-500 shadow-glow">
              <Trophy size={48} className="text-neutral-950" strokeWidth={2.2} />
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-text-primary">{doneTitle}</h2>
            <p className="text-sm text-text-muted mt-1">{doneSubtitle}</p>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-primary-500 ltr">{score}%</span>
              <span className="text-2xs text-text-muted">النتيجة</span>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-success-400 ltr">{correctCount}/{total}</span>
              <span className="text-2xs text-text-muted">إجابات صحيحة</span>
            </div>
          </div>

          <div className="flex gap-2">
            {[0, 1, 2].map((s) => (
              <Star
                key={s}
                size={28}
                className={s < stars ? 'text-primary-500' : 'text-white/15'}
                fill={s < stars ? 'currentColor' : 'none'}
              />
            ))}
          </div>

          {wrongWords.length > 0 && (
            <div className="w-full max-w-sm">
              <p className="text-2xs font-semibold text-text-muted mb-2 text-center">كلمات تحتاج مراجعة</p>
              <div className="flex flex-col gap-1.5">
                {wrongWords.map((w, i) => (
                  <div
                    key={`${w.id}-${i}`}
                    className="flex items-center justify-between rounded-md bg-surface border border-border/50 px-4 py-2"
                  >
                    <span className="text-sm font-medium text-text-secondary ltr">{w.word}</span>
                    <span className="text-sm text-primary-500">{w.arabicTranslation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {doneExtra}

          <div className="flex flex-col gap-3 w-full max-w-xs">
            {onRestart && (
              <Button fullWidth size="lg" icon={<RotateCcw size={18} />} onClick={handleRestart}>
                {restartLabel}
              </Button>
            )}
            <Button fullWidth size="md" variant="ghost" onClick={onBack}>
              {backLabel}
            </Button>
          </div>
        </div>
      </Screen>
    );
  }

  // --- Practice phase ---
  const isCorrect = selected !== null && isAdaptiveAnswerCorrect(selected, current.correctAnswer, current.type);
  const isLast = currentIdx === exercises.length - 1;

  return (
    <Screen scroll={false}>
      <div className="flex items-center gap-3 px-5 pt-6 pb-3 shrink-0">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-pill bg-white/5 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="رجوع"
        >
          <ChevronLeft size={18} className="rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-text-primary truncate">{title}</h1>
          <p className="text-2xs text-text-muted">
            {currentIdx + 1} من {exercises.length}
          </p>
        </div>
        {badge && (
          <span className="rounded-pill bg-primary-500/15 px-3 py-1 text-2xs font-semibold text-primary-500 shrink-0">
            {badge}
          </span>
        )}
      </div>

      <div className="px-5 pb-4 shrink-0">
        <ProgressBar
          value={currentIdx + (answered ? 1 : 0)}
          max={exercises.length}
          color={answered && !isCorrect ? 'bg-error-500' : 'bg-primary-500'}
        />
      </div>

      <div className="flex flex-col gap-5 px-5 pb-8 flex-1 overflow-y-auto no-scrollbar">
        <div key={currentIdx} className="flex flex-col items-center text-center gap-3 pt-4 animate-fade-up">
          <p className="text-2xs text-text-muted">{EXERCISE_TYPE_LABELS[current.type]}</p>

          {['ar-to-en', 'recall', 'definition-match'].includes(current.type) ? (
            <h2 className="text-4xl font-bold text-primary-500">{current.prompt}</h2>
          ) : (
            <h2 className="text-3xl font-bold text-text-primary ltr leading-relaxed">{current.prompt}</h2>
          )}

          {current.promptSub && (
            ['fill-blank', 'sentence-completion', 'context-selection', 'mixed-review'].includes(current.type) ? (
              <p className="text-sm text-text-muted">{current.promptSub}</p>
            ) : (
              <p className="text-2xs text-text-muted ltr">{current.promptSub}</p>
            )
          )}

          {['en-to-ar', 'recognition'].includes(current.type) && (
            <button
              className="flex items-center gap-1.5 text-2xs text-text-muted hover:text-primary-500 transition-colors mt-1"
              onClick={() => {
                try {
                  const utterance = new SpeechSynthesisUtterance(current.word.word);
                  utterance.lang = 'en-US';
                  window.speechSynthesis.speak(utterance);
                } catch {
                  // speech not available
                }
              }}
            >
              <Volume2 size={14} />
              <span>استمع</span>
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {current.type === 'spelling' ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => { event.preventDefault(); if (typedAnswer.trim()) handleAnswer(typedAnswer); }}
            >
              <input
                value={typedAnswer}
                onChange={(event) => setTypedAnswer(event.target.value)}
                disabled={answered}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="اكتب الكلمة الإنجليزية"
                placeholder="اكتب الكلمة الإنجليزية هنا"
                className="w-full rounded-lg border-2 border-border bg-surface p-4 text-lg text-text-primary ltr outline-none focus:border-primary-500 disabled:opacity-70"
              />
              {!answered && (
                <Button type="submit" fullWidth size="lg" disabled={!typedAnswer.trim()}>
                  تحقق من الإجابة
                </Button>
              )}
            </form>
          ) : current.options.map((option) => {
            const isThisCorrect = option === current.correctAnswer;
            const isThisSelected = option === selected;

            let stateClass = 'border-border bg-surface text-text-primary hover:border-primary-500/50';
            if (answered) {
              if (isThisCorrect) {
                stateClass = 'border-success-500 bg-success-500/10 text-success-400';
              } else if (isThisSelected) {
                stateClass = 'border-error-500 bg-error-500/10 text-error-400';
              } else {
                stateClass = 'border-border/50 bg-surface/50 text-text-muted';
              }
            }

            return (
              <button
                key={option}
                onClick={() => handleAnswer(option)}
                disabled={answered}
                className={`flex items-center justify-between gap-3 rounded-lg border-2 p-4 transition-all duration-200 ${stateClass} ${
                  !answered ? 'cursor-pointer active:scale-[0.98]' : ''
                }`}
              >
                <span className={`font-semibold text-lg ${current.isArabicOptions ? 'text-xl' : 'ltr'}`}>
                  {option}
                </span>
                {answered && isThisCorrect && <Check size={20} className="text-success-400 shrink-0" />}
                {answered && isThisSelected && !isThisCorrect && <X size={20} className="text-error-400 shrink-0" />}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="flex flex-col gap-3 animate-fade-up">
            <div
              className={`rounded-lg p-4 border ${
                isCorrect
                  ? 'bg-success-500/10 border-success-500/30'
                  : 'bg-error-500/10 border-error-500/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center justify-center h-10 w-10 rounded-full shrink-0 ${
                    isCorrect ? 'bg-success-500/20' : 'bg-error-500/20'
                  }`}
                >
                  {isCorrect ? (
                    <Check size={22} className="text-success-400" strokeWidth={2.5} />
                  ) : (
                    <X size={22} className="text-error-400" strokeWidth={2.5} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold ${isCorrect ? 'text-success-400' : 'text-error-400'}`}>
                    {isCorrect ? 'إجابة صحيحة!' : 'إجابة خاطئة'}
                  </p>
                  {!isCorrect && (
                    <p className="text-2xs text-text-muted mt-0.5">
                      الإجابة الصحيحة:{' '}
                      <span className="text-text-secondary font-medium">{current.correctAnswer}</span>
                    </p>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <p className="text-sm font-semibold text-text-primary ltr">{current.word.word}</p>
                  <p className="text-2xs text-primary-500">{current.word.arabicTranslation}</p>
                </div>
              </div>
            </div>

            {reviewMode &&isLastReviewQuestionForWord &&  (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-text-primary text-center">
                  ما مدى سهولة تذكّر الكلمة؟
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['again', 'مرة أخرى'],
                      ['hard', 'صعبة'],
                      ['good', 'جيدة'],
                      ['easy', 'سهلة'],
                    ] as const
                  ).map(([rating, label]) => (
                    <Button
                      key={rating}
                      fullWidth
                      variant="ghost"
                      disabled={reviewRating !== null}
                      onClick={() => {
                        if (reviewRating !== null) return;
                        recordWordReviewRating(current.word.id, rating);
                        setReviewRating(rating);
                      }}
                    >
                      {reviewRating === rating ? `✓ ${label}` : label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Button
              fullWidth
              size="lg"
              onClick={handleContinue}
              disabled={reviewMode && isLastReviewQuestionForWord && reviewRating === null}
            >
              {isLast ? 'إنهاء وعرض النتيجة' : 'متابعة'}
            </Button>
          </div>
        )}
      </div>
    </Screen>
  );
}

export default ExerciseRunner;
