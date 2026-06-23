import { supabase } from './supabaseClient';

export interface LeaderboardEntry {
  username: string;
  balance: number;
  wins: number;
  losses: number;
}

export async function getTopPlayers(limit = 10): Promise<LeaderboardEntry[]> {
  const { data } = await supabase
    .from('profiles')
    .select('username, balance, wins, losses')
    .eq('is_admin', false)
    .order('balance', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getMyRank(userId: string): Promise<{ rank: number; username: string; balance: number; wins: number; losses: number } | null> {
  const { data: me } = await supabase
    .from('profiles')
    .select('username, balance, wins, losses, is_admin')
    .eq('id', userId)
    .single();
  if (!me || me.is_admin) return null;

  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_admin', false)
    .gt('balance', me.balance);

  return { rank: (count ?? 0) + 1, username: me.username, balance: me.balance, wins: me.wins, losses: me.losses };
}
