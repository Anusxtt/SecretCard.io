import { Card, isValidPair, countPairs, isDeadCard } from './SomSipRules';

interface BotDecision {
  action: 'draw' | 'pick_discard';
  discardCardId: string;
}

export function botDecide(
  hand: Card[],
  topDiscard: Card | undefined,
  jokerValue: number
): BotDecision {
  // ลองหยิบกองทิ้งถ้าทำให้ได้คู่เพิ่ม
  if (topDiscard && !isDeadCard(topDiscard, jokerValue)) {
    const pairsBefore = countPairs(hand, jokerValue);
    const testHand = [...hand, topDiscard];
    const pairsAfter = countPairs(testHand, jokerValue);
    if (pairsAfter > pairsBefore) {
      const discardCardId = chooseBestDiscard(testHand, topDiscard, jokerValue);
      return { action: 'pick_discard', discardCardId };
    }
  }

  return { action: 'draw', discardCardId: '' };
}

export function botChooseDiscard(hand: Card[], jokerValue: number): string {
  return chooseBestDiscard(hand, null, jokerValue);
}

function chooseBestDiscard(hand: Card[], keep: Card | null, jokerValue: number): string {
  // ทิ้งไพ่ที่ไม่ได้อยู่ในคู่และไม่ใช่ไพ่ที่เพิ่งหยิบมา
  const inPair = new Set<string>();
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (isValidPair(hand[i], hand[j], jokerValue)) {
        inPair.add(hand[i].id);
        inPair.add(hand[j].id);
      }
    }
  }

  const candidates = hand.filter((c) => !inPair.has(c.id) && c.id !== keep?.id);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }
  // fallback: ทิ้งสุ่ม
  const others = keep ? hand.filter((c) => c.id !== keep.id) : hand;
  return others[Math.floor(Math.random() * others.length)]?.id ?? hand[0].id;
}
