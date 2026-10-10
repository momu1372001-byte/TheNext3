
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

import {
  exportProgress,
  importProgress,
  setProgressUser,
  subscribe,
  hasPendingProgressSync,
  markProgressSyncComplete,
} from '@/data/progressStore';

export type UserProfile = {
  id: string;
  email: string;
  fullName: string;
  level: string;
  dailyGoal: number;
  streak: number;
  xp: number;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

const GUEST_KEY = 'words-app-guest';

const PROFILE_SELECT =
  'id, email, full_name, level, daily_goal, streak, xp, progress_data';

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  level: string | null;
  daily_goal: number | null;
  streak: number | null;
  xp: number | null;
  progress_data: unknown;
};

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [isGuest, setIsGuest] = useState(
    () => localStorage.getItem(GUEST_KEY) === 'true',
  );

  // لا نسمح بالمزامنة قبل تحميل بيانات الحساب المطابق.
  const [readyUserId, setReadyUserId] = useState<string | null>(null);

  const activeUserIdRef = useRef<string | null>(null);

  const syncTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastSyncedRef = useRef<string>('');

  const clearSyncTimer = useCallback(() => {
    if (syncTimerRef.current !== null) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, []);

  /**
   * تحميل الملف الشخصي الخاص بالمستخدم الحالي.
   *
   * إذا كان هناك تقدم محلي لم تتم مزامنته، نحافظ عليه
   * ولا نستبدله بنسخة سحابية قديمة.
   */
  const fetchProfile = useCallback(
    async (uid: string, email = ''): Promise<ProfileRow | null> => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .eq('id', uid)
          .maybeSingle();

        if (error) {
          console.error('Profile fetch error:', error.message);
          return null;
        }

        // تجاهل أي استجابة تخص حسابًا لم يعد نشطًا.
        if (activeUserIdRef.current !== uid) {
          return null;
        }

        let row = data as ProfileRow | null;

        if (!row) {
          // هذا التقدم مأخوذ من المخزن المحلي لهذا الحساب فقط.
          const localProgress = exportProgress();

          const { data: created, error: createError } = await supabase
            .from('profiles')
            .upsert(
              {
                id: uid,
                email,
                full_name: '',
                level: '',
                daily_goal: 10,
                streak: localProgress.streak,
                xp: localProgress.xp,
                progress_data: localProgress,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'id' },
            )
            .select(PROFILE_SELECT)
            .single();

          if (createError || !created) {
            console.error(
              'Profile creation error:',
              createError?.message ?? 'No profile returned',
            );
            return null;
          }

          if (activeUserIdRef.current !== uid) {
            return null;
          }

          row = created as ProfileRow;
        }

        // التأكد مرة أخرى من الحساب قبل التعامل مع التقدم.
        if (activeUserIdRef.current !== uid) {
          return null;
        }

        setProfile({
          id: row.id,
          email: row.email ?? email,
          fullName: row.full_name ?? '',
          level: row.level ?? '',
          dailyGoal: row.daily_goal ?? 10,
          streak: row.streak ?? 0,
          xp: row.xp ?? 0,
        });

        const cloudProgress = row.progress_data;

        const hasValidCloudProgress =
          cloudProgress !== null &&
          typeof cloudProgress === 'object' &&
          !Array.isArray(cloudProgress);

        // نعيد فحص علامة التقدم غير المتزامن بعد اكتمال طلب الشبكة.
        // قد يكون المستخدم قد تعلم كلمات أثناء انتظار الاستجابة.
        const hasLocalPendingChanges = hasPendingProgressSync();

        if (hasValidCloudProgress && hasLocalPendingChanges) {
          /*
           * توجد تغييرات محلية لم تصل إلى الخادم.
           * لا نستورد النسخة السحابية فوقها.
           * نحتفظ بالنسخة المحلية ونترك المزامنة ترفعها.
           */
          lastSyncedRef.current = JSON.stringify(cloudProgress);
        } else if (hasValidCloudProgress) {
          /*
           * لا توجد تغييرات محلية معلقة.
           * من الآمن استعادة تقدم الحساب من السحابة.
           */
          importProgress(
            cloudProgress as Parameters<typeof importProgress>[0],
          );

          lastSyncedRef.current = JSON.stringify(exportProgress());
        } else {
          // لا توجد نسخة سحابية صالحة حتى الآن.
          // ستتم محاولة رفع التقدم المحلي عند تفعيل المزامنة.
          lastSyncedRef.current = '';
        }

        if (activeUserIdRef.current !== uid) {
          return null;
        }

        setReadyUserId(uid);

        return row;
      } catch (error) {
        console.error('Profile loading error:', error);
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;

    const initializeSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Session fetch error:', error.message);
          return;
        }

        if (!active) return;

        const initialSession = data.session;
        const initialUserId = initialSession?.user.id ?? null;

        activeUserIdRef.current = initialUserId;

        setProgressUser(initialUserId);
        setReadyUserId(null);
        lastSyncedRef.current = '';

        setSession(initialSession);

        if (initialSession?.user) {
          setIsGuest(false);

          try {
            localStorage.removeItem(GUEST_KEY);
          } catch (storageError) {
            console.error('Guest storage cleanup error:', storageError);
          }

          await fetchProfile(
            initialSession.user.id,
            initialSession.user.email ?? '',
          );
        }
      } catch (error) {
        console.error('Session initialization error:', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        const newUserId = newSession?.user.id ?? null;

        // تغيير مخزن التقدم عند تغيير الحساب، دون دمج بيانات الحسابات.
        if (activeUserIdRef.current !== newUserId) {
          activeUserIdRef.current = newUserId;

          setProgressUser(newUserId);
          setReadyUserId(null);

          lastSyncedRef.current = '';

          clearSyncTimer();
          setProfile(null);
        }

        setSession(newSession);

        if (newSession?.user) {
          setIsGuest(false);

          try {
            localStorage.removeItem(GUEST_KEY);
          } catch (storageError) {
            console.error('Guest storage cleanup error:', storageError);
          }

          // تنفيذ طلب الشبكة خارج callback المصادقة.
          const userId = newSession.user.id;
          const userEmail = newSession.user.email ?? '';

          setTimeout(() => {
            if (activeUserIdRef.current === userId) {
              void fetchProfile(userId, userEmail);
            }
          }, 0);
        } else {
          setProfile(null);
          setReadyUserId(null);
        }

        setLoading(false);
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
      clearSyncTimer();
    };
  }, [fetchProfile, clearSyncTimer]);

  /**
   * إعادة محاولة تحميل الملف الشخصي عند رجوع الإنترنت،
   * خصوصًا إذا فشل التحميل الأول بسبب انقطاع الاتصال.
   */
  useEffect(() => {
    const currentUser = session?.user;

    if (!currentUser) return;

    const retryProfileLoad = () => {
      if (activeUserIdRef.current !== currentUser.id) {
        return;
      }

      // إذا لم يكتمل تحميل الملف الشخصي، نحاول من جديد.
      if (readyUserId !== currentUser.id) {
        void fetchProfile(
          currentUser.id,
          currentUser.email ?? '',
        );
      }
    };

    window.addEventListener('online', retryProfileLoad);

    return () => {
      window.removeEventListener('online', retryProfileLoad);
    };
  }, [session, readyUserId, fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      return { error: error?.message ?? null };
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (!data.user) {
        return {
          error: 'فشل إنشاء الحساب. حاول مرة أخرى.',
        };
      }

      // قد لا توجد جلسة بعد إنشاء الحساب إذا كان تأكيد البريد مطلوبًا.
      if (data.session) {
        const userId = data.user.id;

        activeUserIdRef.current = userId;

        setProgressUser(userId);
        setReadyUserId(null);

        lastSyncedRef.current = '';

        clearSyncTimer();

        const localProgress = exportProgress();

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: userId,
              email: normalizedEmail,
              full_name: '',
              level: '',
              daily_goal: 10,
              progress_data: localProgress,
              streak: localProgress.streak,
              xp: localProgress.xp,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          );

        if (profileError) {
          console.error(
            'Profile creation error:',
            profileError.message,
          );

          return {
            error:
              'تم إنشاء الحساب، لكن تعذر حفظ الملف الشخصي. سجّل الدخول وحاول مرة أخرى.',
          };
        }

        await fetchProfile(userId, normalizedEmail);
      }

      return { error: null };
    },
    [fetchProfile, clearSyncTimer],
  );

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    clearSyncTimer();

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Sign out error:', error.message);
      return;
    }

    // مستمع المصادقة سيحوّل مخزن التقدم إلى مخزن الضيف.
    setProfile(null);
    setReadyUserId(null);
    setIsGuest(false);

    try {
      localStorage.removeItem(GUEST_KEY);
    } catch (storageError) {
      console.error('Guest storage cleanup error:', storageError);
    }
  }, [clearSyncTimer]);

  const refreshProfile = useCallback(async () => {
    const currentSession = session;

    if (currentSession?.user) {
      await fetchProfile(
        currentSession.user.id,
        currentSession.user.email ?? '',
      );
    }
  }, [session, fetchProfile]);

  /**
   * مزامنة التقدم مع الخادم.
   *
   * - حفظ محلي فوري يجري داخل progressStore.
   * - تأخير قصير لتجميع التغييرات المتتابعة.
   * - لا نمسح علامة التقدم المعلق إلا بعد نجاح الحفظ.
   * - عند عودة الاتصال، نحاول إرسال التقدم مرة أخرى.
   */
  useEffect(() => {
    const userId = session?.user.id;

    // لا تزامن قبل تحميل ملف الحساب المطابق.
    if (!userId || readyUserId !== userId) {
      return;
    }

    let disposed = false;

    const pushToServer = () => {
      clearSyncTimer();

      syncTimerRef.current = setTimeout(async () => {
        if (
          disposed ||
          activeUserIdRef.current !== userId ||
          readyUserId !== userId
        ) {
          return;
        }

        const progress = exportProgress();
        const progressJson = JSON.stringify(progress);

        const pending = hasPendingProgressSync();

        // لا حاجة لرفع نسخة مطابقة إذا لم توجد تغييرات معلقة.
        if (
          progressJson === lastSyncedRef.current &&
          !pending
        ) {
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .update({
            progress_data: progress,
            streak: progress.streak,
            xp: progress.xp,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select('id');

        // تجاهل نتيجة أي طلب انتهى بعد تغيير الحساب أو إلغاء الأثر.
        if (
          disposed ||
          activeUserIdRef.current !== userId
        ) {
          return;
        }

        if (error) {
          // لا نمسح التغييرات المعلقة عند فشل الشبكة.
          console.error('Progress sync error:', error.message);
          return;
        }

        if (!data || data.length === 0) {
          console.error(
            'Progress sync failed: no matching profile row was updated.',
          );
          return;
        }

        /*
         * تُمسح علامة الانتظار فقط إذا كانت الحالة الحالية
         * ما زالت مطابقة للنسخة التي نجح رفعها.
         */
        markProgressSyncComplete(progressJson);

        lastSyncedRef.current = progressJson;

        // ربما تغير التقدم أثناء انتظار استجابة الخادم.
        const latestJson = JSON.stringify(exportProgress());

        if (
          latestJson !== progressJson ||
          hasPendingProgressSync()
        ) {
          pushToServer();
        }
      }, 3000);
    };

    const unsubscribe = subscribe(pushToServer);

    const retrySync = () => {
      if (
        activeUserIdRef.current === userId &&
        readyUserId === userId
      ) {
        pushToServer();
      }
    };

    window.addEventListener('online', retrySync);
    window.addEventListener('focus', retrySync);

    // رفع أي تغييرات معلقة أو حالة لم تُرفع بعد.
    if (
      hasPendingProgressSync() ||
      lastSyncedRef.current === ''
    ) {
      pushToServer();
    }

    return () => {
      disposed = true;

      unsubscribe();

      window.removeEventListener('online', retrySync);
      window.removeEventListener('focus', retrySync);

      clearSyncTimer();
    };
  }, [session, readyUserId, clearSyncTimer]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isGuest,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}