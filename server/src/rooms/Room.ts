export type GameType = 'somsip' | 'khang';

export interface Player {
  socketId: string;
  playerId: string;
  name: string;
  balance: number;
  isBot: boolean;
  isGuest: boolean;
}

export abstract class Room {
  readonly roomId: string;
  readonly gameType: GameType;
  readonly betAmount: number;
  players: Player[] = [];
  maxPlayers: number;
  started: boolean = false;

  constructor(roomId: string, gameType: GameType, betAmount: number, maxPlayers: number) {
    this.roomId = roomId;
    this.gameType = gameType;
    this.betAmount = betAmount;
    this.maxPlayers = maxPlayers;
  }

  addPlayer(player: Player): boolean {
    if (this.players.length >= this.maxPlayers || this.started) return false;
    this.players.push(player);
    return true;
  }

  removePlayer(socketId: string): Player | undefined {
    const idx = this.players.findIndex((p) => p.socketId === socketId);
    if (idx === -1) return undefined;
    const [player] = this.players.splice(idx, 1);
    return player;
  }

  isFull(): boolean {
    return this.players.length >= this.maxPlayers;
  }

  abstract handleAction(socketId: string, action: string, payload: unknown): unknown;
}
