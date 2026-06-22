import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface AuthUser {
  id: string;
  name: string;
  balance: number;
  isGuest: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // โหลด guest จาก localStorage
    const guest = localStorage.getItem('guest_user');
    if (guest) {
      setUser(JSON.parse(guest));
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, balance')
          .eq('id', data.session.user.id)
          .single();

        setUser({
          id: data.session.user.id,
          name: profile?.username ?? 'ผู้เล่น',
          balance: profile?.balance ?? 1000,
          isGuest: false,
        });
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, balance')
          .eq('id', session.user.id)
          .single();

        setUser({
          id: session.user.id,
          name: profile?.username ?? 'ผู้เล่น',
          balance: profile?.balance ?? 1000,
          isGuest: false,
        });
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
      isGuest: true,
    };
    localStorage.setItem('guest_user', JSON.stringify(guest));
    setUser(guest);
  };

  const loginWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  };

  const signupWithEmail = async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (!error && data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        username,
        balance: 1000,
      });
    }
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

  return { user, loading, loginAsGuest, loginWithEmail, signupWithEmail, logout, refreshBalance };
}
