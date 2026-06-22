export interface Card {
  id: string;
  suit: 'S' | 'H' | 'D' | 'C';
  rank: number; // A=1, 2-10, J=11, Q=12, K=13
}

export function cardValue(card: Card): number {
  if (card.rank >= 10) return 10;
  return card.rank;
}

export function isDeadCard(card: Card, jokerValue: number): boolean {
  // ไพ่ตาย = ไพ่ที่มีค่า (10 - jokerValue) — ยกเว้น joker = 5,10,J,Q,K ไม่มีไพ่ตาย
  if ([5, 10, 11, 12, 13].includes(jokerValue)) return false;
  return cardValue(card) === 10 - jokerValue;
}

export function isJokerCard(card: Card, jokerValue: number): boolean {
  return cardValue(card) === jokerValue || card.rank === jokerValue;
}

export function isValidPair(c1: Card, c2: Card, jokerValue: number): boolean {
  const j1 = isJokerCard(c1, jokerValue);
  const j2 = isJokerCard(c2, jokerValue);
  const d1 = isDeadCard(c1, jokerValue);
  const d2 = isDeadCard(c2, jokerValue);

  // โจ๊กคู่กับโจ๊ก
  if (j1 && j2) return true;
  // โจ๊กคู่กับไพ่ที่ไม่ใช่ไพ่ตาย
  if (j1 && !d2) return true;
  if (j2 && !d1) return true;
  // ไพ่ตายจับคู่ไม่ได้
  if (d1 || d2) return false;
  // หน้าเดียวกัน 10-10, J-J, Q-Q, K-K
  if (c1.rank >= 10 && c2.rank >= 10 && c1.rank === c2.rank) return true;
  // รวมแต้ม = 10 (ไม่ใช่ไพ่สูง)
  if (c1.rank < 10 && c2.rank < 10 && c1.rank + c2.rank === 10) return true;
  return false;
}

export function findAllPairs(hand: Card[], jokerValue: number): [Card, Card][] {
  const pairs: [Card, Card][] = [];
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (isValidPair(hand[i], hand[j], jokerValue)) {
        pairs.push([hand[i], hand[j]]);
      }
    }
  }
  return pairs;
}

export function countPairs(hand: Card[], jokerValue: number): number {
  // Greedy: จับคู่ได้สูงสุด
  const used = new Set<string>();
  let count = 0;
  for (let i = 0; i < hand.length; i++) {
    if (used.has(hand[i].id)) continue;
    for (let j = i + 1; j < hand.length; j++) {
      if (used.has(hand[j].id)) continue;
      if (isValidPair(hand[i], hand[j], jokerValue)) {
        used.add(hand[i].id);
        used.add(hand[j].id);
        count++;
        break;
      }
    }
  }
  return count;
}

export function checkWin(hand: Card[], jokerValue: number): boolean {
  return hand.length === 6 && countPairs(hand, jokerValue) === 3;
}

export function canIntercept(hand: Card[], drawnCard: Card, jokerValue: number): boolean {
  // มี 2 คู่ + รอ 1 ใบ = ถ้าไพ่ที่จั่วขึ้นมาทำให้ชนะได้
  const testHand = [...hand, drawnCard];
  return checkWin(testHand, jokerValue);
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
