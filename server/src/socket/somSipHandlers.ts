import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/RoomManager';
import { SomSipRoom } from '../games/somsip/SomSipGame';
import { adjustBalance, saveGameHistory, recordWin, recordLoss } from '../services/walletService';

export function registerSomSipHandlers(io: Server, socket: Socket, rm: RoomManager) {
  socket.on('ss:start', async (data: { roomId: string }) => {
    const room = rm.getRoom(data.roomId) as SomSipRoom | undefined;
    if (!room || room.gameType !== 'somsip' || room.started) return;

    const state = room.startGame();

    // ส่ง state แบบ hide ไพ่ผู้เล่นอื่น
    room.players.forEach((p) => {
      const masked = maskState(state, p.playerId);
      if (!p.isBot) io.to(p.socketId).emit('ss:state', masked);
    });

    // ถ้า turn แรกเป็น bot
    runBotIfNeeded(io, room, rm);
  });

  socket.on('ss:draw', (data: { roomId: string }) => {
    const room = rm.getRoom(data.roomId) as SomSipRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const state = room.handleDraw(playerIndex);
    if (state) broadcastState(io, room, state);
  });

  socket.on('ss:pick_discard', (data: { roomId: string; fromPlayerIndex: number }) => {
    const room = rm.getRoom(data.roomId) as SomSipRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const state = room.handlePickDiscard(playerIndex, { fromPlayerIndex: data.fromPlayerIndex });
    if (state) broadcastState(io, room, state);
  });

  socket.on('ss:discard', async (data: { roomId: string; cardId: string }) => {
    const room = rm.getRoom(data.roomId) as SomSipRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const state = room.handleDiscard(playerIndex, { cardId: data.cardId });
    if (!state) return;

    broadcastState(io, room, state);

    if (state.phase === 'finished' && state.winnerId) {
      await handleFinish(io, room, state.winnerId);
    } else {
      runBotIfNeeded(io, room, rm);
    }
  });

  socket.on('ss:intercept', (data: { roomId: string; card: any }) => {
    const room = rm.getRoom(data.roomId) as SomSipRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const state = room.handleIntercept(playerIndex, { cardId: data.card });
    if (state) {
      broadcastState(io, room, state);
      if (state.phase === 'finished' && state.winnerId) {
        handleFinish(io, room, state.winnerId);
      }
    }
  });
}

async function handleFinish(io: Server, room: SomSipRoom, winnerId: string) {
  const gs = room.gameState!;
  const pot = room.betAmount * room.players.length;

  // อัพเดต balance (เฉพาะ non-guest)
  for (const p of room.players) {
    if (!p.isGuest && !p.isBot) {
      const isWinner = p.playerId === winnerId;
      const delta = isWinner ? pot - room.betAmount : -room.betAmount;
      await adjustBalance(p.playerId, delta);
      if (isWinner) await recordWin(p.playerId);
      else await recordLoss(p.playerId);
    }
  }

  await saveGameHistory(
    'somsip',
    winnerId,
    pot,
    room.players.map((p) => ({ id: p.playerId, name: p.name }))
  );

  io.to(room.roomId).emit('ss:finished', {
    winnerId,
    pot,
    players: gs.players.map((p) => ({ playerId: p.playerId, name: p.name, hand: p.hand })),
  });
}

async function runBotIfNeeded(io: Server, room: SomSipRoom, rm: RoomManager) {
  const gs = room.gameState;
  if (!gs || gs.phase !== 'playing') return;

  const currentPlayer = room.players[gs.currentPlayerIndex];
  if (!currentPlayer?.isBot) return;

  const { state } = await room.doBotTurn(gs.currentPlayerIndex);
  broadcastState(io, room, state);

  if (state.phase === 'finished' && state.winnerId) {
    await handleFinish(io, room, state.winnerId);
  } else {
    runBotIfNeeded(io, room, rm);
  }
}

function maskState(state: any, playerId: string) {
  return {
    ...state,
    players: state.players.map((p: any) => ({
      ...p,
      hand: p.playerId === playerId ? p.hand : p.hand.map(() => ({ id: 'hidden', suit: '?', rank: 0 })),
    })),
  };
}

function broadcastState(io: Server, room: SomSipRoom, state: any) {
  room.players.forEach((p) => {
    if (!p.isBot) {
      io.to(p.socketId).emit('ss:state', maskState(state, p.playerId));
    }
  });
}
