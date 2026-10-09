import { useEffect, useState } from 'react';
import { PhoneFrame, TabBar } from '@/components/ui';
import { loadProfile, saveProfile, updateProfile, clearProfile } from '@/data/profileStore';
import { resetProgress, subscribe } from '@/data/progressStore';
import type { OnboardingState, TabKey } from '@/types';
import OnboardingScreen from '@/screens/OnboardingScreen';
import LearnScreen from '@/screens/LearnScreen';
import ReviewScreen from '@/screens/ReviewScreen';
import ProgressScreen from '@/screens/ProgressScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import SettingsScreen from '@/SettingsScreen';
import { useSettings } from '@/useSettings';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import AuthScreen from '@/screens/AuthScreen';
import { supabase } from '@/lib/supabaseClient';

function AppInner() {
  const { user, profile: authProfile, loading } = useAuth();
  const [profile, setProfile] = useState<OnboardingState>(() => loadProfile());
  const [activeTab, setActiveTab] = useState<TabKey>('learn');
  const [showSettings, setShowSettings] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  useSettings();

  // Re-render on progress store changes (streak/XP updates, etc.)
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);

  // If user signs in and has a server profile, sync level/dailyGoal to local onboarding
  const authProfileKey = authProfile ? `${authProfile.id}:${authProfile.level}:${authProfile.dailyGoal}` : '';
  useEffect(() => {
    if (!authProfile || (!authProfile.level && !authProfile.dailyGoal)) return;
    const local = loadProfile();
    let changed = false;
    let next = { ...local };
    const serverLevel = authProfile.level as OnboardingState['level'];
    if (serverLevel && (!local.level || local.level !== serverLevel)) {
      next = { ...next, level: serverLevel };
      changed = true;
    }
    if (authProfile.dailyGoal && local.dailyGoal !== authProfile.dailyGoal) {
      next = { ...next, dailyGoal: authProfile.dailyGoal };
      changed = true;
    }
    if (!local.completed && serverLevel) {
      next = { ...next, completed: true };
      changed = true;
    }
    if (changed) {
      saveProfile(next);
      // Defer setState to avoid cascading renders
      Promise.resolve().then(() => setProfile(next));
    }
  }, [authProfileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOnboardingComplete = (level: OnboardingState['level'], dailyGoal: number) => {
    const next = { level, dailyGoal, completed: true };
    saveProfile(next);
    setProfile(next);
  };

  const handleUpdateProfile = (partial: Partial<OnboardingState>) => {
    const next = updateProfile(partial);
    setProfile(next);

    if (user) {
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (partial.level) updateData.level = partial.level;
      if (partial.dailyGoal) updateData.daily_goal = partial.dailyGoal;
      supabase.from('profiles').update(updateData).eq('id', user.id).then(({ error }) => {
        if (error) console.warn('Profile sync error:', error.message);
      });
    }
  };

  const handleResetOnboarding = () => {
    clearProfile();
    resetProgress();
    setProfile({ level: null, dailyGoal: 0, completed: false });
    setActiveTab('learn');
  };

  // Show nothing while auth is loading
  if (loading) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
        </div>
      </PhoneFrame>
    );
  }

  // Show auth prompt (triggered from profile tab when user is a guest)
  if (showAuthPrompt && !user) {
    return (
      <PhoneFrame>
        <AuthScreen onSkip={() => setShowAuthPrompt(false)} />
      </PhoneFrame>
    );
  }

  // Show onboarding if not completed
  if (!profile.completed || !profile.level) {
    return (
      <PhoneFrame>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </PhoneFrame>
    );
  }

  // Settings overlay (accessible from profile tab)
  if (showSettings) {
    return (
      <PhoneFrame>
        <SettingsScreen
          profile={profile}
          onUpdateProfile={handleUpdateProfile}
          onResetProgress={resetProgress}
          onBack={() => setShowSettings(false)}
        />
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      {activeTab === 'learn' && <LearnScreen profile={profile} />}
      {activeTab === 'review' && <ReviewScreen />}
      {activeTab === 'progress' && <ProgressScreen profile={profile} />}
      {activeTab === 'profile' && (
        <ProfileScreen
          profile={profile}
          onUpdateProfile={handleUpdateProfile}
          onResetOnboarding={handleResetOnboarding}
          onOpenSettings={() => setShowSettings(true)}
          onRequestAuth={() => setShowAuthPrompt(true)}
        />
      )}
      <TabBar active={activeTab} onChange={setActiveTab} />
    </PhoneFrame>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
