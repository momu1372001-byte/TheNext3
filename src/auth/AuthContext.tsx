
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

  // Only sync after this user's cloud profile has been loaded.
  const [readyUserId, setReadyUserId] = useState<string | null>(null);

  const activeUserIdRef = useRef<string | null>(null);
  const syncTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<string>('');

  const clearSyncTimer = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, []);

  /**
   * Loads the profile belonging to one specific authenticated user.
   * A missing profile is created before synchronization is enabled.
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

        // Ignore a response that belongs to an account no longer active.
        if (activeUserIdRef.current !== uid) {
          return null;
        }

        let row = data as ProfileRow | null;

        if (!row) {
          // This snapshot comes from the local store for this user only.
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

        if (
          cloudProgress !== null &&
          typeof cloudProgress === 'object' &&
          !Array.isArray(cloudProgress)
        ) {
          // Replace, don't merge: progress must not leak between accounts.
          importProgress(cloudProgress as Parameters<typeof importProgress>[0]);

          lastSyncedRef.current = JSON.stringify(exportProgress());
        } else {
          // No cloud snapshot exists yet. Allow the current user's
          // isolated local progress to be uploaded by the sync effect.
          lastSyncedRef.current = '';
        }

        // Recheck after loading/importing, before enabling sync.
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
          localStorage.removeItem(GUEST_KEY);

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

        // Switch local storage before loading the new account's profile.
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
          localStorage.removeItem(GUEST_KEY);

          // Keep network requests outside the auth callback.
          setTimeout(() => {
            if (activeUserIdRef.current === newSession.user.id) {
              void fetchProfile(
                newSession.user.id,
                newSession.user.email ?? '',
              );
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

      // With email confirmation enabled, there may be no session yet.
      // The authenticated-session flow will create/load the profile later.
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

    // The auth listener switches the store to the guest account.
    setProfile(null);
    setReadyUserId(null);
    setIsGuest(false);
    localStorage.removeItem(GUEST_KEY);
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

  useEffect(() => {
    const userId = session?.user.id;

    // Do not sync until the matching account has finished loading.
    if (!userId || readyUserId !== userId) {
      return;
    }

    const pushToServer = () => {
      clearSyncTimer();

      syncTimerRef.current = setTimeout(async () => {
        if (
          activeUserIdRef.current !== userId ||
          readyUserId !== userId
        ) {
          return;
        }

        const progress = exportProgress();
        const progressJson = JSON.stringify(progress);

        if (progressJson === lastSyncedRef.current) {
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

        if (error) {
          console.error('Progress sync error:', error.message);
          return;
        }

        // An update affecting zero rows is not a successful sync.
        if (!data || data.length === 0) {
          console.error(
            'Progress sync failed: no matching profile row was updated.',
          );
          return;
        }

        lastSyncedRef.current = progressJson;
      }, 3000);
    };

    const unsubscribe = subscribe(pushToServer);

    // If the cloud had no snapshot, upload this account's local state.
    if (lastSyncedRef.current === '') {
      pushToServer();
    }

    return () => {
      unsubscribe();
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
