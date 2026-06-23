import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/RoomManager';
import { supabase } from '../services/supabaseClient';

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}

export function registerAdminHandlers(io: Server, socket: Socket, rm: RoomManager) {
  socket.on('admin:get_rooms', async ({ userId }: { userId: string }) => {
    if (!(await isAdmin(userId))) {
      socket.emit('admin:error', { message: 'Unauthorized' });
      return;
    }

    const rooms = rm.getAllRooms().map((room) => ({
      roomId: room.roomId,
      gameType: room.gameType,
      betAmount: room.betAmount,
      started: room.started,
      playerCount: room.players.filter((p) => !p.isBot).length,
      botCount: room.players.filter((p) => p.isBot).length,
      players: room.players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        isBot: p.isBot,
        isGuest: p.isGuest,
      })),
    }));

    socket.emit('admin:rooms', rooms);
  });

  socket.on('admin:get_players', async ({ userId, limit = 50, offset = 0 }: { userId: string; limit?: number; offset?: number }) => {
    if (!(await isAdmin(userId))) {
      socket.emit('admin:error', { message: 'Unauthorized' });
      return;
    }

    const { data, count } = await supabase
      .from('profiles')
      .select('id, username, balance, wins, losses, is_admin, created_at', { count: 'exact' })
      .order('balance', { ascending: false })
      .range(offset, offset + limit - 1);

    socket.emit('admin:players', { players: data ?? [], total: count ?? 0 });
  });

  socket.on('admin:get_stats', async ({ userId }: { userId: string }) => {
    if (!(await isAdmin(userId))) {
      socket.emit('admin:error', { message: 'Unauthorized' });
      return;
    }

    const [{ count: totalPlayers }, { count: totalGames }, { data: richest }] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gt('wins', 0),
      supabase.from('profiles').select('username, balance').order('balance', { ascending: false }).limit(1),
    ]);

    const activeRooms = rm.getAllRooms();
    const activeGames = activeRooms.filter((r) => r.started).length;
    const waitingRooms = activeRooms.filter((r) => !r.started).length;
    const onlinePlayers = activeRooms.reduce((sum, r) => sum + r.players.filter((p) => !p.isBot).length, 0);

    socket.emit('admin:stats', {
      totalPlayers: totalPlayers ?? 0,
      totalGamesPlayed: totalGames ?? 0,
      activeGames,
      waitingRooms,
      onlinePlayers,
      richestPlayer: richest?.[0] ?? null,
    });
  });

  socket.on('admin:kick_room', async ({ userId, roomId }: { userId: string; roomId: string }) => {
    if (!(await isAdmin(userId))) {
      socket.emit('admin:error', { message: 'Unauthorized' });
      return;
    }

    io.to(roomId).emit('room:kicked', { reason: 'Admin closed this room' });
    socket.emit('admin:kick_room_ok', { roomId });
  });

  socket.on('admin:adjust_balance', async ({ userId, targetId, newBalance }: { userId: string; targetId: string; newBalance: number }) => {
    if (!(await isAdmin(userId))) {
      socket.emit('admin:error', { message: 'Unauthorized' });
      return;
    }

    if (newBalance < 0 || newBalance > 10_000_000) {
      socket.emit('admin:error', { message: 'Invalid balance' });
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', targetId);

    if (error) {
      socket.emit('admin:error', { message: 'Failed to update balance' });
      return;
    }

    socket.emit('admin:adjust_balance_ok', { targetId, newBalance });
  });

  socket.on('admin:search_player', async ({ userId, query }: { userId: string; query: string }) => {
    if (!(await isAdmin(userId))) {
      socket.emit('admin:error', { message: 'Unauthorized' });
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, username, balance, wins, losses, is_admin, created_at')
      .ilike('username', `%${query}%`)
      .limit(20);

    socket.emit('admin:search_result', { players: data ?? [] });
  });

  socket.on('admin:get_history', async ({ userId, limit = 50, offset = 0 }: { userId: string; limit?: number; offset?: number }) => {
    if (!(await isAdmin(userId))) {
      socket.emit('admin:error', { message: 'Unauthorized' });
      return;
    }

    const { data, count } = await supabase
      .from('game_history')
      .select('id, game_type, winner_id, pot, players, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // ดึง username ของ winner
    const winnerIds = [...new Set((data ?? []).map((r: any) => r.winner_id).filter(Boolean))];
    let winnerMap: Record<string, string> = {};
    if (winnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', winnerIds);
      for (const p of profiles ?? []) winnerMap[p.id] = p.username;
    }

    const rows = (data ?? []).map((r: any) => ({
      ...r,
      winner_name: winnerMap[r.winner_id] ?? (r.players?.find((p: any) => p.id === r.winner_id)?.name ?? 'บอท/ไม่ระบุ'),
    }));

    socket.emit('admin:history', { rows, total: count ?? 0 });
  });
}
