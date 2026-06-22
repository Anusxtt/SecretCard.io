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
