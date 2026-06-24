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
const CARD_W = 112;
const CARD_H = 158;
const CARD_R = 14;

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['S','H','D','C'];

const FRAME_HEX: Record<string, number> = {
  gold: 0xffd700, silver: 0xbdc3c7, bronze: 0xcd7f32,
  blue: 0x3498db, red: 0xe74c3c, purple: 0x9b59b6, green: 0x27ae60,
  none: 0x556677,
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
  private particleLayer!: Phaser.GameObjects.Container;
  private statusBg!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private loadingAvatars: Set<string> = new Set();

  constructor() { super({ key: 'SomSipScene', active: false }); }

  preload() {
    for (const s of SUITS) for (const r of RANKS) {
      this.load.image(`${r}${s}`, `/cards/${r}${s}.png`);
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
    this.particleLayer = this.add.container(0, 0).setDepth(4);
    this.uiLayer = this.add.container(0, 0).setDepth(5);
    this.createStatusBar();
    this.startAmbientParticles();
    this.setupSocketListeners();
    getSocket().emit('ss:start', { roomId: this.roomId, playerId: this.myPlayerId });
  }

  // ── Ambient particles ─────────────────────────────────────────────────────
  private startAmbientParticles() {
    for (let i = 0; i < 24; i++) {
      this.time.delayedCall(i * 250, () => this.spawnDust());
    }
    this.time.addEvent({ delay: 1900, callback: this.spawnDust, callbackScope: this, loop: true });
  }

  private spawnDust() {
    const g = this.add.graphics();
    const r = Phaser.Math.Between(2, 5);
    const colors = [0xffd700, 0xdaa520, 0x27ae60, 0x44cc88, 0xffffff];
    g.fillStyle(colors[Phaser.Math.Between(0, colors.length - 1)], Phaser.Math.FloatBetween(0.08, 0.3));
    g.fillCircle(0, 0, r);
    g.x = Phaser.Math.Between(80, W - 80);
    g.y = Phaser.Math.Between(H * 0.15, H * 0.85);
    this.particleLayer.add(g);
    this.tweens.add({
      targets: g,
      y: g.y - Phaser.Math.Between(60, 200),
      x: g.x + Phaser.Math.Between(-50, 50),
      alpha: { from: Phaser.Math.FloatBetween(0.1, 0.28), to: 0 },
      duration: Phaser.Math.Between(3200, 6500),
      ease: 'Sine.Out',
      onComplete: () => g.destroy(),
    });
  }

  // ── Avatar loader ─────────────────────────────────────────────────────────
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

  // ── Background ────────────────────────────────────────────────────────────
  private drawBackground() {
    // Deep base
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x030d06, 0x030d06, 0x010804, 0x010804, 1);
    bg.fillRect(0, 0, W, H);

    // ── TABLE ──
    // Deep shadow under table
    const tableShadow = this.add.graphics();
    tableShadow.fillStyle(0x000000, 0.7);
    tableShadow.fillEllipse(W / 2 + 20, H / 2 + 24, W - 18, H - 22);

    // Outer mahogany wood rim
    const woodRim = this.add.graphics();
    woodRim.fillGradientStyle(0x2a0e00, 0x4a1e00, 0x1e0800, 0x2a0e00, 1);
    woodRim.fillEllipse(W / 2, H / 2, W - 28, H - 26);

    // Gold inlay on rim
    const goldRim1 = this.add.graphics();
    goldRim1.lineStyle(5, 0xffd700, 1);
    goldRim1.strokeEllipse(W / 2, H / 2, W - 52, H - 50);
    const goldRim2 = this.add.graphics();
    goldRim2.lineStyle(2, 0xdaa520, 0.6);
    goldRim2.strokeEllipse(W / 2, H / 2, W - 64, H - 62);
    const goldRim3 = this.add.graphics();
    goldRim3.lineStyle(1, 0xffd700, 0.2);
    goldRim3.strokeEllipse(W / 2, H / 2, W - 78, H - 76);

    // Felt — green casino
    const felt1 = this.add.graphics();
    felt1.fillStyle(0x093d1c, 1);
    felt1.fillEllipse(W / 2, H / 2, W - 86, H - 84);
    const felt2 = this.add.graphics();
    felt2.fillStyle(0x0b4a22, 1);
    felt2.fillEllipse(W / 2, H / 2, W - 106, H - 104);
    const felt3 = this.add.graphics();
    felt3.fillStyle(0x0c5228, 1);
    felt3.fillEllipse(W / 2, H / 2, W - 136, H - 134);

    // Fabric texture
    for (let gx = 0; gx < W; gx += 28) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0e6230, 0.11);
      gl.lineBetween(gx, 0, gx, H);
    }
    for (let gy = 0; gy < H; gy += 28) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0e6230, 0.11);
      gl.lineBetween(0, gy, W, gy);
    }
    for (let d = -H; d < W + H; d += 56) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0e6230, 0.06);
      gl.lineBetween(d, 0, d + H, H);
    }
    for (let d = W + H; d > -H; d -= 56) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0e6230, 0.05);
      gl.lineBetween(d, 0, d - H, H);
    }

    // Inner accent ring
    const innerRing = this.add.graphics();
    innerRing.lineStyle(3, 0x1a8844, 0.28);
    innerRing.strokeEllipse(W / 2, H / 2, W - 196, H - 194);
    const innerRing2 = this.add.graphics();
    innerRing2.lineStyle(1, 0xffd700, 0.07);
    innerRing2.strokeEllipse(W / 2, H / 2, W - 216, H - 214);

    // Overhead lamp reflection
    const topLight = this.add.graphics();
    topLight.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.06, 0.06, 0, 0);
    topLight.fillEllipse(W / 2, H * 0.18, W * 0.68, H * 0.48);

    // Side color glow
    const glowL = this.add.graphics();
    glowL.fillStyle(0x003300, 0.07);
    glowL.fillRect(0, 0, W * 0.28, H);
    const glowR = this.add.graphics();
    glowR.fillStyle(0x001100, 0.06);
    glowR.fillRect(W * 0.72, 0, W * 0.28, H);

    // Center watermark
    this.add.text(W / 2, H / 2 - 24, '10', {
      fontSize: '160px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.035);
    this.add.text(W / 2, H / 2 + 56, 'สมสิบ', {
      fontSize: '50px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.035);

    // Corner ornaments
    for (const [cx, cy] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]]) {
      const d = this.add.graphics();
      d.fillGradientStyle(0x4a1e00, 0x6a2e00, 0x2a0e00, 0x4a1e00, 1);
      d.fillCircle(cx as number, cy as number, 34);
      d.lineStyle(3, 0xdaa520, 1);
      d.strokeCircle(cx as number, cy as number, 34);
      d.lineStyle(1.5, 0xffd700, 0.6);
      d.strokeCircle(cx as number, cy as number, 24);
      d.lineStyle(1, 0xffd700, 0.3);
      d.strokeCircle(cx as number, cy as number, 14);
      this.add.text(cx as number, cy as number + 1, '✦', {
        fontSize: '22px', color: '#ffd700',
      }).setOrigin(0.5).setAlpha(0.88);
    }

    // Pulsing center glow
    const cGlow = this.add.graphics();
    cGlow.fillStyle(0x27ae60, 0.03);
    cGlow.fillEllipse(W / 2, H / 2, 650, 420);
    this.tweens.add({
      targets: cGlow,
      alpha: { from: 0.3, to: 0.85 },
      scaleX: { from: 0.96, to: 1.04 }, scaleY: { from: 0.96, to: 1.04 },
      duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  private createStatusBar() {
    this.statusBg = this.add.graphics();
    this.statusText = this.add.text(W / 2, 44, 'กำลังโหลด...', {
      fontSize: '26px', color: '#ffd700', fontStyle: 'bold',
      fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
      stroke: '#000', strokeThickness: 6, resolution: 2,
    }).setOrigin(0.5).setDepth(10);
    this.updateStatus('กำลังโหลด...', false);
  }

  private updateStatus(text: string, isMyTurn: boolean) {
    const bw = Math.max(680, text.length * 16 + 100);
    this.statusBg.clear();
    if (isMyTurn) {
      this.statusBg.fillStyle(0x22aa44, 0.1);
      this.statusBg.fillRoundedRect(W / 2 - bw / 2 - 18, 2, bw + 36, 88, 44);
    }
    this.statusBg.fillGradientStyle(
      isMyTurn ? 0x041808 : 0x060e08,
      isMyTurn ? 0x041808 : 0x060e08,
      isMyTurn ? 0x020c04 : 0x030804,
      isMyTurn ? 0x020c04 : 0x030804, 0.95
    );
    this.statusBg.fillRoundedRect(W / 2 - bw / 2, 8, bw, 72, 36);
    // Top shine
    this.statusBg.fillStyle(0xffffff, 0.05);
    this.statusBg.fillRoundedRect(W / 2 - bw / 2 + 4, 8, bw - 8, 22, 11);
    // Border
    this.statusBg.lineStyle(2, isMyTurn ? 0x27ae60 : 0x1a3a20, isMyTurn ? 1 : 0.75);
    this.statusBg.strokeRoundedRect(W / 2 - bw / 2, 8, bw, 72, 36);
    this.statusBg.lineStyle(1, isMyTurn ? 0x44cc88 : 0xffd700, 0.12);
    this.statusBg.strokeRoundedRect(W / 2 - bw / 2 + 6, 14, bw - 12, 60, 30);
    this.statusText.setText(text).setColor(isMyTurn ? '#44ff88' : '#ffd700');
  }

  // ── Sockets ───────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  private renderState(state: GameState) {
    this.uiLayer.removeAll(true);
    const me = state.players.find(p => p.playerId === this.myPlayerId);
    if (!me) return;
    const isMyTurn = state.players[state.currentPlayerIndex]?.playerId === this.myPlayerId;
    const currentName = state.players[state.currentPlayerIndex]?.name ?? '';
    this.updateStatus(
      isMyTurn ? '🎯  ถึงเทิร์นของคุณ — เลือกการกระทำ' : `⏳  รอ ${currentName}...`,
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

  // ── Joker + Pot center ────────────────────────────────────────────────────
  private drawCenterDisplay(state: GameState) {
    const cx = W / 2, cy = 136;

    // Joker panel — glass morphism
    const jbg = this.add.graphics();
    jbg.fillGradientStyle(0x060e08, 0x060e08, 0x030804, 0x030804, 0.92);
    jbg.fillRoundedRect(cx - 200, cy - 65, 400, 125, 26);
    jbg.lineStyle(2, 0xdaa520, 0.7);
    jbg.strokeRoundedRect(cx - 200, cy - 65, 400, 125, 26);
    jbg.lineStyle(1, 0xffd700, 0.2);
    jbg.strokeRoundedRect(cx - 194, cy - 59, 388, 113, 22);
    // Shine
    jbg.fillStyle(0xffffff, 0.05);
    jbg.fillRoundedRect(cx - 196, cy - 63, 392, 28, 14);
    this.uiLayer.add(jbg);

    this.uiTxt(cx - 110, cy - 35, 'โจ๊กเกอร์', 14, '#c8a44a', 600);
    this.uiLayer.add(this.makeCard(state.jokerCard, cx - 110, cy + 18, true));

    // Equals divider
    const eqBg = this.add.graphics();
    eqBg.fillStyle(0xffd700, 0.15);
    eqBg.fillCircle(cx - 30, cy - 10, 18);
    this.uiLayer.add(eqBg);
    const eq = this.add.text(cx - 30, cy - 10, '=', {
      fontSize: '24px', color: '#ffd700', fontStyle: 'bold', resolution: 2,
    }).setOrigin(0.5);
    this.uiLayer.add(eq);

    // Joker value pill
    const valBg = this.add.graphics();
    valBg.fillGradientStyle(0x1a0a00, 0x1a0a00, 0x0d0500, 0x0d0500, 0.95);
    valBg.fillRoundedRect(cx + 16, cy - 38, 80, 60, 16);
    valBg.lineStyle(2, 0xffd700, 0.8);
    valBg.strokeRoundedRect(cx + 16, cy - 38, 80, 60, 16);
    this.uiLayer.add(valBg);
    const val = this.add.text(cx + 56, cy - 8, rankLabel(state.jokerValue), {
      fontSize: '46px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5);
    this.uiLayer.add(val);

    // Pot badge
    const potBg = this.add.graphics();
    potBg.fillGradientStyle(0x120c00, 0x120c00, 0x0a0800, 0x0a0800, 0.95);
    potBg.fillRoundedRect(cx - 148, cy + 68, 296, 52, 26);
    potBg.lineStyle(2, 0xdaa520, 0.85);
    potBg.strokeRoundedRect(cx - 148, cy + 68, 296, 52, 26);
    potBg.fillStyle(0xffd700, 0.05);
    potBg.fillRoundedRect(cx - 144, cy + 70, 288, 18, 9);
    this.uiLayer.add(potBg);
    this.uiTxt(cx, cy + 94, `♟  ${this.betAmount * (state.players.length)} บาท`, 22, '#ffd700', 700);
  }

  // ── Opponents ─────────────────────────────────────────────────────────────
  private drawOpponents(state: GameState, isMyTurn: boolean) {
    const opponents = state.players.filter(p => p.playerId !== this.myPlayerId);
    const positions = this.getOpponentPositions(opponents.length);
    opponents.forEach((p, i) => {
      const isCurrent = state.players[state.currentPlayerIndex]?.playerId === p.playerId;
      this.drawPlayerSlot(p, positions[i].x, positions[i].y, isCurrent, false, state, isMyTurn);
    });
  }

  private drawPlayerSlot(p: PlayerState, x: number, y: number, isCur: boolean, isMe: boolean, state: GameState, isMyTurn: boolean) {
    // Seat spotlight
    if (isCur) {
      const spot = this.add.graphics();
      spot.fillGradientStyle(0x27ae60, 0x27ae60, 0x27ae60, 0x27ae60, 0, 0, 0.1, 0);
      spot.fillEllipse(x, y, 360, 280);
      this.uiLayer.add(spot);
    } else if (isMe) {
      const mySpot = this.add.graphics();
      mySpot.fillGradientStyle(0x27ae60, 0x27ae60, 0x27ae60, 0x27ae60, 0, 0, 0.06, 0);
      mySpot.fillEllipse(x, y, 360, 280);
      this.uiLayer.add(mySpot);
    }

    const avR = isMe ? 48 : 40;
    const avY = isMe ? y : y + 10;
    const frameKey = p.avatarFrame ?? (isMe ? this.avatarFrame : undefined) ?? 'none';
    const frameHex = FRAME_HEX[frameKey] ?? FRAME_HEX.none;

    // Outer glow rings
    if (isCur) {
      const pulseOuter = this.add.graphics();
      pulseOuter.lineStyle(18, frameHex, 0.14);
      pulseOuter.strokeCircle(x, avY, avR + 22);
      this.uiLayer.add(pulseOuter);
    }
    if (frameKey !== 'none') {
      const glow = this.add.graphics();
      glow.lineStyle(12, frameHex, 0.17);
      glow.strokeCircle(x, avY, avR + 12);
      this.uiLayer.add(glow);
    }

    // Avatar ring
    const ring = this.add.graphics();
    ring.lineStyle(isCur ? 4 : 3, frameHex, isCur ? 1 : 0.72);
    ring.strokeCircle(x, avY, avR + 3);
    this.uiLayer.add(ring);

    // Avatar bg
    const avBg = this.add.graphics();
    avBg.fillGradientStyle(0x071208, 0x071208, 0x040a06, 0x040a06, 1);
    avBg.fillCircle(x, avY, avR);
    this.uiLayer.add(avBg);

    const seed = p.avatarSeed ?? (isMe ? this.avatarSeed : undefined) ?? p.name;
    const avKey = `av_${seed}`;
    if (this.textures.exists(avKey)) {
      const avImg = this.add.image(x, avY, avKey);
      avImg.setDisplaySize(avR * 1.8, avR * 1.8);
      this.uiLayer.add(avImg);
    } else {
      this.uiTxt(x, avY, p.isBot ? '🤖' : '👤', avR * 0.9, '#fff');
      this.ensureAvatar(seed);
    }

    // Current-turn pulse rings
    if (isCur) {
      const pulse = this.add.graphics();
      pulse.lineStyle(3, 0x27ae60, 0.9);
      pulse.strokeCircle(x, avY, avR + 16);
      this.uiLayer.add(pulse);
      this.tweens.add({
        targets: pulse,
        alpha: { from: 0.9, to: 0 },
        scaleX: { from: 1, to: 1.55 }, scaleY: { from: 1, to: 1.55 },
        duration: 1100, repeat: -1, ease: 'Sine.Out',
      });
      const pulse2 = this.add.graphics();
      pulse2.lineStyle(2, 0x44ff88, 0.4);
      pulse2.strokeCircle(x, avY, avR + 16);
      this.uiLayer.add(pulse2);
      this.tweens.add({
        targets: pulse2,
        alpha: { from: 0.4, to: 0 },
        scaleX: { from: 1, to: 1.8 }, scaleY: { from: 1, to: 1.8 },
        duration: 1400, repeat: -1, ease: 'Sine.Out', delay: 220,
      });
    }

    // Name badge
    const nameY = avY + avR + 26;
    const nbg = this.add.graphics();
    nbg.fillGradientStyle(
      isCur ? 0x082010 : 0x050c08,
      isCur ? 0x082010 : 0x050c08,
      isCur ? 0x041008 : 0x030604,
      isCur ? 0x041008 : 0x030604, 0.95
    );
    nbg.fillRoundedRect(x - 114, nameY - 20, 228, 40, 20);
    nbg.lineStyle(isCur ? 2 : 1.5, isCur ? 0x27ae60 : 0x1a4428, isCur ? 1 : 0.65);
    nbg.strokeRoundedRect(x - 114, nameY - 20, 228, 40, 20);
    nbg.fillStyle(0xffffff, 0.05);
    nbg.fillRoundedRect(x - 110, nameY - 18, 220, 12, 6);
    this.uiLayer.add(nbg);
    this.uiTxt(x, nameY, `${p.isBot ? '🤖 ' : ''}${p.name}`, isMe ? 20 : 18, isCur ? '#44ff88' : '#ddeedd', 700);

    // Opponent fan + discard
    if (!isMe) {
      const fanY = avY - avR - 20;
      p.hand.forEach((card, j) => {
        const angle = (j - (p.hand.length - 1) / 2) * 9;
        const cx2 = x + (j - (p.hand.length - 1) / 2) * 17;
        const c = this.makeCard(card, cx2, fanY - 52, false);
        c.setRotation(Phaser.Math.DegToRad(angle));
        this.uiLayer.add(c);
      });
      // Hand count badge
      const ccbg = this.add.graphics();
      ccbg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.82);
      ccbg.fillRoundedRect(x - 34, fanY - 14, 68, 28, 14);
      ccbg.lineStyle(1, 0x5a4a00, 0.4);
      ccbg.strokeRoundedRect(x - 34, fanY - 14, 68, 28, 14);
      this.uiLayer.add(ccbg);
      this.uiTxt(x, fanY + 1, `${p.hand.length} ใบ`, 15, '#c8a44a', 600);

      // Opponent discard pile
      const top = p.discardPile.at(-1);
      if (top) {
        const pIdx = state.players.findIndex(pl => pl.playerId === p.playerId);
        const discardY = avY + avR + 82;
        const dc = this.makeCard(top, x, discardY, true);
        if (isMyTurn) {
          dc.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
          dc.on('pointerdown', () => getSocket().emit('ss:pick_discard', { roomId: this.roomId, fromPlayerIndex: pIdx }));
          dc.on('pointerover', () => {
            dc.setScale(1.1);
            // Pickup hint glow
            const hg = this.add.graphics().setDepth(15);
            hg.lineStyle(4, 0xffd700, 0.8);
            hg.strokeRoundedRect(x - CARD_W / 2 - 10, discardY - CARD_H / 2 - 10, CARD_W + 20, CARD_H + 20, CARD_R + 5);
            dc.setData('hintGlow', hg);
          });
          dc.on('pointerout', () => {
            dc.setScale(1);
            const hg = dc.getData('hintGlow') as Phaser.GameObjects.Graphics | undefined;
            if (hg) hg.destroy();
          });
        }
        this.uiLayer.add(dc);
        const dlb = this.add.graphics();
        dlb.fillGradientStyle(0x060606, 0x060606, 0x020202, 0x020202, 0.82);
        dlb.fillRoundedRect(x - 56, discardY + CARD_H / 2 + 8, 112, 28, 14);
        this.uiLayer.add(dlb);
        this.uiTxt(x, discardY + CARD_H / 2 + 22, `กองทิ้ง ×${p.discardPile.length}`, 14, '#c8a44a');
      }
    }
  }

  private getOpponentPositions(count: number): { x: number; y: number }[] {
    if (count === 1) return [{ x: W / 2, y: 360 }];
    if (count === 2) return [{ x: W / 2 - 320, y: 340 }, { x: W / 2 + 320, y: 340 }];
    if (count === 3) return [{ x: W / 2, y: 295 }, { x: W / 2 - 410, y: 410 }, { x: W / 2 + 410, y: 410 }];
    return [{ x: W / 2 - 200, y: 300 }, { x: W / 2 + 200, y: 300 }, { x: W / 2 - 440, y: 435 }, { x: W / 2 + 440, y: 435 }];
  }

  // ── My area ───────────────────────────────────────────────────────────────
  private drawMyArea(me: PlayerState, state: GameState, isMyTurn: boolean) {
    const myX = 168, myY = H - 195;
    this.drawPlayerSlot({ ...me, avatarSeed: me.avatarSeed ?? this.avatarSeed, avatarFrame: me.avatarFrame ?? this.avatarFrame }, myX, myY, isMyTurn, true, state, isMyTurn);

    // Hand label
    const lb = this.add.graphics();
    lb.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.72);
    lb.fillRoundedRect(W / 2 - 264, H - 316, 528, 36, 18);
    lb.lineStyle(1, 0x3a3000, 0.45);
    lb.strokeRoundedRect(W / 2 - 264, H - 316, 528, 36, 18);
    this.uiLayer.add(lb);
    this.uiTxt(W / 2, H - 298, `มือของคุณ  (${me.hand.length} ใบ)`, 17, '#c8a44a', 600);

    // Own discard pile
    if (me.discardPile.length > 0) {
      const dtop = me.discardPile.at(-1)!;
      const dX = W - 158, dY = H - 200;
      const dlb2 = this.add.graphics();
      dlb2.fillGradientStyle(0x060606, 0x060606, 0x020202, 0x020202, 0.8);
      dlb2.fillRoundedRect(dX - 70, dY - CARD_H / 2 - 36, 140, 30, 15);
      dlb2.lineStyle(1, 0x3a3000, 0.4);
      dlb2.strokeRoundedRect(dX - 70, dY - CARD_H / 2 - 36, 140, 30, 15);
      this.uiLayer.add(dlb2);
      this.uiTxt(dX, dY - CARD_H / 2 - 21, 'กองทิ้งของฉัน', 14, '#c8a44a');
      this.uiLayer.add(this.makeCard(dtop, dX, dY, true));
      if (me.discardPile.length > 1) {
        const ct = this.add.graphics();
        ct.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.78);
        ct.fillRoundedRect(dX - 30, dY + CARD_H / 2 + 8, 60, 28, 14);
        this.uiLayer.add(ct);
        this.uiTxt(dX, dY + CARD_H / 2 + 22, `×${me.discardPile.length}`, 15, '#ddd');
      }
    }

    // Hand cards
    const handY = H - 168;
    const gap = Math.min(130, (W - 460) / Math.max(me.hand.length, 1));
    const startX = W / 2 - ((me.hand.length - 1) * gap) / 2;

    me.hand.forEach((card, i) => {
      const x = startX + i * gap;
      const isSelected = this.selectedCardId === card.id;
      const cardY = isSelected ? handY - 46 : handY;

      // Selected glow
      if (isSelected) {
        const selOuter = this.add.graphics();
        selOuter.lineStyle(14, 0x27ae60, 0.2);
        selOuter.strokeRoundedRect(x - CARD_W / 2 - 16, cardY - CARD_H / 2 - 16, CARD_W + 32, CARD_H + 32, CARD_R + 8);
        this.uiLayer.add(selOuter);
        const glow = this.add.graphics();
        glow.lineStyle(4, 0x27ae60, 1);
        glow.strokeRoundedRect(x - CARD_W / 2 - 9, cardY - CARD_H / 2 - 9, CARD_W + 18, CARD_H + 18, CARD_R + 4);
        glow.fillStyle(0x27ae60, 0.07);
        glow.fillRoundedRect(x - CARD_W / 2 - 9, cardY - CARD_H / 2 - 9, CARD_W + 18, CARD_H + 18, CARD_R + 4);
        this.uiLayer.add(glow);
      }

      const cardObj = this.makeCard(card, x, cardY, true);
      cardObj.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      cardObj.on('pointerdown', () => {
        if (card.id === 'hidden') return;
        this.selectedCardId = this.selectedCardId === card.id ? null : card.id;
        if (this.gameState) this.renderState(this.gameState);
      });
      cardObj.on('pointerover', () => { if (!isSelected) { cardObj.setY(cardY - 18); cardObj.setScale(1.04); } });
      cardObj.on('pointerout', () => { if (!isSelected) { cardObj.setY(cardY); cardObj.setScale(1); } });
      this.uiLayer.add(cardObj);
    });
  }

  // ── Action buttons ────────────────────────────────────────────────────────
  private drawActionButtons(state: GameState, me: PlayerState) {
    const btnY = H - 44;
    const canDraw = me.hand.length <= 5;
    const canDiscard = !!this.selectedCardId;

    if (canDraw) {
      this.uiLayer.add(this.makeButton('🃏  จั่วไพ่', W / 2 - 152, btnY, 0x0d47a1, 0x082060, 0x4090e0, () => {
        getSocket().emit('ss:draw', { roomId: this.roomId });
      }, 276, 64));
    }

    if (canDiscard) {
      this.uiLayer.add(this.makeButton('🗑  ทิ้งไพ่', W / 2 + 152, btnY, 0xb71c1c, 0x7f0000, 0xef5050, () => {
        getSocket().emit('ss:discard', { roomId: this.roomId, cardId: this.selectedCardId });
        this.selectedCardId = null;
      }, 276, 64));
    } else {
      this.uiTxt(W / 2 + 152, btnY, 'เลือกไพ่ที่จะทิ้ง', 17, '#6c6c8c');
    }
  }

  // ── Intercept button ──────────────────────────────────────────────────────
  private drawInterceptButton(card: Card) {
    // Pulsing ring
    const pulse = this.add.graphics();
    pulse.fillStyle(0xff1744, 0.14);
    pulse.fillCircle(W / 2, H / 2 - 44, 100);
    this.uiLayer.add(pulse);
    this.tweens.add({
      targets: pulse, alpha: { from: 0.14, to: 0 },
      scaleX: 2.2, scaleY: 2.2, duration: 900, repeat: -1,
    });
    this.uiLayer.add(this.makeButton(
      `⚡  ขัดเทิร์น! (${rankLabel(card.rank)} ${card.suit})`,
      W / 2, H / 2 - 44, 0xff1744, 0xb71c1c, 0xff5570, () => {
        getSocket().emit('ss:intercept', { roomId: this.roomId, card });
      }, 360, 68
    ));
  }

  // ── Pair highlight ────────────────────────────────────────────────────────
  private highlightPairs(hand: Card[], jokerValue: number) {
    const paired = new Set<string>();
    const used = new Set<string>();
    for (let i = 0; i < hand.length; i++) {
      if (used.has(hand[i].id)) continue;
      for (let j = i + 1; j < hand.length; j++) {
        if (used.has(hand[j].id)) continue;
        if (this.isValidPair(hand[i], hand[j], jokerValue)) {
          paired.add(hand[i].id); paired.add(hand[j].id);
          used.add(hand[i].id); used.add(hand[j].id); break;
        }
      }
    }
    if (paired.size === 0) return;
    const handY = H - 168;
    const gap = Math.min(130, (W - 460) / Math.max(hand.length, 1));
    const startX = W / 2 - ((hand.length - 1) * gap) / 2;
    const g = this.add.graphics();
    hand.forEach((card, i) => {
      if (!paired.has(card.id)) return;
      const x = startX + i * gap;
      const cy = this.selectedCardId === card.id ? handY - 46 : handY;
      g.lineStyle(3, 0xffd700, 0.65);
      g.strokeRoundedRect(x - CARD_W / 2 - 5, cy - CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10, CARD_R + 3);
    });
    this.uiLayer.add(g);
  }

  // ── Card factory ──────────────────────────────────────────────────────────
  private makeCard(card: Card, x: number, y: number, faceUp: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    // Multi-layer shadow for depth
    const sh1 = this.add.graphics();
    sh1.fillStyle(0x000000, 0.52);
    sh1.fillRoundedRect(-CARD_W / 2 + 6, -CARD_H / 2 + 10, CARD_W, CARD_H, CARD_R);
    c.add(sh1);
    const sh2 = this.add.graphics();
    sh2.fillStyle(0x000000, 0.25);
    sh2.fillRoundedRect(-CARD_W / 2 + 3, -CARD_H / 2 + 5, CARD_W, CARD_H, CARD_R);
    c.add(sh2);
    const key = (!faceUp || card.id === 'hidden') ? 'card_back' : cardKey(card.suit, card.rank);
    const img = this.add.image(0, 0, key);
    img.setDisplaySize(CARD_W, CARD_H);
    c.add(img);
    // Shine on face-up cards
    if (faceUp && card.id !== 'hidden') {
      const shine = this.add.graphics();
      shine.fillStyle(0xffffff, 0.07);
      shine.fillRoundedRect(-CARD_W / 2 + 2, -CARD_H / 2 + 2, CARD_W - 4, CARD_H * 0.34, CARD_R - 2);
      c.add(shine);
    }
    return c;
  }

  // ── Button factory ────────────────────────────────────────────────────────
  private makeButton(label: string, x: number, y: number, col: number, hov: number, border: number, cb: () => void, w = 276, h = 64): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    // Ambient glow ellipse
    const outerGlow = this.add.graphics();
    outerGlow.fillStyle(col, 0.15);
    outerGlow.fillEllipse(0, 8, w + 44, h + 22);
    c.add(outerGlow);

    // Shadow
    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.52);
    sh.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, h / 2);
    c.add(sh);

    // Main gradient bg
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      Phaser.Display.Color.IntegerToColor(col).lighten(18).color,
      Phaser.Display.Color.IntegerToColor(col).lighten(18).color,
      Phaser.Display.Color.IntegerToColor(col).darken(14).color,
      Phaser.Display.Color.IntegerToColor(col).darken(14).color, 1
    );
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);

    // Top shine
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.2);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.4, h / 2 - 2);
    c.add(shine);

    // Border
    const bdr = this.add.graphics();
    bdr.lineStyle(2, border, 0.9);
    bdr.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bdr);
    bdr.lineStyle(1, 0xffffff, 0.14);
    bdr.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, h / 2 - 2);

    const t = this.add.text(0, 0, label, {
      fontSize: '22px', color: '#fff', fontStyle: 'bold',
      fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5);
    c.add(t);

    c.setSize(w, h).setInteractive();
    c.on('pointerdown', () => {
      c.setScale(0.93);
      bg.clear();
      bg.fillGradientStyle(hov, hov, Phaser.Display.Color.IntegerToColor(hov).darken(20).color, Phaser.Display.Color.IntegerToColor(hov).darken(20).color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      const ripple = this.add.graphics().setDepth(50);
      ripple.fillStyle(0xffffff, 0.28);
      ripple.fillCircle(0, 0, 18);
      ripple.x = x; ripple.y = y;
      this.tweens.add({ targets: ripple, scaleX: 5, scaleY: 3, alpha: 0, duration: 360, onComplete: () => ripple.destroy() });
      this.time.delayedCall(125, () => { c.setScale(1); cb(); });
    });
    c.on('pointerover', () => {
      bg.clear();
      bg.fillGradientStyle(hov, hov, Phaser.Display.Color.IntegerToColor(hov).darken(10).color, Phaser.Display.Color.IntegerToColor(hov).darken(10).color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      outerGlow.setAlpha(0.5);
      this.tweens.add({ targets: c, y: y - 6, duration: 115, ease: 'Sine.Out' });
    });
    c.on('pointerout', () => {
      bg.clear();
      bg.fillGradientStyle(
        Phaser.Display.Color.IntegerToColor(col).lighten(18).color,
        Phaser.Display.Color.IntegerToColor(col).lighten(18).color,
        Phaser.Display.Color.IntegerToColor(col).darken(14).color,
        Phaser.Display.Color.IntegerToColor(col).darken(14).color, 1
      );
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      outerGlow.setAlpha(1);
      this.tweens.add({ targets: c, y, duration: 115, ease: 'Sine.Out' });
    });
    return c;
  }

  // ── uiTxt helper ──────────────────────────────────────────────────────────
  private uiTxt(x: number, y: number, text: string, size: number, color: string, weight = 400) {
    const t = this.add.text(x, y, text, {
      fontSize: `${size}px`, color,
      fontStyle: weight >= 700 ? 'bold' : 'normal',
      fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
      resolution: 2,
    }).setOrigin(0.5);
    this.uiLayer.add(t);
    return t;
  }

  // ── Result overlay ────────────────────────────────────────────────────────
  private showResult(isWinner: boolean, pot: number) {
    this.gameState = null;
    this.uiLayer.removeAll(true);

    // Overlay
    const overlay = this.add.graphics().setDepth(20);
    overlay.fillStyle(0x000000, 0.86);
    overlay.fillRect(0, 0, W, H);

    const pw = 880, ph = 560;
    const panelX = W / 2, panelY = H / 2;

    // Outer panel glow
    const panelGlow = this.add.graphics().setDepth(20);
    panelGlow.lineStyle(36, isWinner ? 0xffd700 : 0xc62828, 0.07);
    panelGlow.strokeRoundedRect(panelX - pw / 2 - 18, panelY - ph / 2 - 18, pw + 36, ph + 36, 52);

    // Shadow
    const shadow = this.add.graphics().setDepth(20);
    shadow.fillStyle(0x000000, 0.6);
    shadow.fillRoundedRect(panelX - pw / 2 + 14, panelY - ph / 2 + 20, pw, ph, 44);

    // Panel
    const panel = this.add.graphics().setDepth(21);
    panel.fillGradientStyle(
      isWinner ? 0x0a2e12 : 0x2e0a0a,
      isWinner ? 0x0a2e12 : 0x2e0a0a,
      isWinner ? 0x051808 : 0x180505,
      isWinner ? 0x051808 : 0x180505, 1
    );
    panel.fillRoundedRect(panelX - pw / 2, panelY - ph / 2, pw, ph, 44);
    panel.lineStyle(3.5, isWinner ? 0x27ae60 : 0xef5350, 1);
    panel.strokeRoundedRect(panelX - pw / 2, panelY - ph / 2, pw, ph, 44);
    panel.lineStyle(1.5, isWinner ? 0x44ff88 : 0xff8888, 0.22);
    panel.strokeRoundedRect(panelX - pw / 2 + 9, panelY - ph / 2 + 9, pw - 18, ph - 18, 37);

    // Top bar
    const topBar = this.add.graphics().setDepth(22);
    topBar.fillGradientStyle(
      isWinner ? 0x27ae60 : 0xc62828,
      isWinner ? 0x1e8449 : 0x8b0000,
      isWinner ? 0x1e8449 : 0x8b0000,
      isWinner ? 0x145a32 : 0x5c0000, 1
    );
    topBar.fillRoundedRect(panelX - 130, panelY - ph / 2 - 7, 260, 14, 7);

    // Icon
    const iconBg = this.add.graphics().setDepth(22).setAlpha(0);
    iconBg.fillGradientStyle(
      isWinner ? 0x27ae60 : 0xc62828,
      isWinner ? 0x1e8449 : 0x8b0000,
      isWinner ? 0x145a32 : 0x6b0000,
      isWinner ? 0x0d3b22 : 0x3d0000, 1
    );
    iconBg.fillCircle(panelX, panelY - ph / 2 + 82, 58);
    iconBg.lineStyle(5, isWinner ? 0x44ff88 : 0xff6666, 0.65);
    iconBg.strokeCircle(panelX, panelY - ph / 2 + 82, 58);
    iconBg.lineStyle(2, isWinner ? 0x27ae60 : 0xc62828, 0.28);
    iconBg.strokeCircle(panelX, panelY - ph / 2 + 82, 78);
    this.tweens.add({
      targets: iconBg, alpha: 1,
      scaleX: { from: 0.1, to: 1 }, scaleY: { from: 0.1, to: 1 },
      duration: 560, ease: 'Back.Out',
    });

    const iconTxt = this.add.text(panelX, panelY - ph / 2 + 82, isWinner ? '♛' : '✕', {
      fontSize: isWinner ? '54px' : '62px', color: isWinner ? '#0a1e0e' : '#1a0000',
      fontStyle: 'bold', resolution: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this.tweens.add({ targets: iconTxt, alpha: 1, duration: 380, delay: 200 });

    // Title
    const titleTxt = this.add.text(panelX, panelY - 128, isWinner ? 'ชนะ!' : 'แพ้', {
      fontSize: '82px', color: isWinner ? '#44ff88' : '#ef5350', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 9, resolution: 2,
      fontFamily: "'Segoe UI', sans-serif",
    }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this.tweens.add({ targets: titleTxt, alpha: 1, y: panelY - 136, duration: 560, delay: 170, ease: 'Back.Out' });

    const subTxt = this.add.text(panelX, panelY - 62, isWinner ? '🎉 คุณชนะรอบนี้!' : '💀 เสียโชคครั้งนี้', {
      fontSize: '28px', color: isWinner ? '#b8ffcc' : '#ffb3b3', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this.tweens.add({ targets: subTxt, alpha: 1, duration: 480, delay: 330 });

    // Divider
    const div = this.add.graphics().setDepth(22).setAlpha(0);
    div.lineStyle(1, isWinner ? 0x27ae60 : 0xc62828, 0.35);
    div.lineBetween(panelX - 320, panelY, panelX + 320, panelY);
    this.tweens.add({ targets: div, alpha: 1, duration: 380, delay: 420 });

    if (isWinner) {
      const potLabel = this.add.text(panelX, panelY + 42, 'เงินที่ได้รับ', {
        fontSize: '22px', color: '#888', resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      const potAmt = this.add.text(panelX, panelY + 90, `+ ${pot.toLocaleString()} บาท`, {
        fontSize: '54px', color: '#44ff88', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 6, resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      this.tweens.add({ targets: potLabel, alpha: 1, duration: 480, delay: 470 });
      this.tweens.add({ targets: potAmt, alpha: 1, scaleX: { from: 0.6, to: 1 }, scaleY: { from: 0.6, to: 1 }, duration: 600, delay: 550, ease: 'Back.Out' });

      // Coin + star burst
      for (let i = 0; i < 30; i++) {
        this.time.delayedCall(i * 65, () => {
          const sx = Phaser.Math.Between(panelX - 420, panelX + 420);
          const coin = this.add.graphics().setDepth(24);
          const coinR = Phaser.Math.Between(6, 14);
          const coinColor = [0xffd700, 0x44ff88, 0xf4c430, 0xdaa520][i % 4];
          coin.fillGradientStyle(coinColor, coinColor, Phaser.Display.Color.IntegerToColor(coinColor).darken(35).color, Phaser.Display.Color.IntegerToColor(coinColor).darken(35).color, 1);
          coin.fillCircle(0, 0, coinR);
          coin.lineStyle(2, 0xffffff, 0.3);
          coin.strokeCircle(0, 0, coinR);
          coin.x = sx; coin.y = panelY - 240;
          this.tweens.add({
            targets: coin, alpha: { from: 1, to: 0 },
            y: panelY - 240 - Phaser.Math.Between(80, 340),
            x: coin.x + Phaser.Math.Between(-70, 70),
            angle: Phaser.Math.Between(-200, 200),
            duration: Phaser.Math.Between(700, 1300),
            onComplete: () => coin.destroy(),
          });
        });
      }

      // Sparkles
      for (let i = 0; i < 18; i++) {
        this.time.delayedCall(i * 120 + 300, () => {
          const sp = this.add.text(
            Phaser.Math.Between(panelX - 400, panelX + 400),
            Phaser.Math.Between(panelY - ph / 2 + 10, panelY + ph / 2 - 10),
            ['⭐','✦','✨','★'][i % 4],
            { fontSize: `${Phaser.Math.Between(14, 34)}px`, color: ['#ffd700', '#44ff88'][i % 2] }
          ).setAlpha(0).setDepth(25);
          this.tweens.add({ targets: sp, alpha: { from: 0, to: 0.9 }, y: sp.y - 55, duration: 820, yoyo: true, onComplete: () => sp.destroy() });
        });
      }
    } else {
      const loseLabel = this.add.text(panelX, panelY + 50, 'เสียเงิน', { fontSize: '22px', color: '#888', resolution: 2 }).setOrigin(0.5).setAlpha(0).setDepth(23);
      const loseAmt = this.add.text(panelX, panelY + 98, `- ${this.betAmount.toLocaleString()} บาท`, {
        fontSize: '50px', color: '#ef5350', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 6, resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      this.tweens.add({ targets: loseLabel, alpha: 1, duration: 480, delay: 420 });
      this.tweens.add({ targets: loseAmt, alpha: 1, duration: 500, delay: 530 });
    }

    // Buttons
    const btnY = panelY + ph / 2 - 84;
    const lobbyBtn = this.premiumBtn(panelX, btnY, 0x1b5e20, 0x0a3d15, 0x2e7d32, '🏠  กลับ Lobby', () => {
      window.location.href = '/';
    });
    lobbyBtn.setDepth(24).setAlpha(0);
    this.add.existing(lobbyBtn);
    this.tweens.add({ targets: lobbyBtn, alpha: 1, y: btnY - 8, duration: 460, delay: 680, ease: 'Back.Out' });
  }

  // ── Premium result button ─────────────────────────────────────────────────
  private premiumBtn(x: number, y: number, col: number, hov: number, border: number, label: string, cb: () => void): Phaser.GameObjects.Container {
    const w = 370, h = 82;
    const c = this.add.container(x, y);

    const glow = this.add.graphics();
    glow.fillStyle(col, 0.18);
    glow.fillEllipse(0, 10, w + 52, h + 30);
    c.add(glow);

    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.55);
    sh.fillRoundedRect(-w / 2 + 5, -h / 2 + 7, w, h, h / 2);
    c.add(sh);

    const bg = this.add.graphics();
    bg.fillGradientStyle(
      Phaser.Display.Color.IntegerToColor(col).lighten(22).color, col,
      Phaser.Display.Color.IntegerToColor(col).darken(22).color,
      Phaser.Display.Color.IntegerToColor(col).darken(12).color, 1
    );
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);

    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.17);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.38, h / 2 - 2);
    c.add(shine);

    const bdr = this.add.graphics();
    bdr.lineStyle(2.5, border, 0.9);
    bdr.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bdr);

    const t = this.add.text(0, 1, label, {
      fontSize: '28px', color: '#fff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
      fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
    }).setOrigin(0.5);
    c.add(t);

    c.setSize(w, h).setInteractive();
    c.on('pointerdown', () => { c.setScale(0.93); this.time.delayedCall(130, () => { c.setScale(1); cb(); }); });
    c.on('pointerover', () => {
      bg.clear();
      bg.fillGradientStyle(hov, hov, Phaser.Display.Color.IntegerToColor(hov).darken(22).color, Phaser.Display.Color.IntegerToColor(hov).darken(22).color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      glow.setAlpha(0.5);
      this.tweens.add({ targets: c, y: y - 7, duration: 110, ease: 'Sine.Out' });
    });
    c.on('pointerout', () => {
      bg.clear();
      bg.fillGradientStyle(
        Phaser.Display.Color.IntegerToColor(col).lighten(22).color, col,
        Phaser.Display.Color.IntegerToColor(col).darken(22).color,
        Phaser.Display.Color.IntegerToColor(col).darken(12).color, 1
      );
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      glow.setAlpha(1);
      this.tweens.add({ targets: c, y, duration: 110, ease: 'Sine.Out' });
    });
    return c;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
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
