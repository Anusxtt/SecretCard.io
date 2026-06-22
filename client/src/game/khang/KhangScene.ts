import Phaser from 'phaser';
import { getSocket } from '../../hooks/useSocket';

interface Card { id: string; suit: string; rank: number; }
interface KhangPlayerState { playerId: string; name: string; hand: Card[]; isBot: boolean; }
interface KhangGameState {
  roomId: string;
  players: KhangPlayerState[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  phase: string;
  result: { winnerId: string; wrongKhangId: string | null } | null;
  lastDiscard: Card | null;
  flowChain: { playerId: string; cardIds: string[] }[];
  waitingDiscard: boolean;
}

const RL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rl = (r: number) => RL[r] ?? String(r);
const pts = (r: number) => r >= 11 ? 10 : r;

// Canvas logical size
const W = 1920;
const H = 1080;
const CW = 100;   // card width
const CH = 140;   // card height
const CR = 10;    // card corner radius

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

export class KhangScene extends Phaser.Scene {
  private roomId!: string;
  private myPlayerId!: string;
  private betAmount!: number;
  private gs: KhangGameState | null = null;
  private selectedId: string | null = null;
  private initialized = false;
  private ui!: Phaser.GameObjects.Container;
  private statusBg!: Phaser.GameObjects.Graphics;
  private statusTxt!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'KhangScene', active: false }); }

  init(data: { roomId: string; playerId: string; betAmount: number }) {
    this.roomId = data.roomId;
    this.myPlayerId = data.playerId;
    this.betAmount = data.betAmount;
    this.initialized = true;
  }

  create() {
    if (!this.initialized) return;
    this.drawBg();
    this.ui = this.add.container(0, 0);
    this.createHUD();
    this.setupSockets();
    getSocket().emit('kh:start', { roomId: this.roomId });
  }

  // ── Background ───────────────────────────────────────────────────────────
  private drawBg() {
    // dark base
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0520, 0x0a0520, 0x060315, 0x060315, 1);
    bg.fillRect(0, 0, W, H);

    // felt oval
    const felt = this.add.graphics();
    felt.fillStyle(0x130830, 1);
    felt.fillEllipse(W / 2, H / 2, W - 60, H - 60);

    // gold border
    felt.lineStyle(6, 0xb8860b, 0.7);
    felt.strokeEllipse(W / 2, H / 2, W - 60, H - 60);
    felt.lineStyle(2, 0xdaa520, 0.3);
    felt.strokeEllipse(W / 2, H / 2, W - 120, H - 120);

    // subtle felt texture — concentric ellipses
    for (let i = 1; i <= 6; i++) {
      const g2 = this.add.graphics();
      g2.lineStyle(1, 0x7b2d8b, 0.06);
      g2.strokeEllipse(W / 2, H / 2, W - 60 - i * 60, H - 60 - i * 38);
    }

    // corner ornaments
    for (const [cx, cy] of [[36, 36], [W - 36, 36], [36, H - 36], [W - 36, H - 36]]) {
      const d = this.add.graphics();
      d.fillStyle(0xb8860b, 0.35);
      d.fillCircle(cx, cy, 21);
      d.lineStyle(1, 0xdaa520, 0.5);
      d.strokeCircle(cx, cy, 21);
    }
  }

  // ── HUD (status bar) ────────────────────────────────────────────────────
  private createHUD() {
    this.statusBg = this.add.graphics();
    this.statusBg.fillStyle(0x000000, 0.5);
    this.statusBg.fillRoundedRect(W / 2 - 390, 12, 780, 66, 33);

    this.statusTxt = this.add.text(W / 2, 45, '', {
      fontSize: '27px', color: '#daa520', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
  }

  private setStatus(text: string, isMyTurn: boolean) {
    this.statusBg.clear();
    this.statusBg.fillStyle(isMyTurn ? 0x1a0a3a : 0x000000, 0.65);
    this.statusBg.fillRoundedRect(W / 2 - 390, 12, 780, 66, 33);
    if (isMyTurn) {
      this.statusBg.lineStyle(2, 0x9b59b6, 0.8);
      this.statusBg.strokeRoundedRect(W / 2 - 390, 12, 780, 66, 33);
    }
    this.statusTxt.setText(text).setColor(isMyTurn ? '#ce93d8' : '#daa520');
  }

  // ── Sockets ─────────────────────────────────────────────────────────────
  private setupSockets() {
    const s = getSocket();
    s.off('kh:state'); s.off('kh:wrong_khang'); s.off('kh:finished');

    s.on('kh:state', (state: KhangGameState) => {
      this.gs = state;
      this.render(state);
    });

    s.on('kh:wrong_khang', (d: { playerId: string; penalty: number }) => {
      const name = this.gs?.players.find(p => p.playerId === d.playerId)?.name ?? 'ผู้เล่น';
      this.toast(`⚠️ ${name} แคงผิด! เสีย ${d.penalty} บาท`, 0xff5722);
    });

    s.on('kh:finished', (d: { winnerId: string; pot: number; players: KhangPlayerState[] }) => {
      this.showResult(d.winnerId === this.myPlayerId, d.pot);
    });
  }

  // ── Main render ─────────────────────────────────────────────────────────
  private render(state: KhangGameState) {
    this.ui.removeAll(true);

    const me = state.players.find(p => p.playerId === this.myPlayerId);
    if (!me) return;

    const isMyCurrent = state.players[state.currentPlayerIndex]?.playerId === this.myPlayerId;
    const myTotal = me.hand.reduce((s, c) => s + pts(c.rank), 0);
    const curName = state.players[state.currentPlayerIndex]?.name ?? '';

    // Determine status message
    let statusMsg: string;
    if (isMyCurrent) {
      if (state.waitingDiscard) {
        statusMsg = '🗑 เลือกไพ่ที่จะทิ้ง';
      } else {
        statusMsg = `🎯 เทิร์นของคุณ — แต้ม: ${myTotal}`;
      }
    } else {
      statusMsg = `⏳ รอ ${curName}...`;
    }
    this.setStatus(statusMsg, isMyCurrent);

    this.drawScorePanel(me);
    this.drawDeckPile(state);
    this.drawDiscardPile(state);
    this.drawOpponents(state);
    this.drawMyHand(me, state, isMyCurrent);
    if (isMyCurrent) this.drawActionBtns(state, me);
    if (state.flowChain.length > 0) this.drawFlowBadge(state);
  }

  // ── Score panel (left) ──────────────────────────────────────────────────
  private drawScorePanel(me: KhangPlayerState) {
    const total = me.hand.reduce((s, c) => s + pts(c.rank), 0);
    const x = 108, y = H / 2;
    const color = total <= 5 ? 0x27ae60 : total <= 15 ? 0xf39c12 : 0xe74c3c;
    const colorHex = total <= 5 ? '#27ae60' : total <= 15 ? '#f39c12' : '#e74c3c';

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(x - 93, y - 78, 186, 156, 21);
    bg.lineStyle(2, color, 0.5);
    bg.strokeRoundedRect(x - 93, y - 78, 186, 156, 21);
    this.ui.add(bg);

    this.uiText(x, y - 45, 'แต้มของคุณ', 18, '#9b59b6', 600);
    this.uiText(x, y + 3, String(total), 57, colorHex, 800, '#000', 3);
    this.uiText(x, y + 54, total <= 3 ? '🌟 ดีมาก' : total <= 10 ? '👍 โอเค' : '⚠️ เสี่ยง', 18, colorHex);
  }

  // ── Deck pile (right) ───────────────────────────────────────────────────
  private drawDeckPile(state: KhangGameState) {
    const x = W - 150, y = H / 2 - 15;
    const depth = Math.min(6, Math.ceil(state.deck.length / 8));
    for (let i = depth - 1; i >= 0; i--) {
      this.drawCardBack(x - i * 2, y - i * 2);
    }
    // count badge
    const cb = this.add.graphics();
    cb.fillStyle(0x7b2d8b, 1);
    cb.fillCircle(x + CW / 2 - 9, y - CH / 2 + 9, 21);
    this.ui.add(cb);
    this.uiText(x + CW / 2 - 9, y - CH / 2 + 9, String(state.deck.length), 18, '#fff', 700);
    this.uiText(x, y + CH / 2 + 18, 'สำรับ', 18, '#9b59b6');
  }

  // ── Discard pile (center) ───────────────────────────────────────────────
  private drawDiscardPile(state: KhangGameState) {
    const x = W / 2, y = H / 2 - 15;

    // shadow platform
    const plat = this.add.graphics();
    plat.fillStyle(0x000000, 0.35);
    plat.fillEllipse(x, y + CH / 2 + 12, 180, 30);
    this.ui.add(plat);

    if (!state.discardPile.length) {
      const empty = this.add.graphics();
      empty.lineStyle(2, 0x7b2d8b, 0.3);
      empty.strokeRoundedRect(x - CW / 2, y - CH / 2, CW, CH, CR);
      this.ui.add(empty);
      this.uiText(x, y, 'กองกลาง', 19, '#555');
      return;
    }

    // stack ghost
    for (let i = Math.min(3, state.discardPile.length - 1); i > 0; i--) {
      const g = this.add.graphics();
      g.fillStyle(0x1565c0, 0.5);
      g.fillRoundedRect(x - CW / 2 + i * 2, y - CH / 2 - i * 2, CW, CH, CR);
      this.ui.add(g);
    }

    const top = state.discardPile.at(-1)!;
    this.ui.add(this.makeCard(top, x, y, true));
    this.uiText(x, y + CH / 2 + 21, `กองทิ้ง (${state.discardPile.length})`, 17, '#9b59b6');
  }

  // ── Opponents ────────────────────────────────────────────────────────────
  private drawOpponents(state: KhangGameState) {
    const ops = state.players.filter(p => p.playerId !== this.myPlayerId);
    const pos = this.opponentPositions(ops.length);

    ops.forEach((p, i) => {
      const { x, y } = pos[i];
      const isCur = state.players[state.currentPlayerIndex]?.playerId === p.playerId;

      // name badge
      const bb = this.add.graphics();
      bb.fillStyle(isCur ? 0x2a1050 : 0x0d0520, 0.88);
      bb.fillRoundedRect(x - 102, y - 141, 204, 45, 18);
      if (isCur) { bb.lineStyle(2, 0x9b59b6, 1); bb.strokeRoundedRect(x - 102, y - 141, 204, 45, 18); }
      this.ui.add(bb);
      this.uiText(x, y - 119, `${p.isBot ? '🤖' : '👤'} ${p.name}`, 19, isCur ? '#ce93d8' : '#aaa', 700);

      // fan hand (card backs)
      p.hand.forEach((card, j) => {
        const angle = (j - (p.hand.length - 1) / 2) * 10;
        const cx = x + (j - (p.hand.length - 1) / 2) * 20;
        const c = this.makeCard(card, cx, y - 30, card.id !== 'hidden');
        c.setRotation(Phaser.Math.DegToRad(angle));
        this.ui.add(c);
      });

      this.uiText(x, y + CH / 2 - 3, `${p.hand.length} ใบ`, 17, '#7b2d8b');

      // turn glow ring
      if (isCur) {
        const ring = this.add.graphics();
        ring.lineStyle(3, 0x9b59b6, 0.6);
        ring.strokeCircle(x, y - 30, 84);
        this.ui.add(ring);
      }
    });
  }

  private opponentPositions(n: number) {
    if (n === 1) return [{ x: W / 2, y: 315 }];
    if (n === 2) return [{ x: W / 2 - 330, y: 300 }, { x: W / 2 + 330, y: 300 }];
    if (n === 3) return [{ x: W / 2, y: 263 }, { x: W / 2 - 420, y: 375 }, { x: W / 2 + 420, y: 375 }];
    return [{ x: W / 2 - 210, y: 278 }, { x: W / 2 + 210, y: 278 }, { x: W / 2 - 450, y: 405 }, { x: W / 2 + 450, y: 405 }];
  }

  // ── My hand ─────────────────────────────────────────────────────────────
  private drawMyHand(me: KhangPlayerState, state: KhangGameState, _isMyCurrent: boolean) {
    const handY = H - 142;
    const n = me.hand.length;
    const gap = Math.min(120, (W - 300) / Math.max(n, 1));
    const startX = W / 2 - ((n - 1) * gap) / 2;
    const flowRank = state.lastDiscard?.rank;

    this.uiText(W / 2, handY - 108, `มือของคุณ (${n} ใบ) — แต้ม: ${me.hand.reduce((s, c) => s + pts(c.rank), 0)}`, 19, '#9b59b6');

    me.hand.forEach((card, i) => {
      const x = startX + i * gap;
      const isSel = this.selectedId === card.id;
      const canFlow = !state.waitingDiscard && flowRank !== undefined && card.rank === flowRank;
      const cardY = isSel ? handY - 39 : handY;

      // flow glow
      if (canFlow) {
        const fg = this.add.graphics();
        fg.lineStyle(3, 0xff9800, 0.85);
        fg.strokeRoundedRect(x - CW / 2 - 6, cardY - CH / 2 - 6, CW + 12, CH + 12, CR + 3);
        this.ui.add(fg);
        this.uiText(x, cardY + CH / 2 + 15, '⚡ไหล', 17, '#ff9800', 700);
      }

      // selected glow
      if (isSel) {
        const sg = this.add.graphics();
        sg.lineStyle(3, 0xce93d8, 1);
        sg.strokeRoundedRect(x - CW / 2 - 6, cardY - CH / 2 - 6, CW + 12, CH + 12, CR + 3);
        this.ui.add(sg);
      }

      const c = this.makeCard(card, x, cardY, true);
      c.setInteractive(new Phaser.Geom.Rectangle(-CW / 2, -CH / 2, CW, CH), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', () => {
        if (card.id === 'hidden') return;
        this.selectedId = this.selectedId === card.id ? null : card.id;
        if (this.gs) this.render(this.gs);
      });
      c.on('pointerover', () => { if (!isSel) c.setY(cardY - 12); });
      c.on('pointerout', () => { if (!isSel) c.setY(cardY); });
      this.ui.add(c);

      // point badge
      const p = pts(card.rank);
      const bc = p >= 10 ? 0xc0392b : p >= 7 ? 0xe67e22 : 0x27ae60;
      const bbg = this.add.graphics();
      bbg.fillStyle(bc, 0.9);
      bbg.fillCircle(x + CW / 2 - 15, cardY - CH / 2 + 15, 17);
      this.ui.add(bbg);
      this.uiText(x + CW / 2 - 15, cardY - CH / 2 + 15, String(p), 17, '#fff', 700);
    });
  }

  // ── Action buttons ───────────────────────────────────────────────────────
  private drawActionBtns(state: KhangGameState, me: KhangPlayerState) {
    const y = H - 39;
    const flowRank = state.lastDiscard?.rank;
    const flowCards = me.hand.filter(c => c.rank === flowRank);

    if (state.waitingDiscard) {
      this.uiText(W / 2, y - 21, '← เลือกไพ่ที่จะทิ้ง แล้วกดปุ่ม', 19, '#ce93d8');
      if (this.selectedId) {
        this.ui.add(this.btn('🗑 ทิ้งไพ่นี้', W / 2, y, 0xc62828, 0x8e0000, () => {
          getSocket().emit('kh:discard', { roomId: this.roomId, cardId: this.selectedId });
          this.selectedId = null;
        }, 270, 63));
      }
    } else {
      // แคง
      this.ui.add(this.btn('👑 แคง', W / 2 - 390, y, 0x6a1b9a, 0x4a148c, () => {
        getSocket().emit('kh:khang', { roomId: this.roomId });
      }, 225, 63));

      // จั่ว
      this.ui.add(this.btn('🃏 จั่วไพ่', W / 2, y, 0x1565c0, 0x0d47a1, () => {
        getSocket().emit('kh:draw', { roomId: this.roomId });
        this.selectedId = null;
      }, 225, 63));

      // ไหล (ถ้ามีไพ่ไหลได้)
      if (flowCards.length > 0 && flowRank !== undefined) {
        const label = flowCards.length > 1
          ? `⚡ ไหล ${flowCards.length} ใบ (${rl(flowRank)})`
          : `⚡ ไหล (${rl(flowRank)} ${flowCards[0].suit})`;
        this.ui.add(this.btn(label, W / 2 + 390, y, 0xe65100, 0xbf360c, () => {
          getSocket().emit('kh:flow', { roomId: this.roomId, cardId: flowCards[0].id });
        }, 285, 63));
      }
    }
  }

  // ── Flow badge ───────────────────────────────────────────────────────────
  private drawFlowBadge(state: KhangGameState) {
    const last = state.flowChain.at(-1);
    if (!last) return;
    const name = state.players.find(p => p.playerId === last.playerId)?.name ?? '?';
    const x = W / 2, y = 93;
    const bg = this.add.graphics();
    bg.fillStyle(0xe65100, 0.18);
    bg.fillRoundedRect(x - 255, y - 22, 510, 45, 22);
    bg.lineStyle(1, 0xff9800, 0.5);
    bg.strokeRoundedRect(x - 255, y - 22, 510, 45, 22);
    this.ui.add(bg);
    this.uiText(x, y, `⚡ ${name} ไหล ${last.cardIds.length} ใบ!`, 19, '#ff9800', 700);
  }

  // ── Card factory ─────────────────────────────────────────────────────────
  private makeCard(card: Card, x: number, y: number, faceUp: boolean): Phaser.GameObjects.Container {
    return faceUp && card.id !== 'hidden'
      ? this.cardFront(card, x, y)
      : this.drawCardBack(x, y);
  }

  private cardFront(card: Card, x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const isRed = card.suit === 'H' || card.suit === 'D';
    const suitColor = isRed ? 0xd32f2f : 0x1a237e;
    const textColor = isRed ? '#d32f2f' : '#1a237e';

    // 1. Drop shadow
    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.3);
    sh.fillRoundedRect(-CW / 2 + 3, -CH / 2 + 5, CW, CH, CR);
    c.add(sh);

    // 2. White base
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 1);
    bg.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, CR);
    c.add(bg);

    // 3. Subtle gradient highlight at top 1/3
    const tint = this.add.graphics();
    tint.fillStyle(0xffffff, 0.2);
    tint.fillRoundedRect(-CW / 2 + 2, -CH / 2 + 2, CW - 4, CH / 3, CR - 1);
    c.add(tint);

    // 4. Thin border
    const border = this.add.graphics();
    border.lineStyle(1.5, 0xe0e0e0, 1);
    border.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, CR);
    c.add(border);

    // 5. Top-left rank text
    const rTL = this.add.text(-CW / 2 + 7, -CH / 2 + 6, rl(card.rank), {
      fontSize: '22px', fontStyle: 'bold', fontFamily: 'Georgia, serif',
      color: textColor, resolution: 3,
    });
    c.add(rTL);

    // 5b. Top-left suit graphic (size=13)
    const sTL = this.add.graphics();
    drawSuit(sTL, card.suit, -CW / 2 + 14, -CH / 2 + 30, 13, suitColor);
    c.add(sTL);

    // 6. Center suit graphic (size=36)
    const sCenter = this.add.graphics();
    drawSuit(sCenter, card.suit, 0, 3, 36, suitColor);
    c.add(sCenter);

    // 7. Bottom-right rank text (rotated 180°)
    const rBR = this.add.text(CW / 2 - 7, CH / 2 - 6, rl(card.rank), {
      fontSize: '22px', fontStyle: 'bold', fontFamily: 'Georgia, serif',
      color: textColor, resolution: 3,
    }).setOrigin(1, 1).setRotation(Math.PI);
    c.add(rBR);

    // 7b. Bottom-right suit graphic (size=13, rotated 180°)
    const sBR = this.add.graphics();
    // Draw at bottom-right position, then rotate the whole graphics object
    drawSuit(sBR, card.suit, CW / 2 - 14, CH / 2 - 30, 13, suitColor);
    sBR.setRotation(Math.PI);
    c.add(sBR);

    return c;
  }

  private drawCardBack(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    // 1. Drop shadow
    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.3);
    sh.fillRoundedRect(-CW / 2 + 3, -CH / 2 + 5, CW, CH, CR);
    c.add(sh);

    // 2. Deep navy base
    const bg = this.add.graphics();
    bg.fillStyle(0x0d1b5e, 1);
    bg.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, CR);
    c.add(bg);

    // 3. Thin gold border
    bg.lineStyle(1.5, 0xc8a44a, 1);
    bg.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, CR);

    // 4. Inner border (4px inset, gold 40% opacity)
    const ib = this.add.graphics();
    ib.lineStyle(4, 0xc8a44a, 0.4);
    ib.strokeRoundedRect(-CW / 2 + 6, -CH / 2 + 6, CW - 12, CH - 12, CR - 3);
    c.add(ib);

    // 5. Cross-hatch diagonal lines (gold 15% opacity)
    const hatch = this.add.graphics();
    hatch.lineStyle(1, 0xc8a44a, 0.15);
    const step = (CW + CH) / 8;
    for (let k = 0; k < 8; k++) {
      const offset = -CH / 2 + k * step;
      hatch.lineBetween(-CW / 2, offset, CW / 2, offset + CW);
      hatch.lineBetween(-CW / 2, offset, CW / 2, offset - CW);
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

    // 7. Small gold dot in center of diamond
    const dot = this.add.graphics();
    dot.fillStyle(0xc8a44a, 1);
    dot.fillCircle(0, 0, 3);
    c.add(dot);

    this.ui.add(c);
    return c;
  }

  // ── Button factory ───────────────────────────────────────────────────────
  private btn(
    label: string, x: number, y: number,
    col: number, hov: number,
    cb: () => void, w = 240, h = 60
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.4);
    sh.fillRoundedRect(-w / 2 + 3, -h / 2 + 4, w, h, h / 2);
    c.add(sh);

    const bg = this.add.graphics();
    bg.fillStyle(col, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);

    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.12);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 4, h / 2 - 2);
    c.add(shine);

    const t = this.add.text(0, 0, label, {
      fontSize: '22px', color: '#fff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3, resolution: 2,
    }).setOrigin(0.5);
    c.add(t);

    c.setSize(w, h).setInteractive();
    c.on('pointerdown', () => {
      c.setScale(0.95);
      bg.clear(); bg.fillStyle(hov, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      this.time.delayedCall(100, () => { c.setScale(1); cb(); });
    });
    c.on('pointerover', () => {
      bg.clear(); bg.fillStyle(hov, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      c.setY(y - 4);
    });
    c.on('pointerout', () => {
      bg.clear(); bg.fillStyle(col, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      c.setY(y);
    });
    return c;
  }

  // ── Helper: add text to uiLayer ────────────────────────────────────────
  private uiText(x: number, y: number, text: string, size: number, color: string, weight = 400, stroke?: string, sw = 0) {
    const t = this.add.text(x, y, text, {
      fontSize: `${size}px`, color,
      fontStyle: weight >= 700 ? 'bold' : 'normal',
      stroke: stroke ?? undefined, strokeThickness: sw,
      resolution: 2,
    }).setOrigin(0.5);
    this.ui.add(t);
    return t;
  }

  // ── Toast ────────────────────────────────────────────────────────────────
  private toast(msg: string, bgColor = 0x000000) {
    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 0.85);
    bg.fillRoundedRect(W / 2 - 330, H / 2 - 180, 660, 78, 27);
    const t = this.add.text(W / 2, H / 2 - 141, msg, {
      fontSize: '25px', color: '#fff', fontStyle: 'bold', resolution: 2,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: [bg, t], alpha: { from: 1, to: 0 },
      delay: 2000, duration: 600,
      onComplete: () => { bg.destroy(); t.destroy(); },
    });
  }

  // ── Result overlay ───────────────────────────────────────────────────────
  private showResult(win: boolean, pot: number) {
    const ov = this.add.graphics();
    ov.fillStyle(0x000000, 0.78);
    ov.fillRect(0, 0, W, H);

    const panel = this.add.graphics();
    panel.fillStyle(win ? 0x1a0a4a : 0x3a0000, 1);
    panel.fillRoundedRect(W / 2 - 375, H / 2 - 225, 750, 450, 36);
    panel.lineStyle(3, win ? 0x9b59b6 : 0xef5350, 1);
    panel.strokeRoundedRect(W / 2 - 375, H / 2 - 225, 750, 450, 36);

    const emoji = this.add.text(W / 2, H / 2 - 158, win ? '👑' : '😔', { fontSize: '90px', resolution: 2 })
      .setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: emoji, alpha: 1, scaleX: { from: 0.4, to: 1 }, scaleY: { from: 0.4, to: 1 }, duration: 500, ease: 'Back.Out' });

    this.add.text(W / 2, H / 2 - 57, win ? '🎉 คุณชนะ!' : '💀 คุณแพ้', {
      fontSize: '51px', color: win ? '#ce93d8' : '#ef5350', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5);

    if (win) {
      const pt = this.add.text(W / 2, H / 2 + 27, `+${pot} บาท`, {
        fontSize: '42px', color: '#ffd700', fontStyle: 'bold', resolution: 2,
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: pt, alpha: 1, y: H / 2 + 18, duration: 600, delay: 350 });

      for (let i = 0; i < 18; i++) {
        this.time.delayedCall(i * 90, () => {
          const px = Phaser.Math.Between(W / 2 - 330, W / 2 + 330);
          const p = this.add.text(px, H / 2 - 180, '💰', { fontSize: '30px' }).setAlpha(0);
          this.tweens.add({ targets: p, alpha: 1, y: H / 2 - 180 - Phaser.Math.Between(90, 210), duration: 700, onComplete: () => p.destroy() });
        });
      }
    }

    this.ui.add(this.btn('🏠 กลับ Lobby', W / 2, H / 2 + 128, 0x37474f, 0x263238, () => {
      window.location.href = '/';
    }, 300, 72));
  }

  destroy() {
    const s = getSocket();
    s.off('kh:state'); s.off('kh:finished'); s.off('kh:wrong_khang');
  }
}
