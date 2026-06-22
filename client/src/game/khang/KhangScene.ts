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

const SYM: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rl = (r: number) => RL[r] ?? String(r);
const pts = (r: number) => r >= 11 ? 10 : r;

// Canvas logical size — rendered at 2× for sharpness
const W = 1280;
const H = 720;
const CW = 72;   // card width
const CH = 100;  // card height
const CR = 7;    // card corner radius

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
    felt.fillEllipse(W / 2, H / 2, W - 40, H - 40);

    // gold border
    felt.lineStyle(6, 0xb8860b, 0.7);
    felt.strokeEllipse(W / 2, H / 2, W - 40, H - 40);
    felt.lineStyle(2, 0xdaa520, 0.3);
    felt.strokeEllipse(W / 2, H / 2, W - 80, H - 80);

    // subtle felt texture — concentric ellipses
    for (let i = 1; i <= 6; i++) {
      const g2 = this.add.graphics();
      g2.lineStyle(1, 0x7b2d8b, 0.06);
      g2.strokeEllipse(W / 2, H / 2, W - 40 - i * 40, H - 40 - i * 25);
    }

    // corner ornaments
    for (const [cx, cy] of [[24, 24], [W - 24, 24], [24, H - 24], [W - 24, H - 24]]) {
      const d = this.add.graphics();
      d.fillStyle(0xb8860b, 0.35);
      d.fillCircle(cx, cy, 14);
      d.lineStyle(1, 0xdaa520, 0.5);
      d.strokeCircle(cx, cy, 14);
    }
  }

  // ── HUD (status bar) ────────────────────────────────────────────────────
  private createHUD() {
    this.statusBg = this.add.graphics();
    this.statusBg.fillStyle(0x000000, 0.5);
    this.statusBg.fillRoundedRect(W / 2 - 260, 8, 520, 44, 22);

    this.statusTxt = this.add.text(W / 2, 30, '', {
      fontSize: '18px', color: '#daa520', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
  }

  private setStatus(text: string, isMyTurn: boolean) {
    this.statusBg.clear();
    this.statusBg.fillStyle(isMyTurn ? 0x1a0a3a : 0x000000, 0.65);
    this.statusBg.fillRoundedRect(W / 2 - 260, 8, 520, 44, 22);
    if (isMyTurn) {
      this.statusBg.lineStyle(2, 0x9b59b6, 0.8);
      this.statusBg.strokeRoundedRect(W / 2 - 260, 8, 520, 44, 22);
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
    const x = 72, y = H / 2;
    const color = total <= 5 ? 0x27ae60 : total <= 15 ? 0xf39c12 : 0xe74c3c;
    const colorHex = total <= 5 ? '#27ae60' : total <= 15 ? '#f39c12' : '#e74c3c';

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(x - 62, y - 52, 124, 104, 14);
    bg.lineStyle(2, color, 0.5);
    bg.strokeRoundedRect(x - 62, y - 52, 124, 104, 14);
    this.ui.add(bg);

    this.uiText(x, y - 30, 'แต้มของคุณ', 12, '#9b59b6', 600);
    this.uiText(x, y + 2, String(total), 38, colorHex, 800, '#000', 3);
    this.uiText(x, y + 36, total <= 3 ? '🌟 ดีมาก' : total <= 10 ? '👍 โอเค' : '⚠️ เสี่ยง', 12, colorHex);
  }

  // ── Deck pile (right) ───────────────────────────────────────────────────
  private drawDeckPile(state: KhangGameState) {
    const x = W - 100, y = H / 2 - 10;
    const depth = Math.min(6, Math.ceil(state.deck.length / 8));
    for (let i = depth - 1; i >= 0; i--) {
      this.drawCardBack(x - i * 2, y - i * 2);
    }
    // count badge
    const cb = this.add.graphics();
    cb.fillStyle(0x7b2d8b, 1);
    cb.fillCircle(x + CW / 2 - 6, y - CH / 2 + 6, 14);
    this.ui.add(cb);
    this.uiText(x + CW / 2 - 6, y - CH / 2 + 6, String(state.deck.length), 12, '#fff', 700);
    this.uiText(x, y + CH / 2 + 12, 'สำรับ', 12, '#9b59b6');
  }

  // ── Discard pile (center) ───────────────────────────────────────────────
  private drawDiscardPile(state: KhangGameState) {
    const x = W / 2, y = H / 2 - 10;

    // shadow platform
    const plat = this.add.graphics();
    plat.fillStyle(0x000000, 0.35);
    plat.fillEllipse(x, y + CH / 2 + 8, 120, 20);
    this.ui.add(plat);

    if (!state.discardPile.length) {
      const empty = this.add.graphics();
      empty.lineStyle(2, 0x7b2d8b, 0.3);
      empty.strokeRoundedRect(x - CW / 2, y - CH / 2, CW, CH, CR);
      this.ui.add(empty);
      this.uiText(x, y, 'กองกลาง', 13, '#555');
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
    this.uiText(x, y + CH / 2 + 14, `กองทิ้ง (${state.discardPile.length})`, 11, '#9b59b6');
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
      bb.fillRoundedRect(x - 68, y - 94, 136, 30, 12);
      if (isCur) { bb.lineStyle(2, 0x9b59b6, 1); bb.strokeRoundedRect(x - 68, y - 94, 136, 30, 12); }
      this.ui.add(bb);
      this.uiText(x, y - 79, `${p.isBot ? '🤖' : '👤'} ${p.name}`, 13, isCur ? '#ce93d8' : '#aaa', 700);

      // fan hand (card backs)
      p.hand.forEach((card, j) => {
        const angle = (j - (p.hand.length - 1) / 2) * 10;
        const cx = x + (j - (p.hand.length - 1) / 2) * 20;
        const c = this.makeCard(card, cx, y - 20, card.id !== 'hidden');
        c.setRotation(Phaser.Math.DegToRad(angle));
        this.ui.add(c);
      });

      this.uiText(x, y + CH / 2 - 2, `${p.hand.length} ใบ`, 11, '#7b2d8b');

      // turn glow ring
      if (isCur) {
        const ring = this.add.graphics();
        ring.lineStyle(3, 0x9b59b6, 0.6);
        ring.strokeCircle(x, y - 20, 56);
        this.ui.add(ring);
      }
    });
  }

  private opponentPositions(n: number) {
    if (n === 1) return [{ x: W / 2, y: 210 }];
    if (n === 2) return [{ x: W / 2 - 220, y: 200 }, { x: W / 2 + 220, y: 200 }];
    if (n === 3) return [{ x: W / 2, y: 175 }, { x: W / 2 - 280, y: 250 }, { x: W / 2 + 280, y: 250 }];
    return [{ x: W / 2 - 140, y: 185 }, { x: W / 2 + 140, y: 185 }, { x: W / 2 - 300, y: 270 }, { x: W / 2 + 300, y: 270 }];
  }

  // ── My hand ─────────────────────────────────────────────────────────────
  private drawMyHand(me: KhangPlayerState, state: KhangGameState, _isMyCurrent: boolean) {
    const handY = H - 95;
    const n = me.hand.length;
    const gap = Math.min(86, (W - 200) / Math.max(n, 1));
    const startX = W / 2 - ((n - 1) * gap) / 2;
    const flowRank = state.lastDiscard?.rank;

    this.uiText(W / 2, handY - 72, `มือของคุณ (${n} ใบ) — แต้ม: ${me.hand.reduce((s, c) => s + pts(c.rank), 0)}`, 13, '#9b59b6');

    me.hand.forEach((card, i) => {
      const x = startX + i * gap;
      const isSel = this.selectedId === card.id;
      const canFlow = !state.waitingDiscard && flowRank !== undefined && card.rank === flowRank;
      const cardY = isSel ? handY - 26 : handY;

      // flow glow
      if (canFlow) {
        const fg = this.add.graphics();
        fg.lineStyle(3, 0xff9800, 0.85);
        fg.strokeRoundedRect(x - CW / 2 - 4, cardY - CH / 2 - 4, CW + 8, CH + 8, CR + 2);
        this.ui.add(fg);
        this.uiText(x, cardY + CH / 2 + 10, '⚡ไหล', 11, '#ff9800', 700);
      }

      // selected glow
      if (isSel) {
        const sg = this.add.graphics();
        sg.lineStyle(3, 0xce93d8, 1);
        sg.strokeRoundedRect(x - CW / 2 - 4, cardY - CH / 2 - 4, CW + 8, CH + 8, CR + 2);
        this.ui.add(sg);
      }

      const c = this.makeCard(card, x, cardY, true);
      c.setInteractive(new Phaser.Geom.Rectangle(-CW / 2, -CH / 2, CW, CH), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', () => {
        if (card.id === 'hidden') return;
        this.selectedId = this.selectedId === card.id ? null : card.id;
        if (this.gs) this.render(this.gs);
      });
      c.on('pointerover', () => { if (!isSel) c.setY(cardY - 8); });
      c.on('pointerout', () => { if (!isSel) c.setY(cardY); });
      this.ui.add(c);

      // point badge
      const p = pts(card.rank);
      const bc = p >= 10 ? 0xc0392b : p >= 7 ? 0xe67e22 : 0x27ae60;
      const bbg = this.add.graphics();
      bbg.fillStyle(bc, 0.9);
      bbg.fillCircle(x + CW / 2 - 10, cardY - CH / 2 + 10, 11);
      this.ui.add(bbg);
      this.uiText(x + CW / 2 - 10, cardY - CH / 2 + 10, String(p), 11, '#fff', 700);
    });
  }

  // ── Action buttons ───────────────────────────────────────────────────────
  private drawActionBtns(state: KhangGameState, me: KhangPlayerState) {
    const y = H - 26;
    const flowRank = state.lastDiscard?.rank;
    const flowCards = me.hand.filter(c => c.rank === flowRank);

    if (state.waitingDiscard) {
      // Phase: ต้องทิ้ง
      this.uiText(W / 2, y - 14, '← เลือกไพ่ที่จะทิ้ง แล้วกดปุ่ม', 13, '#ce93d8');
      if (this.selectedId) {
        this.ui.add(this.btn('🗑 ทิ้งไพ่นี้', W / 2, y, 0xc62828, 0x8e0000, () => {
          getSocket().emit('kh:discard', { roomId: this.roomId, cardId: this.selectedId });
          this.selectedId = null;
        }, 180, 42));
      }
    } else {
      // Phase: รอ action
      // แคง
      this.ui.add(this.btn('👑 แคง', W / 2 - 260, y, 0x6a1b9a, 0x4a148c, () => {
        getSocket().emit('kh:khang', { roomId: this.roomId });
      }, 150, 42));

      // จั่ว
      this.ui.add(this.btn('🃏 จั่วไพ่', W / 2, y, 0x1565c0, 0x0d47a1, () => {
        getSocket().emit('kh:draw', { roomId: this.roomId });
        this.selectedId = null;
      }, 150, 42));

      // ไหล (ถ้ามีไพ่ไหลได้)
      if (flowCards.length > 0 && flowRank !== undefined) {
        const label = flowCards.length > 1
          ? `⚡ ไหล ${flowCards.length} ใบ (${rl(flowRank)})`
          : `⚡ ไหล (${rl(flowRank)}${SYM[flowCards[0].suit]})`;
        this.ui.add(this.btn(label, W / 2 + 260, y, 0xe65100, 0xbf360c, () => {
          getSocket().emit('kh:flow', { roomId: this.roomId, cardId: flowCards[0].id });
        }, 190, 42));
      }
    }
  }

  // ── Flow badge ───────────────────────────────────────────────────────────
  private drawFlowBadge(state: KhangGameState) {
    const last = state.flowChain.at(-1);
    if (!last) return;
    const name = state.players.find(p => p.playerId === last.playerId)?.name ?? '?';
    const x = W / 2, y = 62;
    const bg = this.add.graphics();
    bg.fillStyle(0xe65100, 0.18);
    bg.fillRoundedRect(x - 170, y - 15, 340, 30, 15);
    bg.lineStyle(1, 0xff9800, 0.5);
    bg.strokeRoundedRect(x - 170, y - 15, 340, 30, 15);
    this.ui.add(bg);
    this.uiText(x, y, `⚡ ${name} ไหล ${last.cardIds.length} ใบ!`, 13, '#ff9800', 700);
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
    const tc = isRed ? '#c0392b' : '#1a1a2e';

    // shadow
    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.28);
    sh.fillRoundedRect(-CW / 2 + 3, -CH / 2 + 4, CW, CH, CR);
    c.add(sh);

    // white base
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 1);
    bg.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, CR);
    bg.lineStyle(1.5, 0xdddddd, 1);
    bg.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, CR);
    c.add(bg);

    // subtle top tint
    const tint = this.add.graphics();
    tint.fillStyle(isRed ? 0xfff5f5 : 0xf5f5ff, 0.6);
    tint.fillRoundedRect(-CW / 2 + 2, -CH / 2 + 2, CW - 4, CH / 3, CR - 1);
    c.add(tint);

    // top-left corner
    const rTL = this.add.text(-CW / 2 + 5, -CH / 2 + 3, rl(card.rank),
      { fontSize: '14px', color: tc, fontStyle: 'bold', resolution: 2 });
    c.add(rTL);
    const sTL = this.add.text(-CW / 2 + 5, -CH / 2 + 18, SYM[card.suit] ?? '',
      { fontSize: '12px', color: tc, resolution: 2 });
    c.add(sTL);

    // center suit
    const center = this.add.text(0, 3, SYM[card.suit] ?? '',
      { fontSize: '32px', color: tc, resolution: 2 }).setOrigin(0.5);
    c.add(center);

    // bottom-right corner (rotated 180°)
    const rBR = this.add.text(CW / 2 - 5, CH / 2 - 3, rl(card.rank),
      { fontSize: '14px', color: tc, fontStyle: 'bold', resolution: 2 })
      .setOrigin(1, 1).setRotation(Math.PI);
    c.add(rBR);

    return c;
  }

  private drawCardBack(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.28);
    sh.fillRoundedRect(-CW / 2 + 3, -CH / 2 + 4, CW, CH, CR);
    c.add(sh);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a237e, 1);
    bg.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, CR);
    bg.lineStyle(2, 0x5c6bc0, 0.9);
    bg.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, CR);
    c.add(bg);

    // diamond pattern
    const pat = this.add.graphics();
    pat.lineStyle(1, 0x5c6bc0, 0.4);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        const px = -CW / 2 + 10 + col * 22;
        const py = -CH / 2 + 14 + row * 20;
        pat.strokeRect(px, py, 10, 10);
      }
    }
    c.add(pat);

    // inner border
    const ib = this.add.graphics();
    ib.lineStyle(1.5, 0x5c6bc0, 0.6);
    ib.strokeRoundedRect(-CW / 2 + 5, -CH / 2 + 5, CW - 10, CH - 10, CR - 2);
    c.add(ib);

    this.ui.add(c);
    return c;
  }

  // ── Button factory ───────────────────────────────────────────────────────
  private btn(
    label: string, x: number, y: number,
    col: number, hov: number,
    cb: () => void, w = 160, h = 40
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
      fontSize: '15px', color: '#fff', fontStyle: 'bold',
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
      c.setY(y - 3);
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
    bg.fillRoundedRect(W / 2 - 220, H / 2 - 120, 440, 52, 18);
    const t = this.add.text(W / 2, H / 2 - 94, msg, {
      fontSize: '17px', color: '#fff', fontStyle: 'bold', resolution: 2,
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
    panel.fillRoundedRect(W / 2 - 250, H / 2 - 150, 500, 300, 24);
    panel.lineStyle(3, win ? 0x9b59b6 : 0xef5350, 1);
    panel.strokeRoundedRect(W / 2 - 250, H / 2 - 150, 500, 300, 24);

    const emoji = this.add.text(W / 2, H / 2 - 105, win ? '👑' : '😔', { fontSize: '60px', resolution: 2 })
      .setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: emoji, alpha: 1, scaleX: { from: 0.4, to: 1 }, scaleY: { from: 0.4, to: 1 }, duration: 500, ease: 'Back.Out' });

    this.add.text(W / 2, H / 2 - 38, win ? '🎉 คุณชนะ!' : '💀 คุณแพ้', {
      fontSize: '34px', color: win ? '#ce93d8' : '#ef5350', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5);

    if (win) {
      const pt = this.add.text(W / 2, H / 2 + 18, `+${pot} บาท`, {
        fontSize: '28px', color: '#ffd700', fontStyle: 'bold', resolution: 2,
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: pt, alpha: 1, y: H / 2 + 12, duration: 600, delay: 350 });

      for (let i = 0; i < 18; i++) {
        this.time.delayedCall(i * 90, () => {
          const px = Phaser.Math.Between(W / 2 - 220, W / 2 + 220);
          const p = this.add.text(px, H / 2 - 120, '💰', { fontSize: '20px' }).setAlpha(0);
          this.tweens.add({ targets: p, alpha: 1, y: H / 2 - 120 - Phaser.Math.Between(60, 140), duration: 700, onComplete: () => p.destroy() });
        });
      }
    }

    this.ui.add(this.btn('🏠 กลับ Lobby', W / 2, H / 2 + 85, 0x37474f, 0x263238, () => {
      window.location.href = '/';
    }, 200, 48));
  }

  destroy() {
    const s = getSocket();
    s.off('kh:state'); s.off('kh:finished'); s.off('kh:wrong_khang');
  }
}
