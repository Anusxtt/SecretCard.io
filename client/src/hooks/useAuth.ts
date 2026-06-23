import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface AuthUser {
  id: string;
  name: string;
  balance: number;
  wins: number;
  losses: number;
  isGuest: boolean;
  isAdmin?: boolean;
  avatarSeed?: string;
  avatarFrame?: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const buildUser = (id: string, profile: { username?: string; balance?: number; wins?: number; losses?: number; avatar_seed?: string; avatar_frame?: string; is_admin?: boolean } | null): AuthUser => ({
    id,
    name: profile?.username ?? 'ผู้เล่น',
    balance: profile?.balance ?? 1000,
    wins: profile?.wins ?? 0,
    losses: profile?.losses ?? 0,
    isGuest: false,
    isAdmin: profile?.is_admin ?? false,
    avatarSeed: profile?.avatar_seed ?? undefined,
    avatarFrame: profile?.avatar_frame ?? 'none',
  });

  const createAutoGuest = (): AuthUser => {
    const id = `guest_${Date.now()}`;
    const suffix = Math.floor(100 + Math.random() * 900);
    const name = `Guest_${suffix}`;
    const guest: AuthUser = { id, name, balance: 500, wins: 0, losses: 0, isGuest: true };
    localStorage.setItem('guest_user', JSON.stringify(guest));
    return guest;
  };

  useEffect(() => {
    const guestRaw = localStorage.getItem('guest_user');

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        // logged-in user — ignore any guest
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, balance, wins, losses, avatar_seed, avatar_frame, is_admin')
          .eq('id', data.session.user.id)
          .single();
        setUser(buildUser(data.session.user.id, profile));
        setLoading(false);
        return;
      }
      // no session — use stored guest or create new one
      const guest = guestRaw ? JSON.parse(guestRaw) : createAutoGuest();
      setUser(guest);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, balance, wins, losses, avatar_seed, avatar_frame, is_admin')
          .eq('id', session.user.id)
          .single();
        setUser(buildUser(session.user.id, profile));
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('guest_user');
        setUser(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const loginAsGuest = (name: string) => {
    const guest: AuthUser = {
      id: `guest_${Date.now()}`,
      name,
      balance: 1000,
      wins: 0,
      losses: 0,
      isGuest: true,
    };
    localStorage.setItem('guest_user', JSON.stringify(guest));
    setUser(guest);
  };

  const loginWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  };

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const signupWithEmail = async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    return error;
  };

  const logout = async () => {
    localStorage.removeItem('guest_user');
    await supabase.auth.signOut();
    setUser(null);
  };

  const refreshBalance = async () => {
    if (!user || user.isGuest) return;
    const { data } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single();
    if (data) setUser({ ...user, balance: data.balance });
  };

  const refreshProfile = async () => {
    if (!user || user.isGuest) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, balance, wins, losses, avatar_seed, avatar_frame, is_admin')
      .eq('id', user.id)
      .single();
    if (profile) setUser(buildUser(user.id, profile));
  };

  return { user, loading, loginAsGuest, loginWithEmail, loginWithGoogle, signupWithEmail, logout, refreshBalance, refreshProfile };
}
