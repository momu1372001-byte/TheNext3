import { useState, useCallback } from 'react';
import {
  GraduationCap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader as Loader2,
  ChevronLeft,
  Sparkles,
  BookOpen,
  Flame,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

type Mode = 'welcome' | 'login' | 'signup';

type AuthScreenProps = {
  onSkip: () => void;
};

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function AuthScreen({ onSkip }: AuthScreenProps) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!email.trim() || !password) {
        setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
        return;
      }

      if (password.length < 6) {
        setError('كلمة المرور يجب أن تكون ٦ أحرف على الأقل');
        return;
      }

      setLoading(true);
      const { error: err } =
        mode === 'login' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
      setLoading(false);

      if (err) {
        setError(translateError(err));
      }
    },
    [mode, email, password, signIn, signUp],
  );

  const handleGoogle = useCallback(async () => {
    setError(null);
    setGoogleLoading(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(translateError(err));
      setGoogleLoading(false);
    }
    // On success, the browser redirects to Google — loading state stays until redirect
  }, [signInWithGoogle]);

  // --- Welcome screen ---
  if (mode === 'welcome') {
    return (
      <div className="flex flex-1 flex-col bg-bg overflow-y-auto no-scrollbar">
        {/* Hero */}
        <div className="relative flex flex-col items-center justify-center px-6 pt-16 pb-8">
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-primary-500/10 blur-3xl" />
            <div className="absolute top-20 right-0 w-40 h-40 rounded-full bg-accent-500/10 blur-2xl" />
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-primary-500/30 blur-2xl animate-pulse-glow" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-400 to-accent-500 shadow-glow mb-6">
              <GraduationCap size={48} className="text-neutral-950" strokeWidth={2.2} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-text-primary text-center mt-4">
            ٦٥٠٠ كلمة إنجليزية
          </h1>
          <p className="text-sm text-text-muted text-center mt-2 leading-relaxed max-w-xs">
            تعلّم الإنجليزية كلمة بكلمة، ابنِ سلسلتك يوماً بعد يوم
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-col gap-3 px-6 pb-6">
          <FeaturePill icon={<BookOpen size={18} />} title="آلاف الكلمات" subtitle="من المستوى A1 إلى C1" />
          <FeaturePill icon={<Flame size={18} />} title="سلسلة يومية" subtitle="حافظ على تقدّمك كل يوم" />
          <FeaturePill icon={<Zap size={18} />} title="نقاط الخبرة" subtitle="اكسب XP مع كل إجابة" />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 px-6 pb-4 mt-auto">
          <button
            onClick={() => setMode('login')}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-500 text-neutral-950 font-bold py-4 text-base hover:bg-primary-400 active:scale-[0.98] transition-all duration-200 shadow-glow"
          >
            تسجيل الدخول
          </button>
          <button
            onClick={() => setMode('signup')}
            className="flex items-center justify-center gap-2 rounded-xl bg-surface-raised text-text-primary border border-border font-semibold py-4 text-base hover:border-primary-500/50 active:scale-[0.98] transition-all duration-200"
          >
            إنشاء حساب جديد
          </button>
        </div>

        {/* Google sign-in */}
        <div className="flex flex-col items-center gap-2 px-6 pb-4">
          <div className="flex items-center gap-3 w-full">
            <div className="h-px flex-1 bg-border/40" />
            <span className="text-2xs text-text-muted">أو</span>
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="flex items-center justify-center gap-3 rounded-xl bg-white text-neutral-800 font-semibold py-3.5 text-base hover:bg-neutral-100 active:scale-[0.98] transition-all duration-200 w-full disabled:opacity-50"
          >
            {googleLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <GoogleIcon size={20} />
            )}
            المتابعة بحساب جوجل
          </button>
        </div>

        {/* Skip */}
        <div className="flex flex-col items-center gap-2 px-6 pb-8">
          <button
            onClick={onSkip}
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors py-2"
          >
            <span>المتابعة كزائر</span>
            <ChevronLeft size={16} className="rotate-180" />
          </button>
          <p className="text-2xs text-text-muted text-center leading-relaxed max-w-xs">
            يمكنك تسجيل الدخول لاحقاً لحفظ تقدّمك ومزامنته عبر أجهزتك
          </p>
        </div>
      </div>
    );
  }

  // --- Login / Signup form ---
  const isLogin = mode === 'login';

  return (
    <div className="flex flex-1 flex-col bg-bg overflow-y-auto no-scrollbar">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-2 shrink-0">
        <button
          onClick={() => {
            setMode('welcome');
            setError(null);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-pill bg-white/5 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="رجوع"
        >
          <ChevronLeft size={18} className="rotate-180" />
        </button>
      </div>

      {/* Hero icon */}
      <div className="flex flex-col items-center px-6 pt-6 pb-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-primary-500/20 blur-xl animate-pulse-glow" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-accent-500 shadow-glow">
            <GraduationCap size={32} className="text-neutral-950" strokeWidth={2.2} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-text-primary mt-4">
          {isLogin ? 'مرحباً بعودتك' : 'أنشئ حسابك'}
        </h2>
        <p className="text-sm text-text-muted mt-1 text-center">
          {isLogin ? 'سجّل دخولك لمتابعة رحلتك' : 'ابدأ رحلتك في تعلّم الإنجليزية'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 pb-6">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label className="text-2xs font-semibold text-text-muted px-1">البريد الإلكتروني</label>
          <div className="relative">
            <Mail size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              dir="ltr"
              className="w-full rounded-xl bg-surface border border-border text-text-primary text-base px-4 py-3.5 pr-11 text-left placeholder:text-text-muted focus:outline-none focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/15 transition-all"
            />
          </div>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label className="text-2xs font-semibold text-text-muted px-1">كلمة المرور</label>
          <div className="relative">
            <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              dir="ltr"
              className="w-full rounded-xl bg-surface border border-border text-text-primary text-base px-4 py-3.5 pr-11 pl-11 text-left placeholder:text-text-muted focus:outline-none focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/15 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-error-500/10 border border-error-500/30 px-4 py-3 animate-fade-up">
            <p className="text-sm text-error-400">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary-500 text-neutral-950 font-bold py-4 text-base hover:bg-primary-400 active:scale-[0.98] transition-all duration-200 shadow-glow disabled:opacity-50 disabled:pointer-events-none mt-2"
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>
              <Sparkles size={18} />
              {isLogin ? 'دخول' : 'إنشاء الحساب'}
            </>
          )}
        </button>
      </form>

      {/* Google sign-in */}
      <div className="flex flex-col items-center gap-2 px-6 pb-4">
        <div className="flex items-center gap-3 w-full">
          <div className="h-px flex-1 bg-border/40" />
          <span className="text-2xs text-text-muted">أو</span>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="flex items-center justify-center gap-3 rounded-xl bg-white text-neutral-800 font-semibold py-3.5 text-base hover:bg-neutral-100 active:scale-[0.98] transition-all duration-200 w-full disabled:opacity-50"
        >
          {googleLoading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <GoogleIcon size={20} />
          )}
          المتابعة بحساب جوجل
        </button>
      </div>

      {/* Toggle mode */}
      <div className="flex items-center justify-center gap-1.5 text-sm px-6 pb-4">
        <span className="text-text-muted">
          {isLogin ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
        </span>
        <button
          type="button"
          onClick={() => {
            setMode(isLogin ? 'signup' : 'login');
            setError(null);
          }}
          className="text-primary-500 font-semibold hover:text-primary-400 transition-colors"
        >
          {isLogin ? 'أنشئ حساباً' : 'سجّل دخول'}
        </button>
      </div>

      {/* Back / Skip */}
      <div className="flex flex-col items-center gap-2 px-6 pb-8 mt-auto">
        <div className="flex items-center gap-3 w-full">
          <div className="h-px flex-1 bg-border/40" />
          <span className="text-2xs text-text-muted">أو</span>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors py-2"
        >
          <span>المتابعة كزائر</span>
          <ChevronLeft size={16} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}

export default AuthScreen;

function FeaturePill({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface border border-border/60 px-4 py-3 animate-fade-up">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-500">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="text-2xs text-text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function translateError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials'))
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  if (lower.includes('user already registered'))
    return 'هذا البريد مسجّل بالفعل. سجّل دخولك بدلاً من ذلك';
  if (lower.includes('email'))
    return 'البريد الإلكتروني غير صالح';
  if (lower.includes('password'))
    return 'كلمة المرور ضعيفة جداً. استخدم ٦ أحرف على الأقل';
  if (lower.includes('rate limit'))
    return 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً';
  if (lower.includes('network') || lower.includes('fetch'))
    return 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً';
  return 'حدث خطأ. حاول مرة أخرى';
}
