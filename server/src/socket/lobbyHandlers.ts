import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { RoomManager } from '../rooms/RoomManager';
import { GameType } from '../rooms/Room';
import { getTopPlayers } from '../services/leaderboardService';

export function registerLobbyHandlers(io: Server, socket: Socket, rm: RoomManager) {
  socket.on(
    'join_lobby',
    async (data: {
      gameType: GameType;
      betAmount: number;
      playerName: string;
      playerId?: string;
      balance?: number;
    }) => {
      const playerId = data.playerId || uuidv4();
      const player = {
        socketId: socket.id,
        playerId,
        name: data.playerName || 'ผู้เล่น',
        balance: data.balance ?? 1000,
        isBot: false,
        isGuest: !data.playerId,
      };

      // หาห้องที่รอ หรือสร้างใหม่
      let room = rm.findWaitingRoom(data.gameType, data.betAmount);
      if (!room) {
        room = rm.createRoom(data.gameType, data.betAmount);
      }

      rm.joinRoom(room.roomId, player);
      socket.join(room.roomId);

      io.to(room.roomId).emit('room_update', {
        roomId: room.roomId,
        players: room.players.map((p) => ({ playerId: p.playerId, name: p.name })),
        betAmount: room.betAmount,
        gameType: room.gameType,
      });

      socket.emit('joined_room', { roomId: room.roomId, playerId });
    }
  );

  socket.on('start_with_bots', (data: { roomId: string }) => {
    const room = rm.getRoom(data.roomId);
    if (!room || room.started) return;

    // เติม bot ให้ครบ 2 คน
    while (room.players.length < 2) {
      const botId = uuidv4();
      room.addPlayer({
        socketId: `bot_${botId}`,
        playerId: botId,
        name: `Bot ${room.players.length + 1}`,
        balance: 1000,
        isBot: true,
        isGuest: true,
      });
    }

    io.to(data.roomId).emit('game_ready', {
      roomId: data.roomId,
      players: room.players.map((p) => ({ playerId: p.playerId, name: p.name, isBot: p.isBot })),
    });
  });

  socket.on('get_leaderboard', async () => {
    const entries = await getTopPlayers(10);
    socket.emit('leaderboard', entries);
  });
}
