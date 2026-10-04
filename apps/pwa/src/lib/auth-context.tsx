import * as React from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile, UserRole } from '@wird/domain';
import { isAuthRetryableFetchError, signInWithUsername } from '@wird/supabase-client';
import { supabase } from './supabase';
import { deleteMeta, getMetaJSON, mirrorAccessToken, setMetaJSON } from './offline';
import { unregisterPushDevice } from './notifications';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /**
   * Signed in — with a live session, or offline on the last known profile. An expired access
   * token cannot be refreshed without a network, and supabase-js then reports no session at
   * all; that must not look like a sign-out, or every offline open after the first hour lands
   * on the login screen with a full, usable cache behind it.
   */
  signedIn: boolean;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthState | null>(null);

// The last signed-in profile, so the app can open offline.
const PROFILE_KEY = 'profile';

function toProfile(row: {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  group_id: string | null;
  admin_group_id?: string | null;
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
    adminGroupId: row.admin_group_id ?? null,
    mustChangePassword: row.must_change_password,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function mirrorSession(session: Session | null) {
  void mirrorAccessToken(
    session?.expires_at
      ? { token: session.access_token, expiresAt: session.expires_at * 1000 }
      : null,
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [offlineSession, setOfflineSession] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  /** Cache first (instant, works offline), then the network refreshes it. */
  const loadProfile = React.useCallback(async (userId: string) => {
    const cached = await getMetaJSON<Profile>(PROFILE_KEY);
    if (cached?.id === userId) setProfile(cached);

    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!error && data) {
      const fresh = toProfile(data);
      setProfile(fresh);
      await setMetaJSON(PROFILE_KEY, fresh);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;

    async function restore() {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        setSession(data.session);
        setOfflineSession(false);
        mirrorSession(data.session);
        await loadProfile(data.session.user.id);
      } else if (error && isAuthRetryableFetchError(error)) {
        // The refresh token is still stored; only the network is missing. Keep the user in,
        // on the cached profile, and let the next successful refresh restore the session.
        const cached = await getMetaJSON<Profile>(PROFILE_KEY);
        if (cached) {
          setProfile(cached);
          setOfflineSession(true);
        }
      }
    }

    restore().finally(() => mounted && setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (newSession) {
        setSession(newSession);
        setOfflineSession(false);
        mirrorSession(newSession);
        // Token refreshes don't change the profile; don't refetch it every hour.
        if (event !== 'TOKEN_REFRESHED') await loadProfile(newSession.user.id);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setOfflineSession(false);
        mirrorSession(null);
      }
    });

    // Back online with only an offline session: try to recover the real one right away rather
    // than waiting for supabase-js's own refresh tick.
    function onOnline() {
      void restore();
    }
    window.addEventListener('online', onOnline);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
    };
  }, [loadProfile]);

  const signIn = React.useCallback(async (username: string, password: string) => {
    if (!navigator.onLine) return { error: 'يلزم الاتصال بالإنترنت لتسجيل الدخول' };
    const { error } = await signInWithUsername(supabase, username, password);
    if (error) {
      return {
        error: isAuthRetryableFetchError(error)
          ? 'تعذر الاتصال بالخادم، تحقق من الإنترنت وحاول مجدداً'
          : 'اسم المستخدم أو كلمة المرور غير صحيحة',
      };
    }
    return { error: null };
  }, []);

  const signOut = React.useCallback(async () => {
    // Stop this device receiving the account's reminders before the session goes. Best
    // effort: logging out must never be blocked by the network.
    await unregisterPushDevice();
    await deleteMeta(PROFILE_KEY);
    // scope: 'local' clears this device only and skips the /auth/v1/logout round trip, which
    // 403s whenever the access token has already expired — leaving the user visibly stuck on
    // a screen they asked to leave. Session rows expire server-side on their own.
    await supabase.auth.signOut({ scope: 'local' });
    // An offline session never had a supabase session to sign out of, so no SIGNED_OUT fires.
    setSession(null);
    setProfile(null);
    setOfflineSession(false);
    mirrorSession(null);
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signedIn = !!profile && (!!session || offlineSession);

  return (
    <AuthContext.Provider
      value={{ session, profile, signedIn, loading, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
