import { Lock, Star, Check } from 'lucide-react';
import { CategoryIcon } from '@/components/ui';
import type { Category, Lesson } from '@/types';

export type LessonStatus = 'completed' | 'active' | 'locked';

type LessonPathNodeProps = {
  lesson: Lesson;
  category?: Category;
  status: LessonStatus;
  progressText: string;
  stars: number;
  index: number;
  isLast: boolean;
  onTap: () => void;
};

/**
 * A single node in the vertical learning path.
 * Circular nodes alternate left/right along a zigzag path,
 * with a compact info card beneath each node.
 */
export function LessonPathNode({
  lesson,
  category,
  status,
  progressText,
  stars,
  index,
  isLast,
  onTap,
}: LessonPathNodeProps) {

  const nodeStyles: Record<LessonStatus, string> = {
    completed:
      'bg-gradient-to-br from-primary-400 to-accent-500 text-neutral-950 shadow-glow',
    active:
      'bg-gradient-to-br from-primary-400 to-accent-500 text-neutral-950 shadow-glow ring-4 ring-primary-500/25 animate-pulse-glow',
    locked: 'bg-surface-raised text-text-muted border-2 border-border',
  };

  const cardStyles: Record<LessonStatus, string> = {
    completed: 'border-primary-500/40 bg-surface',
    active: 'border-primary-500/60 bg-surface shadow-glow',
    locked: 'border-border/50 bg-surface/50 opacity-60',
  };

  const labelStyles: Record<LessonStatus, string> = {
    completed: 'text-success-400',
    active: 'text-primary-500',
    locked: 'text-text-muted',
  };

  const isInteractive = status !== 'locked';

  return (
    <div
      className="relative flex flex-col items-center animate-fade-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Connecting zigzag line — sits behind the node */}
      {!isLast && (
        <div
          className={`absolute top-7 bottom-0 w-0.5 border-l-2 border-dashed ${
            status === 'completed' ? 'border-primary-500/50' : 'border-border/60'
          } left-1/2 -translate-x-1/2`}
          aria-hidden
        />
      )}

      {/* Node circle */}
      <button
        onClick={isInteractive ? onTap : undefined}
        disabled={!isInteractive}
        className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300 ${nodeStyles[status]} ${
          isInteractive ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-not-allowed'
        }`}
        aria-label={lesson.titleAr}
      >
        {status === 'completed' ? (
          <Check size={26} strokeWidth={3} />
        ) : status === 'active' ? (
          <span className="text-xl font-bold ltr">{index + 1}</span>
        ) : (
          <Lock size={20} />
        )}
      </button>

      {/* Info card beneath the node */}
      <div
        onClick={isInteractive ? onTap : undefined}
        className={`mt-3 w-full max-w-[260px] flex flex-col gap-1.5 rounded-2xl border p-3.5 text-right transition-all duration-200 ${cardStyles[status]} ${
          isInteractive ? 'cursor-pointer hover:border-primary-500/60 hover:-translate-y-0.5' : 'cursor-not-allowed'
        }`}
      >
        {/* Title + category icon */}
        <div className="flex items-center gap-2">
          {category && (
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              status === 'locked' ? 'bg-white/5 text-text-muted' : 'bg-primary-500/15 text-primary-500'
            }`}>
              <CategoryIcon name={category.icon} size={14} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-bold truncate ${status === 'locked' ? 'text-text-muted' : 'text-text-primary'}`}>
              {lesson.titleAr}
            </p>
            <p className="text-2xs text-text-muted truncate ltr">{lesson.titleEn}</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-2xs text-text-muted truncate">{lesson.descriptionAr}</p>

        {/* Bottom row: progress + stars */}
        <div className="flex items-center justify-between mt-0.5">
          <span className={`text-2xs font-semibold ${labelStyles[status]}`}>
            {progressText}
          </span>
          <div className="flex gap-0.5">
            {[0, 1, 2].map((s) => (
              <Star
                key={s}
                size={11}
                className={s < stars ? 'text-primary-500' : 'text-white/15'}
                fill={s < stars ? 'currentColor' : 'none'}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LessonPathNode;
