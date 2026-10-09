import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { exportProgress, importProgress, subscribe } from '@/data/progressStore';

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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const GUEST_KEY = 'words-app-guest';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem(GUEST_KEY) === 'true');
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<string>('');

  const fetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, level, daily_goal, streak, xp, progress_data')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.warn('Profile fetch error:', error.message);
      return null;
    }

    if (data) {
      setProfile({
        id: data.id,
        email: data.email,
        fullName: data.full_name ?? '',
        level: data.level,
        dailyGoal: data.daily_goal,
        streak: data.streak,
        xp: data.xp,
      });

      if (data.progress_data && Object.keys(data.progress_data).length > 0) {
        importProgress(data.progress_data);
      }
      return data;
    }
    return null;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        fetchProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      (async () => {
        setSession(newSession);
        if (newSession?.user) {
          setIsGuest(false);
          localStorage.removeItem(GUEST_KEY);
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'فشل إنشاء الحساب' };

    // The DB trigger auto-creates the profile row — upsert to also push local progress
    const localProgress = exportProgress();
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      email,
      progress_data: localProgress,
    });

    if (upsertError) {
      console.warn('Profile upsert error:', upsertError.message);
    }

    return { error: null };
  }, []);

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
    await supabase.auth.signOut();
    setProfile(null);
    setIsGuest(false);
    localStorage.removeItem(GUEST_KEY);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

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

  // Debounced server sync: subscribe to progress store changes and push to server
  useEffect(() => {
    if (!session?.user) return;

    const pushToServer = () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(async () => {
        const progress = exportProgress();
        const progressJson = JSON.stringify(progress);
        if (progressJson === lastSyncedRef.current) return;
        lastSyncedRef.current = progressJson;

        const { error } = await supabase
          .from('profiles')
          .update({
            progress_data: progress,
            streak: progress.streak,
            xp: progress.xp,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.user!.id);

        if (error) {
          console.warn('Progress sync error:', error.message);
        }
      }, 3000);
    };

    pushToServer();
    const unsub = subscribe(pushToServer);
    return () => {
      unsub();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [session]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
