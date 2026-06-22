export interface Card {
  id: string;
  suit: 'S' | 'H' | 'D' | 'C';
  rank: number; // A=1, 2-10, J=11, Q=12, K=13
}

export function cardPoints(card: Card): number {
  if (card.rank >= 11) return 10;
  return card.rank; // A=1
}

export function calcTotal(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

export type SpecialHand =
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | null;

export function checkSpecialHand(hand: Card[]): SpecialHand {
  if (hand.length !== 5) return null;

  const ranks = hand.map((c) => c.rank).sort((a, b) => a - b);
  const suits = hand.map((c) => c.suit);
  const rankCounts = new Map<number, number>();
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  const counts = [...rankCounts.values()].sort((a, b) => b - a);

  const isFlush = suits.every((s) => s === suits[0]);
  const isStraight =
    ranks[4] - ranks[0] === 4 && new Set(ranks).size === 5;

  if (isFlush && isStraight) return 'straight_flush';
  if (counts[0] === 4) return 'four_of_a_kind';
  if (counts[0] === 3 && counts[1] === 2) return 'full_house';
  if (isFlush) return 'flush';
  if (isStraight) return 'straight';
  if (counts[0] === 3) return 'three_of_a_kind';
  return null;
}

const SPECIAL_RANK: Record<NonNullable<SpecialHand>, number> = {
  straight_flush: 6,
  four_of_a_kind: 5,
  full_house: 4,
  flush: 3,
  straight: 2,
  three_of_a_kind: 1,
};

export function compareSpecialHands(a: SpecialHand, b: SpecialHand): number {
  return (SPECIAL_RANK[a!] ?? 0) - (SPECIAL_RANK[b!] ?? 0);
}

export function canFlow(hand: Card[], lastDiscard: Card | null): Card | null {
  if (!lastDiscard) return null;
  return hand.find((c) => c.rank === lastDiscard.rank) ?? null;
}

export interface KhangResult {
  winnerId: string;
  loserIds: string[];
  wrongKhangId: string | null; // คนแคงผิด
  flows: { fromId: string; toId: string }[];
}

export function resolveKhang(
  declarerId: string,
  players: { playerId: string; hand: Card[] }[]
): KhangResult {
  const declarer = players.find((p) => p.playerId === declarerId)!;
  const declarerSpecial = checkSpecialHand(declarer.hand);
  const declarerTotal = calcTotal(declarer.hand);
  const others = players.filter((p) => p.playerId !== declarerId);

  let wrongKhangId: string | null = null;
  let winnerId = declarerId;

  // แคงผิดถ้ามีคนอื่นแต้มน้อยกว่าหรือเท่ากัน (และไม่มี special ของคนแคง)
  // หรือคนอื่นมี special hand ที่สูงกว่า
  const declarerWins = (() => {
    // ถ้าคนแคงมี special hand → ชนะทันที (ถ้าไม่มีใครสูงกว่า)
    if (declarerSpecial) {
      for (const p of others) {
        const s = checkSpecialHand(p.hand);
        if (s && compareSpecialHands(s, declarerSpecial) > 0) return false;
      }
      return true;
    }
    // ไม่มี special — คนแคงต้องมีแต้มน้อยสุดในวง (น้อยกว่าทุกคน)
    for (const p of others) {
      if (calcTotal(p.hand) <= declarerTotal) return false;
    }
    return true;
  })();

  const losers: string[] = [];

  if (declarerWins) {
    // แคงถูก
    for (const p of others) losers.push(p.playerId);
  } else {
    // แคงผิด
    wrongKhangId = declarerId;
    losers.push(declarerId);
    // ผู้ชนะ = คนที่มีแต้มน้อยสุดในบรรดาคนที่ไม่ใช่คนแคง
    winnerId = others.reduce((best, p) =>
      calcTotal(p.hand) < calcTotal(best.hand) ? p : best
    ).playerId;
  }

  return { winnerId, loserIds: losers, wrongKhangId, flows: [] };
}

export function createDeck(): Card[] {
  const suits: Card['suit'][] = ['S', 'H', 'D', 'C'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${suit}${rank}`, suit, rank });
    }
  }
  return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
