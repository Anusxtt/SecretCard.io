import { supabase } from './supabaseClient';

export async function getBalance(userId: string): Promise<number> {
  const { data } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();
  return data?.balance ?? 0;
}

export async function adjustBalance(userId: string, delta: number): Promise<number> {
  const current = await getBalance(userId);
  const next = Math.max(0, current + delta);
  await supabase.from('profiles').update({ balance: next }).eq('id', userId);
  return next;
}

export async function transferBet(
  loserIds: string[],
  winnerId: string,
  betAmount: number
): Promise<void> {
  const pot = betAmount * loserIds.length;
  for (const id of loserIds) {
    await adjustBalance(id, -betAmount);
  }
  await adjustBalance(winnerId, pot);
}

export async function recordWin(userId: string): Promise<void> {
  await supabase.rpc('increment_wins', { user_id: userId });
}

export async function recordLoss(userId: string): Promise<void> {
  await supabase.rpc('increment_losses', { user_id: userId });
}

export async function saveGameHistory(
  gameType: 'somsip' | 'khang',
  winnerId: string | null,
  pot: number,
  players: object[]
): Promise<void> {
  await supabase.from('game_history').insert({
    game_type: gameType,
    winner_id: winnerId,
    pot,
    players,
  });
}
