import { useState, useMemo, useCallback, useEffect } from 'react';
import { getLessonById, getCategoryById, getWordsByLesson } from '@/data/vocabularyRepository';
import { markLessonComplete, checkAndUnlockAchievements, recordSessionAccuracy } from '@/data/progressStore';
import { ExerciseRunner, buildExercisesForWords, type Exercise } from '@/components/ui';
import { Screen } from '@/components/ui';

type LessonPracticeScreenProps = {
  lessonId: string;
  onBack: () => void;
};

export function LessonPracticeScreen({ lessonId, onBack }: LessonPracticeScreenProps) {
  const lesson = getLessonById(lessonId);
  const words = useMemo(() => (lesson ? getWordsByLesson(lessonId) : []), [lessonId, lesson]);
  const category = lesson ? getCategoryById(lesson.category) : undefined;

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isPreparing, setIsPreparing] = useState(true);
  const [generationRequest, setGenerationRequest] = useState(0);
  const [generationError, setGenerationError] = useState(false);

  // Defer exercise generation until after the screen can render. The old lazy
  // useState initializer generated the entire exercise set during first render,
  // making the start button appear to freeze on slower devices.
  useEffect(() => {
    let cancelled = false;
    setIsPreparing(true);
    setGenerationError(false);
    const timer = window.setTimeout(() => {
      try {
        const nextExercises = buildExercisesForWords(words);
        if (!cancelled) {
          setExercises(nextExercises);
          setIsPreparing(false);
        }
      } catch (error) {
        console.error('Failed to prepare lesson exercises:', error);
        if (!cancelled) {
          setExercises([]);
          setGenerationError(true);
          setIsPreparing(false);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [words, generationRequest]);

  const handleComplete = useCallback(
    (result: { total: number; correct: number; score: number }) => {
      if (lesson) {
        markLessonComplete(lessonId, result.score, words.map((w) => w.id));
        recordSessionAccuracy(result.score);
        checkAndUnlockAchievements();
      }
    },
    [lessonId, lesson, words],
  );

  const handleRestart = useCallback(() => {
    setIsPreparing(true);
    setGenerationRequest((request) => request + 1);
  }, []);

  if (!lesson || words.length === 0) {
    return (
      <Screen>
        <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
          الدرس غير متاح
        </div>
      </Screen>
    );
  }

  if (isPreparing) {
    return (
      <Screen scroll={false}>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 text-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
          <p className="text-sm font-semibold text-text-primary">جارٍ تجهيز التمارين...</p>
          <p className="text-xs text-text-muted">لحظات ونبدأ الدرس</p>
        </div>
      </Screen>
    );
  }

  if (generationError || exercises.length === 0) {
    return (
      <Screen scroll={false}>
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 text-center">
          <p className="text-sm text-text-muted">
            {generationError ? 'تعذّر تجهيز التمارين. حاول مرة أخرى.' : 'لا توجد تمارين متاحة لهذا الدرس.'}
          </p>
          <button
            type="button"
            onClick={handleRestart}
            className="rounded-lg bg-primary-500 px-5 py-3 text-sm font-semibold text-white"
          >
            إعادة المحاولة
          </button>
          <button type="button" onClick={onBack} className="text-sm text-text-muted">
            العودة للدروس
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <ExerciseRunner
      exercises={exercises}
      title={lesson.titleAr}
      badge={category?.nameAr}
      onBack={onBack}
      onComplete={handleComplete}
      onRestart={handleRestart}
      doneTitle="أحسنت!"
      doneSubtitle={`أكملت درس «${lesson.titleAr}»`}
      restartLabel="تمرين آخر"
      backLabel="العودة للدروس"
    />
  );
}

export default LessonPracticeScreen;
