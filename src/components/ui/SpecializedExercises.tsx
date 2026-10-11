import { useState, useCallback, useRef, useEffect } from 'react';
import { Check, X, Volume2, Mic, MicOff, RotateCcw, Headphones } from 'lucide-react';
import { Button } from '@/components/ui';
import type { AdaptiveExercise } from '@/data/adaptiveExerciseEngine';
import { getEmojiForWord } from '@/data/wordEmoji';
import { getAllWords } from '@/data/vocabularyRepository';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[.!?,;:،؛؟]/g, '').replace(/\s+/g, ' ');
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sentence Assembly — Word Tiles
// ---------------------------------------------------------------------------

type TileItem = {
  id: number;
  text: string;
  used: boolean;
};

export function SentenceAssemblyExercise({
  exercise,
  answered,
  onAnswer,
}: {
  exercise: AdaptiveExercise;
  answered: boolean;
  onAnswer: (correct: boolean) => void;
}) {
  const correctSentence = exercise.correctSentence ?? exercise.correctAnswer;
  const correctTokens = correctSentence.split(/\s+/);

  const [tiles, setTiles] = useState<TileItem[]>(() =>
    shuffle(exercise.options).map((text, i) => ({ id: i, text, used: false })),
  );
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const selectedTiles = selectedIds.map((id) => tiles.find((t) => t.id === id)!).filter(Boolean);
  const assembled = selectedTiles.map((t) => t.text).join(' ');
  const isCorrect = answered && normalize(assembled) === normalize(correctSentence);

  const handleSelectTile = useCallback((id: number) => {
    if (answered) return;
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, used: true } : t)));
    setSelectedIds((prev) => [...prev, id]);
  }, [answered]);

  const handleRemoveTile = useCallback((id: number) => {
    if (answered) return;
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, used: false } : t)));
    setSelectedIds((prev) => prev.filter((tid) => tid !== id));
  }, [answered]);

  const handleSubmit = useCallback(() => {
    if (answered || selectedIds.length === 0) return;
    onAnswer(normalize(assembled) === normalize(correctSentence));
  }, [answered, selectedIds, assembled, correctSentence, onAnswer]);

  const handleClear = useCallback(() => {
    if (answered) return;
    setTiles((prev) => prev.map((t) => ({ ...t, used: false })));
    setSelectedIds([]);
  }, [answered]);

  return (
    <div className="flex flex-col gap-4">
      {/* Answer area */}
      <div
        className={`min-h-[80px] rounded-lg border-2 p-3 flex flex-wrap gap-2 items-start transition-all duration-200 ${
          answered
            ? isCorrect
              ? 'border-success-500 bg-success-500/10'
              : 'border-error-500 bg-error-500/10'
            : 'border-border bg-surface'
        }`}
      >
        {selectedTiles.length === 0 && (
          <span className="text-2xs text-text-muted py-2">اضغط على الكلمات لترتيبها هنا</span>
        )}
        {selectedTiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => handleRemoveTile(tile.id)}
            disabled={answered}
            className="rounded-lg bg-surface-raised border border-border px-3 py-2 text-sm font-medium text-text-primary ltr active:scale-95 transition-transform"
          >
            {tile.text}
          </button>
        ))}
      </div>

      {/* Available tiles */}
      <div className="flex flex-wrap gap-2 justify-center">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => handleSelectTile(tile.id)}
            disabled={tile.used || answered}
            className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ltr transition-all duration-150 ${
              tile.used
                ? 'opacity-20 border-border bg-surface'
                : 'border-primary-500/40 bg-primary-500/10 text-text-primary active:scale-95 hover:border-primary-500/70'
            }`}
          >
            {tile.text}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {answered && (
        <div className="flex items-center gap-3 rounded-lg p-4 border animate-fade-up ${
          isCorrect ? 'bg-success-500/10 border-success-500/30' : 'bg-error-500/10 border-error-500/30'
        }">
          <div className={`flex items-center justify-center h-10 w-10 rounded-full shrink-0 ${
            isCorrect ? 'bg-success-500/20' : 'bg-error-500/20'
          }`}>
            {isCorrect ? <Check size={22} className="text-success-400" /> : <X size={22} className="text-error-400" />}
          </div>
          <div className="flex-1">
            <p className={`font-bold ${isCorrect ? 'text-success-400' : 'text-error-400'}`}>
              {isCorrect ? 'إجابة صحيحة!' : 'إجابة خاطئة'}
            </p>
            {!isCorrect && (
              <p className="text-2xs text-text-muted mt-0.5 ltr">
                <span className="font-medium text-text-secondary">{correctSentence}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {!answered && (
        <div className="flex gap-2">
          <Button
            fullWidth
            size="md"
            variant="secondary"
            onClick={handleClear}
            disabled={selectedIds.length === 0}
          >
            مسح
          </Button>
          <Button
            fullWidth
            size="md"
            onClick={handleSubmit}
            disabled={selectedIds.length === 0}
          >
            تحقق
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matching Pairs
// ---------------------------------------------------------------------------

type MatchState = 'idle' | 'selecting-left' | 'selecting-right' | 'matched' | 'wrong';

export function MatchingPairsExercise({
  exercise,
  answered,
  onAnswer,
}: {
  exercise: AdaptiveExercise;
  answered: boolean;
  onAnswer: (correct: boolean) => void;
}) {
  const leftItems = exercise.options; // English words (shuffled)
  const rightItems = exercise.matchPairs ?? []; // Arabic translations, parallel to leftItems
  const correctPairs = exercise.relatedWords?.map((w) => ({ en: w.word, ar: w.arabicTranslation })) ?? [];

  const [matchedLeft, setMatchedLeft] = useState<Set<number>>(new Set());
  const [matchedRight, setMatchedRight] = useState<Set<number>>(new Set());
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  const [wrongFlash, setWrongFlash] = useState<{ left: number; right: number } | null>(null);

  const handleSelectLeft = useCallback((idx: number) => {
    if (answered || matchedLeft.has(idx)) return;
    setSelectedLeft(idx);
  }, [answered, matchedLeft]);

  const handleSelectRight = useCallback((idx: number) => {
    if (answered || matchedRight.has(idx)) return;
    setSelectedRight(idx);
  }, [answered, matchedRight]);

  // Check pair when both are selected
  useEffect(() => {
    if (selectedLeft === null || selectedRight === null) return;
    const leftWord = leftItems[selectedLeft];
    const rightTranslation = rightItems[selectedRight];
    const isCorrectPair = correctPairs.some((p) => p.en === leftWord && p.ar === rightTranslation);

    if (isCorrectPair) {
      setMatchedLeft((prev) => new Set([...prev, selectedLeft]));
      setMatchedRight((prev) => new Set([...prev, selectedRight]));
      setSelectedLeft(null);
      setSelectedRight(null);
    } else {
      setWrongFlash({ left: selectedLeft, right: selectedRight });
      const timer = setTimeout(() => {
        setWrongFlash(null);
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [selectedLeft, selectedRight, leftItems, rightItems, correctPairs]);

  // Check completion
  const totalPairs = leftItems.length;
  const allMatched = matchedLeft.size === totalPairs && totalPairs > 0;

  useEffect(() => {
    if (allMatched && !answered) {
      onAnswer(true);
    }
  }, [allMatched, answered, onAnswer]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Left column — English */}
        <div className="flex flex-col gap-2">
          {leftItems.map((word, idx) => {
            const isMatched = matchedLeft.has(idx);
            const isSelected = selectedLeft === idx;
            const isWrong = wrongFlash?.left === idx;
            return (
              <button
                key={`${word}-${idx}`}
                onClick={() => handleSelectLeft(idx)}
                disabled={isMatched || answered}
                className={`rounded-lg border-2 p-3.5 text-center text-sm font-semibold ltr transition-all duration-200 ${
                  isMatched
                    ? 'border-success-500/50 bg-success-500/10 text-success-400 opacity-60'
                    : isWrong
                    ? 'border-error-500 bg-error-500/10 text-error-400 animate-shake'
                    : isSelected
                    ? 'border-primary-500 bg-primary-500/15 text-primary-500'
                    : 'border-border bg-surface text-text-primary hover:border-primary-500/40 active:scale-95'
                }`}
              >
                {word}
                {isMatched && <Check size={14} className="inline-block mr-1 text-success-400" />}
              </button>
            );
          })}
        </div>

        {/* Right column — Arabic */}
        <div className="flex flex-col gap-2">
          {rightItems.map((translation, idx) => {
            const isMatched = matchedRight.has(idx);
            const isSelected = selectedRight === idx;
            const isWrong = wrongFlash?.right === idx;
            return (
              <button
                key={`${translation}-${idx}`}
                onClick={() => handleSelectRight(idx)}
                disabled={isMatched || answered}
                className={`rounded-lg border-2 p-3.5 text-center text-sm font-semibold transition-all duration-200 ${
                  isMatched
                    ? 'border-success-500/50 bg-success-500/10 text-success-400 opacity-60'
                    : isWrong
                    ? 'border-error-500 bg-error-500/10 text-error-400 animate-shake'
                    : isSelected
                    ? 'border-primary-500 bg-primary-500/15 text-primary-500'
                    : 'border-border bg-surface text-text-primary hover:border-primary-500/40 active:scale-95'
                }`}
              >
                {translation}
                {isMatched && <Check size={14} className="inline-block mr-1 text-success-400" />}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-2xs text-text-muted text-center">
        {matchedLeft.size} / {totalPairs} مطابق
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listening Comprehension
// ---------------------------------------------------------------------------

export function ListeningExercise({
  exercise,
  answered,
  onAnswer,
}: {
  exercise: AdaptiveExercise;
  answered: boolean;
  onAnswer: (correct: boolean) => void;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Generate distractors once
  useEffect(() => {
    const allWords = getAllWords();
    const distractors = shuffle(
      allWords
        .filter((w) => w.id !== exercise.word.id && w.cefrLevel === exercise.word.cefrLevel)
        .map((w) => w.word),
    ).slice(0, 3);
    setOptions(shuffle([exercise.word.word, ...distractors]));
  }, [exercise.word]);

  const playAudio = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(exercise.word.word);
      utterance.lang = 'en-US';
      utterance.onend = () => {
        if (mountedRef.current) setHasPlayed(true);
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      setHasPlayed(true);
    }
  }, [exercise.word.word]);

  // Auto-play on mount
  useEffect(() => {
    const timer = setTimeout(() => playAudio(), 300);
    return () => clearTimeout(timer);
  }, [playAudio]);

  const handleSelect = useCallback((option: string) => {
    if (answered) return;
    setSelected(option);
    onAnswer(option === exercise.word.word);
  }, [answered, exercise.word.word, onAnswer]);

  const isCorrect = selected === exercise.word.word;

  return (
    <div className="flex flex-col gap-4">
      {/* Audio player */}
      <div className="flex flex-col items-center gap-3 py-4">
        <button
          onClick={playAudio}
          disabled={answered}
          className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-400 to-accent-500 shadow-glow active:scale-95 transition-transform"
          aria-label="تشغيل الصوت"
        >
          <div className="absolute inset-0 rounded-3xl bg-primary-500/30 blur-xl animate-pulse-glow" />
          <Headphones size={36} className="relative text-neutral-950" />
        </button>
        <button
          onClick={playAudio}
          disabled={answered}
          className="flex items-center gap-1.5 text-2xs text-text-muted hover:text-primary-500 transition-colors"
        >
          <Volume2 size={14} />
          <span>إعادة التشغيل</span>
        </button>
        {!hasPlayed && (
          <p className="text-2xs text-text-muted">اضغط للاستماع ثم اختر الكلمة الصحيحة</p>
        )}
      </div>

      {/* Options */}
      <div className="flex flex-col gap-3">
        {options.map((option) => {
          const isThisCorrect = option === exercise.word.word;
          const isThisSelected = option === selected;
          let stateClass = 'border-border bg-surface text-text-primary hover:border-primary-500/50';
          if (answered) {
            if (isThisCorrect) stateClass = 'border-success-500 bg-success-500/10 text-success-400';
            else if (isThisSelected) stateClass = 'border-error-500 bg-error-500/10 text-error-400';
            else stateClass = 'border-border/50 bg-surface/50 text-text-muted';
          }
          return (
            <button
              key={option}
              onClick={() => handleSelect(option)}
              disabled={answered}
              className={`flex items-center justify-between gap-3 rounded-lg border-2 p-4 transition-all duration-200 ${stateClass} ${
                !answered ? 'cursor-pointer active:scale-[0.98]' : ''
              }`}
            >
              <span className="font-semibold text-lg ltr">{option}</span>
              {answered && isThisCorrect && <Check size={20} className="text-success-400 shrink-0" />}
              {answered && isThisSelected && !isThisCorrect && <X size={20} className="text-error-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Picture Selection
// ---------------------------------------------------------------------------

export function PictureSelectionExercise({
  exercise,
  answered,
  onAnswer,
}: {
  exercise: AdaptiveExercise;
  answered: boolean;
  onAnswer: (correct: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const emojis = exercise.emojis ?? exercise.options;

  const handleSelect = useCallback((emoji: string) => {
    if (answered) return;
    setSelected(emoji);
    onAnswer(emoji === exercise.correctAnswer);
  }, [answered, exercise.correctAnswer, onAnswer]);

  const isCorrect = selected === exercise.correctAnswer;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {emojis.map((emoji, idx) => {
          const isThisCorrect = emoji === exercise.correctAnswer;
          const isThisSelected = emoji === selected;
          let stateClass = 'border-border bg-surface hover:border-primary-500/50';
          if (answered) {
            if (isThisCorrect) stateClass = 'border-success-500 bg-success-500/10';
            else if (isThisSelected) stateClass = 'border-error-500 bg-error-500/10';
            else stateClass = 'border-border/50 bg-surface/50 opacity-50';
          }
          return (
            <button
              key={`${emoji}-${idx}`}
              onClick={() => handleSelect(emoji)}
              disabled={answered}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-6 transition-all duration-200 ${stateClass} ${
                !answered ? 'cursor-pointer active:scale-95' : ''
              }`}
              aria-label={exercise.relatedWords?.[idx]?.word ?? `option-${idx}`}
            >
              <span className="text-5xl">{emoji}</span>
              {answered && isThisCorrect && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-500/20">
                  <Check size={16} className="text-success-400" />
                </span>
              )}
              {answered && isThisSelected && !isThisCorrect && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-error-500/20">
                  <X size={16} className="text-error-400" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="flex items-center gap-3 rounded-lg p-3 border animate-fade-up ${
          isCorrect ? 'bg-success-500/10 border-success-500/30' : 'bg-error-500/10 border-error-500/30'
        }">
          <p className={`text-sm font-bold ${isCorrect ? 'text-success-400' : 'text-error-400'}`}>
            {isCorrect ? 'إجابة صحيحة!' : 'إجابة خاطئة'}
          </p>
          {!isCorrect && (
            <span className="text-2xs text-text-muted ltr mr-auto">{exercise.word.word}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speaking / Pronunciation
// ---------------------------------------------------------------------------

export function SpeakingExercise({
  exercise,
  answered,
  onAnswer,
}: {
  exercise: AdaptiveExercise;
  answered: boolean;
  onAnswer: (correct: boolean) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [result, setResult] = useState<'correct' | 'incorrect' | 'skipped' | null>(null);
  const recognitionRef = useRef<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    };
  }, []);

  const playReference = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(exercise.word.word);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    } catch { /* speech not available */ }
  }, [exercise.word.word]);

  const handleMic = useCallback(() => {
    if (answered || isRecording) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError('المتصفح لا يدعم التعرف على الكلام. استمع للنطق ثم تابع.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 3;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        if (mountedRef.current) { setIsRecording(true); setMicError(null); }
      };

      recognition.onresult = (event: any) => {
        if (!mountedRef.current) return;
        const alternatives = Array.from(event.results[0] as any);
        const texts = alternatives.map((a: any) => a.transcript as string);
        const bestText = texts[0] ?? '';
        setTranscript(bestText);
        const isCorrect = texts.some((t: string) => normalize(t) === normalize(exercise.word.word));
        setResult(isCorrect ? 'correct' : 'incorrect');
        onAnswer(isCorrect);
      };

      recognition.onerror = (event: any) => {
        if (!mountedRef.current) return;
        setIsRecording(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicError('تم رفض إذن الميكروفون. استمع للنطق ثم تابع.');
        } else if (event.error === 'no-speech') {
          setMicError('لم يتم التقاط صوت. حاول مرة أخرى.');
        } else {
          setMicError('تعذّر التعرف على الكلام. استمع للنطق ثم تابع.');
        }
      };

      recognition.onend = () => {
        if (mountedRef.current) setIsRecording(false);
      };

      recognition.start();
    } catch {
      setMicError('تعذّر تشغيل الميكروفون.');
    }
  }, [answered, isRecording, exercise.word.word, onAnswer]);

  const handleSkip = useCallback(() => {
    if (answered) return;
    setResult('skipped');
    onAnswer(false);
  }, [answered, onAnswer]);

  const isCorrect = result === 'correct';

  return (
    <div className="flex flex-col gap-5">
      {/* Word display */}
      <div className="flex flex-col items-center gap-2 py-2">
        <h3 className="text-3xl font-bold text-text-primary ltr">{exercise.word.word}</h3>
        <p className="text-sm text-primary-500">{exercise.word.arabicTranslation}</p>
        <p className="text-2xs text-text-muted ltr">{exercise.word.pronunciation}</p>
      </div>

      {/* Reference audio */}
      <button
        onClick={playReference}
        disabled={answered}
        className="flex items-center justify-center gap-2 rounded-xl bg-surface border border-border px-4 py-3 text-sm font-semibold text-text-secondary hover:border-primary-500/40 transition-all active:scale-95"
      >
        <Volume2 size={18} className="text-primary-500" />
        استمع للنطق الصحيح
      </button>

      {/* Mic button */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleMic}
          disabled={answered || isRecording}
          className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-200 ${
            isRecording
              ? 'bg-error-500/20 border-2 border-error-500 animate-pulse'
              : 'bg-primary-500/15 border-2 border-primary-500/40 active:scale-95'
          }`}
          aria-label="تسجيل النطق"
        >
          {isRecording ? (
            <MicOff size={32} className="text-error-400" />
          ) : (
            <Mic size={32} className="text-primary-500" />
          )}
        </button>
        <span className="text-2xs text-text-muted">
          {isRecording ? 'يتحدث...' : 'اضغط وانطق الكلمة'}
        </span>
      </div>

      {/* Error / fallback */}
      {micError && (
        <div className="rounded-lg bg-warning-500/10 border border-warning-500/30 px-4 py-3 animate-fade-up">
          <p className="text-2xs text-warning-400">{micError}</p>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="rounded-lg bg-surface border border-border p-4 text-center animate-fade-up">
          <p className="text-2xs text-text-muted mb-1">سمعت:</p>
          <p className="text-lg font-semibold text-text-primary ltr">{transcript}</p>
        </div>
      )}

      {/* Feedback */}
      {answered && (
        <div className={`flex items-center gap-3 rounded-lg p-4 border animate-fade-up ${
          isCorrect ? 'bg-success-500/10 border-success-500/30' : 'bg-error-500/10 border-error-500/30'
        }`}>
          <div className={`flex items-center justify-center h-10 w-10 rounded-full shrink-0 ${
            isCorrect ? 'bg-success-500/20' : 'bg-error-500/20'
          }`}>
            {isCorrect ? <Check size={22} className="text-success-400" /> : <X size={22} className="text-error-400" />}
          </div>
          <p className={`font-bold ${isCorrect ? 'text-success-400' : 'text-error-400'}`}>
            {isCorrect ? 'نطق صحيح!' : result === 'skipped' ? 'تخطيت التمرين' : 'نطق غير مطابق'}
          </p>
        </div>
      )}

      {/* Skip */}
      {!answered && (
        <Button fullWidth size="md" variant="ghost" onClick={handleSkip}>
          تخطي
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word-by-Word Sentence Translation
// ---------------------------------------------------------------------------

export function WordTranslationExercise({
  exercise,
}: {
  exercise: AdaptiveExercise;
  answered: boolean;
  onAnswer: (correct: boolean) => void;
}) {
  const tokens = exercise.tokens ?? [];
  const [selectedToken, setSelectedToken] = useState<number | null>(null);

  const playToken = useCallback((text: string) => {
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[.!?,;:]/g, '');
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    } catch { /* noop */ }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Full sentence */}
      <div className="rounded-lg bg-surface border border-border p-4 text-center">
        <p className="text-2xs text-text-muted mb-2">الجملة الكاملة</p>
        <p className="text-lg font-semibold text-text-primary ltr leading-relaxed">{exercise.prompt}</p>
      </div>

      {/* Arabic translation */}
      <div className="rounded-lg bg-primary-500/10 border border-primary-500/20 p-4 text-center">
        <p className="text-2xs text-text-muted mb-1">الترجمة الكاملة</p>
        <p className="text-base text-primary-500">{exercise.promptSub}</p>
      </div>

      {/* Interactive tokens */}
      <div className="flex flex-wrap gap-2 justify-center py-2">
        {tokens.map((token, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1">
            <button
              onClick={() => { setSelectedToken(idx); playToken(token.text); }}
              className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold ltr transition-all duration-200 active:scale-95 ${
                selectedToken === idx
                  ? 'border-primary-500 bg-primary-500/15 text-primary-500'
                  : 'border-border bg-surface text-text-primary hover:border-primary-500/40'
              }`}
            >
              {token.text}
              <Volume2 size={11} className="inline-block mr-1 text-text-muted" />
            </button>
            {selectedToken === idx && (
              <span className="text-2xs text-text-muted text-center max-w-[100px] leading-tight animate-fade-up">
                {token.translation || 'لا توجد ترجمة متاحة'}
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-2xs text-text-muted text-center">
        اضغط على أي كلمة لسماع نطقها ورؤية معناها
      </p>
    </div>
  );
}
