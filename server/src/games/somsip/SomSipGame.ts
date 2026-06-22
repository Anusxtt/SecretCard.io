import { v4 as uuidv4 } from 'uuid';
import { Room, Player } from '../../rooms/Room';
import {
  Card,
  createDeck,
  checkWin,
  canIntercept,
  isDeadCard,
} from './SomSipRules';
import { botDecide, botChooseDiscard } from './SomSipBot';

export interface SomSipPlayerState {
  playerId: string;
  name: string;
  hand: Card[];
  discardPile: Card[]; // LIFO กองทิ้งของตัวเอง
  isBot: boolean;
}

export interface SomSipGameState {
  roomId: string;
  players: SomSipPlayerState[];
  deck: Card[];
  jokerValue: number;
  jokerCard: Card; // เปิดไว้กลางโต๊ะ
  currentPlayerIndex: number;
  phase: 'waiting' | 'playing' | 'finished';
  winnerId: string | null;
  lastDrawnCard: Card | null;
}

export class SomSipRoom extends Room {
  gameState: SomSipGameState | null = null;

  constructor(roomId: string, betAmount: number) {
    super(roomId, 'somsip', betAmount, 5);
  }

  startGame(): SomSipGameState {
    const deck = createDeck();

    // กำหนด jokerValue แบบสุ่ม (1-9, 11-13, ไม่ใช่ 10)
    const validJokers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13];
    const jokerValue = validJokers[Math.floor(Math.random() * validJokers.length)];

    // เปิดไพ่โจ๊กกลางโต๊ะ
    const jokerCard = deck.pop()!;

    const playerStates: SomSipPlayerState[] = this.players.map((p, i) => {
      const handSize = i === 0 ? 6 : 5; // คนเริ่มเกมได้ 6 ใบ
      return {
        playerId: p.playerId,
        name: p.name,
        hand: deck.splice(0, handSize),
        discardPile: [],
        isBot: p.isBot,
      };
    });

    this.gameState = {
      roomId: this.roomId,
      players: playerStates,
      deck,
      jokerValue,
      jokerCard,
      currentPlayerIndex: 0,
      phase: 'playing',
      winnerId: null,
      lastDrawnCard: null,
    };

    this.started = true;
    return this.gameState;
  }

  handleAction(socketId: string, action: string, payload: unknown): unknown {
    if (!this.gameState || this.gameState.phase !== 'playing') return null;

    const playerIndex = this.players.findIndex((p) => p.socketId === socketId);
    const gs = this.gameState;

    switch (action) {
      case 'draw':
        return this.handleDraw(playerIndex);
      case 'pick_discard':
        return this.handlePickDiscard(playerIndex, payload as { fromPlayerIndex: number });
      case 'discard':
        return this.handleDiscard(playerIndex, payload as { cardId: string });
      case 'intercept':
        return this.handleIntercept(playerIndex, payload as { cardId: Card });
      default:
        return null;
    }
  }

  handleDraw(playerIndex: number): SomSipGameState | null {
    const gs = this.gameState!;
    if (playerIndex !== gs.currentPlayerIndex) return null;
    if (gs.deck.length === 0) return null;

    const card = gs.deck.pop()!;
    gs.players[playerIndex].hand.push(card);
    gs.lastDrawnCard = card;

    return gs;
  }

  handlePickDiscard(playerIndex: number, payload: { fromPlayerIndex: number }): SomSipGameState | null {
    const gs = this.gameState!;
    if (playerIndex !== gs.currentPlayerIndex) return null;

    const fromIndex = payload.fromPlayerIndex;
    const fromPlayer = gs.players[fromIndex];
    if (!fromPlayer || fromPlayer.discardPile.length === 0) return null;

    // หยิบได้เฉพาะใบบนสุดของคนก่อนหน้า
    const prevIndex = (playerIndex - 1 + gs.players.length) % gs.players.length;
    if (fromIndex !== prevIndex) return null;

    const card = fromPlayer.discardPile[fromPlayer.discardPile.length - 1];
    fromPlayer.discardPile.pop();
    gs.players[playerIndex].hand.push(card);
    gs.lastDrawnCard = card;

    return gs;
  }

  handleDiscard(playerIndex: number, payload: { cardId: string }): SomSipGameState | null {
    const gs = this.gameState!;
    if (playerIndex !== gs.currentPlayerIndex) return null;

    const hand = gs.players[playerIndex].hand;
    const cardIdx = hand.findIndex((c) => c.id === payload.cardId);
    if (cardIdx === -1) return null;

    const [card] = hand.splice(cardIdx, 1);
    gs.players[playerIndex].discardPile.push(card);
    gs.lastDrawnCard = null;

    // เช็ค win ด้วยไพ่ในมือ 6 ใบ
    if (checkWin(gs.players[playerIndex].hand, gs.jokerValue)) {
      gs.phase = 'finished';
      gs.winnerId = gs.players[playerIndex].playerId;
      return gs;
    }

    // ส่งต่อเทิร์น
    gs.currentPlayerIndex = (playerIndex + 1) % gs.players.length;
    return gs;
  }

  handleIntercept(interceptorIndex: number, payload: { cardId: Card }): SomSipGameState | null {
    const gs = this.gameState!;
    const card = gs.lastDrawnCard;
    if (!card) return null;

    const hand = gs.players[interceptorIndex].hand;
    if (!canIntercept(hand, card, gs.jokerValue)) return null;

    // ขอไพ่ใบนั้นมา
    gs.players[interceptorIndex].hand.push(card);
    gs.lastDrawnCard = null;
    gs.phase = 'finished';
    gs.winnerId = gs.players[interceptorIndex].playerId;
    return gs;
  }

  // AI bot turn
  async doBotTurn(botIndex: number): Promise<{ action: string; state: SomSipGameState }> {
    const gs = this.gameState!;
    const botPlayer = gs.players[botIndex];
    const prevIndex = (botIndex - 1 + gs.players.length) % gs.players.length;
    const topDiscard = gs.players[prevIndex].discardPile.at(-1);

    const decision = botDecide(botPlayer.hand, topDiscard, gs.jokerValue);

    await delay(1000 + Math.random() * 1000);

    if (decision.action === 'pick_discard' && topDiscard) {
      this.handlePickDiscard(botIndex, { fromPlayerIndex: prevIndex });
    } else {
      this.handleDraw(botIndex);
    }

    // เลือกทิ้ง
    if (gs.phase === 'playing') {
      const discardId = decision.discardCardId || botChooseDiscard(botPlayer.hand, gs.jokerValue);
      this.handleDiscard(botIndex, { cardId: discardId });
    }

    return { action: decision.action, state: gs };
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
