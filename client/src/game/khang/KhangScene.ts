import Phaser from 'phaser';
import { getSocket } from '../../hooks/useSocket';

interface Card { id: string; suit: string; rank: number; }
interface KhangPlayerState {
  playerId: string; name: string; hand: Card[]; isBot: boolean;
  avatarSeed?: string; avatarFrame?: string;
}
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

const W = 1920;
const H = 1080;
const CW = 112;
const CH = 158;
const CR = 14;

const FRAME_HEX: Record<string, number> = {
  gold: 0xffd700, silver: 0xbdc3c7, bronze: 0xcd7f32,
  blue: 0x3498db, red: 0xe74c3c, purple: 0x9b59b6, green: 0x27ae60,
  none: 0x556677,
};

const KH_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const KH_SUITS = ['S','H','D','C'];

function khCardKey(suit: string, rank: number): string {
  const r = ({ 1:'A', 11:'J', 12:'Q', 13:'K' } as Record<number,string>)[rank] ?? String(rank);
  return `${r}${suit}`;
}
function dicebearUrl(seed: string) {
  return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed ?? 'Player')}&backgroundColor=transparent`;
}

export class KhangScene extends Phaser.Scene {
  private roomId!: string;
  private myPlayerId!: string;
  private betAmount!: number;
  private avatarSeed?: string;
  private avatarFrame?: string;
  private gs: KhangGameState | null = null;
  private selectedIds: Set<string> = new Set();
  private initialized = false;
  private ui!: Phaser.GameObjects.Container;
  private statusBg!: Phaser.GameObjects.Graphics;
  private statusTxt!: Phaser.GameObjects.Text;
  private loadingAvatars: Set<string> = new Set();
  private dealing = false;
  private pendingState: KhangGameState | null = null;
  private animLayer!: Phaser.GameObjects.Container;
  private particleLayer!: Phaser.GameObjects.Container;

  constructor() { super({ key: 'KhangScene', active: false }); }

  preload() {
    for (const s of KH_SUITS) for (const r of KH_RANKS) {
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
    this.drawBg();
    this.ui = this.add.container(0, 0);
    this.animLayer = this.add.container(0, 0).setDepth(30);
    this.particleLayer = this.add.container(0, 0).setDepth(5);
    this.createHUD();
    this.startAmbientParticles();
    this.setupSockets();
    getSocket().emit('kh:start', { roomId: this.roomId, playerId: this.myPlayerId });
  }

  // ── Ambient dust particles ───────────────────────────────────────────────
  private startAmbientParticles() {
    for (let i = 0; i < 28; i++) {
      this.time.delayedCall(i * 220, () => this.spawnDust());
    }
    this.time.addEvent({ delay: 1800, callback: this.spawnDust, callbackScope: this, loop: true });
  }

  private spawnDust() {
    const g = this.add.graphics();
    const r = Phaser.Math.Between(2, 5);
    const colors = [0xffd700, 0xdaa520, 0xb8860b, 0xce93d8, 0xffffff];
    const col = colors[Phaser.Math.Between(0, colors.length - 1)];
    g.fillStyle(col, Phaser.Math.FloatBetween(0.1, 0.35));
    g.fillCircle(0, 0, r);
    g.x = Phaser.Math.Between(80, W - 80);
    g.y = Phaser.Math.Between(H * 0.15, H * 0.85);
    this.particleLayer.add(g);
    this.tweens.add({
      targets: g,
      y: g.y - Phaser.Math.Between(60, 180),
      x: g.x + Phaser.Math.Between(-40, 40),
      alpha: { from: Phaser.Math.FloatBetween(0.1, 0.3), to: 0 },
      duration: Phaser.Math.Between(3000, 6000),
      ease: 'Sine.Out',
      onComplete: () => g.destroy(),
    });
  }

  // ── avatar loader ─────────────────────────────────────────────────────────
  private ensureAvatar(seed: string) {
    const key = `av_${seed}`;
    if (this.textures.exists(key) || this.loadingAvatars.has(key)) return;
    this.loadingAvatars.add(key);
    this.load.svg(key, dicebearUrl(seed), { width: 80, height: 80 });
    this.load.once('complete', () => {
      if (this.gs && !this.dealing) this.render(this.gs);
    });
    this.load.start();
  }

  // ── Background ───────────────────────────────────────────────────────────
  private drawBg() {
    // Deep dark base
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x080210, 0x080210, 0x030108, 0x030108, 1);
    bg.fillRect(0, 0, W, H);

    // Outer vignette rings
    for (let i = 5; i >= 1; i--) {
      const vg = this.add.graphics();
      vg.fillStyle(0x000000, 0.04 * i);
      vg.fillRect(0, 0, W, H);
    }

    // === MAIN TABLE ===
    // Deep shadow under table
    const tableShadow = this.add.graphics();
    tableShadow.fillStyle(0x000000, 0.7);
    tableShadow.fillEllipse(W / 2 + 18, H / 2 + 22, W - 20, H - 24);

    // Outer wood/mahogany rim (thickest)
    const woodRim = this.add.graphics();
    woodRim.fillGradientStyle(0x3d1a00, 0x5c2800, 0x2a1000, 0x3d1a00, 1);
    woodRim.fillEllipse(W / 2, H / 2, W - 30, H - 28);

    // Carved gold inlay on wood
    const goldRim1 = this.add.graphics();
    goldRim1.lineStyle(5, 0xffd700, 1);
    goldRim1.strokeEllipse(W / 2, H / 2, W - 54, H - 52);
    const goldRim2 = this.add.graphics();
    goldRim2.lineStyle(2, 0xdaa520, 0.6);
    goldRim2.strokeEllipse(W / 2, H / 2, W - 66, H - 64);
    const goldRim3 = this.add.graphics();
    goldRim3.lineStyle(1, 0xffd700, 0.25);
    goldRim3.strokeEllipse(W / 2, H / 2, W - 80, H - 78);

    // Inner felt — layered
    const felt1 = this.add.graphics();
    felt1.fillStyle(0x0a4020, 1);
    felt1.fillEllipse(W / 2, H / 2, W - 88, H - 86);
    const felt2 = this.add.graphics();
    felt2.fillStyle(0x0c5028, 1);
    felt2.fillEllipse(W / 2, H / 2, W - 108, H - 106);
    const felt3 = this.add.graphics();
    felt3.fillStyle(0x0d5a2c, 1);
    felt3.fillEllipse(W / 2, H / 2, W - 140, H - 138);

    // Felt fabric texture (woven pattern)
    const mask = this.add.graphics();
    mask.fillStyle(0x0d5a2c, 1);
    mask.fillEllipse(W / 2, H / 2, W - 108, H - 106);

    for (let gx = 0; gx < W; gx += 28) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0f6a34, 0.12);
      gl.lineBetween(gx, 0, gx, H);
    }
    for (let gy = 0; gy < H; gy += 28) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0f6a34, 0.12);
      gl.lineBetween(0, gy, W, gy);
    }
    for (let d = -H; d < W + H; d += 56) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0f6a34, 0.07);
      gl.lineBetween(d, 0, d + H, H);
    }
    for (let d = W + H; d > -H; d -= 56) {
      const gl = this.add.graphics();
      gl.lineStyle(1, 0x0f6a34, 0.05);
      gl.lineBetween(d, 0, d - H, H);
    }

    // Inner accent ring on felt
    const innerRing = this.add.graphics();
    innerRing.lineStyle(3, 0x1a8a50, 0.3);
    innerRing.strokeEllipse(W / 2, H / 2, W - 200, H - 198);
    const innerRing2 = this.add.graphics();
    innerRing2.lineStyle(1, 0xffd700, 0.08);
    innerRing2.strokeEllipse(W / 2, H / 2, W - 220, H - 218);

    // Top-light reflection (simulates overhead lamp)
    const topLight = this.add.graphics();
    topLight.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.07, 0.07, 0, 0);
    topLight.fillEllipse(W / 2, H * 0.2, W * 0.7, H * 0.5);

    // Side ambient glow (purple/blue casino light)
    const sideGlowL = this.add.graphics();
    sideGlowL.fillStyle(0x4a0080, 0.06);
    sideGlowL.fillRect(0, 0, W * 0.3, H);
    const sideGlowR = this.add.graphics();
    sideGlowR.fillStyle(0x000080, 0.05);
    sideGlowR.fillRect(W * 0.7, 0, W * 0.3, H);

    // Center watermark — SecretCard logo
    this.add.text(W / 2, H / 2 - 20, '♠', {
      fontSize: '160px', color: '#ffd700',
    }).setOrigin(0.5).setAlpha(0.04);
    this.add.text(W / 2, H / 2 + 50, 'แคง', {
      fontSize: '52px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.04);

    // Corner ornament diamonds
    for (const [cx, cy] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]]) {
      const d = this.add.graphics();
      d.fillGradientStyle(0x5c2800, 0x7a3800, 0x3d1a00, 0x5c2800, 1);
      d.fillCircle(cx as number, cy as number, 34);
      d.lineStyle(3, 0xdaa520, 1);
      d.strokeCircle(cx as number, cy as number, 34);
      d.lineStyle(1.5, 0xffd700, 0.6);
      d.strokeCircle(cx as number, cy as number, 24);
      d.lineStyle(1, 0xffd700, 0.3);
      d.strokeCircle(cx as number, cy as number, 14);
      this.add.text(cx as number, cy as number + 1, '✦', {
        fontSize: '22px', color: '#ffd700',
      }).setOrigin(0.5).setAlpha(0.9);
    }

    // Pulsing center glow (animated)
    const cGlow = this.add.graphics();
    cGlow.fillStyle(0x27ae60, 0.04);
    cGlow.fillEllipse(W / 2, H / 2, 600, 400);
    this.tweens.add({
      targets: cGlow,
      alpha: { from: 0.3, to: 0.8 },
      scaleX: { from: 0.95, to: 1.05 },
      scaleY: { from: 0.95, to: 1.05 },
      duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
  }

  // ── HUD status bar ───────────────────────────────────────────────────────
  private createHUD() {
    this.statusBg = this.add.graphics();
    this.statusTxt = this.add.text(W / 2, 44, '', {
      fontSize: '26px', color: '#ffd700', fontStyle: 'bold',
      fontFamily: "'Segoe UI', sans-serif",
      stroke: '#000', strokeThickness: 6, resolution: 2,
    }).setOrigin(0.5).setDepth(10);
    this.setStatus('กำลังโหลด...', false);
  }

  private setStatus(text: string, isMyTurn: boolean) {
    const bw = Math.max(680, text.length * 16 + 100);
    this.statusBg.clear();

    // Outer glow when my turn
    if (isMyTurn) {
      this.statusBg.fillStyle(0x9b59b6, 0.12);
      this.statusBg.fillRoundedRect(W / 2 - bw / 2 - 18, 2, bw + 36, 88, 44);
    }

    // Glass panel
    this.statusBg.fillGradientStyle(
      isMyTurn ? 0x1a0635 : 0x080816,
      isMyTurn ? 0x1a0635 : 0x080816,
      isMyTurn ? 0x100220 : 0x040408,
      isMyTurn ? 0x100220 : 0x040408, 0.95
    );
    this.statusBg.fillRoundedRect(W / 2 - bw / 2, 8, bw, 72, 36);

    // Top shine
    this.statusBg.fillStyle(0xffffff, 0.06);
    this.statusBg.fillRoundedRect(W / 2 - bw / 2 + 4, 8, bw - 8, 24, 12);

    // Border
    this.statusBg.lineStyle(2, isMyTurn ? 0x9b59b6 : 0x2a3040, isMyTurn ? 1 : 0.8);
    this.statusBg.strokeRoundedRect(W / 2 - bw / 2, 8, bw, 72, 36);

    // Inner subtle line
    this.statusBg.lineStyle(1, isMyTurn ? 0xce93d8 : 0xffd700, 0.15);
    this.statusBg.strokeRoundedRect(W / 2 - bw / 2 + 6, 14, bw - 12, 60, 30);

    this.statusTxt.setText(text).setColor(isMyTurn ? '#ce93d8' : '#ffd700');
  }

  // ── Sockets ──────────────────────────────────────────────────────────────
  private setupSockets() {
    const s = getSocket();
    s.off('kh:state'); s.off('kh:wrong_khang'); s.off('kh:finished');

    s.on('kh:state', (state: KhangGameState) => {
      state.players.forEach(p => this.ensureAvatar(p.avatarSeed || p.name));
      this.ensureAvatar(this.avatarSeed || 'Player');

      if (state.phase === 'dealing' && !this.dealing) {
        this.gs = state;
        this.dealing = true;
        this.playDealAnimation(state);
        return;
      }
      if (this.dealing) {
        this.pendingState = state;
        return;
      }
      if (state.phase === 'playing' && this.gs?.phase === 'playing') {
        const me = state.players.find(p => p.playerId === this.myPlayerId);
        const prevMe = this.gs.players.find(p => p.playerId === this.myPlayerId);
        if (me && prevMe) {
          const prevIds = prevMe.hand.map(c => c.id);
          const curIds = me.hand.map(c => c.id);
          const added = me.hand.filter(c => !prevIds.includes(c.id));
          const removed = prevMe.hand.filter(c => !curIds.includes(c.id));
          if (added.length === 1 && removed.length === 0) {
            this.gs = state;
            this.animDrawCard(added[0], state);
            return;
          }
          if (removed.length >= 1 && added.length === 0) {
            this.gs = state;
            this.animDiscardCards(removed, state);
            return;
          }
        }
      }
      this.gs = state;
      this.render(state);
    });

    s.on('kh:wrong_khang', (d: { playerId: string; penalty: number }) => {
      const name = this.gs?.players.find(p => p.playerId === d.playerId)?.name ?? 'ผู้เล่น';
      this.toast(`⚠️ ${name} แคงผิด! เสีย ${d.penalty} บาท`, 0xff5722);
    });

    s.on('kh:finished', (d: { winnerId: string; pot: number; players?: { playerId: string; name: string; hand: Card[] }[] }) => {
      this.showScoreReveal(d.players ?? [], d.winnerId, () => {
        this.showResult(d.winnerId === this.myPlayerId, d.pot);
      });
    });
  }

  // ── Dealing animation ─────────────────────────────────────────────────────
  private playDealAnimation(state: KhangGameState) {
    this.ui.removeAll(true);
    this.animLayer.removeAll(true);
    this.setStatus('กำลังแจกไพ่...', false);

    const me = state.players.find(p => p.playerId === this.myPlayerId);
    if (!me) return;

    const emptyState = { ...state, players: state.players.map(p => ({ ...p, hand: [] })) };
    this.drawCenterArea(emptyState as KhangGameState);
    this.drawOpponents(emptyState as KhangGameState);
    const myX = 168, myY = H - 195;
    const meWithAv: KhangPlayerState = { ...me, hand: [], avatarSeed: me.avatarSeed ?? this.avatarSeed, avatarFrame: me.avatarFrame ?? this.avatarFrame };
    this.drawPlayerSlot(meWithAv, myX, myY, false, true);

    const n = 5;
    const gap = Math.min(132, (W - 460) / Math.max(n, 1));
    const startX = W / 2 - ((n - 1) * gap) / 2;
    const handY = H - 170;
    const ops = state.players.filter(p => p.playerId !== this.myPlayerId);
    const opPos = this.opponentPositions(ops.length);
    const deckX = W - 175, deckY = H / 2 - 10;
    const cardDelay = 100;
    const landed: Phaser.GameObjects.Container[] = [];
    const myLandedCards: Phaser.GameObjects.Container[] = [];

    for (let round = 0; round < n; round++) {
      for (let pi = 0; pi < state.players.length; pi++) {
        const delayMs = (round * state.players.length + pi) * cardDelay;
        const player = state.players[pi];
        const isMe = player.playerId === this.myPlayerId;
        let destX: number, destY: number;
        if (isMe) {
          destX = startX + round * gap;
          destY = handY;
        } else {
          const opIdx = ops.findIndex(o => o.playerId === player.playerId);
          destX = opPos[opIdx]?.x ?? W / 2;
          destY = (opPos[opIdx]?.y ?? 300) - 80;
        }
        this.time.delayedCall(delayMs, () => {
          // Whoosh sound substitute: flash effect
          const fc = this.makeCard({ id: 'hidden', suit: 'S', rank: 1 }, deckX, deckY, false);
          fc.setScale(0.5);
          this.animLayer.add(fc);
          // Trail effect
          const trail = this.add.graphics().setDepth(29).setAlpha(0.4);
          trail.fillStyle(0xffd700, 0.3);
          trail.fillCircle(deckX, deckY, 8);
          this.tweens.add({ targets: trail, alpha: 0, scaleX: 3, scaleY: 3, duration: 350, onComplete: () => trail.destroy() });

          this.tweens.add({
            targets: fc,
            x: destX, y: destY,
            scaleX: isMe ? 1 : 0.65, scaleY: isMe ? 1 : 0.65,
            duration: 240, ease: 'Cubic.Out',
            onComplete: () => {
              landed.push(fc);
              if (isMe) myLandedCards.push(fc);
            },
          });
        });
      }
    }

    const dealEnd = n * state.players.length * cardDelay + 350;
    this.time.delayedCall(dealEnd, () => {
      const myLanded = myLandedCards;
      me.hand.forEach((card, i) => {
        this.time.delayedCall(i * 90, () => {
          const fc = myLanded[i];
          if (!fc) return;
          this.tweens.add({
            targets: fc, scaleX: 0, duration: 80, ease: 'Linear',
            onComplete: () => {
              const flipped = this.makeCard(card, fc.x, fc.y, true);
              this.animLayer.add(flipped);
              // Flip flash
              const flash = this.add.graphics().setDepth(31).setAlpha(0.6);
              flash.fillStyle(0xffffff, 0.5);
              flash.fillRoundedRect(fc.x - CW / 2, fc.y - CH / 2, CW, CH, CR);
              this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
              this.tweens.add({
                targets: flipped, scaleX: 1, duration: 80, ease: 'Linear',
                onComplete: () => { fc.destroy(); },
              });
            },
          });
        });
      });

      this.time.delayedCall(me.hand.length * 90 + 400, () => {
        this.animLayer.removeAll(true);
        this.dealing = false;
        getSocket().emit('kh:deal_done', { roomId: state.roomId });
        const next = this.pendingState ?? state;
        this.pendingState = null;
        this.gs = next;
        this.render(next);
      });
    });
  }

  // ── Draw card animation ───────────────────────────────────────────────────
  private animDrawCard(drawnCard: Card, state: KhangGameState) {
    const deckX = W - 175, deckY = H / 2 - 10;
    const me = state.players.find(p => p.playerId === this.myPlayerId)!;
    const n = me.hand.length;
    const gap = Math.min(132, (W - 460) / Math.max(n, 1));
    const startX = W / 2 - ((n - 1) * gap) / 2;
    const handY = H - 170;
    const cardSlot = me.hand.findIndex(c => c.id === drawnCard.id);
    const destX = startX + cardSlot * gap;

    this.render(state);

    const fc = this.makeCard(drawnCard, deckX, deckY, false);
    fc.setScale(0.7);
    this.animLayer.removeAll(true);
    this.animLayer.add(fc);

    // Draw trail
    const trail = this.add.graphics().setDepth(31).setAlpha(0.5);
    trail.fillStyle(0x9b59b6, 0.4);
    trail.fillCircle(deckX, deckY, 12);
    this.tweens.add({ targets: trail, alpha: 0, x: destX, y: handY, scaleX: 2, scaleY: 2, duration: 300, onComplete: () => trail.destroy() });

    this.tweens.add({
      targets: fc, x: destX, y: handY, scaleX: 1, scaleY: 1,
      duration: 300, ease: 'Cubic.Out',
      onComplete: () => {
        this.tweens.add({
          targets: fc, scaleX: 0, duration: 75, ease: 'Linear',
          onComplete: () => {
            const flipped = this.makeCard(drawnCard, destX, handY, true);
            this.animLayer.add(flipped);
            this.tweens.add({
              targets: flipped, scaleX: 1, duration: 75, ease: 'Linear',
              onComplete: () => {
                this.animLayer.removeAll(true);
                this.render(state);
              },
            });
          },
        });
      },
    });
  }

  // ── Discard animation ─────────────────────────────────────────────────────
  private animDiscardCards(removed: Card[], state: KhangGameState) {
    const discardX = W / 2, discardY = H / 2 - 10;
    const prevMe = this.gs!.players.find(p => p.playerId === this.myPlayerId)!;
    const prevN = prevMe.hand.length;
    const prevGap = Math.min(132, (W - 460) / Math.max(prevN, 1));
    const prevStartX = W / 2 - ((prevN - 1) * prevGap) / 2;
    const handY = H - 170;
    this.animLayer.removeAll(true);

    removed.forEach((card, idx) => {
      const prevIdx = prevMe.hand.findIndex(c => c.id === card.id);
      const fromX = prevStartX + prevIdx * prevGap;
      const fc = this.makeCard(card, fromX, handY, true);
      this.animLayer.add(fc);
      this.tweens.add({
        targets: fc,
        x: discardX, y: discardY,
        scaleX: 0.88, scaleY: 0.88,
        angle: Phaser.Math.Between(-18, 18),
        duration: 260, ease: 'Cubic.Out', delay: idx * 55,
        onComplete: () => {
          // Impact flash on discard pile
          const flash = this.add.graphics().setDepth(31).setAlpha(0.7);
          flash.fillStyle(0xffd700, 0.4);
          flash.fillCircle(discardX, discardY, 80);
          this.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 300, onComplete: () => flash.destroy() });
          if (idx === removed.length - 1) {
            this.time.delayedCall(100, () => {
              this.animLayer.removeAll(true);
              this.render(state);
            });
          }
        },
      });
    });
  }

  // ── Score reveal ──────────────────────────────────────────────────────────
  private showScoreReveal(players: { playerId: string; name: string; hand: Card[] }[], winnerId: string, onDone: () => void) {
    if (players.length === 0) { onDone(); return; }
    this.gs = null;
    this.ui.removeAll(true);
    this.animLayer.removeAll(true);

    // Dark overlay with blur
    const ov = this.add.graphics().setDepth(18);
    ov.fillStyle(0x000000, 0.82);
    ov.fillRect(0, 0, W, H);

    // Title with glow
    const titleGlow = this.add.graphics().setDepth(19).setAlpha(0);
    titleGlow.fillStyle(0xffd700, 0.08);
    titleGlow.fillEllipse(W / 2, 110, 700, 120);
    this.tweens.add({ targets: titleGlow, alpha: 1, duration: 400 });

    const label = this.add.text(W / 2, 100, 'เปิดไพ่ทุกคน', {
      fontSize: '44px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 7, resolution: 2,
      fontFamily: "'Segoe UI', sans-serif",
    }).setOrigin(0.5).setAlpha(0).setDepth(19);
    this.tweens.add({ targets: label, alpha: 1, y: 92, duration: 400, ease: 'Back.Out' });

    const cols = players.length <= 3 ? players.length : Math.ceil(players.length / 2);
    const colW = Math.min(350, (W - 160) / cols);
    const rowH = 340;
    const rows = Math.ceil(players.length / cols);
    const totalH = rows * rowH;
    const startY = H / 2 - totalH / 2 + 60;

    players.forEach((p, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = W / 2 - ((cols - 1) * colW) / 2 + col * colW;
      const cy = startY + row * rowH;
      const isWinner = p.playerId === winnerId;
      const total = p.hand.reduce((s, c) => s + pts(c.rank), 0);
      const isMe = p.playerId === this.myPlayerId;

      this.time.delayedCall(idx * 190, () => {
        // Winner glow behind panel
        if (isWinner) {
          const winGlow = this.add.graphics().setDepth(19).setAlpha(0);
          winGlow.fillStyle(0xffd700, 0.12);
          winGlow.fillEllipse(cx, cy, colW + 40, 300);
          this.tweens.add({ targets: winGlow, alpha: 1, scaleX: { from: 0.5, to: 1 }, scaleY: { from: 0.5, to: 1 }, duration: 400, ease: 'Back.Out' });
        }

        // Panel bg
        const bg = this.add.graphics().setDepth(19).setAlpha(0);
        if (isWinner) {
          bg.fillGradientStyle(0x1a0d00, 0x1a0d00, 0x0d0600, 0x0d0600, 0.96);
        } else {
          bg.fillGradientStyle(0x060d08, 0x060d08, 0x030806, 0x030806, 0.96);
        }
        bg.fillRoundedRect(cx - colW / 2 + 8, cy - 135, colW - 16, 270, 20);
        bg.lineStyle(isWinner ? 3 : 1.5, isWinner ? 0xffd700 : (isMe ? 0x9b59b6 : 0x1a4a2a), isWinner ? 1 : 0.7);
        bg.strokeRoundedRect(cx - colW / 2 + 8, cy - 135, colW - 16, 270, 20);
        if (isWinner) {
          bg.lineStyle(1, 0xffd700, 0.25);
          bg.strokeRoundedRect(cx - colW / 2 + 14, cy - 129, colW - 28, 258, 16);
        }
        bg.setAlpha(0);
        this.tweens.add({ targets: bg, alpha: 1, scaleX: { from: 0.75, to: 1 }, scaleY: { from: 0.75, to: 1 }, duration: 320, ease: 'Back.Out' });

        const nameT = this.add.text(cx, cy - 102, (isWinner ? '♛ ' : '') + p.name + (isMe ? ' (คุณ)' : ''), {
          fontSize: '21px', color: isWinner ? '#ffd700' : '#ddeedd', fontStyle: 'bold',
          stroke: '#000', strokeThickness: 4, resolution: 2,
        }).setOrigin(0.5).setAlpha(0).setDepth(20);
        this.tweens.add({ targets: nameT, alpha: 1, duration: 250, delay: 80 });

        const cardScale = 0.54;
        const cardGap = Math.min(52, (colW - 40) / Math.max(p.hand.length, 1));
        const cardStartX = cx - ((p.hand.length - 1) * cardGap) / 2;
        p.hand.forEach((card, ci) => {
          const cardContainer = this.makeCard(card, cardStartX + ci * cardGap, cy - 8, true);
          cardContainer.setScale(0).setDepth(20);
          this.add.existing(cardContainer);
          this.tweens.add({ targets: cardContainer, scaleX: cardScale, scaleY: cardScale, alpha: { from: 0, to: 1 }, duration: 220, delay: 120 + ci * 55, ease: 'Back.Out' });
        });

        const total2 = p.hand.reduce((s, c) => s + pts(c.rank), 0);
        const scoreColor = total2 <= 5 ? '#27ae60' : total2 <= 15 ? '#f39c12' : '#ef5350';
        const scoreT = this.add.text(cx, cy + 120, `แต้ม: ${total}`, {
          fontSize: '28px', color: scoreColor, fontStyle: 'bold',
          stroke: '#000', strokeThickness: 5, resolution: 2,
        }).setOrigin(0.5).setAlpha(0).setDepth(20);
        this.tweens.add({ targets: scoreT, alpha: 1, y: cy + 114, duration: 320, delay: 200, ease: 'Back.Out' });

        // Winner badge
        if (isWinner) {
          const badge = this.add.text(cx, cy - 146, '🏆 ผู้ชนะ', {
            fontSize: '18px', color: '#000', fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(21).setAlpha(0);
          const badgeBg = this.add.graphics().setDepth(20).setAlpha(0);
          badgeBg.fillStyle(0xffd700, 1);
          badgeBg.fillRoundedRect(cx - 66, cy - 162, 132, 30, 15);
          this.tweens.add({ targets: [badge, badgeBg], alpha: 1, duration: 300, delay: 150 });
        }
      });
    });

    const revealDuration = players.length * 190 + 2400;
    this.time.delayedCall(revealDuration, onDone);
  }

  // ── Main render ──────────────────────────────────────────────────────────
  private render(state: KhangGameState) {
    this.ui.removeAll(true);
    const me = state.players.find(p => p.playerId === this.myPlayerId);
    if (!me) return;

    const isMyCurrent = state.players[state.currentPlayerIndex]?.playerId === this.myPlayerId;
    if (!isMyCurrent) this.selectedIds = new Set();

    const myTotal = me.hand.reduce((s, c) => s + pts(c.rank), 0);
    const curName = state.players[state.currentPlayerIndex]?.name ?? '';

    let statusMsg: string;
    if (isMyCurrent) {
      statusMsg = state.waitingDiscard ? '🗑️  เลือกไพ่ที่จะทิ้ง' : `👑  เทิร์นของคุณ — แต้ม: ${myTotal}`;
    } else {
      statusMsg = `⏳  รอ ${curName}...`;
    }
    this.setStatus(statusMsg, isMyCurrent);

    this.drawCenterArea(state);
    this.drawOpponents(state);
    this.drawMyArea(me, state, isMyCurrent);
    if (isMyCurrent) this.drawActionBtns(state, me);
    if (state.flowChain.length > 0) this.drawFlowBadge(state);
  }

  // ── Center: deck + discard + pot ─────────────────────────────────────────
  private drawCenterArea(state: KhangGameState) {
    // Pot badge — premium style
    const potBg = this.add.graphics();
    potBg.fillGradientStyle(0x120c00, 0x120c00, 0x0a0800, 0x0a0800, 0.95);
    potBg.fillRoundedRect(W / 2 - 150, 88, 300, 56, 28);
    potBg.lineStyle(2, 0xdaa520, 0.9);
    potBg.strokeRoundedRect(W / 2 - 150, 88, 300, 56, 28);
    potBg.lineStyle(1, 0xffd700, 0.3);
    potBg.strokeRoundedRect(W / 2 - 144, 94, 288, 44, 22);
    // Shine
    potBg.fillStyle(0xffd700, 0.06);
    potBg.fillRoundedRect(W / 2 - 146, 90, 292, 18, 9);
    this.ui.add(potBg);
    this.uiText(W / 2, 116, `♟  ${this.betAmount * (state.players.length)} บาท`, 22, '#ffd700', 700);

    // Discard pile
    const px = W / 2, py = H / 2 - 10;
    // Shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.5);
    shadow.fillEllipse(px + 6, py + CH / 2 + 20, 240, 40);
    this.ui.add(shadow);

    if (!state.discardPile.length) {
      const empty = this.add.graphics();
      empty.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.3);
      empty.fillRoundedRect(px - CW / 2, py - CH / 2, CW, CH, CR);
      empty.lineStyle(1.5, 0xdaa520, 0.2);
      empty.strokeRoundedRect(px - CW / 2, py - CH / 2, CW, CH, CR);
      this.ui.add(empty);
      this.uiText(px, py, 'กองกลาง', 16, '#2a5030');
    } else {
      // Stack shadow cards
      for (let i = Math.min(5, state.discardPile.length - 1); i > 0; i--) {
        const g = this.add.graphics();
        g.fillStyle(0x0e4a20, 0.5 - i * 0.08);
        g.fillRoundedRect(px - CW / 2 + i * 2.5, py - CH / 2 - i * 2.5, CW, CH, CR);
        this.ui.add(g);
      }
      const topCard = this.makeCard(state.discardPile.at(-1)!, px, py, true);
      this.ui.add(topCard);
    }

    // Discard label
    const dlb = this.add.graphics();
    dlb.fillGradientStyle(0x080808, 0x080808, 0x040404, 0x040404, 0.85);
    dlb.fillRoundedRect(px - 72, py + CH / 2 + 10, 144, 34, 17);
    dlb.lineStyle(1, 0x5a4a00, 0.5);
    dlb.strokeRoundedRect(px - 72, py + CH / 2 + 10, 144, 34, 17);
    this.ui.add(dlb);
    this.uiText(px, py + CH / 2 + 27, `กองทิ้ง  ${state.discardPile.length}`, 16, '#c8a44a');

    // Deck
    const dx = W - 175, dy = H / 2 - 10;
    const depth = Math.min(8, Math.ceil(state.deck.length / 5));
    for (let i = depth - 1; i >= 0; i--) {
      this.ui.add(this.makeCard({ id: 'hidden', suit: 'S', rank: 1 }, dx - i * 2.5, dy - i * 2, false));
    }
    // Card count badge
    const cb = this.add.graphics();
    cb.fillGradientStyle(0x5a0090, 0x4a0070, 0x380050, 0x5a0090, 1);
    cb.fillCircle(dx + CW / 2 - 12, dy - CH / 2 + 12, 24);
    cb.lineStyle(2, 0xce93d8, 0.85);
    cb.strokeCircle(dx + CW / 2 - 12, dy - CH / 2 + 12, 24);
    this.ui.add(cb);
    this.uiText(dx + CW / 2 - 12, dy - CH / 2 + 12, String(state.deck.length), 15, '#fff', 700);

    const dlb2 = this.add.graphics();
    dlb2.fillGradientStyle(0x080808, 0x080808, 0x040404, 0x040404, 0.85);
    dlb2.fillRoundedRect(dx - 64, dy + CH / 2 + 10, 128, 34, 17);
    dlb2.lineStyle(1, 0x5a4a00, 0.5);
    dlb2.strokeRoundedRect(dx - 64, dy + CH / 2 + 10, 128, 34, 17);
    this.ui.add(dlb2);
    this.uiText(dx, dy + CH / 2 + 27, `สำรับ  ${state.deck.length}`, 16, '#c8a44a');
  }

  // ── Opponents ────────────────────────────────────────────────────────────
  private drawOpponents(state: KhangGameState) {
    const ops = state.players.filter(p => p.playerId !== this.myPlayerId);
    const pos = this.opponentPositions(ops.length);
    ops.forEach((p, i) => {
      const isCur = state.players[state.currentPlayerIndex]?.playerId === p.playerId;
      this.drawPlayerSlot(p, pos[i].x, pos[i].y, isCur, false);
    });
  }

  private drawPlayerSlot(p: KhangPlayerState, x: number, y: number, isCur: boolean, isMe: boolean) {
    // Seat spotlight glow
    if (isCur) {
      const spotGlow = this.add.graphics();
      spotGlow.fillGradientStyle(0x9b59b6, 0x9b59b6, 0x9b59b6, 0x9b59b6, 0, 0, 0.12, 0);
      spotGlow.fillEllipse(x, y, 340, 260);
      this.ui.add(spotGlow);
    } else if (isMe) {
      const myGlow = this.add.graphics();
      myGlow.fillGradientStyle(0x27ae60, 0x27ae60, 0x27ae60, 0x27ae60, 0, 0, 0.07, 0);
      myGlow.fillEllipse(x, y, 340, 260);
      this.ui.add(myGlow);
    }

    const avR = isMe ? 48 : 40;
    const avY = isMe ? y : y + 10;

    // Avatar outer glow ring
    const frameKey = p.avatarFrame ?? (isMe ? this.avatarFrame : undefined) ?? 'none';
    const frameHex = FRAME_HEX[frameKey] ?? FRAME_HEX.none;

    if (isCur) {
      const pulseGlow = this.add.graphics();
      pulseGlow.lineStyle(18, frameHex, 0.15);
      pulseGlow.strokeCircle(x, avY, avR + 20);
      this.ui.add(pulseGlow);
    }

    if (frameKey !== 'none') {
      const glow = this.add.graphics();
      glow.lineStyle(12, frameHex, 0.18);
      glow.strokeCircle(x, avY, avR + 11);
      this.ui.add(glow);
    }

    // Avatar ring
    const ring = this.add.graphics();
    ring.lineStyle(isCur ? 4 : 3, frameHex, isCur ? 1 : 0.75);
    ring.strokeCircle(x, avY, avR + 3);
    this.ui.add(ring);

    // Avatar bg
    const avBg = this.add.graphics();
    avBg.fillGradientStyle(0x0a1a10, 0x0a1a10, 0x050d08, 0x050d08, 1);
    avBg.fillCircle(x, avY, avR);
    this.ui.add(avBg);

    // Avatar image
    const seed = p.avatarSeed ?? (isMe ? this.avatarSeed : undefined) ?? p.name;
    const avKey = `av_${seed}`;
    if (this.textures.exists(avKey)) {
      const avImg = this.add.image(x, avY, avKey);
      avImg.setDisplaySize(avR * 1.8, avR * 1.8);
      this.ui.add(avImg);
    } else {
      this.uiText(x, avY, p.isBot ? '🤖' : '👤', avR * 0.9, '#fff');
      this.ensureAvatar(seed);
    }

    // Current-turn animated pulse ring
    if (isCur) {
      const pulse = this.add.graphics();
      pulse.lineStyle(3, 0x9b59b6, 0.9);
      pulse.strokeCircle(x, avY, avR + 15);
      this.ui.add(pulse);
      this.tweens.add({
        targets: pulse,
        alpha: { from: 0.9, to: 0 },
        scaleX: { from: 1, to: 1.5 }, scaleY: { from: 1, to: 1.5 },
        duration: 1100, repeat: -1, ease: 'Sine.Out',
      });
      const pulse2 = this.add.graphics();
      pulse2.lineStyle(2, 0xce93d8, 0.5);
      pulse2.strokeCircle(x, avY, avR + 15);
      this.ui.add(pulse2);
      this.tweens.add({
        targets: pulse2,
        alpha: { from: 0.5, to: 0 },
        scaleX: { from: 1, to: 1.7 }, scaleY: { from: 1, to: 1.7 },
        duration: 1400, repeat: -1, ease: 'Sine.Out', delay: 200,
      });
    }

    // Name badge — glass morphism
    const nameY = avY + avR + 26;
    const nameBg = this.add.graphics();
    nameBg.fillGradientStyle(
      isCur ? 0x1e0838 : 0x060e0a,
      isCur ? 0x1e0838 : 0x060e0a,
      isCur ? 0x100420 : 0x030804,
      isCur ? 0x100420 : 0x030804, 0.95
    );
    nameBg.fillRoundedRect(x - 112, nameY - 20, 224, 40, 20);
    nameBg.lineStyle(isCur ? 2 : 1, isCur ? 0x9b59b6 : 0x1a4a28, isCur ? 1 : 0.65);
    nameBg.strokeRoundedRect(x - 112, nameY - 20, 224, 40, 20);
    // Shine
    nameBg.fillStyle(0xffffff, 0.05);
    nameBg.fillRoundedRect(x - 108, nameY - 18, 216, 12, 6);
    this.ui.add(nameBg);
    this.uiText(x, nameY, `${p.isBot ? '🤖 ' : ''}${p.name}`, isMe ? 20 : 18, isCur ? '#ce93d8' : '#ddeedd', 700);

    // Opponent hand fan
    if (!isMe) {
      const fanY = avY - avR - 20;
      p.hand.forEach((card, j) => {
        const angle = (j - (p.hand.length - 1) / 2) * 9;
        const cx = x + (j - (p.hand.length - 1) / 2) * 17;
        const c = this.makeCard(card, cx, fanY - 52, card.id !== 'hidden');
        c.setRotation(Phaser.Math.DegToRad(angle));
        this.ui.add(c);
      });
      const ccbg = this.add.graphics();
      ccbg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.8);
      ccbg.fillRoundedRect(x - 32, fanY - 14, 64, 28, 14);
      ccbg.lineStyle(1, 0x5a4a00, 0.4);
      ccbg.strokeRoundedRect(x - 32, fanY - 14, 64, 28, 14);
      this.ui.add(ccbg);
      this.uiText(x, fanY + 1, `${p.hand.length} ใบ`, 15, '#c8a44a', 600);
    }

    // Score panel for my seat
    if (isMe) {
      const total = p.hand.reduce((s, c) => s + pts(c.rank), 0);
      const scoreHex = total <= 5 ? '#27ae60' : total <= 15 ? '#f39c12' : '#ef5350';
      const scoreInt = total <= 5 ? 0x27ae60 : total <= 15 ? 0xf39c12 : 0xef5350;
      const sbg = this.add.graphics();
      sbg.fillGradientStyle(0x060e0a, 0x060e0a, 0x030804, 0x030804, 0.95);
      sbg.fillRoundedRect(x + avR + 16, avY - 34, 114, 68, 18);
      sbg.lineStyle(2, scoreInt, 0.7);
      sbg.strokeRoundedRect(x + avR + 16, avY - 34, 114, 68, 18);
      sbg.fillStyle(scoreInt, 0.08);
      sbg.fillRoundedRect(x + avR + 16, avY - 34, 114, 68, 18);
      this.ui.add(sbg);
      this.uiText(x + avR + 73, avY - 14, 'แต้ม', 12, '#888');
      this.uiText(x + avR + 73, avY + 15, String(total), 30, scoreHex, 800);
    }
  }

  private opponentPositions(n: number) {
    if (n === 1) return [{ x: W / 2, y: 345 }];
    if (n === 2) return [{ x: W / 2 - 345, y: 315 }, { x: W / 2 + 345, y: 315 }];
    if (n === 3) return [{ x: W / 2, y: 275 }, { x: W / 2 - 435, y: 385 }, { x: W / 2 + 435, y: 385 }];
    return [{ x: W / 2 - 225, y: 285 }, { x: W / 2 + 225, y: 285 }, { x: W / 2 - 455, y: 405 }, { x: W / 2 + 455, y: 405 }];
  }

  // ── My area ───────────────────────────────────────────────────────────────
  private drawMyArea(me: KhangPlayerState, state: KhangGameState, isMyCurrent: boolean) {
    const myX = 168, myY = H - 195;
    const meWithAv: KhangPlayerState = { ...me, avatarSeed: me.avatarSeed ?? this.avatarSeed, avatarFrame: me.avatarFrame ?? this.avatarFrame };
    this.drawPlayerSlot(meWithAv, myX, myY, isMyCurrent, true);

    // Hand area label
    const lb = this.add.graphics();
    lb.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.7);
    lb.fillRoundedRect(W / 2 - 260, H - 316, 520, 36, 18);
    lb.lineStyle(1, 0x5a4a00, 0.4);
    lb.strokeRoundedRect(W / 2 - 260, H - 316, 520, 36, 18);
    this.ui.add(lb);
    this.uiText(W / 2, H - 298, `มือของคุณ  (${me.hand.length} ใบ)`, 17, '#c8a44a', 600);

    const handY = H - 168;
    const n = me.hand.length;
    const gap = Math.min(132, (W - 460) / Math.max(n, 1));
    const startX = W / 2 - ((n - 1) * gap) / 2;
    const flowRank = state.lastDiscard?.rank;

    me.hand.forEach((card, i) => {
      const x = startX + i * gap;
      const isSel = this.selectedIds.has(card.id);
      const canFlow = !state.waitingDiscard && flowRank !== undefined && card.rank === flowRank;
      const cardY = isSel ? handY - 48 : handY;

      // Flow highlight ring
      if (canFlow) {
        const fg = this.add.graphics();
        fg.lineStyle(4, 0xff9800, 1);
        fg.strokeRoundedRect(x - CW / 2 - 10, cardY - CH / 2 - 10, CW + 20, CH + 20, CR + 5);
        fg.fillStyle(0xff9800, 0.08);
        fg.fillRoundedRect(x - CW / 2 - 10, cardY - CH / 2 - 10, CW + 20, CH + 20, CR + 5);
        this.ui.add(fg);
        // Flow badge
        const fb = this.add.graphics();
        fb.fillGradientStyle(0xff6600, 0xff9800, 0xe65100, 0xff6600, 1);
        fb.fillRoundedRect(x - 30, cardY + CH / 2 + 8, 60, 26, 13);
        this.ui.add(fb);
        this.uiText(x, cardY + CH / 2 + 21, '⚡ ไหล', 13, '#fff', 700);
      }

      // Selected highlight
      if (isSel) {
        const sg = this.add.graphics();
        sg.lineStyle(4, 0xce93d8, 1);
        sg.strokeRoundedRect(x - CW / 2 - 9, cardY - CH / 2 - 9, CW + 18, CH + 18, CR + 4);
        sg.fillStyle(0xce93d8, 0.08);
        sg.fillRoundedRect(x - CW / 2 - 9, cardY - CH / 2 - 9, CW + 18, CH + 18, CR + 4);
        this.ui.add(sg);
        // Selected glow
        const selGlow = this.add.graphics();
        selGlow.lineStyle(12, 0xce93d8, 0.2);
        selGlow.strokeRoundedRect(x - CW / 2 - 16, cardY - CH / 2 - 16, CW + 32, CH + 32, CR + 8);
        this.ui.add(selGlow);
      }

      const c = this.makeCard(card, x, cardY, true);
      c.setInteractive(new Phaser.Geom.Rectangle(-CW / 2, -CH / 2, CW, CH), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', () => {
        if (card.id === 'hidden') return;
        if (!state.waitingDiscard) {
          this.selectedIds = this.selectedIds.has(card.id) ? new Set() : new Set([card.id]);
        } else {
          if (this.selectedIds.has(card.id)) {
            this.selectedIds.delete(card.id);
          } else {
            const sel = me.hand.filter(c2 => this.selectedIds.has(c2.id));
            const existingRank = sel[0]?.rank;
            if (!existingRank || existingRank === card.rank) {
              this.selectedIds.add(card.id);
            } else {
              this.selectedIds = new Set([card.id]);
            }
          }
        }
        if (this.gs) this.render(this.gs);
      });
      c.on('pointerover', () => { if (!isSel) { c.setY(cardY - 18); c.setScale(1.04); } });
      c.on('pointerout', () => { if (!isSel) { c.setY(cardY); c.setScale(1); } });
      this.ui.add(c);

      // Point badge
      const p = pts(card.rank);
      const bc = p >= 10 ? 0xb71c1c : p >= 7 ? 0xe65100 : 0x1b5e20;
      const bbg = this.add.graphics();
      bbg.fillGradientStyle(bc, bc, Phaser.Display.Color.IntegerToColor(bc).darken(20).color, Phaser.Display.Color.IntegerToColor(bc).darken(20).color, 1);
      bbg.fillCircle(x + CW / 2 - 15, cardY - CH / 2 + 15, 20);
      bbg.lineStyle(2, 0xffffff, 0.3);
      bbg.strokeCircle(x + CW / 2 - 15, cardY - CH / 2 + 15, 20);
      this.ui.add(bbg);
      this.uiText(x + CW / 2 - 15, cardY - CH / 2 + 15, String(p), 15, '#fff', 700);
    });
  }

  // ── Action buttons ────────────────────────────────────────────────────────
  private drawActionBtns(state: KhangGameState, me: KhangPlayerState) {
    const y = H - 44;
    const flowRank = state.lastDiscard?.rank;
    const flowCards = me.hand.filter(c => c.rank === flowRank);

    if (state.waitingDiscard) {
      const selIds = [...this.selectedIds];
      const selCount = selIds.length;
      const hint = selCount === 0
        ? 'เลือกไพ่ที่จะทิ้ง  (เลขเดียวกันเลือกหลายใบได้)'
        : `เลือกแล้ว ${selCount} ใบ — กดทิ้ง`;
      this.uiText(W / 2, y - 32, hint, 17, selCount > 0 ? '#ce93d8' : '#7c7c9c');
      if (selCount > 0) {
        const label = selCount > 1 ? `🗑  ทิ้ง ${selCount} ใบพร้อมกัน` : '🗑  ทิ้งไพ่นี้';
        this.ui.add(this.btn(label, W / 2, y, 0xb71c1c, 0x7f0000, 0xef5350, () => {
          getSocket().emit('kh:discard', { roomId: this.roomId, cardIds: selIds });
          this.selectedIds = new Set();
        }, 330, 64));
      }
    } else {
      this.ui.add(this.btn('👑  แคง', W / 2 - 420, y, 0x6a1b9a, 0x4a148c, 0x9b59b6, () => {
        getSocket().emit('kh:khang', { roomId: this.roomId });
      }, 250, 64));

      this.ui.add(this.btn('🃏  จั่วไพ่', W / 2, y, 0x0d47a1, 0x082060, 0x3f8de0, () => {
        getSocket().emit('kh:draw', { roomId: this.roomId });
        this.selectedIds = new Set();
      }, 250, 64));

      if (flowCards.length > 0 && flowRank !== undefined) {
        const label = flowCards.length > 1
          ? `⚡  ไหล ${flowCards.length} ใบ (${rl(flowRank)})`
          : `⚡  ไหล (${rl(flowRank)})`;
        this.ui.add(this.btn(label, W / 2 + 420, y, 0xe65100, 0xbf360c, 0xff9800, () => {
          getSocket().emit('kh:flow', { roomId: this.roomId, cardId: flowCards[0].id });
        }, 320, 64));
      }
    }
  }

  // ── Flow badge ────────────────────────────────────────────────────────────
  private drawFlowBadge(state: KhangGameState) {
    const last = state.flowChain.at(-1);
    if (!last) return;
    const name = state.players.find(p => p.playerId === last.playerId)?.name ?? '?';
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a1200, 0x2a1200, 0x180a00, 0x180a00, 0.9);
    bg.fillRoundedRect(W / 2 - 290, 162, 580, 48, 24);
    bg.lineStyle(1.5, 0xff9800, 0.8);
    bg.strokeRoundedRect(W / 2 - 290, 162, 580, 48, 24);
    bg.fillStyle(0xff9800, 0.06);
    bg.fillRoundedRect(W / 2 - 286, 164, 572, 44, 22);
    this.ui.add(bg);
    this.uiText(W / 2, 186, `⚡  ${name} ไหล ${last.cardIds.length} ใบ!`, 20, '#ff9800', 700);
  }

  // ── Card factory ──────────────────────────────────────────────────────────
  private makeCard(card: Card, x: number, y: number, faceUp: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    // Drop shadow (multi-layer for depth)
    const sh1 = this.add.graphics();
    sh1.fillStyle(0x000000, 0.5);
    sh1.fillRoundedRect(-CW / 2 + 6, -CH / 2 + 10, CW, CH, CR);
    c.add(sh1);
    const sh2 = this.add.graphics();
    sh2.fillStyle(0x000000, 0.25);
    sh2.fillRoundedRect(-CW / 2 + 3, -CH / 2 + 5, CW, CH, CR);
    c.add(sh2);

    const key = (!faceUp || card.id === 'hidden') ? 'card_back' : khCardKey(card.suit, card.rank);
    const img = this.add.image(0, 0, key);
    img.setDisplaySize(CW, CH);
    c.add(img);

    // Face-up shine overlay
    if (faceUp && card.id !== 'hidden') {
      const shine = this.add.graphics();
      shine.fillStyle(0xffffff, 0.08);
      shine.fillRoundedRect(-CW / 2 + 2, -CH / 2 + 2, CW - 4, CH * 0.35, CR - 2);
      c.add(shine);
    }

    return c;
  }

  // ── Premium button ────────────────────────────────────────────────────────
  private btn(label: string, x: number, y: number, col: number, hov: number, border: number, cb: () => void, w = 250, h = 64): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    // Outer ambient glow
    const outerGlow = this.add.graphics();
    outerGlow.fillStyle(col, 0.16);
    outerGlow.fillEllipse(0, 8, w + 40, h + 20);
    c.add(outerGlow);

    // Drop shadow
    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.5);
    sh.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, h / 2);
    c.add(sh);

    // Main gradient background
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      Phaser.Display.Color.IntegerToColor(col).lighten(15).color,
      Phaser.Display.Color.IntegerToColor(col).lighten(15).color,
      Phaser.Display.Color.IntegerToColor(col).darken(15).color,
      Phaser.Display.Color.IntegerToColor(col).darken(15).color, 1
    );
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);

    // Top shine strip
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.22);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.4, h / 2 - 2);
    c.add(shine);

    // Border
    const bdr = this.add.graphics();
    bdr.lineStyle(2, border, 0.9);
    bdr.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bdr);
    bdr.lineStyle(1, 0xffffff, 0.15);
    bdr.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, h / 2 - 2);

    const t = this.add.text(0, 0, label, {
      fontSize: '22px', color: '#fff', fontStyle: 'bold',
      fontFamily: "'Segoe UI', sans-serif",
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5);
    c.add(t);

    c.setSize(w, h).setInteractive();
    c.on('pointerdown', () => {
      c.setScale(0.93);
      bg.clear();
      bg.fillGradientStyle(hov, hov, Phaser.Display.Color.IntegerToColor(hov).darken(20).color, Phaser.Display.Color.IntegerToColor(hov).darken(20).color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      // Click ripple
      const ripple = this.add.graphics().setDepth(50);
      ripple.fillStyle(0xffffff, 0.3);
      ripple.fillCircle(0, 0, 20);
      ripple.x = x; ripple.y = y;
      this.tweens.add({ targets: ripple, scaleX: 5, scaleY: 3, alpha: 0, duration: 350, onComplete: () => ripple.destroy() });
      this.time.delayedCall(120, () => { c.setScale(1); cb(); });
    });
    c.on('pointerover', () => {
      bg.clear();
      bg.fillGradientStyle(hov, hov, Phaser.Display.Color.IntegerToColor(hov).darken(10).color, Phaser.Display.Color.IntegerToColor(hov).darken(10).color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      outerGlow.setAlpha(0.5);
      this.tweens.add({ targets: c, y: y - 6, duration: 120, ease: 'Sine.Out' });
    });
    c.on('pointerout', () => {
      bg.clear();
      bg.fillGradientStyle(
        Phaser.Display.Color.IntegerToColor(col).lighten(15).color,
        Phaser.Display.Color.IntegerToColor(col).lighten(15).color,
        Phaser.Display.Color.IntegerToColor(col).darken(15).color,
        Phaser.Display.Color.IntegerToColor(col).darken(15).color, 1
      );
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      outerGlow.setAlpha(1);
      this.tweens.add({ targets: c, y, duration: 120, ease: 'Sine.Out' });
    });
    return c;
  }

  // ── uiText ────────────────────────────────────────────────────────────────
  private uiText(x: number, y: number, text: string, size: number, color: string, weight = 400) {
    const t = this.add.text(x, y, text, {
      fontSize: `${size}px`, color,
      fontStyle: weight >= 700 ? 'bold' : 'normal',
      fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
      resolution: 2,
    }).setOrigin(0.5);
    this.ui.add(t);
    return t;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  private toast(msg: string, bgColor = 0x000000) {
    const bg = this.add.graphics().setDepth(40);
    bg.fillGradientStyle(bgColor, bgColor, Phaser.Display.Color.IntegerToColor(bgColor).darken(30).color, Phaser.Display.Color.IntegerToColor(bgColor).darken(30).color, 0.92);
    bg.fillRoundedRect(W / 2 - 380, H / 2 - 210, 760, 84, 32);
    bg.lineStyle(2, bgColor, 0.9);
    bg.strokeRoundedRect(W / 2 - 380, H / 2 - 210, 760, 84, 32);
    // Shine
    bg.fillStyle(0xffffff, 0.08);
    bg.fillRoundedRect(W / 2 - 376, H / 2 - 208, 752, 24, 12);

    const t = this.add.text(W / 2, H / 2 - 168, msg, {
      fontSize: '27px', color: '#fff', fontStyle: 'bold', resolution: 2,
      fontFamily: "'Segoe UI', sans-serif",
    }).setOrigin(0.5).setDepth(41);
    this.tweens.add({
      targets: [bg, t], alpha: { from: 1, to: 0 },
      delay: 2400, duration: 500,
      onComplete: () => { bg.destroy(); t.destroy(); },
    });
  }

  // ── Result overlay ────────────────────────────────────────────────────────
  private showResult(win: boolean, pot: number) {
    this.gs = null;
    this.ui.removeAll(true);

    // Dim overlay
    const ov = this.add.graphics().setDepth(20);
    ov.fillStyle(0x000000, 0.85);
    ov.fillRect(0, 0, W, H);

    const pw = 900, ph = 580;
    const px = W / 2, py = H / 2;

    // Panel glow ring
    const panelGlow = this.add.graphics().setDepth(20);
    panelGlow.lineStyle(40, win ? 0xffd700 : 0xc62828, 0.08);
    panelGlow.strokeRoundedRect(px - pw / 2 - 20, py - ph / 2 - 20, pw + 40, ph + 40, 54);

    // Panel shadow
    const shadow = this.add.graphics().setDepth(20);
    shadow.fillStyle(0x000000, 0.6);
    shadow.fillRoundedRect(px - pw / 2 + 14, py - ph / 2 + 20, pw, ph, 46);

    // Main panel
    const panel = this.add.graphics().setDepth(21);
    panel.fillGradientStyle(
      win ? 0x18083c : 0x2e0a0a,
      win ? 0x18083c : 0x2e0a0a,
      win ? 0x0a0420 : 0x180404,
      win ? 0x0a0420 : 0x180404, 1
    );
    panel.fillRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 46);
    panel.lineStyle(4, win ? 0xffd700 : 0xc62828, 1);
    panel.strokeRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 46);
    panel.lineStyle(1.5, win ? 0xffd700 : 0xff8888, 0.25);
    panel.strokeRoundedRect(px - pw / 2 + 10, py - ph / 2 + 10, pw - 20, ph - 20, 38);

    // Top accent line
    const accentLine = this.add.graphics().setDepth(22);
    accentLine.fillGradientStyle(
      win ? 0xffd700 : 0xc62828,
      win ? 0xffd700 : 0xc62828,
      win ? 0xdaa520 : 0x8b0000,
      win ? 0xdaa520 : 0x8b0000, 1
    );
    accentLine.fillRoundedRect(px - 120, py - ph / 2 - 6, 240, 12, 6);

    // Icon circle
    const iconBg = this.add.graphics().setDepth(22).setAlpha(0);
    iconBg.fillGradientStyle(
      win ? 0xffd700 : 0xc62828,
      win ? 0xdaa520 : 0x8b0000,
      win ? 0xdaa520 : 0x8b0000,
      win ? 0xb8860b : 0x6b0000, 1
    );
    iconBg.fillCircle(px, py - ph / 2 + 84, 60);
    iconBg.lineStyle(5, win ? 0xfff8dc : 0xff6666, 0.7);
    iconBg.strokeCircle(px, py - ph / 2 + 84, 60);
    iconBg.lineStyle(2, win ? 0xffd700 : 0xc62828, 0.3);
    iconBg.strokeCircle(px, py - ph / 2 + 84, 80);

    this.tweens.add({
      targets: iconBg, alpha: 1,
      scaleX: { from: 0.1, to: 1 }, scaleY: { from: 0.1, to: 1 },
      duration: 550, ease: 'Back.Out',
    });

    // Icon text
    const iconTxt = this.add.text(px, py - ph / 2 + 84, win ? '♛' : '✕', {
      fontSize: win ? '56px' : '64px', color: win ? '#1a0848' : '#1a0000',
      fontStyle: 'bold', resolution: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this.tweens.add({ targets: iconTxt, alpha: 1, duration: 400, delay: 200 });

    // Title
    const titleTxt = this.add.text(px, py - 126, win ? 'ชนะ!' : 'แพ้', {
      fontSize: '84px', color: win ? '#ffd700' : '#ef5350', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 9, resolution: 2,
      fontFamily: "'Segoe UI', sans-serif",
    }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this.tweens.add({ targets: titleTxt, alpha: 1, y: py - 134, duration: 560, delay: 180, ease: 'Back.Out' });

    const subTxt = this.add.text(px, py - 58, win ? 'คุณชนะรอบนี้!' : 'เสียโชคครั้งนี้', {
      fontSize: '28px', color: win ? '#e8d5ff' : '#ffb3b3', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this.tweens.add({ targets: subTxt, alpha: 1, duration: 500, delay: 340 });

    // Divider
    const div = this.add.graphics().setDepth(22).setAlpha(0);
    div.lineStyle(1, win ? 0xffd700 : 0xc62828, 0.35);
    div.lineBetween(px - 320, py + 2, px + 320, py + 2);
    this.tweens.add({ targets: div, alpha: 1, duration: 400, delay: 440 });

    if (win) {
      const potLabel = this.add.text(px, py + 44, 'เงินที่ได้รับ', {
        fontSize: '22px', color: '#aaa', resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      const potAmt = this.add.text(px, py + 92, `+ ${pot.toLocaleString()} บาท`, {
        fontSize: '56px', color: '#ffd700', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 6, resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      this.tweens.add({ targets: potLabel, alpha: 1, duration: 500, delay: 490 });
      this.tweens.add({ targets: potAmt, alpha: 1, scaleX: { from: 0.6, to: 1 }, scaleY: { from: 0.6, to: 1 }, duration: 620, delay: 570, ease: 'Back.Out' });

      // Coin burst
      for (let i = 0; i < 28; i++) {
        this.time.delayedCall(i * 70, () => {
          const sx = Phaser.Math.Between(px - 400, px + 400);
          const coin = this.add.graphics().setDepth(24);
          const coinR = Phaser.Math.Between(7, 16);
          const coinColor = [0xffd700, 0xf4c430, 0xdaa520, 0xfff8dc][i % 4];
          coin.fillGradientStyle(coinColor, coinColor, Phaser.Display.Color.IntegerToColor(coinColor).darken(30).color, Phaser.Display.Color.IntegerToColor(coinColor).darken(30).color, 1);
          coin.fillCircle(0, 0, coinR);
          coin.lineStyle(2, 0xfff8dc, 0.4);
          coin.strokeCircle(0, 0, coinR);
          coin.x = sx; coin.y = py - 230;
          this.tweens.add({
            targets: coin,
            alpha: { from: 1, to: 0 },
            y: py - 230 - Phaser.Math.Between(80, 300),
            x: coin.x + Phaser.Math.Between(-60, 60),
            angle: Phaser.Math.Between(-180, 180),
            duration: Phaser.Math.Between(800, 1400),
            onComplete: () => coin.destroy(),
          });
        });
      }

      // Sparkle stars
      for (let i = 0; i < 16; i++) {
        this.time.delayedCall(i * 130 + 400, () => {
          const sp = this.add.text(
            Phaser.Math.Between(px - 380, px + 380),
            Phaser.Math.Between(py - ph / 2 + 20, py + ph / 2 - 20),
            ['✦', '★', '✶', '✸'][i % 4],
            { fontSize: `${Phaser.Math.Between(16, 36)}px`, color: '#ffd700' }
          ).setAlpha(0).setDepth(25);
          this.tweens.add({ targets: sp, alpha: { from: 0, to: 0.9 }, y: sp.y - 50, duration: 800, yoyo: true, onComplete: () => sp.destroy() });
        });
      }
    } else {
      const loseLabel = this.add.text(px, py + 54, 'เสียเงิน', { fontSize: '22px', color: '#888', resolution: 2 }).setOrigin(0.5).setAlpha(0).setDepth(23);
      const loseAmt = this.add.text(px, py + 102, `- ${this.betAmount.toLocaleString()} บาท`, {
        fontSize: '52px', color: '#ef5350', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 6, resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      this.tweens.add({ targets: loseLabel, alpha: 1, duration: 500, delay: 440 });
      this.tweens.add({ targets: loseAmt, alpha: 1, duration: 500, delay: 540 });
    }

    // Buttons
    const btnY = py + ph / 2 - 82;
    const playBtn = this.premiumBtn(px - 204, btnY, win ? 0x6a1b9a : 0x1a237e, win ? 0x4a148c : 0x0d47a1, win ? 0x9b59b6 : 0x5c6bc0, 'เล่นต่อ', () => {
      window.dispatchEvent(new CustomEvent('khang:play_again'));
    });
    playBtn.setDepth(24).setAlpha(0);
    this.add.existing(playBtn);
    this.tweens.add({ targets: playBtn, alpha: 1, y: btnY - 8, duration: 460, delay: 680, ease: 'Back.Out' });

    const lobbyBtn = this.premiumBtn(px + 204, btnY, 0x1b5e20, 0x0a3d15, 0x2e7d32, 'กลับ Lobby', () => {
      window.location.href = '/';
    });
    lobbyBtn.setDepth(24).setAlpha(0);
    this.add.existing(lobbyBtn);
    this.tweens.add({ targets: lobbyBtn, alpha: 1, y: btnY - 8, duration: 460, delay: 760, ease: 'Back.Out' });
  }

  // ── Premium result button ─────────────────────────────────────────────────
  private premiumBtn(x: number, y: number, col: number, hov: number, border: number, label: string, cb: () => void): Phaser.GameObjects.Container {
    const w = 356, h = 82;
    const c = this.add.container(x, y);

    const glow = this.add.graphics();
    glow.fillStyle(col, 0.2);
    glow.fillEllipse(0, 10, w + 50, h + 28);
    c.add(glow);

    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.55);
    sh.fillRoundedRect(-w / 2 + 5, -h / 2 + 7, w, h, h / 2);
    c.add(sh);

    const bg = this.add.graphics();
    bg.fillGradientStyle(
      Phaser.Display.Color.IntegerToColor(col).lighten(20).color, col,
      Phaser.Display.Color.IntegerToColor(col).darken(20).color,
      Phaser.Display.Color.IntegerToColor(col).darken(10).color, 1
    );
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);

    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.18);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.38, h / 2 - 2);
    c.add(shine);

    const bdr = this.add.graphics();
    bdr.lineStyle(2.5, border, 0.9);
    bdr.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bdr);

    const t = this.add.text(0, 1, label, {
      fontSize: '28px', color: '#fff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
      fontFamily: "'Segoe UI', sans-serif",
    }).setOrigin(0.5);
    c.add(t);

    c.setSize(w, h).setInteractive();
    c.on('pointerdown', () => {
      c.setScale(0.93);
      this.time.delayedCall(130, () => { c.setScale(1); cb(); });
    });
    c.on('pointerover', () => {
      bg.clear();
      bg.fillGradientStyle(hov, hov, Phaser.Display.Color.IntegerToColor(hov).darken(20).color, Phaser.Display.Color.IntegerToColor(hov).darken(20).color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      glow.setAlpha(0.5);
      this.tweens.add({ targets: c, y: y - 7, duration: 110, ease: 'Sine.Out' });
    });
    c.on('pointerout', () => {
      bg.clear();
      bg.fillGradientStyle(
        Phaser.Display.Color.IntegerToColor(col).lighten(20).color, col,
        Phaser.Display.Color.IntegerToColor(col).darken(20).color,
        Phaser.Display.Color.IntegerToColor(col).darken(10).color, 1
      );
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      glow.setAlpha(1);
      this.tweens.add({ targets: c, y, duration: 110, ease: 'Sine.Out' });
    });
    return c;
  }

  destroy() {
    const s = getSocket();
    s.off('kh:state'); s.off('kh:finished'); s.off('kh:wrong_khang');
  }
}
