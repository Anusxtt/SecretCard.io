import { Card, calcTotal, canFlow } from './KhangRules';

export type BotAction = 'khang' | 'draw' | 'flow';

export function botDecide(
  hand: Card[],
  lastDiscard: Card | null
): { action: BotAction; flowCardId?: string; discardCardId?: string } {
  const total = calcTotal(hand);

  // ถ้าแต้มต่ำมาก → แคง
  if (total <= 5) {
    return { action: 'khang' };
  }

  // ถ้าไหลได้ → ไหล
  const flowCard = canFlow(hand, lastDiscard);
  if (flowCard && Math.random() > 0.4) {
    return { action: 'flow', flowCardId: flowCard.id };
  }

  return { action: 'draw' };
}

export function botChooseDiscard(hand: Card[]): string {
  // ทิ้งไพ่แต้มสูงสุด
  const sorted = [...hand].sort((a, b) => {
    const pa = a.rank >= 11 ? 10 : a.rank;
    const pb = b.rank >= 11 ? 10 : b.rank;
    return pb - pa;
  });
  return sorted[0].id;
}
