import Phaser from 'phaser';
import { getSocket } from '../../hooks/useSocket';

interface Card {
  id: string;
  suit: string;
  rank: number;
}

interface PlayerState {
  playerId: string;
  name: string;
  hand: Card[];
  discardPile: Card[];
  isBot: boolean;
}

interface GameState {
  roomId: string;
  players: PlayerState[];
  jokerValue: number;
  jokerCard: Card;
  currentPlayerIndex: number;
  phase: string;
  winnerId: string | null;
  lastDrawnCard: Card | null;
}

const SUIT_COLOR: Record<string, number> = { S: 0x1a237e, H: 0xd32f2f, D: 0xd32f2f, C: 0x1a237e };
const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
function rankLabel(r: number) { return RANK_LABEL[r] ?? String(r); }

const W = 1920;
const H = 1080;
const CARD_W = 100;
const CARD_H = 140;
const CARD_R = 10;

// ── Suit drawing helpers (module-level) ────────────────────────────────────

function drawHeart(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number) {
  g.fillCircle(x - s * 0.25, y - s * 0.1, s * 0.32);
  g.fillCircle(x + s * 0.25, y - s * 0.1, s * 0.32);
  g.fillTriangle(x, y + s * 0.48, x - s * 0.52, y - s * 0.05, x + s * 0.52, y - s * 0.05);
}

function drawDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number) {
  g.fillTriangle(x, y - s * 0.5, x - s * 0.38, y, x + s * 0.38, y);
  g.fillTriangle(x, y + s * 0.5, x - s * 0.38, y, x + s * 0.38, y);
}

function drawSpade(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number) {
  g.fillCircle(x - s * 0.25, y - s * 0.1, s * 0.35);
  g.fillCircle(x + s * 0.25, y - s * 0.1, s * 0.35);
  g.fillTriangle(x, y - s * 0.55, x - s * 0.42, y + s * 0.1, x + s * 0.42, y + s * 0.1);
  g.fillRect(x - s * 0.08, y + s * 0.08, s * 0.16, s * 0.35);
  g.fillTriangle(x - s * 0.28, y + s * 0.42, x + s * 0.28, y + s * 0.42, x, y + s * 0.08);
}

function drawClub(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number) {
  g.fillCircle(x, y - s * 0.2, s * 0.28);
  g.fillCircle(x - s * 0.28, y + s * 0.08, s * 0.28);
  g.fillCircle(x + s * 0.28, y + s * 0.08, s * 0.28);
  g.fillRect(x - s * 0.08, y + s * 0.12, s * 0.16, s * 0.32);
  g.fillTriangle(x - s * 0.26, y + s * 0.43, x + s * 0.26, y + s * 0.43, x, y + s * 0.14);
}

function drawSuit(g: Phaser.GameObjects.Graphics, suit: string, x: number, y: number, size: number, color: number) {
  g.fillStyle(color, 1);
  switch (suit) {
    case 'H': drawHeart(g, x, y, size); break;
    case 'D': drawDiamond(g, x, y, size); break;
    case 'S': drawSpade(g, x, y, size); break;
    case 'C': drawClub(g, x, y, size); break;
  }
}

export class SomSipScene extends Phaser.Scene {
  private roomId!: string;
  private myPlayerId!: string;
  private betAmount!: number;
  private gameState: GameState | null = null;
  private selectedCardId: string | null = null;
  private initialized = false;
  private uiLayer!: Phaser.GameObjects.Container;
  private statusBg!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private turnIndicator!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'SomSipScene', active: false });
  }

  init(data: { roomId: string; playerId: string; betAmount: number }) {
    this.roomId = data.roomId;
    this.myPlayerId = data.playerId;
    this.betAmount = data.betAmount;
    this.initialized = true;
  }

  create() {
    if (!this.initialized) return;
    this.drawBackground();
    this.uiLayer = this.add.container(0, 0);
    this.createStatusBar();
    this.setupSocketListeners();
    getSocket().emit('ss:start', { roomId: this.roomId });
  }

  // ─── Background ────────────────────────────────────────────────
  private drawBackground() {
    // gradient felt table
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0d4f2e, 0x0d4f2e, 0x0a3d22, 0x0a3d22, 1);
    bg.fillRect(0, 0, W, H);

    // table oval
    const oval = this.add.graphics();
    oval.fillStyle(0x0f5c34, 1);
    oval.fillEllipse(W / 2, H / 2, W - 90, H - 90);
    oval.lineStyle(8, 0xc8a44a, 1);
    oval.strokeEllipse(W / 2, H / 2, W - 90, H - 90);

    // inner ring
    const inner = this.add.graphics();
    inner.lineStyle(2, 0xc8a44a, 0.3);
    inner.strokeEllipse(W / 2, H / 2, W - 150, H - 150);

    // corner decorations
    for (const [cx, cy] of [[45, 45], [W - 45, 45], [45, H - 45], [W - 45, H - 45]]) {
      const deco = this.add.graphics();
      deco.fillStyle(0xc8a44a, 0.4);
      deco.fillCircle(cx, cy, 18);
    }
  }

  // ─── Status Bar ────────────────────────────────────────────────
  private createStatusBar() {
    this.statusBg = this.add.graphics();
    this.statusBg.fillStyle(0x000000, 0.55);
    this.statusBg.fillRoundedRect(W / 2 - 300, 12, 600, 60, 30);

    this.statusText = this.add.text(W / 2, 42, 'กำลังโหลด...', {
      fontSize: '24px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);
  }

  private updateStatus(text: string, isMyTurn: boolean) {
    this.statusBg.clear();
    this.statusBg.fillStyle(isMyTurn ? 0x1a4a1a : 0x000000, 0.7);
    this.statusBg.fillRoundedRect(W / 2 - 315, 12, 630, 60, 30);
    if (isMyTurn) {
      this.statusBg.lineStyle(2, 0x44ff44, 0.8);
      this.statusBg.strokeRoundedRect(W / 2 - 315, 12, 630, 60, 30);
    }
    this.statusText.setText(text);
    this.statusText.setColor(isMyTurn ? '#44ff44' : '#ffd700');
  }

  // ─── Socket ────────────────────────────────────────────────────
  private setupSocketListeners() {
    const socket = getSocket();
    socket.off('ss:state');
    socket.off('ss:finished');

    socket.on('ss:state', (state: GameState) => {
      this.gameState = state;
      this.renderState(state);
    });

    socket.on('ss:finished', (data: { winnerId: string; pot: number; players: PlayerState[] }) => {
      if (this.gameState) this.gameState.phase = 'finished';
      const isWinner = data.winnerId === this.myPlayerId;
      this.showResult(isWinner, data.pot, data.players);
    });
  }

  // ─── Render ────────────────────────────────────────────────────
  private renderState(state: GameState) {
    this.uiLayer.removeAll(true);

    const me = state.players.find((p) => p.playerId === this.myPlayerId);
    if (!me) return;

    const isMyTurn = state.players[state.currentPlayerIndex]?.playerId === this.myPlayerId;
    const currentName = state.players[state.currentPlayerIndex]?.name ?? '';

    this.updateStatus(
      isMyTurn ? '🎯 ถึงเทิร์นของคุณ — เลือกการกระทำ' : `⏳ รอ ${currentName}...`,
      isMyTurn
    );

    // Joker card center-top
    this.drawJokerDisplay(state);

    // Opponents
    this.drawOpponents(state, isMyTurn);

    // My hand
    this.drawMyHand(me, state, isMyTurn);

    // Action buttons
    if (isMyTurn) {
      this.drawActionButtons(state, me);
    }

    // Intercept button
    if (state.lastDrawnCard && !isMyTurn) {
      const canI = this.checkIntercept(me.hand, state.lastDrawnCard, state.jokerValue);
      if (canI) this.drawInterceptButton(state.lastDrawnCard);
    }

    // Pair highlight on my hand
    this.highlightPairs(me.hand, state.jokerValue);
  }

  // ─── Joker Display ─────────────────────────────────────────────
  private drawJokerDisplay(state: GameState) {
    const x = W / 2;
    const y = 135;

    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.45);
    panel.fillRoundedRect(x - 135, y - 45, 270, 84, 21);
    panel.lineStyle(1, 0xc8a44a, 0.6);
    panel.strokeRoundedRect(x - 135, y - 45, 270, 84, 21);
    this.uiLayer.add(panel);

    const jokerLabel = this.add.text(x - 75, y - 15, 'โจ๊กเกอร์', {
      fontSize: '16px', color: '#c8a44a', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.uiLayer.add(jokerLabel);

    const card = this.makeCard(state.jokerCard, x - 75, y + 12, true, false);
    this.uiLayer.add(card);

    const arrow = this.add.text(x - 18, y + 12, '=', {
      fontSize: '27px', color: '#fff',
    }).setOrigin(0.5);
    this.uiLayer.add(arrow);

    const valueText = this.add.text(x + 42, y - 3, rankLabel(state.jokerValue), {
      fontSize: '42px', color: '#ffd700', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.uiLayer.add(valueText);
  }

  // ─── Opponents ─────────────────────────────────────────────────
  private drawOpponents(state: GameState, isMyTurn: boolean) {
    const opponents = state.players.filter((p) => p.playerId !== this.myPlayerId);
    const positions = this.getOpponentPositions(opponents.length);

    opponents.forEach((p, i) => {
      const { x, y } = positions[i];
      const isCurrent = state.players[state.currentPlayerIndex]?.playerId === p.playerId;

      // Name badge
      const badgeBg = this.add.graphics();
      badgeBg.fillStyle(isCurrent ? 0x1a4a1a : 0x1a1a2e, 0.85);
      badgeBg.fillRoundedRect(x - 82, y - 135, 165, 42, 15);
      if (isCurrent) {
        badgeBg.lineStyle(2, 0x44ff44, 1);
        badgeBg.strokeRoundedRect(x - 82, y - 135, 165, 42, 15);
      }
      this.uiLayer.add(badgeBg);

      const nameText = this.add.text(x, y - 114, `${p.isBot ? '🤖 ' : '👤 '}${p.name}`, {
        fontSize: '18px', color: isCurrent ? '#44ff44' : '#fff', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.uiLayer.add(nameText);

      // Hand count badge
      const countBg = this.add.graphics();
      countBg.fillStyle(0x000, 0.7);
      countBg.fillCircle(x + 67, y - 82, 18);
      this.uiLayer.add(countBg);
      const countText = this.add.text(x + 67, y - 82, String(p.hand.length), {
        fontSize: '18px', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.uiLayer.add(countText);

      // Hidden hand cards (fan layout)
      p.hand.forEach((card, j) => {
        const angle = (j - (p.hand.length - 1) / 2) * 8;
        const cx = x + (j - (p.hand.length - 1) / 2) * 16;
        const c = this.makeCard(card, cx, y - 27, false, false);
        c.setRotation(Phaser.Math.DegToRad(angle));
        this.uiLayer.add(c);
      });

      // Discard pile (top card face up, clickable if my turn)
      const top = p.discardPile.at(-1);
      if (top) {
        const pIdx = state.players.findIndex((pl) => pl.playerId === p.playerId);
        const discardCard = this.makeCard(top, x, y + 82, true, isMyTurn);
        if (isMyTurn) {
          discardCard.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
          discardCard.on('pointerdown', () => {
            getSocket().emit('ss:pick_discard', { roomId: this.roomId, fromPlayerIndex: pIdx });
          });
          discardCard.on('pointerover', () => discardCard.setScale(1.1));
          discardCard.on('pointerout', () => discardCard.setScale(1));
        }
        this.uiLayer.add(discardCard);

        const discardLabel = this.add.text(x, y + 165, 'กองทิ้ง', {
          fontSize: '15px', color: '#aaa',
        }).setOrigin(0.5);
        this.uiLayer.add(discardLabel);

        if (p.discardPile.length > 1) {
          const stackBg = this.add.graphics();
          stackBg.fillStyle(0x000, 0.5);
          stackBg.fillRoundedRect(x - 21, y + 168, 42, 21, 9);
          this.uiLayer.add(stackBg);
          const stackCount = this.add.text(x, y + 179, `×${p.discardPile.length}`, {
            fontSize: '15px', color: '#ddd',
          }).setOrigin(0.5);
          this.uiLayer.add(stackCount);
        }
      }
    });
  }

  private getOpponentPositions(count: number): { x: number; y: number }[] {
    if (count === 1) return [{ x: W / 2, y: 360 }];
    if (count === 2) return [{ x: W / 2 - 300, y: 345 }, { x: W / 2 + 300, y: 345 }];
    if (count === 3) return [
      { x: W / 2, y: 300 },
      { x: W / 2 - 390, y: 420 },
      { x: W / 2 + 390, y: 420 },
    ];
    return [
      { x: W / 2 - 180, y: 300 },
      { x: W / 2 + 180, y: 300 },
      { x: W / 2 - 420, y: 450 },
      { x: W / 2 + 420, y: 450 },
    ];
  }

  // ─── My Hand ───────────────────────────────────────────────────
  private drawMyHand(me: PlayerState, state: GameState, isMyTurn: boolean) {
    const handY = H - 142;
    const startX = W / 2 - ((me.hand.length - 1) * 117) / 2;

    // "มือของคุณ" label
    const handLabel = this.add.text(W / 2, handY - 97, `มือของคุณ (${me.hand.length} ใบ)`, {
      fontSize: '18px', color: '#c8a44a',
    }).setOrigin(0.5);
    this.uiLayer.add(handLabel);

    me.hand.forEach((card, i) => {
      const x = startX + i * 117;
      const isSelected = this.selectedCardId === card.id;
      const cardY = isSelected ? handY - 33 : handY;

      const cardObj = this.makeCard(card, x, cardY, true, isMyTurn);

      if (isSelected) {
        // glow effect
        const glow = this.add.graphics();
        glow.lineStyle(3, 0x44ff44, 0.9);
        glow.strokeRoundedRect(x - CARD_W / 2 - 4, cardY - CARD_H / 2 - 4, CARD_W + 8, CARD_H + 8, 12);
        this.uiLayer.add(glow);
      }

      cardObj.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      cardObj.on('pointerdown', () => {
        if (card.id === 'hidden') return;
        this.selectedCardId = this.selectedCardId === card.id ? null : card.id;
        if (this.gameState) this.renderState(this.gameState);
      });
      cardObj.on('pointerover', () => { if (!isSelected) cardObj.setY(cardY - 12); });
      cardObj.on('pointerout', () => { if (!isSelected) cardObj.setY(cardY); });

      this.uiLayer.add(cardObj);
    });

    // My discard pile (bottom right)
    if (me.discardPile.length > 0) {
      const dtop = me.discardPile.at(-1)!;
      const discardX = W - 120;
      const discardY = handY;
      this.add.text(discardX, discardY - 93, 'กองทิ้งของฉัน', { fontSize: '15px', color: '#aaa' }).setOrigin(0.5);
      const dc = this.makeCard(dtop, discardX, discardY, true, false);
      this.uiLayer.add(dc);
      if (me.discardPile.length > 1) {
        const ct = this.add.text(discardX, discardY + 84, `×${me.discardPile.length}`, { fontSize: '15px', color: '#ddd' }).setOrigin(0.5);
        this.uiLayer.add(ct);
      }
    }
  }

  // ─── Action Buttons ────────────────────────────────────────────
  private drawActionButtons(state: GameState, me: PlayerState) {
    const btnY = H - 45;
    const canDiscard = !!this.selectedCardId;
    const canDraw = me.hand.length <= 5;

    if (canDraw) {
      const drawBtn = this.makeButton('🃏 จั่วไพ่', W / 2 - 135, btnY, 0x2196f3, 0x1976d2, () => {
        getSocket().emit('ss:draw', { roomId: this.roomId });
      });
      this.uiLayer.add(drawBtn);
    }

    if (canDiscard) {
      const discardBtn = this.makeButton('🗑 ทิ้งไพ่', W / 2 + 135, btnY, 0xe53935, 0xb71c1c, () => {
        getSocket().emit('ss:discard', { roomId: this.roomId, cardId: this.selectedCardId });
        this.selectedCardId = null;
      });
      this.uiLayer.add(discardBtn);
    } else {
      // hint
      const hint = this.add.text(W / 2 + 135, btnY, 'เลือกไพ่ที่จะทิ้ง', {
        fontSize: '18px', color: '#888',
      }).setOrigin(0.5);
      this.uiLayer.add(hint);
    }
  }

  // ─── Intercept Button ──────────────────────────────────────────
  private drawInterceptButton(card: Card) {
    const pulse = this.add.graphics();
    pulse.fillStyle(0xff4444, 0.2);
    pulse.fillCircle(W / 2, H / 2 - 30, 90);
    this.uiLayer.add(pulse);
    this.tweens.add({ targets: pulse, alpha: { from: 0.2, to: 0 }, scaleX: 2, scaleY: 2, duration: 800, repeat: -1 });

    const btn = this.makeButton(`⚡ ขัดเทิร์น! (${rankLabel(card.rank)} ${card.suit})`, W / 2, H / 2 - 30, 0xff1744, 0xb71c1c, () => {
      getSocket().emit('ss:intercept', { roomId: this.roomId, card });
    }, 300, 66);
    this.uiLayer.add(btn);
  }

  // ─── Pair Highlight ────────────────────────────────────────────
  private highlightPairs(hand: Card[], jokerValue: number) {
    // find paired cards
    const paired = new Set<string>();
    const used = new Set<string>();
    for (let i = 0; i < hand.length; i++) {
      if (used.has(hand[i].id)) continue;
      for (let j = i + 1; j < hand.length; j++) {
        if (used.has(hand[j].id)) continue;
        if (this.isValidPair(hand[i], hand[j], jokerValue)) {
          paired.add(hand[i].id);
          paired.add(hand[j].id);
          used.add(hand[i].id);
          used.add(hand[j].id);
          break;
        }
      }
    }
    if (paired.size === 0) return;

    const handY = H - 142;
    const startX = W / 2 - ((hand.length - 1) * 117) / 2;
    const g = this.add.graphics();

    hand.forEach((card, i) => {
      if (!paired.has(card.id)) return;
      const x = startX + i * 117;
      const y = this.selectedCardId === card.id ? handY - 33 : handY;
      g.lineStyle(2, 0xffd700, 0.6);
      g.strokeRoundedRect(x - CARD_W / 2 - 3, y - CARD_H / 2 - 3, CARD_W + 6, CARD_H + 6, 11);
    });
    this.uiLayer.add(g);
  }

  // ─── Card Drawing ──────────────────────────────────────────────
  private makeCard(card: Card, x: number, y: number, faceUp: boolean, _interactive: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    if (!faceUp || card.id === 'hidden') {
      // Card back

      // 1. Drop shadow
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.3);
      shadow.fillRoundedRect(-CARD_W / 2 + 3, -CARD_H / 2 + 5, CARD_W, CARD_H, CARD_R);
      c.add(shadow);

      // 2. Deep navy base
      const bg = this.add.graphics();
      bg.fillStyle(0x0d1b5e, 1);
      bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_R);
      c.add(bg);

      // 3. Thin gold border
      bg.lineStyle(1.5, 0xc8a44a, 1);
      bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_R);

      // 4. Inner border (4px inset, gold 40% opacity)
      const ib = this.add.graphics();
      ib.lineStyle(4, 0xc8a44a, 0.4);
      ib.strokeRoundedRect(-CARD_W / 2 + 6, -CARD_H / 2 + 6, CARD_W - 12, CARD_H - 12, CARD_R - 3);
      c.add(ib);

      // 5. Cross-hatch diagonal lines (gold 15% opacity)
      const hatch = this.add.graphics();
      hatch.lineStyle(1, 0xc8a44a, 0.15);
      const step = (CARD_W + CARD_H) / 8;
      for (let k = 0; k < 8; k++) {
        const offset = -CARD_H / 2 + k * step;
        hatch.lineBetween(-CARD_W / 2, offset, CARD_W / 2, offset + CARD_W);
        hatch.lineBetween(-CARD_W / 2, offset, CARD_W / 2, offset - CARD_W);
      }
      c.add(hatch);

      // 6. Center diamond shape (filled 0x1565c0, outlined gold)
      const diam = this.add.graphics();
      diam.fillStyle(0x1565c0, 1);
      const ds = 22;
      diam.fillTriangle(0, -ds, -ds * 0.7, 0, ds * 0.7, 0);
      diam.fillTriangle(0, ds, -ds * 0.7, 0, ds * 0.7, 0);
      diam.lineStyle(1, 0xc8a44a, 1);
      diam.strokeTriangle(0, -ds, -ds * 0.7, 0, ds * 0.7, 0);
      diam.strokeTriangle(0, ds, -ds * 0.7, 0, ds * 0.7, 0);
      c.add(diam);

      // 7. Small gold dot in center
      const dot = this.add.graphics();
      dot.fillStyle(0xc8a44a, 1);
      dot.fillCircle(0, 0, 3);
      c.add(dot);

    } else {
      // Card front
      const isRed = card.suit === 'H' || card.suit === 'D';
      const suitColor = SUIT_COLOR[card.suit] ?? 0x1a237e;
      const textColor = isRed ? '#d32f2f' : '#1a237e';

      // 1. Drop shadow
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.3);
      shadow.fillRoundedRect(-CARD_W / 2 + 3, -CARD_H / 2 + 5, CARD_W, CARD_H, CARD_R);
      c.add(shadow);

      // 2. White base
      const base = this.add.graphics();
      base.fillStyle(0xffffff, 1);
      base.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_R);
      c.add(base);

      // 3. Subtle gradient highlight at top 1/3
      const tint = this.add.graphics();
      tint.fillStyle(0xffffff, 0.2);
      tint.fillRoundedRect(-CARD_W / 2 + 2, -CARD_H / 2 + 2, CARD_W - 4, CARD_H / 3, CARD_R - 1);
      c.add(tint);

      // 4. Thin border
      const border = this.add.graphics();
      border.lineStyle(1.5, 0xe0e0e0, 1);
      border.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_R);
      c.add(border);

      // 5. Top-left rank text
      const topRank = this.add.text(-CARD_W / 2 + 7, -CARD_H / 2 + 6, rankLabel(card.rank), {
        fontSize: '22px', fontStyle: 'bold', fontFamily: 'Georgia, serif',
        color: textColor, resolution: 3,
      });
      c.add(topRank);

      // 5b. Top-left suit graphic (size=13)
      const sTL = this.add.graphics();
      drawSuit(sTL, card.suit, -CARD_W / 2 + 14, -CARD_H / 2 + 30, 13, suitColor);
      c.add(sTL);

      // 6. Center suit graphic (size=32)
      const sCenter = this.add.graphics();
      drawSuit(sCenter, card.suit, 0, 2, 32, suitColor);
      c.add(sCenter);

      // 7. Bottom-right rank text (rotated 180°)
      const botRank = this.add.text(CARD_W / 2 - 7, CARD_H / 2 - 6, rankLabel(card.rank), {
        fontSize: '22px', fontStyle: 'bold', fontFamily: 'Georgia, serif',
        color: textColor, resolution: 3,
      }).setOrigin(1, 1).setRotation(Math.PI);
      c.add(botRank);

      // 7b. Bottom-right suit graphic (size=13, rotated 180°)
      const sBR = this.add.graphics();
      drawSuit(sBR, card.suit, CARD_W / 2 - 14, CARD_H / 2 - 30, 13, suitColor);
      sBR.setRotation(Math.PI);
      c.add(sBR);
    }

    return c;
  }

  // ─── Button ────────────────────────────────────────────────────
  private makeButton(
    label: string, x: number, y: number,
    color: number, hoverColor: number,
    cb: () => void,
    w = 240, h = 57
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillRoundedRect(-w / 2 + 3, -h / 2 + 4, w, h, h / 2);
    c.add(shadow);

    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);

    // shine
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.15);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 4, (h / 2) - 2);
    c.add(shine);

    const text = this.add.text(0, 0, label, {
      fontSize: '21px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 2, resolution: 2,
    }).setOrigin(0.5);
    c.add(text);

    c.setSize(w, h);
    c.setInteractive();
    c.on('pointerdown', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      c.setScale(0.96);
      this.time.delayedCall(120, () => {
        bg.clear();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        c.setScale(1);
        cb();
      });
    });
    c.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      c.setY(y - 4);
    });
    c.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      c.setY(y);
    });

    return c;
  }

  // ─── Result Overlay ────────────────────────────────────────────
  private showResult(isWinner: boolean, pot: number, _players: PlayerState[]) {
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, W, H);

    const panel = this.add.graphics();
    panel.fillStyle(isWinner ? 0x1b5e20 : 0x4a0000, 1);
    panel.fillRoundedRect(W / 2 - 330, H / 2 - 195, 660, 390, 30);
    panel.lineStyle(3, isWinner ? 0x4caf50 : 0xef5350, 1);
    panel.strokeRoundedRect(W / 2 - 330, H / 2 - 195, 660, 390, 30);

    const emoji = this.add.text(W / 2, H / 2 - 135, isWinner ? '🏆' : '😔', {
      fontSize: '78px',
    }).setOrigin(0.5);

    const title = this.add.text(W / 2, H / 2 - 45, isWinner ? 'คุณชนะ!' : 'คุณแพ้แล้ว', {
      fontSize: '45px', color: isWinner ? '#4caf50' : '#ef5350', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    if (isWinner) {
      const potText = this.add.text(W / 2, H / 2 + 22, `+${pot} บาท`, {
        fontSize: '33px', color: '#ffd700', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.tweens.add({ targets: potText, y: H / 2 + 7, alpha: { from: 0, to: 1 }, duration: 600, ease: 'Back.Out' });
    }

    // particle effect for win
    if (isWinner) {
      for (let i = 0; i < 20; i++) {
        this.time.delayedCall(i * 80, () => {
          const px = Phaser.Math.Between(W / 2 - 300, W / 2 + 300);
          const py = Phaser.Math.Between(H / 2 - 180, H / 2 + 90);
          const p = this.add.text(px, py, ['⭐', '✨', '🌟'][i % 3], { fontSize: '30px' }).setAlpha(0);
          this.tweens.add({ targets: p, alpha: 1, y: py - 90, duration: 600, ease: 'Quad.Out', onComplete: () => p.destroy() });
        });
      }
    }

    const backBtn = this.makeButton('🏠 กลับ Lobby', W / 2, H / 2 + 112, 0x37474f, 0x263238, () => {
      window.location.href = '/';
    }, 270, 63);
    this.uiLayer.add(backBtn);

    [overlay, panel, emoji, title].forEach((o) => {
      if (o instanceof Phaser.GameObjects.Container) return;
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────
  private isValidPair(c1: Card, c2: Card, jokerValue: number): boolean {
    const val = (c: Card) => (c.rank >= 10 ? 10 : c.rank);
    const isJoker = (c: Card) => val(c) === jokerValue || c.rank === jokerValue;
    const isDead = (c: Card) => {
      if ([5, 10, 11, 12, 13].includes(jokerValue)) return false;
      return val(c) === 10 - jokerValue;
    };
    const j1 = isJoker(c1), j2 = isJoker(c2);
    if (j1 && j2) return true;
    if (j1 && !isDead(c2)) return true;
    if (j2 && !isDead(c1)) return true;
    if (isDead(c1) || isDead(c2)) return false;
    if (c1.rank >= 10 && c2.rank >= 10 && c1.rank === c2.rank) return true;
    if (c1.rank < 10 && c2.rank < 10 && c1.rank + c2.rank === 10) return true;
    return false;
  }

  private checkIntercept(hand: Card[], drawn: Card, jokerValue: number): boolean {
    const testHand = [...hand, drawn];
    if (testHand.length !== 6) return false;
    const used = new Set<string>();
    let count = 0;
    for (let i = 0; i < testHand.length; i++) {
      if (used.has(testHand[i].id)) continue;
      for (let j = i + 1; j < testHand.length; j++) {
        if (used.has(testHand[j].id)) continue;
        if (this.isValidPair(testHand[i], testHand[j], jokerValue)) {
          used.add(testHand[i].id); used.add(testHand[j].id); count++; break;
        }
      }
    }
    return count === 3;
  }

  destroy() {
    getSocket().off('ss:state');
    getSocket().off('ss:finished');
  }
}
