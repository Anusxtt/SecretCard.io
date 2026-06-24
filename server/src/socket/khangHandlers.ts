import { Server, Socket } from 'socket.io';
import { RoomManager } from '../rooms/RoomManager';
import { KhangRoom } from '../games/khang/KhangGame';
import { adjustBalance, saveGameHistory, recordWin, recordLoss } from '../services/walletService';

export function registerKhangHandlers(io: Server, socket: Socket, rm: RoomManager) {

  socket.on('kh:start', (data: { roomId: string; playerId?: string }) => {
    const room = rm.getRoom(data.roomId) as KhangRoom | undefined;
    if (!room || room.gameType !== 'khang') return;

    // อัปเดต socketId ของ player ในกรณีที่ socket reconnect
    if (data.playerId) {
      const p = room.players.find((p) => p.playerId === data.playerId);
      if (p) {
        p.socketId = socket.id;
        socket.join(data.roomId);
      }
    }

    if (room.started) {
      // ถ้าเกมเริ่มไปแล้ว ส่ง state ปัจจุบันกลับให้ player คนที่ reconnect
      if (room.gameState) broadcastState(io, room, room.gameState);
      return;
    }

    const state = room.startGame();
    broadcastState(io, room, state);
    // client จะ animate แจกไพ่แล้ว emit kh:deal_done กลับมา
  });

  socket.on('kh:deal_done', (data: { roomId: string }) => {
    const room = rm.getRoom(data.roomId) as KhangRoom | undefined;
    if (!room) return;
    const state = room.beginPlay();
    if (!state) return;
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

  // ทิ้งไพ่ (หลังจั่ว) — รับ cardIds array หรือ cardId ใบเดียวก็ได้
  socket.on('kh:discard', (data: { roomId: string; cardId?: string; cardIds?: string[] }) => {
    const room = rm.getRoom(data.roomId) as KhangRoom | undefined;
    if (!room) return;
    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    const ids = data.cardIds ?? (data.cardId ? [data.cardId] : []);
    const state = room.handleDiscard(playerIndex, ids);
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
    if (state.result) handleFinish(io, room, state.result.winnerId);
    else runBotIfNeeded(io, room);
  });
}

async function handleFinish(io: Server, room: KhangRoom, winnerId: string) {
  const gs = room.gameState!;
  const result = gs.result!;
  const pot = room.betAmount * room.players.length;

  for (const p of room.players) {
    if (!p.isGuest && !p.isBot) {
      const isWinner = p.playerId === winnerId;
      const delta = isWinner ? pot - room.betAmount : -room.betAmount;
      await adjustBalance(p.playerId, delta);
      if (isWinner) await recordWin(p.playerId);
      else await recordLoss(p.playerId);
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
    gs.players.map((p) => ({
      id: p.playerId,
      name: p.name,
      isBot: p.isBot,
      hand: p.hand,
      total: p.hand.reduce((s, c) => s + (c.rank >= 11 ? 10 : c.rank), 0),
    }))
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
