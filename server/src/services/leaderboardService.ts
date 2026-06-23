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
    .order('balance', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getMyRank(userId: string): Promise<{ rank: number; username: string; balance: number; wins: number; losses: number } | null> {
  const { data: me } = await supabase
    .from('profiles')
    .select('username, balance, wins, losses')
    .eq('id', userId)
    .single();
  if (!me) return null;

  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gt('balance', me.balance);

  return { rank: (count ?? 0) + 1, ...me };
}
