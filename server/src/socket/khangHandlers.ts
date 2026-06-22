import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/RoomManager';
import { KhangRoom } from '../games/khang/KhangGame';
import { adjustBalance, saveGameHistory } from '../services/walletService';

export function registerKhangHandlers(io: Server, socket: Socket, rm: RoomManager) {

  socket.on('kh:start', (data: { roomId: string }) => {
    const room = rm.getRoom(data.roomId) as KhangRoom | undefined;
    if (!room || room.gameType !== 'khang' || room.started) return;

    const state = room.startGame();
    broadcastState(io, room, state);

    if (state.phase === 'finished' && state.result) {
      handleFinish(io, room, state.result.winnerId);
    } else {
      runBotIfNeeded(io, room);
    }
  });

  socket.on('kh:khang', (data: { roomId: string }) => {
    const room = rm.getRoom(data.roomId) as KhangRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const state = room.handleKhang(playerIndex);
    if (!state) return;
    broadcastState(io, room, state);
    if (state.result) handleFinish(io, room, state.result.winnerId);
  });

  // จั่ว (แค่จั่ว ยังไม่ทิ้ง)
  socket.on('kh:draw', (data: { roomId: string }) => {
    const room = rm.getRoom(data.roomId) as KhangRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const state = room.handleDraw(playerIndex);
    if (!state) return;
    broadcastState(io, room, state);
    if (state.result) handleFinish(io, room, state.result.winnerId);
  });

  // ทิ้งไพ่ (หลังจั่ว)
  socket.on('kh:discard', (data: { roomId: string; cardId: string }) => {
    const room = rm.getRoom(data.roomId) as KhangRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const state = room.handleDiscard(playerIndex, data.cardId);
    if (!state) return;
    broadcastState(io, room, state);
    if (state.result) handleFinish(io, room, state.result.winnerId);
    else runBotIfNeeded(io, room);
  });

  // ไหล
  socket.on('kh:flow', (data: { roomId: string; cardId: string }) => {
    const room = rm.getRoom(data.roomId) as KhangRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const state = room.handleFlow(playerIndex, { cardId: data.cardId });
    if (!state) return;
    broadcastState(io, room, state);
    // หลังไหล → เทิร์นเดิม ไม่ต้อง runBot (รอ human จั่ว)
  });
}

async function handleFinish(io: Server, room: KhangRoom, winnerId: string) {
  const gs = room.gameState!;
  const result = gs.result!;
  const pot = room.betAmount * room.players.length;

  for (const p of room.players) {
    if (!p.isGuest && !p.isBot) {
      const delta = p.playerId === winnerId ? pot - room.betAmount : -room.betAmount;
      await adjustBalance(p.playerId, delta);
    }
  }

  if (result.wrongKhangId) {
    io.to(room.roomId).emit('kh:wrong_khang', {
      playerId: result.wrongKhangId,
      penalty: room.betAmount * (room.players.length - 1),
    });
  }

  await saveGameHistory(
    'khang',
    winnerId,
    pot,
    room.players.map((p) => ({ id: p.playerId, name: p.name }))
  );

  io.to(room.roomId).emit('kh:finished', {
    winnerId,
    result,
    pot,
    players: gs.players.map((p) => ({ playerId: p.playerId, name: p.name, hand: p.hand })),
  });
}

async function runBotIfNeeded(io: Server, room: KhangRoom) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return;

  const currentPlayer = room.players[gs.currentPlayerIndex];
  if (!currentPlayer?.isBot) return;

  const state = await room.doBotTurn(gs.currentPlayerIndex);
  broadcastState(io, room, state);

  if (state.phase === 'finished' && state.result) {
    await handleFinish(io, room, state.result.winnerId);
  } else {
    runBotIfNeeded(io, room);
  }
}

function broadcastState(io: Server, room: KhangRoom, state: any) {
  room.players.forEach((p) => {
    if (!p.isBot) {
      const masked = {
        ...state,
        players: state.players.map((sp: any) => ({
          ...sp,
          hand: sp.playerId === p.playerId || state.phase === 'finished'
            ? sp.hand
            : sp.hand.map(() => ({ id: 'hidden', suit: '?', rank: 0 })),
        })),
      };
      io.to(p.socketId).emit('kh:state', masked);
    }
  });
}
