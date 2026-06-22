import { Room, Player } from '../../rooms/Room';
import {
  Card,
  createDeck,
  calcTotal,
  canFlow,
  resolveKhang,
  checkSpecialHand,
  KhangResult,
} from './KhangRules';
import { botDecide, botChooseDiscard } from './KhangBot';

export interface KhangPlayerState {
  playerId: string;
  name: string;
  hand: Card[];
  isBot: boolean;
}

export interface KhangGameState {
  roomId: string;
  players: KhangPlayerState[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  phase: 'waiting' | 'dealing' | 'playing' | 'finished';
  result: KhangResult | null;
  lastDiscard: Card | null;
  flowChain: { playerId: string; cardIds: string[] }[];
  waitingDiscard: boolean;
}

export class KhangRoom extends Room {
  gameState: KhangGameState | null = null;

  constructor(roomId: string, betAmount: number) {
    super(roomId, 'khang', betAmount, 5);
  }

  startGame(): KhangGameState {
    const deck = createDeck();
    const playerStates: KhangPlayerState[] = this.players.map((p) => ({
      playerId: p.playerId,
      name: p.name,
      hand: deck.splice(0, 5),
      isBot: p.isBot,
    }));

    const startIndex = Math.floor(Math.random() * this.players.length);

    this.gameState = {
      roomId: this.roomId,
      players: playerStates,
      deck,
      discardPile: [],
      currentPlayerIndex: startIndex,
      phase: 'dealing',
      result: null,
      lastDiscard: null,
      flowChain: [],
      waitingDiscard: false,
    };
    this.started = true;
    return this.gameState;
  }

  // เรียกหลัง animation แจกไพ่เสร็จ
  beginPlay(): KhangGameState | null {
    const gs = this.gameState;
    if (!gs || gs.phase !== 'dealing') return null;
    gs.phase = 'playing';

    // เช็ค special hand ป๊อกทันที
    for (const p of gs.players) {
      const special = checkSpecialHand(p.hand);
      if (special) {
        gs.phase = 'finished';
        gs.result = resolveKhang(p.playerId, gs.players.map((pl) => ({ playerId: pl.playerId, hand: pl.hand })));
        break;
      }
    }
    return gs;
  }

  handleAction(socketId: string, action: string, payload: unknown): unknown {
    if (!this.gameState || (this.gameState.phase !== 'playing' && this.gameState.phase !== 'dealing')) return null;
    const playerIndex = this.players.findIndex((p) => p.socketId === socketId);
    switch (action) {
      case 'khang': return this.handleKhang(playerIndex);
      case 'draw': return this.handleDraw(playerIndex);
      case 'discard': {
        const p = payload as { cardId?: string; cardIds?: string[] };
        const ids = p.cardIds ?? (p.cardId ? [p.cardId] : []);
        return this.handleDiscard(playerIndex, ids);
      }
      case 'flow': return this.handleFlow(playerIndex, payload as { cardId: string });
      default: return null;
    }
  }

  // ─── แคง ───────────────────────────────────────────────────────
  handleKhang(playerIndex: number): KhangGameState | null {
    const gs = this.gameState!;
    if (playerIndex !== gs.currentPlayerIndex) return null;
    if (gs.waitingDiscard) return null; // ต้องทิ้งก่อน

    const declarerId = gs.players[playerIndex].playerId;
    const result = resolveKhang(
      declarerId,
      gs.players.map((p) => ({ playerId: p.playerId, hand: p.hand }))
    );
    gs.phase = 'finished';
    gs.result = result;
    return gs;
  }

  // ─── จั่ว (แค่จั่ว ยังไม่ทิ้ง) ─────────────────────────────────
  handleDraw(playerIndex: number): KhangGameState | null {
    const gs = this.gameState!;
    if (playerIndex !== gs.currentPlayerIndex) return null;
    if (gs.waitingDiscard) return null; // จั่วซ้ำไม่ได้

    if (gs.deck.length === 0) {
      // กองหมด → แคงบังคับ
      return this.handleKhang(playerIndex);
    }

    const drawn = gs.deck.pop()!;
    gs.players[playerIndex].hand.push(drawn);
    gs.waitingDiscard = true; // ตอนนี้มือ 6 ใบ รอทิ้ง
    return gs;
  }

  // ─── ทิ้งไพ่ (หลังจั่วแล้ว) รับ cardIds หลายใบได้ แต่ต้อง rank เดียวกันทั้งหมด ────
  handleDiscard(playerIndex: number, cardId: string | string[]): KhangGameState | null {
    const gs = this.gameState!;
    if (playerIndex !== gs.currentPlayerIndex) return null;
    if (!gs.waitingDiscard) return null;

    const hand = gs.players[playerIndex].hand;
    const ids = Array.isArray(cardId) ? cardId : [cardId];
    if (ids.length === 0) return null;

    // ตรวจว่าทุก id มีในมือ
    const cards = ids.map((id) => hand.find((c) => c.id === id)).filter(Boolean) as Card[];
    if (cards.length !== ids.length) return null;

    // ถ้าทิ้งหลายใบ ต้อง rank เดียวกันทั้งหมด
    if (cards.length > 1 && new Set(cards.map((c) => c.rank)).size > 1) return null;

    for (const card of cards) {
      const i = hand.findIndex((c) => c.id === card.id);
      hand.splice(i, 1);
      gs.discardPile.push(card);
    }

    gs.lastDiscard = cards[cards.length - 1];
    gs.flowChain = [];
    gs.waitingDiscard = false;
    gs.currentPlayerIndex = (playerIndex + 1) % gs.players.length;
    return gs;
  }

  // ─── ไหล (ทิ้งทุกใบที่เลขตรงกับกองทิ้ง) ────────────────────────
  handleFlow(playerIndex: number, payload: { cardId: string }): KhangGameState | null {
    const gs = this.gameState!;
    if (gs.waitingDiscard) return null; // ไหลได้เฉพาะตอนที่ยังไม่ได้จั่ว

    if (!gs.lastDiscard) return null;

    const hand = gs.players[playerIndex].hand;
    const targetRank = gs.lastDiscard.rank;

    // ทิ้ง ALL cards ที่เลขตรงกัน
    const toDiscard = hand.filter((c) => c.rank === targetRank);
    if (toDiscard.length === 0) return null;

    // ตรวจว่า payload.cardId อยู่ในกลุ่มที่ไหลได้
    const validFlow = toDiscard.some((c) => c.id === payload.cardId);
    if (!validFlow) return null;

    // ลบออกจากมือ
    const discardedCards: Card[] = [];
    for (const card of toDiscard) {
      const i = hand.findIndex((c) => c.id === card.id);
      if (i !== -1) {
        const [removed] = hand.splice(i, 1);
        discardedCards.push(removed);
        gs.discardPile.push(removed);
      }
    }

    gs.lastDiscard = discardedCards[discardedCards.length - 1];
    gs.flowChain.push({
      playerId: gs.players[playerIndex].playerId,
      cardIds: discardedCards.map((c) => c.id),
    });

    // ไหลแล้ว → จบเทิร์น ไปคนถัดไป
    gs.currentPlayerIndex = (playerIndex + 1) % gs.players.length;
    gs.waitingDiscard = false;
    return gs;
  }

  async doBotTurn(botIndex: number): Promise<KhangGameState> {
    const gs = this.gameState!;
    const bot = gs.players[botIndex];
    await delay(600 + Math.random() * 600);

    if (gs.waitingDiscard) {
      // Bot อยู่ในช่วงรอทิ้ง
      const discardId = botChooseDiscard(bot.hand);
      this.handleDiscard(botIndex, discardId);
      return gs;
    }

    const decision = botDecide(bot.hand, gs.lastDiscard);

    if (decision.action === 'khang') {
      this.handleKhang(botIndex);
    } else if (decision.action === 'flow' && decision.flowCardId) {
      this.handleFlow(botIndex, { cardId: decision.flowCardId });
    } else {
      // จั่วก่อน แล้วทิ้ง
      this.handleDraw(botIndex);
      await delay(400 + Math.random() * 400);
      const discardId = botChooseDiscard(bot.hand);
      this.handleDiscard(botIndex, discardId);
    }

    return gs;
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
