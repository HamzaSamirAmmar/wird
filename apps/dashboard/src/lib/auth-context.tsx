import * as React from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@wird/domain';
import { signInWithUsername } from '@wird/supabase-client';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthState | null>(null);

function toProfile(row: {
  id: string;
  username: string;
  full_name: string;
  role: 'employee' | 'supervisor';
  group_id: string | null;
  must_change_password: boolean;
  is_active: boolean;
  created_at: string;
}): Profile {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    groupId: row.group_id,
    mustChangePassword: row.must_change_password,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadProfile = React.useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!error && data) setProfile(toProfile(data));
  }, []);

  React.useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = React.useCallback(async (username: string, password: string) => {
    const { error } = await signInWithUsername(supabase, username, password);
    if (error) return { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    return { error: null };
  }, []);

  const signOut = React.useCallback(async () => {
    // scope: 'local' clears this device only and skips the /auth/v1/logout round trip, which
    // 403s whenever the access token has already expired — leaving the user visibly stuck on
    // a screen they asked to leave. Session rows expire server-side on their own.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
