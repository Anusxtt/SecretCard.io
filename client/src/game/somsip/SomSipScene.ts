import Phaser from 'phaser';
import { getSocket } from '../../hooks/useSocket';

interface Card { id: string; suit: string; rank: number; }

interface PlayerState {
  playerId: string; name: string; hand: Card[];
  discardPile: Card[]; isBot: boolean;
  avatarSeed?: string; avatarFrame?: string;
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

const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
function rankLabel(r: number) { return RANK_LABEL[r] ?? String(r); }

const W = 1920;
const H = 1080;
const CARD_W = 108;
const CARD_H = 152;
const CARD_R = 12;

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['S','H','D','C'];

const FRAME_HEX: Record<string, number> = {
  gold: 0xffd700, silver: 0xbdc3c7, bronze: 0xcd7f32,
  blue: 0x3498db, red: 0xe74c3c, purple: 0x9b59b6, green: 0x27ae60,
  none: 0x445544,
};

function cardKey(suit: string, rank: number): string {
  const r = ({ 1:'A', 11:'J', 12:'Q', 13:'K' } as Record<number,string>)[rank] ?? String(rank);
  return `${r}${suit}`;
}
function dicebearUrl(seed: string) {
  return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed ?? 'Player')}&backgroundColor=transparent`;
}

export class SomSipScene extends Phaser.Scene {
  private roomId!: string;
  private myPlayerId!: string;
  private betAmount!: number;
  private avatarSeed?: string;
  private avatarFrame?: string;
  private gameState: GameState | null = null;
  private selectedCardId: string | null = null;
  private initialized = false;
  private uiLayer!: Phaser.GameObjects.Container;
  private statusBg!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private loadingAvatars: Set<string> = new Set();

  constructor() { super({ key: 'SomSipScene', active: false }); }

  preload() {
    for (const s of SUITS) for (const r of RANKS) {
      const key = `${r}${s}`;
      this.load.image(key, `/cards/${key}.png`);
    }
    this.load.image('card_back', '/cards/back.png');
  }

  init(data: { roomId: string; playerId: string; betAmount: number; avatarSeed?: string; avatarFrame?: string }) {
    this.roomId = data.roomId;
    this.myPlayerId = data.playerId;
    this.betAmount = data.betAmount;
    this.avatarSeed = data.avatarSeed;
    this.avatarFrame = data.avatarFrame;
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

  // ── avatar loader ─────────────────────────────────────────────────────
  private ensureAvatar(seed: string) {
    const key = `av_${seed}`;
    if (this.textures.exists(key) || this.loadingAvatars.has(key)) return;
    this.loadingAvatars.add(key);
    this.load.svg(key, dicebearUrl(seed), { width: 80, height: 80 });
    this.load.once('complete', () => {
      if (this.gameState) this.renderState(this.gameState);
    });
    this.load.start();
  }

  // ── Background ────────────────────────────────────────────────────────
  private drawBackground() {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x04080f, 0x04080f, 0x020509, 0x020509, 1);
    bg.fillRect(0, 0, W, H);

    // felt ovals
    const felt = this.add.graphics();
    felt.fillStyle(0x0b5c2e, 1);
    felt.fillEllipse(W / 2, H / 2, W - 36, H - 36);
    felt.fillStyle(0x0d6b34, 1);
    felt.fillEllipse(W / 2, H / 2, W - 110, H - 110);

    // grid texture
    for (let gx = 0; gx < W; gx += 44) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0f7a3c, 0.08);
      gl.lineBetween(gx, 0, gx, H);
    }
    for (let gy = 0; gy < H; gy += 44) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0f7a3c, 0.08);
      gl.lineBetween(0, gy, W, gy);
    }
    for (let d = -H; d < W + H; d += 90) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0f7a3c, 0.05);
      gl.lineBetween(d, 0, d + H, H);
    }

    // gold rim
    const rim = this.add.graphics();
    rim.lineStyle(12, 0xb8860b, 0.95);
    rim.strokeEllipse(W / 2, H / 2, W - 36, H - 36);
    rim.lineStyle(4, 0xdaa520, 0.55);
    rim.strokeEllipse(W / 2, H / 2, W - 62, H - 62);
    rim.lineStyle(1, 0xffd700, 0.18);
    rim.strokeEllipse(W / 2, H / 2, W - 170, H - 170);

    // center watermark
    const logo = this.add.graphics();
    logo.lineStyle(2, 0xffd700, 0.1);
    logo.strokeCircle(W / 2, H / 2, 130);
    logo.lineStyle(1, 0xffd700, 0.06);
    logo.strokeCircle(W / 2, H / 2, 85);
    this.add.text(W / 2, H / 2 + 8, '10', {
      fontSize: '80px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.05);

    // corner ornaments
    for (const [cx, cy] of [[52, 52], [W - 52, 52], [52, H - 52], [W - 52, H - 52]]) {
      const d = this.add.graphics();
      d.fillStyle(0xb8860b, 0.65);
      d.fillCircle(cx as number, cy as number, 30);
      d.lineStyle(2, 0xffd700, 0.9);
      d.strokeCircle(cx as number, cy as number, 30);
      d.lineStyle(1, 0xffd700, 0.5);
      d.strokeCircle(cx as number, cy as number, 19);
      this.add.text(cx as number, cy as number, '✦', { fontSize: '20px', color: '#ffd700' }).setOrigin(0.5).setAlpha(0.85);
    }

    // top light reflection
    const light = this.add.graphics();
    light.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.04, 0.04, 0, 0);
    light.fillEllipse(W / 2, -60, W * 0.85, H * 0.65);
  }

  // ── Status Bar ────────────────────────────────────────────────────────
  private createStatusBar() {
    this.statusBg = this.add.graphics();
    this.statusText = this.add.text(W / 2, 44, 'กำลังโหลด...', {
      fontSize: '28px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 5, resolution: 2,
    }).setOrigin(0.5).setDepth(10);
    this.updateStatus('กำลังโหลด...', false);
  }

  private updateStatus(text: string, isMyTurn: boolean) {
    const bw = Math.max(620, text.length * 17 + 80);
    this.statusBg.clear();
    if (isMyTurn) {
      this.statusBg.fillStyle(0x22aa44, 0.15);
      this.statusBg.fillRoundedRect(W / 2 - bw / 2 - 12, 6, bw + 24, 76, 38);
    }
    this.statusBg.fillStyle(isMyTurn ? 0x041808 : 0x04080f, 0.85);
    this.statusBg.fillRoundedRect(W / 2 - bw / 2, 10, bw, 68, 34);
    this.statusBg.lineStyle(2, isMyTurn ? 0x27ae60 : 0x224422, 0.9);
    this.statusBg.strokeRoundedRect(W / 2 - bw / 2, 10, bw, 68, 34);
    this.statusText.setText(text).setColor(isMyTurn ? '#44ff88' : '#ffd700');
  }

  // ── Sockets ───────────────────────────────────────────────────────────
  private setupSocketListeners() {
    const socket = getSocket();
    socket.off('ss:state');
    socket.off('ss:finished');

    socket.on('ss:state', (state: GameState) => {
      this.gameState = state;
      state.players.forEach(p => this.ensureAvatar(p.avatarSeed || p.name));
      this.ensureAvatar(this.avatarSeed || 'Player');
      this.renderState(state);
    });

    socket.on('ss:finished', (data: { winnerId: string; pot: number; players: PlayerState[] }) => {
      if (this.gameState) this.gameState.phase = 'finished';
      this.showResult(data.winnerId === this.myPlayerId, data.pot);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────
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

    this.drawCenterDisplay(state);
    this.drawOpponents(state, isMyTurn);
    this.drawMyArea(me, state, isMyTurn);
    if (isMyTurn) this.drawActionButtons(state, me);
    if (state.lastDrawnCard && !isMyTurn) {
      const canI = this.checkIntercept(me.hand, state.lastDrawnCard, state.jokerValue);
      if (canI) this.drawInterceptButton(state.lastDrawnCard);
    }
    this.highlightPairs(me.hand, state.jokerValue);
  }

  // ── Joker + Pot center ────────────────────────────────────────────────
  private drawCenterDisplay(state: GameState) {
    const cx = W / 2, cy = 130;

    const jbg = this.add.graphics();
    jbg.fillStyle(0x000000, 0.72);
    jbg.fillRoundedRect(cx - 185, cy - 60, 370, 115, 24);
    jbg.lineStyle(2, 0xffd700, 0.5);
    jbg.strokeRoundedRect(cx - 185, cy - 60, 370, 115, 24);
    this.uiLayer.add(jbg);

    this.uiTxt(cx - 104, cy - 32, 'โจ๊กเกอร์', 15, '#c8a44a', 600);
    this.uiLayer.add(this.makeCard(state.jokerCard, cx - 104, cy + 16, true, false));

    const eq = this.add.text(cx - 30, cx - 104 + 24, '=', { fontSize: '28px', color: '#fff', resolution: 2 }).setOrigin(0.5);
    this.uiLayer.add(eq);

    const val = this.add.text(cx + 56, cy + 8, rankLabel(state.jokerValue), {
      fontSize: '48px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5);
    this.uiLayer.add(val);

    // pot badge
    const potBg = this.add.graphics();
    potBg.fillStyle(0x0a0a00, 0.8);
    potBg.fillRoundedRect(cx - 132, cy + 64, 264, 48, 24);
    potBg.lineStyle(2, 0xffd700, 0.5);
    potBg.strokeRoundedRect(cx - 132, cy + 64, 264, 48, 24);
    this.uiLayer.add(potBg);
    this.uiTxt(cx, cy + 88, `💰  ${this.betAmount * (state.players.length)} บาท`, 22, '#ffd700', 700);
  }

  // ── Opponents ─────────────────────────────────────────────────────────
  private drawOpponents(state: GameState, isMyTurn: boolean) {
    const opponents = state.players.filter((p) => p.playerId !== this.myPlayerId);
    const positions = this.getOpponentPositions(opponents.length);
    opponents.forEach((p, i) => {
      const isCurrent = state.players[state.currentPlayerIndex]?.playerId === p.playerId;
      this.drawPlayerSlot(p, positions[i].x, positions[i].y, isCurrent, false, state, isMyTurn);
    });
  }

  private drawPlayerSlot(
    p: PlayerState, x: number, y: number,
    isCur: boolean, isMe: boolean,
    state: GameState, isMyTurn: boolean
  ) {
    if (isCur) {
      const sg = this.add.graphics();
      sg.fillStyle(0x27ae60, 0.1);
      sg.fillEllipse(x, y, 280, 200);
      this.uiLayer.add(sg);
    }

    const avR = isMe ? 46 : 38;
    const avY = isMe ? y : y + 10;

    const frameKey = p.avatarFrame ?? (isMe ? this.avatarFrame : undefined) ?? 'none';
    const frameHex = FRAME_HEX[frameKey] ?? FRAME_HEX.none;
    if (frameKey !== 'none') {
      const glow = this.add.graphics();
      glow.lineStyle(10, frameHex, 0.2);
      glow.strokeCircle(x, avY, avR + 10);
      this.uiLayer.add(glow);
    }
    const ring = this.add.graphics();
    ring.lineStyle(isCur ? 5 : 4, frameHex, isCur ? 1 : 0.7);
    ring.strokeCircle(x, avY, avR + 3);
    this.uiLayer.add(ring);

    const avBg = this.add.graphics();
    avBg.fillStyle(0x061a0a, 1);
    avBg.fillCircle(x, avY, avR);
    this.uiLayer.add(avBg);

    const seed = p.avatarSeed ?? (isMe ? this.avatarSeed : undefined) ?? p.name;
    const avKey = `av_${seed}`;
    if (this.textures.exists(avKey)) {
      const avImg = this.add.image(x, avY, avKey);
      avImg.setDisplaySize(avR * 1.75, avR * 1.75);
      this.uiLayer.add(avImg);
    } else {
      this.uiTxt(x, avY, p.isBot ? '🤖' : '👤', avR * 0.9, '#fff');
      this.ensureAvatar(seed);
    }

    if (isCur) {
      const pulse = this.add.graphics();
      pulse.lineStyle(3, 0x27ae60, 0.9);
      pulse.strokeCircle(x, avY, avR + 14);
      this.uiLayer.add(pulse);
      this.tweens.add({
        targets: pulse,
        alpha: { from: 0.9, to: 0 },
        scaleX: { from: 1, to: 1.4 }, scaleY: { from: 1, to: 1.4 },
        duration: 1000, repeat: -1,
      });
    }

    const nameY = avY + avR + 24;
    const nbg = this.add.graphics();
    nbg.fillStyle(isCur ? 0x0a2e12 : 0x061a0a, 0.92);
    nbg.fillRoundedRect(x - 108, nameY - 18, 216, 36, 18);
    nbg.lineStyle(isCur ? 2 : 1, isCur ? 0x27ae60 : 0x1a3a20, isCur ? 1 : 0.6);
    nbg.strokeRoundedRect(x - 108, nameY - 18, 216, 36, 18);
    this.uiLayer.add(nbg);
    this.uiTxt(x, nameY, `${p.isBot ? '🤖 ' : ''}${p.name}`, isMe ? 20 : 18, isCur ? '#44ff88' : '#dde8dd', 700);

    if (!isMe) {
      const fanY = avY - avR - 18;
      p.hand.forEach((card, j) => {
        const angle = (j - (p.hand.length - 1) / 2) * 8;
        const cx2 = x + (j - (p.hand.length - 1) / 2) * 16;
        const c = this.makeCard(card, cx2, fanY - 50, false, false);
        c.setRotation(Phaser.Math.DegToRad(angle));
        this.uiLayer.add(c);
      });
      const ccbg = this.add.graphics();
      ccbg.fillStyle(0x000000, 0.75);
      ccbg.fillRoundedRect(x - 30, fanY - 12, 60, 26, 13);
      this.uiLayer.add(ccbg);
      this.uiTxt(x, fanY + 1, `${p.hand.length} ใบ`, 16, '#c8a44a', 600);

      const top = p.discardPile.at(-1);
      if (top) {
        const pIdx = state.players.findIndex((pl) => pl.playerId === p.playerId);
        const discardY = avY + avR + 78;
        const dc = this.makeCard(top, x, discardY, true, isMyTurn);
        if (isMyTurn) {
          dc.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
          dc.on('pointerdown', () => getSocket().emit('ss:pick_discard', { roomId: this.roomId, fromPlayerIndex: pIdx }));
          dc.on('pointerover', () => dc.setScale(1.1));
          dc.on('pointerout', () => dc.setScale(1));
        }
        this.uiLayer.add(dc);
        const dlb = this.add.graphics();
        dlb.fillStyle(0x000000, 0.65);
        dlb.fillRoundedRect(x - 52, discardY + CARD_H / 2 + 8, 104, 26, 13);
        this.uiLayer.add(dlb);
        this.uiTxt(x, discardY + CARD_H / 2 + 21, `กองทิ้ง ×${p.discardPile.length}`, 15, '#c8a44a');
      }
    }
  }

  private getOpponentPositions(count: number): { x: number; y: number }[] {
    if (count === 1) return [{ x: W / 2, y: 360 }];
    if (count === 2) return [{ x: W / 2 - 320, y: 340 }, { x: W / 2 + 320, y: 340 }];
    if (count === 3) return [{ x: W / 2, y: 295 }, { x: W / 2 - 410, y: 410 }, { x: W / 2 + 410, y: 410 }];
    return [{ x: W / 2 - 200, y: 300 }, { x: W / 2 + 200, y: 300 }, { x: W / 2 - 440, y: 435 }, { x: W / 2 + 440, y: 435 }];
  }

  // ── My area ───────────────────────────────────────────────────────────
  private drawMyArea(me: PlayerState, state: GameState, isMyTurn: boolean) {
    const myX = 168, myY = H - 195;
    const meWithAv: PlayerState = {
      ...me,
      avatarSeed: me.avatarSeed ?? this.avatarSeed,
      avatarFrame: me.avatarFrame ?? this.avatarFrame,
    };
    this.drawPlayerSlot(meWithAv, myX, myY, isMyTurn, true, state, isMyTurn);

    const lb = this.add.graphics();
    lb.fillStyle(0x000000, 0.65);
    lb.fillRoundedRect(W / 2 - 250, H - 310, 500, 34, 17);
    this.uiLayer.add(lb);
    this.uiTxt(W / 2, H - 293, `มือของคุณ  (${me.hand.length} ใบ)`, 18, '#c8a44a', 600);

    if (me.discardPile.length > 0) {
      const dtop = me.discardPile.at(-1)!;
      const dX = W - 155, dY = H - 200;
      const dlb2 = this.add.graphics();
      dlb2.fillStyle(0x000000, 0.65);
      dlb2.fillRoundedRect(dX - 66, dY - CARD_H / 2 - 34, 132, 28, 14);
      this.uiLayer.add(dlb2);
      this.uiTxt(dX, dY - CARD_H / 2 - 20, 'กองทิ้งของฉัน', 15, '#c8a44a');
      this.uiLayer.add(this.makeCard(dtop, dX, dY, true, false));
      if (me.discardPile.length > 1) {
        const ct = this.add.graphics();
        ct.fillStyle(0x000000, 0.7);
        ct.fillRoundedRect(dX - 28, dY + CARD_H / 2 + 8, 56, 26, 13);
        this.uiLayer.add(ct);
        this.uiTxt(dX, dY + CARD_H / 2 + 21, `×${me.discardPile.length}`, 16, '#ddd');
      }
    }

    const handY = H - 170;
    const gap = Math.min(130, (W - 460) / Math.max(me.hand.length, 1));
    const startX = W / 2 - ((me.hand.length - 1) * gap) / 2;

    me.hand.forEach((card, i) => {
      const x = startX + i * gap;
      const isSelected = this.selectedCardId === card.id;
      const cardY = isSelected ? handY - 44 : handY;

      if (isSelected) {
        const glow = this.add.graphics();
        glow.lineStyle(4, 0x27ae60, 1);
        glow.strokeRoundedRect(x - CARD_W / 2 - 8, cardY - CARD_H / 2 - 8, CARD_W + 16, CARD_H + 16, CARD_R + 3);
        glow.fillStyle(0x27ae60, 0.08);
        glow.fillRoundedRect(x - CARD_W / 2 - 8, cardY - CARD_H / 2 - 8, CARD_W + 16, CARD_H + 16, CARD_R + 3);
        this.uiLayer.add(glow);
      }

      const cardObj = this.makeCard(card, x, cardY, true, isMyTurn);
      cardObj.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      cardObj.on('pointerdown', () => {
        if (card.id === 'hidden') return;
        this.selectedCardId = this.selectedCardId === card.id ? null : card.id;
        if (this.gameState) this.renderState(this.gameState);
      });
      cardObj.on('pointerover', () => { if (!isSelected) cardObj.setY(cardY - 15); });
      cardObj.on('pointerout', () => { if (!isSelected) cardObj.setY(cardY); });
      this.uiLayer.add(cardObj);
    });
  }

  // ── Action buttons ────────────────────────────────────────────────────
  private drawActionButtons(state: GameState, me: PlayerState) {
    const btnY = H - 44;
    const canDraw = me.hand.length <= 5;
    const canDiscard = !!this.selectedCardId;

    if (canDraw) {
      this.uiLayer.add(this.makeButton('🃏 จั่วไพ่', W / 2 - 148, btnY, 0x0d47a1, 0x082060, () => {
        getSocket().emit('ss:draw', { roomId: this.roomId });
      }, 266, 64));
    }

    if (canDiscard) {
      this.uiLayer.add(this.makeButton('🗑 ทิ้งไพ่', W / 2 + 148, btnY, 0xb71c1c, 0x7f0000, () => {
        getSocket().emit('ss:discard', { roomId: this.roomId, cardId: this.selectedCardId });
        this.selectedCardId = null;
      }, 266, 64));
    } else {
      this.uiTxt(W / 2 + 148, btnY, 'เลือกไพ่ที่จะทิ้ง', 18, '#7c7c9c');
    }
  }

  // ── Intercept ─────────────────────────────────────────────────────────
  private drawInterceptButton(card: Card) {
    const pulse = this.add.graphics();
    pulse.fillStyle(0xff1744, 0.18);
    pulse.fillCircle(W / 2, H / 2 - 40, 96);
    this.uiLayer.add(pulse);
    this.tweens.add({ targets: pulse, alpha: { from: 0.18, to: 0 }, scaleX: 2, scaleY: 2, duration: 900, repeat: -1 });

    this.uiLayer.add(this.makeButton(
      `⚡ ขัดเทิร์น! (${rankLabel(card.rank)} ${card.suit})`,
      W / 2, H / 2 - 40, 0xff1744, 0xb71c1c, () => {
        getSocket().emit('ss:intercept', { roomId: this.roomId, card });
      }, 350, 68
    ));
  }

  // ── Pair highlight ────────────────────────────────────────────────────
  private highlightPairs(hand: Card[], jokerValue: number) {
    const paired = new Set<string>();
    const used = new Set<string>();
    for (let i = 0; i < hand.length; i++) {
      if (used.has(hand[i].id)) continue;
      for (let j = i + 1; j < hand.length; j++) {
        if (used.has(hand[j].id)) continue;
        if (this.isValidPair(hand[i], hand[j], jokerValue)) {
          paired.add(hand[i].id); paired.add(hand[j].id);
          used.add(hand[i].id); used.add(hand[j].id);
          break;
        }
      }
    }
    if (paired.size === 0) return;

    const handY = H - 170;
    const gap = Math.min(130, (W - 460) / Math.max(hand.length, 1));
    const startX = W / 2 - ((hand.length - 1) * gap) / 2;
    const g = this.add.graphics();

    hand.forEach((card, i) => {
      if (!paired.has(card.id)) return;
      const x = startX + i * gap;
      const cy = this.selectedCardId === card.id ? handY - 44 : handY;
      g.lineStyle(3, 0xffd700, 0.65);
      g.strokeRoundedRect(x - CARD_W / 2 - 4, cy - CARD_H / 2 - 4, CARD_W + 8, CARD_H + 8, CARD_R + 2);
    });
    this.uiLayer.add(g);
  }

  // ── Card factory ──────────────────────────────────────────────────────
  private makeCard(card: Card, x: number, y: number, faceUp: boolean, _interactive: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.55);
    shadow.fillRoundedRect(-CARD_W / 2 + 5, -CARD_H / 2 + 7, CARD_W, CARD_H, CARD_R);
    c.add(shadow);
    const key = (!faceUp || card.id === 'hidden') ? 'card_back' : cardKey(card.suit, card.rank);
    const img = this.add.image(0, 0, key);
    img.setDisplaySize(CARD_W, CARD_H);
    c.add(img);
    return c;
  }

  // ── Button factory ────────────────────────────────────────────────────
  private makeButton(label: string, x: number, y: number, col: number, hov: number, cb: () => void, w = 266, h = 64): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    const outerGlow = this.add.graphics();
    outerGlow.fillStyle(col, 0.18);
    outerGlow.fillRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, h / 2 + 5);
    c.add(outerGlow);

    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.55);
    sh.fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, h / 2);
    c.add(sh);

    const bg = this.add.graphics();
    bg.fillStyle(col, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);

    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.2);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.38, h / 2 - 2);
    c.add(shine);

    const border = this.add.graphics();
    border.lineStyle(1, 0xffffff, 0.2);
    border.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(border);

    const t = this.add.text(0, 0, label, {
      fontSize: '23px', color: '#fff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3, resolution: 2,
    }).setOrigin(0.5);
    c.add(t);

    c.setSize(w, h).setInteractive();
    c.on('pointerdown', () => {
      c.setScale(0.94);
      bg.clear(); bg.fillStyle(hov, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      this.time.delayedCall(110, () => { c.setScale(1); cb(); });
    });
    c.on('pointerover', () => {
      bg.clear(); bg.fillStyle(hov, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      outerGlow.setAlpha(0.45); c.setY(y - 5);
    });
    c.on('pointerout', () => {
      bg.clear(); bg.fillStyle(col, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      outerGlow.setAlpha(1); c.setY(y);
    });
    return c;
  }

  // ── uiTxt helper ──────────────────────────────────────────────────────
  private uiTxt(x: number, y: number, text: string, size: number, color: string, weight = 400) {
    const t = this.add.text(x, y, text, {
      fontSize: `${size}px`, color,
      fontStyle: weight >= 700 ? 'bold' : 'normal',
      resolution: 2,
    }).setOrigin(0.5);
    this.uiLayer.add(t);
    return t;
  }

  // ── Result overlay ────────────────────────────────────────────────────
  private showResult(isWinner: boolean, pot: number) {
    // stop re-render จาก ss:state ที่อาจตามมา
    this.gameState = null;

    // เคลียร์ uiLayer ก่อนวาด overlay
    this.uiLayer.removeAll(true);

    const overlay = this.add.graphics().setDepth(20);
    overlay.fillStyle(0x000000, 0.83);
    overlay.fillRect(0, 0, W, H);

    const pw = 820, ph = 520;
    const panel = this.add.graphics().setDepth(21);
    panel.fillGradientStyle(
      isWinner ? 0x0a2e12 : 0x3a0000, isWinner ? 0x0a2e12 : 0x3a0000,
      isWinner ? 0x041808 : 0x1e0000, isWinner ? 0x041808 : 0x1e0000, 1
    );
    panel.fillRoundedRect(W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, 42);
    panel.lineStyle(3, isWinner ? 0x27ae60 : 0xef5350, 1);
    panel.strokeRoundedRect(W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, 42);
    panel.lineStyle(1, isWinner ? 0x44ff88 : 0xff8888, 0.3);
    panel.strokeRoundedRect(W / 2 - pw / 2 + 8, H / 2 - ph / 2 + 8, pw - 16, ph - 16, 36);

    const emoji = this.add.text(W / 2, H / 2 - 175, isWinner ? '🏆' : '😔', { fontSize: '96px', resolution: 2 })
      .setOrigin(0.5).setAlpha(0).setDepth(22);
    this.tweens.add({ targets: emoji, alpha: 1, scaleX: { from: 0.3, to: 1 }, scaleY: { from: 0.3, to: 1 }, duration: 600, ease: 'Back.Out' });

    this.add.text(W / 2, H / 2 - 62, isWinner ? '🎉 คุณชนะ!' : '💀 คุณแพ้', {
      fontSize: '58px', color: isWinner ? '#44ff88' : '#ef5350', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 5, resolution: 2,
    }).setOrigin(0.5).setDepth(22);

    if (isWinner) {
      const pt = this.add.text(W / 2, H / 2 + 28, `+${pot} บาท`, {
        fontSize: '46px', color: '#ffd700', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 4, resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(22);
      this.tweens.add({ targets: pt, alpha: 1, y: H / 2 + 20, duration: 700, delay: 400, ease: 'Back.Out' });

      for (let i = 0; i < 26; i++) {
        this.time.delayedCall(i * 75, () => {
          const px = Phaser.Math.Between(W / 2 - 380, W / 2 + 380);
          const pe = this.add.text(px, H / 2 - 210, ['⭐','✨','🌟','🎊'][i % 4], { fontSize: '34px' })
            .setAlpha(0).setDepth(23);
          this.tweens.add({ targets: pe, alpha: 1, y: H / 2 - 210 - Phaser.Math.Between(80, 240), duration: 900, onComplete: () => pe.destroy() });
        });
      }
    }

    // ปุ่มเพิ่มเข้า scene โดยตรง ไม่ผ่าน uiLayer เพื่อไม่โดน removeAll
    const btn = this.makeButton('🏠 กลับ Lobby', W / 2, H / 2 + 148, 0x37474f, 0x263238, () => {
      window.location.href = '/';
    }, 340, 72);
    btn.setDepth(24);
    this.add.existing(btn);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
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
