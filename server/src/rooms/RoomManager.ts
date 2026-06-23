import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Room, GameType, Player } from './Room';
import { SomSipRoom } from '../games/somsip/SomSipGame';
import { KhangRoom } from '../games/khang/KhangGame';

export class RoomManager {
  private rooms = new Map<string, Room>();
  private playerRoomMap = new Map<string, string>(); // socketId → roomId

  createRoom(gameType: GameType, betAmount: number): Room {
    const roomId = uuidv4().slice(0, 8).toUpperCase();
    const room =
      gameType === 'somsip'
        ? new SomSipRoom(roomId, betAmount)
        : new KhangRoom(roomId, betAmount);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomBySocketId(socketId: string): Room | undefined {
    const roomId = this.playerRoomMap.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  joinRoom(roomId: string, player: Player): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const ok = room.addPlayer(player);
    if (ok) this.playerRoomMap.set(player.socketId, roomId);
    return ok;
  }

  leaveRoom(socketId: string): { room: Room; player: Player } | undefined {
    const roomId = this.playerRoomMap.get(socketId);
    if (!roomId) return undefined;
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const player = room.removePlayer(socketId);
    if (!player) return undefined;
    this.playerRoomMap.delete(socketId);
    if (room.players.filter((p) => !p.isBot).length === 0) {
      this.rooms.delete(roomId);
    }
    return { room, player };
  }

  handleDisconnect(socketId: string, io: Server): void {
    const result = this.leaveRoom(socketId);
    if (result) {
      io.to(result.room.roomId).emit('player_left', {
        playerId: result.player.playerId,
        name: result.player.name,
      });
    }
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  findWaitingRoom(gameType: GameType, betAmount: number): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.gameType === gameType && room.betAmount === betAmount && !room.started && !room.isFull()) {
        return room;
      }
    }
    return undefined;
  }
}
