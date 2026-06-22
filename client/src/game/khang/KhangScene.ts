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
const CW = 108;
const CH = 152;
const CR = 12;

const FRAME_HEX: Record<string, number> = {
  gold: 0xffd700, silver: 0xbdc3c7, bronze: 0xcd7f32,
  blue: 0x3498db, red: 0xe74c3c, purple: 0x9b59b6, green: 0x27ae60,
  none: 0x445544,
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
  private pendingState: KhangGameState | null = null; // state ที่มาระหว่าง dealing
  private animLayer!: Phaser.GameObjects.Container; // สำหรับ flying cards ทุกชนิด
  private prevHandIds: string[] = []; // ติดตามไพ่ก่อนหน้า เพื่อตรวจ draw/discard

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
    this.createHUD();
    this.setupSockets();
    getSocket().emit('kh:start', { roomId: this.roomId });
  }

  // ── load avatar SVG on-demand ────────────────────────────────────────────
  private ensureAvatar(seed: string) {
    const key = `av_${seed}`;
    if (this.textures.exists(key) || this.loadingAvatars.has(key)) return;
    this.loadingAvatars.add(key);
    this.load.svg(key, dicebearUrl(seed), { width: 80, height: 80 });
    this.load.once('complete', () => {
      // ไม่ render ระหว่าง dealing animation
      if (this.gs && !this.dealing) this.render(this.gs);
    });
    this.load.start();
  }

  // ── Background ───────────────────────────────────────────────────────────
  private drawBg() {
    // outer dark frame
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x04080f, 0x04080f, 0x020509, 0x020509, 1);
    bg.fillRect(0, 0, W, H);

    // main felt oval
    const felt = this.add.graphics();
    felt.fillStyle(0x0b5c2e, 1);
    felt.fillEllipse(W / 2, H / 2, W - 36, H - 36);

    // lighter center
    felt.fillStyle(0x0d6b34, 1);
    felt.fillEllipse(W / 2, H / 2, W - 110, H - 110);

    // felt grid texture
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
    // diagonal grain
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
    this.add.text(W / 2, H / 2 + 8, '♠', {
      fontSize: '100px', color: '#ffd700',
    }).setOrigin(0.5).setAlpha(0.05);

    // corner diamond ornaments
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

  // ── HUD status bar ───────────────────────────────────────────────────────
  private createHUD() {
    this.statusBg = this.add.graphics();
    this.statusTxt = this.add.text(W / 2, 44, '', {
      fontSize: '28px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 5, resolution: 2,
    }).setOrigin(0.5).setDepth(10);
    this.setStatus('กำลังโหลด...', false);
  }

  private setStatus(text: string, isMyTurn: boolean) {
    const bw = Math.max(620, text.length * 17 + 80);
    this.statusBg.clear();
    if (isMyTurn) {
      this.statusBg.fillStyle(0x9b59b6, 0.15);
      this.statusBg.fillRoundedRect(W / 2 - bw / 2 - 12, 6, bw + 24, 76, 38);
    }
    this.statusBg.fillStyle(isMyTurn ? 0x160630 : 0x04080f, 0.85);
    this.statusBg.fillRoundedRect(W / 2 - bw / 2, 10, bw, 68, 34);
    this.statusBg.lineStyle(2, isMyTurn ? 0x9b59b6 : 0x224422, 0.9);
    this.statusBg.strokeRoundedRect(W / 2 - bw / 2, 10, bw, 68, 34);
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

      // state ที่มาระหว่าง dealing → เก็บไว้ก่อน animation จะใช้เองตอนจบ
      if (this.dealing) {
        this.pendingState = state;
        return;
      }

      // ตรวจ draw/discard animation เมื่อเป็น playing phase
      if (state.phase === 'playing' && this.gs?.phase === 'playing') {
        const me = state.players.find(p => p.playerId === this.myPlayerId);
        const prevMe = this.gs.players.find(p => p.playerId === this.myPlayerId);
        if (me && prevMe) {
          const prevIds = prevMe.hand.map(c => c.id);
          const curIds = me.hand.map(c => c.id);
          const added = me.hand.filter(c => !prevIds.includes(c.id));
          const removed = prevMe.hand.filter(c => !curIds.includes(c.id));

          // draw: มีไพ่ใหม่เพิ่มขึ้น 1 ใบ
          if (added.length === 1 && removed.length === 0) {
            this.gs = state;
            this.animDrawCard(added[0], state);
            return;
          }
          // discard: มีไพ่หายไป
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
      // แสดงแต้มทุกคนก่อน 2 วินาที แล้วค่อยขึ้น result
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

    // วาด table + player slots ก่อน (ไม่มีไพ่)
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
    const cardDelay = 110;

    // ไพ่ที่ลงจอดไว้แล้ว (ยังไม่พลิก) ติดกับ animLayer
    const landed: Phaser.GameObjects.Container[] = [];

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
          const fc = this.makeCard({ id: 'hidden', suit: 'S', rank: 1 }, deckX, deckY, false);
          fc.setScale(0.55);
          this.animLayer.add(fc);

          this.tweens.add({
            targets: fc,
            x: destX, y: destY,
            scaleX: isMe ? 1 : 0.65,
            scaleY: isMe ? 1 : 0.65,
            duration: 260, ease: 'Cubic.Out',
            onComplete: () => { landed.push(fc); },
          });
        });
      }
    }

    // หลังแจกครบ → พลิกไพ่ของ me ทีละใบ แล้ว emit deal_done
    const dealEnd = n * state.players.length * cardDelay + 350;
    this.time.delayedCall(dealEnd, () => {
      // พลิกไพ่ของ me (ใบสุดท้าย n ใบที่ลงในแถว handY)
      const myLanded = landed.filter(fc => Math.abs(fc.y - handY) < 10);
      me.hand.forEach((card, i) => {
        this.time.delayedCall(i * 80, () => {
          const fc = myLanded[i];
          if (!fc) return;
          this.tweens.add({
            targets: fc, scaleX: 0, duration: 80, ease: 'Linear',
            onComplete: () => {
              const flipped = this.makeCard(card, fc.x, fc.y, true);
              this.animLayer.add(flipped);
              this.tweens.add({
                targets: flipped, scaleX: 1, duration: 80, ease: 'Linear',
                onComplete: () => { fc.destroy(); },
              });
            },
          });
        });
      });

      // หลังพลิกครบทุกใบ → emit แล้วรอ pendingState จาก server
      this.time.delayedCall(me.hand.length * 80 + 350, () => {
        this.animLayer.removeAll(true);
        this.dealing = false;
        getSocket().emit('kh:deal_done', { roomId: state.roomId });
        // ถ้า server ส่ง playing state มาระหว่าง animation แล้ว ใช้เลย
        const next = this.pendingState ?? state;
        this.pendingState = null;
        this.gs = next;
        this.render(next);
      });
    });
  }

  // ── Draw card animation (จั่วไพ่) ────────────────────────────────────────
  private animDrawCard(drawnCard: Card, state: KhangGameState) {
    const deckX = W - 175, deckY = H / 2 - 10;
    const me = state.players.find(p => p.playerId === this.myPlayerId)!;
    const n = me.hand.length; // รวมใบที่จั่วแล้ว
    const gap = Math.min(132, (W - 460) / Math.max(n, 1));
    const startX = W / 2 - ((n - 1) * gap) / 2;
    const handY = H - 170;
    const cardSlot = me.hand.findIndex(c => c.id === drawnCard.id);
    const destX = startX + cardSlot * gap;

    // render ก่อน (ไพ่ใหม่อยู่ในมือแล้ว) แต่ซ่อนไพ่ใบนั้น
    this.render(state);

    // ไพ่บินจาก deck มาที่มือ
    const fc = this.makeCard(drawnCard, deckX, deckY, false);
    fc.setScale(0.7);
    this.animLayer.removeAll(true);
    this.animLayer.add(fc);

    this.tweens.add({
      targets: fc, x: destX, y: handY,
      scaleX: 1, scaleY: 1,
      duration: 300, ease: 'Cubic.Out',
      onComplete: () => {
        // พลิกหน้า
        this.tweens.add({
          targets: fc, scaleX: 0, duration: 75, ease: 'Linear',
          onComplete: () => {
            const flipped = this.makeCard(drawnCard, destX, handY, true);
            this.animLayer.add(flipped);
            this.tweens.add({
              targets: flipped, scaleX: 1, duration: 75, ease: 'Linear',
              onComplete: () => {
                this.animLayer.removeAll(true);
                this.render(state); // re-render ให้ interactive ใช้งานได้
              },
            });
          },
        });
      },
    });
  }

  // ── Discard card animation (ทิ้งไพ่) ─────────────────────────────────────
  private animDiscardCards(removed: Card[], state: KhangGameState) {
    const discardX = W / 2, discardY = H / 2 - 10;
    // หาตำแหน่งเดิมของไพ่ที่ถูกทิ้ง (จาก prevState)
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
        scaleX: 0.85, scaleY: 0.85,
        angle: Phaser.Math.Between(-15, 15),
        duration: 280, ease: 'Cubic.Out', delay: idx * 60,
        onComplete: () => {
          if (idx === removed.length - 1) {
            this.time.delayedCall(120, () => {
              this.animLayer.removeAll(true);
              this.render(state);
            });
          }
        },
      });
    });
  }

  // ── Score reveal ก่อนแสดง result dialog ──────────────────────────────────
  private showScoreReveal(players: { playerId: string; name: string; hand: Card[] }[], winnerId: string, onDone: () => void) {
    if (players.length === 0) { onDone(); return; }

    this.gs = null;
    this.ui.removeAll(true);
    this.animLayer.removeAll(true);

    const ov = this.add.graphics().setDepth(18);
    ov.fillStyle(0x000000, 0.72);
    ov.fillRect(0, 0, W, H);

    const label = this.add.text(W / 2, 90, 'เปิดไพ่ทุกคน', {
      fontSize: '42px', color: '#ffd700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 6, resolution: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(19);
    this.tweens.add({ targets: label, alpha: 1, duration: 350 });

    const cols = players.length <= 3 ? players.length : Math.ceil(players.length / 2);
    const colW = Math.min(340, (W - 160) / cols);
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

      this.time.delayedCall(idx * 180, () => {
        // กรอบผู้เล่น
        const bg = this.add.graphics().setDepth(19);
        bg.fillStyle(isWinner ? 0x1a0d00 : 0x050d05, 0.95);
        bg.fillRoundedRect(cx - colW / 2 + 10, cy - 130, colW - 20, 260, 18);
        bg.lineStyle(3, isWinner ? 0xffd700 : (isMe ? 0x9b59b6 : 0x224422), 1);
        bg.strokeRoundedRect(cx - colW / 2 + 10, cy - 130, colW - 20, 260, 18);
        bg.setAlpha(0);
        this.tweens.add({ targets: bg, alpha: 1, scaleX: { from: 0.7, to: 1 }, scaleY: { from: 0.7, to: 1 }, duration: 300, ease: 'Back.Out' });

        // ชื่อ
        const nameT = this.add.text(cx, cy - 100, (isWinner ? '★ ' : '') + p.name + (isMe ? ' (คุณ)' : ''), {
          fontSize: '22px', color: isWinner ? '#ffd700' : '#ddeedd', fontStyle: 'bold',
          stroke: '#000', strokeThickness: 4, resolution: 2,
        }).setOrigin(0.5).setAlpha(0).setDepth(20);
        this.tweens.add({ targets: nameT, alpha: 1, duration: 250, delay: 80 });

        // ไพ่ในมือ
        const cardScale = 0.55;
        const cardGap = Math.min(50, (colW - 40) / Math.max(p.hand.length, 1));
        const cardStartX = cx - ((p.hand.length - 1) * cardGap) / 2;
        p.hand.forEach((card, ci) => {
          const cardContainer = this.makeCard(card, cardStartX + ci * cardGap, cy - 10, true);
          cardContainer.setScale(cardScale).setDepth(20).setAlpha(0);
          this.add.existing(cardContainer);
          this.tweens.add({ targets: cardContainer, alpha: 1, duration: 200, delay: 120 + ci * 50 });
        });

        // แต้มรวม
        const scoreColor = total <= 5 ? '#27ae60' : total <= 15 ? '#f39c12' : '#e74c3c';
        const scoreT = this.add.text(cx, cy + 118, `แต้ม: ${total}`, {
          fontSize: '30px', color: scoreColor, fontStyle: 'bold',
          stroke: '#000', strokeThickness: 5, resolution: 2,
        }).setOrigin(0.5).setAlpha(0).setDepth(20);
        this.tweens.add({ targets: scoreT, alpha: 1, duration: 300, delay: 200 });
      });
    });

    // รอให้ดูครบแล้วค่อยเปิด result
    const revealDuration = players.length * 180 + 2200;
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
      statusMsg = state.waitingDiscard ? '🗑 เลือกไพ่ที่จะทิ้ง' : `🎯 เทิร์นของคุณ — แต้ม: ${myTotal}`;
    } else {
      statusMsg = `⏳ รอ ${curName}...`;
    }
    this.setStatus(statusMsg, isMyCurrent);

    this.drawCenterArea(state);
    this.drawOpponents(state);
    this.drawMyArea(me, state, isMyCurrent);
    if (isMyCurrent) this.drawActionBtns(state, me);
    if (state.flowChain.length > 0) this.drawFlowBadge(state);
  }

  // ── Center area: deck + discard + pot ────────────────────────────────────
  private drawCenterArea(state: KhangGameState) {
    // Pot badge
    const potBg = this.add.graphics();
    potBg.fillStyle(0x0a0a00, 0.8);
    potBg.fillRoundedRect(W / 2 - 130, 92, 260, 50, 25);
    potBg.lineStyle(2, 0xffd700, 0.6);
    potBg.strokeRoundedRect(W / 2 - 130, 92, 260, 50, 25);
    this.ui.add(potBg);
    this.uiText(W / 2, 117, `💰  ${this.betAmount * (state.players.length)} บาท`, 22, '#ffd700', 700);

    // Discard pile — center
    const px = W / 2, py = H / 2 - 10;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillEllipse(px, py + CH / 2 + 16, 220, 36);
    this.ui.add(shadow);

    if (!state.discardPile.length) {
      const empty = this.add.graphics();
      empty.lineStyle(2, 0xffd700, 0.15);
      empty.strokeRoundedRect(px - CW / 2, py - CH / 2, CW, CH, CR);
      empty.fillStyle(0x000000, 0.25);
      empty.fillRoundedRect(px - CW / 2, py - CH / 2, CW, CH, CR);
      this.ui.add(empty);
      this.uiText(px, py, 'กองกลาง', 18, '#2a5030');
    } else {
      for (let i = Math.min(4, state.discardPile.length - 1); i > 0; i--) {
        const g = this.add.graphics();
        g.fillStyle(0x16622a, 0.45 - i * 0.07);
        g.fillRoundedRect(px - CW / 2 + i * 3, py - CH / 2 - i * 3, CW, CH, CR);
        this.ui.add(g);
      }
      this.ui.add(this.makeCard(state.discardPile.at(-1)!, px, py, true));
    }
    const dlb = this.add.graphics();
    dlb.fillStyle(0x000000, 0.7);
    dlb.fillRoundedRect(px - 68, py + CH / 2 + 10, 136, 32, 16);
    this.ui.add(dlb);
    this.uiText(px, py + CH / 2 + 26, `กองทิ้ง  ${state.discardPile.length}`, 17, '#c8a44a');

    // Deck — right
    const dx = W - 175, dy = H / 2 - 10;
    const depth = Math.min(7, Math.ceil(state.deck.length / 6));
    for (let i = depth - 1; i >= 0; i--) {
      this.ui.add(this.makeCard({ id: 'hidden', suit: 'S', rank: 1 }, dx - i * 3, dy - i * 2, false));
    }
    const cb = this.add.graphics();
    cb.fillStyle(0x6a1b9a, 1);
    cb.fillCircle(dx + CW / 2 - 11, dy - CH / 2 + 11, 22);
    cb.lineStyle(2, 0xce93d8, 0.7);
    cb.strokeCircle(dx + CW / 2 - 11, dy - CH / 2 + 11, 22);
    this.ui.add(cb);
    this.uiText(dx + CW / 2 - 11, dy - CH / 2 + 11, String(state.deck.length), 16, '#fff', 700);
    const dlb2 = this.add.graphics();
    dlb2.fillStyle(0x000000, 0.7);
    dlb2.fillRoundedRect(dx - 60, dy + CH / 2 + 10, 120, 32, 16);
    this.ui.add(dlb2);
    this.uiText(dx, dy + CH / 2 + 26, `สำรับ  ${state.deck.length}`, 17, '#c8a44a');
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
    // seat area glow
    if (isCur) {
      const sg = this.add.graphics();
      sg.fillStyle(0x9b59b6, 0.1);
      sg.fillEllipse(x, y, 280, 200);
      this.ui.add(sg);
    }

    const avR = isMe ? 46 : 38;
    const avY = isMe ? y : y + 10;

    // avatar frame ring glow
    const frameKey = p.avatarFrame ?? (isMe ? this.avatarFrame : undefined) ?? 'none';
    const frameHex = FRAME_HEX[frameKey] ?? FRAME_HEX.none;
    if (frameKey !== 'none') {
      const glow = this.add.graphics();
      glow.lineStyle(10, frameHex, 0.2);
      glow.strokeCircle(x, avY, avR + 10);
      this.ui.add(glow);
    }
    const ring = this.add.graphics();
    ring.lineStyle(isCur ? 5 : 4, frameHex, isCur ? 1 : 0.7);
    ring.strokeCircle(x, avY, avR + 3);
    this.ui.add(ring);

    // avatar bg circle
    const avBg = this.add.graphics();
    avBg.fillStyle(0x061a0a, 1);
    avBg.fillCircle(x, avY, avR);
    this.ui.add(avBg);

    // avatar image
    const seed = p.avatarSeed ?? (isMe ? this.avatarSeed : undefined) ?? p.name;
    const avKey = `av_${seed}`;
    if (this.textures.exists(avKey)) {
      const avImg = this.add.image(x, avY, avKey);
      avImg.setDisplaySize(avR * 1.75, avR * 1.75);
      this.ui.add(avImg);
    } else {
      this.uiText(x, avY, p.isBot ? '🤖' : '👤', avR * 0.9, '#fff');
      this.ensureAvatar(seed);
    }

    // current-turn pulse ring
    if (isCur) {
      const pulse = this.add.graphics();
      pulse.lineStyle(3, 0x9b59b6, 0.9);
      pulse.strokeCircle(x, avY, avR + 14);
      this.ui.add(pulse);
      this.tweens.add({
        targets: pulse,
        alpha: { from: 0.9, to: 0 },
        scaleX: { from: 1, to: 1.4 }, scaleY: { from: 1, to: 1.4 },
        duration: 1000, repeat: -1,
      });
    }

    // name badge below avatar
    const nameY = avY + avR + 24;
    const nameBg = this.add.graphics();
    nameBg.fillStyle(isCur ? 0x2a0a4a : 0x061a0a, 0.92);
    nameBg.fillRoundedRect(x - 108, nameY - 18, 216, 36, 18);
    nameBg.lineStyle(isCur ? 2 : 1, isCur ? 0x9b59b6 : 0x1a3a20, isCur ? 1 : 0.6);
    nameBg.strokeRoundedRect(x - 108, nameY - 18, 216, 36, 18);
    this.ui.add(nameBg);
    this.uiText(x, nameY, `${p.isBot ? '🤖 ' : ''}${p.name}`, isMe ? 20 : 18, isCur ? '#ce93d8' : '#dde8dd', 700);

    // opponent hand fan
    if (!isMe) {
      const fanY = avY - avR - 18;
      p.hand.forEach((card, j) => {
        const angle = (j - (p.hand.length - 1) / 2) * 8;
        const cx = x + (j - (p.hand.length - 1) / 2) * 16;
        const c = this.makeCard(card, cx, fanY - 50, card.id !== 'hidden');
        c.setRotation(Phaser.Math.DegToRad(angle));
        this.ui.add(c);
      });
      const ccbg = this.add.graphics();
      ccbg.fillStyle(0x000000, 0.75);
      ccbg.fillRoundedRect(x - 30, fanY - 12, 60, 26, 13);
      this.ui.add(ccbg);
      this.uiText(x, fanY + 1, `${p.hand.length} ใบ`, 16, '#c8a44a', 600);
    }

    // score panel for my seat
    if (isMe) {
      const total = p.hand.reduce((s, c) => s + pts(c.rank), 0);
      const scoreHex = total <= 5 ? '#27ae60' : total <= 15 ? '#f39c12' : '#e74c3c';
      const scoreNum = total <= 5 ? 0x27ae60 : total <= 15 ? 0xf39c12 : 0xe74c3c;
      const sbg = this.add.graphics();
      sbg.fillStyle(0x061a0a, 0.92);
      sbg.fillRoundedRect(x + avR + 14, avY - 32, 108, 64, 16);
      sbg.lineStyle(2, scoreNum, 0.6);
      sbg.strokeRoundedRect(x + avR + 14, avY - 32, 108, 64, 16);
      this.ui.add(sbg);
      this.uiText(x + avR + 68, avY - 12, 'แต้ม', 13, '#888888');
      this.uiText(x + avR + 68, avY + 14, String(total), 30, scoreHex, 800);
    }
  }

  private opponentPositions(n: number) {
    if (n === 1) return [{ x: W / 2, y: 345 }];
    if (n === 2) return [{ x: W / 2 - 345, y: 315 }, { x: W / 2 + 345, y: 315 }];
    if (n === 3) return [{ x: W / 2, y: 275 }, { x: W / 2 - 435, y: 385 }, { x: W / 2 + 435, y: 385 }];
    return [{ x: W / 2 - 225, y: 285 }, { x: W / 2 + 225, y: 285 }, { x: W / 2 - 455, y: 405 }, { x: W / 2 + 455, y: 405 }];
  }

  // ── My area (bottom) ──────────────────────────────────────────────────────
  private drawMyArea(me: KhangPlayerState, state: KhangGameState, isMyCurrent: boolean) {
    const myX = 168, myY = H - 195;
    const meWithAv: KhangPlayerState = {
      ...me,
      avatarSeed: me.avatarSeed ?? this.avatarSeed,
      avatarFrame: me.avatarFrame ?? this.avatarFrame,
    };
    this.drawPlayerSlot(meWithAv, myX, myY, isMyCurrent, true);

    // hand label
    const lb = this.add.graphics();
    lb.fillStyle(0x000000, 0.65);
    lb.fillRoundedRect(W / 2 - 250, H - 310, 500, 34, 17);
    this.ui.add(lb);
    this.uiText(W / 2, H - 293, `มือของคุณ  (${me.hand.length} ใบ)`, 18, '#c8a44a', 600);

    // hand cards
    const handY = H - 170;
    const n = me.hand.length;
    const gap = Math.min(132, (W - 460) / Math.max(n, 1));
    const startX = W / 2 - ((n - 1) * gap) / 2;
    const flowRank = state.lastDiscard?.rank;

    me.hand.forEach((card, i) => {
      const x = startX + i * gap;
      const isSel = this.selectedIds.has(card.id);
      const canFlow = !state.waitingDiscard && flowRank !== undefined && card.rank === flowRank;
      const cardY = isSel ? handY - 46 : handY;

      // flow highlight
      if (canFlow) {
        const fg = this.add.graphics();
        fg.lineStyle(4, 0xff9800, 1);
        fg.strokeRoundedRect(x - CW / 2 - 9, cardY - CH / 2 - 9, CW + 18, CH + 18, CR + 4);
        fg.fillStyle(0xff9800, 0.1);
        fg.fillRoundedRect(x - CW / 2 - 9, cardY - CH / 2 - 9, CW + 18, CH + 18, CR + 4);
        this.ui.add(fg);
        const fb = this.add.graphics();
        fb.fillStyle(0xff9800, 1);
        fb.fillRoundedRect(x - 28, cardY + CH / 2 + 8, 56, 24, 12);
        this.ui.add(fb);
        this.uiText(x, cardY + CH / 2 + 20, '⚡ ไหล', 14, '#000', 700);
      }

      // selected highlight
      if (isSel) {
        const sg = this.add.graphics();
        sg.lineStyle(4, 0xce93d8, 1);
        sg.strokeRoundedRect(x - CW / 2 - 8, cardY - CH / 2 - 8, CW + 16, CH + 16, CR + 3);
        sg.fillStyle(0xce93d8, 0.07);
        sg.fillRoundedRect(x - CW / 2 - 8, cardY - CH / 2 - 8, CW + 16, CH + 16, CR + 3);
        this.ui.add(sg);
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
      c.on('pointerover', () => { if (!isSel) c.setY(cardY - 15); });
      c.on('pointerout', () => { if (!isSel) c.setY(cardY); });
      this.ui.add(c);

      // point badge
      const p = pts(card.rank);
      const bc = p >= 10 ? 0xb71c1c : p >= 7 ? 0xe65100 : 0x1b5e20;
      const bbg = this.add.graphics();
      bbg.fillStyle(bc, 1);
      bbg.fillCircle(x + CW / 2 - 14, cardY - CH / 2 + 14, 19);
      bbg.lineStyle(2, 0xffffff, 0.35);
      bbg.strokeCircle(x + CW / 2 - 14, cardY - CH / 2 + 14, 19);
      this.ui.add(bbg);
      this.uiText(x + CW / 2 - 14, cardY - CH / 2 + 14, String(p), 16, '#fff', 700);
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
      this.uiText(W / 2, y - 28, hint, 18, selCount > 0 ? '#ce93d8' : '#7c7c9c');
      if (selCount > 0) {
        const label = selCount > 1 ? `🗑 ทิ้ง ${selCount} ใบพร้อมกัน` : '🗑 ทิ้งไพ่นี้';
        this.ui.add(this.btn(label, W / 2, y, 0xb71c1c, 0x7f0000, () => {
          getSocket().emit('kh:discard', { roomId: this.roomId, cardIds: selIds });
          this.selectedIds = new Set();
        }, 320, 64));
      }
    } else {
      this.ui.add(this.btn('👑 แคง', W / 2 - 410, y, 0x6a1b9a, 0x4a148c, () => {
        getSocket().emit('kh:khang', { roomId: this.roomId });
      }, 240, 64));

      this.ui.add(this.btn('🃏 จั่วไพ่', W / 2, y, 0x0d47a1, 0x082060, () => {
        getSocket().emit('kh:draw', { roomId: this.roomId });
        this.selectedIds = new Set();
      }, 240, 64));

      if (flowCards.length > 0 && flowRank !== undefined) {
        const label = flowCards.length > 1
          ? `⚡ ไหล ${flowCards.length} ใบ (${rl(flowRank)})`
          : `⚡ ไหล (${rl(flowRank)})`;
        this.ui.add(this.btn(label, W / 2 + 410, y, 0xe65100, 0xbf360c, () => {
          getSocket().emit('kh:flow', { roomId: this.roomId, cardId: flowCards[0].id });
        }, 310, 64));
      }
    }
  }

  // ── Flow badge ────────────────────────────────────────────────────────────
  private drawFlowBadge(state: KhangGameState) {
    const last = state.flowChain.at(-1);
    if (!last) return;
    const name = state.players.find(p => p.playerId === last.playerId)?.name ?? '?';
    const bg = this.add.graphics();
    bg.fillStyle(0xe65100, 0.2);
    bg.fillRoundedRect(W / 2 - 278, 160, 556, 46, 23);
    bg.lineStyle(1, 0xff9800, 0.7);
    bg.strokeRoundedRect(W / 2 - 278, 160, 556, 46, 23);
    this.ui.add(bg);
    this.uiText(W / 2, 183, `⚡ ${name} ไหล ${last.cardIds.length} ใบ!`, 20, '#ff9800', 700);
  }

  // ── Card ──────────────────────────────────────────────────────────────────
  private makeCard(card: Card, x: number, y: number, faceUp: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.55);
    sh.fillRoundedRect(-CW / 2 + 5, -CH / 2 + 7, CW, CH, CR);
    c.add(sh);
    const key = (!faceUp || card.id === 'hidden') ? 'card_back' : khCardKey(card.suit, card.rank);
    const img = this.add.image(0, 0, key);
    img.setDisplaySize(CW, CH);
    c.add(img);
    return c;
  }

  // ── Button ────────────────────────────────────────────────────────────────
  private btn(label: string, x: number, y: number, col: number, hov: number, cb: () => void, w = 240, h = 64): Phaser.GameObjects.Container {
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

    // top shine
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.2);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.38, h / 2 - 2);
    c.add(shine);

    // border
    const border = this.add.graphics();
    border.lineStyle(1, 0xffffff, 0.2);
    border.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(border);

    const t = this.add.text(0, 0, label, {
      fontSize: '23px', color: '#fff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3, resolution: 2,
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
      outerGlow.setAlpha(0.45);
      c.setY(y - 5);
    });
    c.on('pointerout', () => {
      bg.clear(); bg.fillStyle(col, 1); bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      outerGlow.setAlpha(1);
      c.setY(y);
    });
    return c;
  }

  // ── uiText ────────────────────────────────────────────────────────────────
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

  // ── Toast ─────────────────────────────────────────────────────────────────
  private toast(msg: string, bgColor = 0x000000) {
    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 0.9);
    bg.fillRoundedRect(W / 2 - 350, H / 2 - 195, 700, 80, 28);
    bg.lineStyle(2, bgColor, 1);
    bg.strokeRoundedRect(W / 2 - 350, H / 2 - 195, 700, 80, 28);
    const t = this.add.text(W / 2, H / 2 - 155, msg, {
      fontSize: '26px', color: '#fff', fontStyle: 'bold', resolution: 2,
    }).setOrigin(0.5);
    this.tweens.add({
      targets: [bg, t], alpha: { from: 1, to: 0 },
      delay: 2200, duration: 500,
      onComplete: () => { bg.destroy(); t.destroy(); },
    });
  }

  // ── Result overlay ────────────────────────────────────────────────────────
  private showResult(win: boolean, pot: number) {
    this.gs = null;
    this.ui.removeAll(true);

    // dim backdrop
    const ov = this.add.graphics().setDepth(20);
    ov.fillStyle(0x000000, 0.78);
    ov.fillRect(0, 0, W, H);

    // panel dimensions
    const pw = 860, ph = 560;
    const px = W / 2, py = H / 2;

    // panel shadow
    const shadow = this.add.graphics().setDepth(20);
    shadow.fillStyle(0x000000, 0.55);
    shadow.fillRoundedRect(px - pw / 2 + 12, py - ph / 2 + 18, pw, ph, 44);

    // main panel
    const panel = this.add.graphics().setDepth(21);
    if (win) {
      panel.fillGradientStyle(0x16073a, 0x16073a, 0x09051e, 0x09051e, 1);
    } else {
      panel.fillGradientStyle(0x2c0a0a, 0x2c0a0a, 0x160404, 0x160404, 1);
    }
    panel.fillRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 44);

    // outer border
    panel.lineStyle(4, win ? 0xffd700 : 0xc62828, 1);
    panel.strokeRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 44);
    // inner border
    panel.lineStyle(1, win ? 0xffd700 : 0xff8888, 0.2);
    panel.strokeRoundedRect(px - pw / 2 + 10, py - ph / 2 + 10, pw - 20, ph - 20, 36);

    // top accent bar
    const accentBar = this.add.graphics().setDepth(22);
    accentBar.fillStyle(win ? 0xffd700 : 0xc62828, 1);
    accentBar.fillRoundedRect(px - 110, py - ph / 2 - 5, 220, 10, 5);

    // icon circle
    const iconBg = this.add.graphics().setDepth(22);
    iconBg.fillStyle(win ? 0xffd700 : 0xc62828, 1);
    iconBg.fillCircle(px, py - ph / 2 + 82, 58);
    iconBg.lineStyle(5, win ? 0xfff8dc : 0xff8888, 0.6);
    iconBg.strokeCircle(px, py - ph / 2 + 82, 58);
    iconBg.lineStyle(2, win ? 0xffd700 : 0xc62828, 0.3);
    iconBg.strokeCircle(px, py - ph / 2 + 82, 74);

    // draw icon (crown or X) using graphics
    const iconG = this.add.graphics().setDepth(23).setAlpha(0);
    if (win) {
      // crown shape
      const cx = px, cy = py - ph / 2 + 82;
      iconG.fillStyle(0x1a0848, 1);
      iconG.fillRect(cx - 32, cy - 14, 64, 28);
      iconG.fillStyle(0x1a0848, 1);
      // left spike
      iconG.fillTriangle(cx - 32, cy - 14, cx - 44, cy - 38, cx - 14, cy - 14);
      // center spike
      iconG.fillTriangle(cx - 14, cy - 14, cx, cy - 44, cx + 14, cy - 14);
      // right spike
      iconG.fillTriangle(cx + 14, cy - 14, cx + 44, cy - 38, cx + 32, cy - 14);
      // base
      iconG.fillRoundedRect(cx - 36, cy + 8, 72, 18, 4);
      // dots on crown
      iconG.fillStyle(0xffd700, 0.8);
      iconG.fillCircle(cx - 34, cy - 36, 6);
      iconG.fillCircle(cx, cy - 42, 7);
      iconG.fillCircle(cx + 34, cy - 36, 6);
    } else {
      // X mark
      const cx = px, cy = py - ph / 2 + 82;
      const r = 28;
      iconG.lineStyle(10, 0x1a0000, 1);
      iconG.lineBetween(cx - r, cy - r, cx + r, cy + r);
      iconG.lineBetween(cx + r, cy - r, cx - r, cy + r);
      iconG.lineStyle(6, 0x160404, 0.5);
      iconG.lineBetween(cx - r, cy - r, cx + r, cy + r);
      iconG.lineBetween(cx + r, cy - r, cx - r, cy + r);
    }

    this.tweens.add({
      targets: [iconBg, iconG],
      alpha: 1, scaleX: { from: 0.2, to: 1 }, scaleY: { from: 0.2, to: 1 },
      duration: 520, ease: 'Back.Out',
    });

    // result title
    const titleTxt = this.add.text(px, py - 118, win ? 'ชนะ!' : 'แพ้', {
      fontSize: '80px', color: win ? '#ffd700' : '#ef5350', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 8, resolution: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this.tweens.add({ targets: titleTxt, alpha: 1, y: py - 126, duration: 550, delay: 200, ease: 'Back.Out' });

    // subtitle line
    const subtitleTxt = this.add.text(px, py - 50, win ? 'คุณชนะรอบนี้แล้ว' : 'เสียโชคครั้งนี้', {
      fontSize: '28px', color: win ? '#e8d5ff' : '#ffb3b3', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, resolution: 2,
    }).setOrigin(0.5).setAlpha(0).setDepth(23);
    this.tweens.add({ targets: subtitleTxt, alpha: 1, duration: 500, delay: 350 });

    // divider
    const div = this.add.graphics().setDepth(22).setAlpha(0);
    div.lineStyle(1, win ? 0xffd700 : 0xc62828, 0.4);
    div.lineBetween(px - 300, py + 4, px + 300, py + 4);
    this.tweens.add({ targets: div, alpha: 1, duration: 400, delay: 450 });

    // pot amount
    if (win) {
      const potLabel = this.add.text(px, py + 46, 'เงินที่ได้รับ', {
        fontSize: '22px', color: '#aaaaaa', resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      const potAmt = this.add.text(px, py + 92, `+ ${pot.toLocaleString()} บาท`, {
        fontSize: '54px', color: '#ffd700', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 5, resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      this.tweens.add({ targets: potLabel, alpha: 1, duration: 500, delay: 500 });
      this.tweens.add({ targets: potAmt, alpha: 1, scaleX: { from: 0.7, to: 1 }, scaleY: { from: 0.7, to: 1 }, duration: 600, delay: 580, ease: 'Back.Out' });

      // particle coins (geometric, no emoji)
      for (let i = 0; i < 22; i++) {
        this.time.delayedCall(i * 85, () => {
          const sx = Phaser.Math.Between(px - 350, px + 350);
          const coin = this.add.graphics().setDepth(24).setAlpha(0);
          const coinR = Phaser.Math.Between(8, 16);
          const coinColor = [0xffd700, 0xf4c430, 0xdaa520][i % 3];
          coin.fillStyle(coinColor, 1);
          coin.fillCircle(0, 0, coinR);
          coin.lineStyle(2, 0xfff8dc, 0.5);
          coin.strokeCircle(0, 0, coinR);
          coin.x = sx; coin.y = py - 200;
          this.tweens.add({
            targets: coin, alpha: { from: 1, to: 0 },
            y: py - 200 - Phaser.Math.Between(90, 260),
            duration: 1000,
            onComplete: () => coin.destroy(),
          });
        });
      }
    } else {
      const loseLabel = this.add.text(px, py + 58, 'เสียเงิน', {
        fontSize: '22px', color: '#888888', resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      const loseAmt = this.add.text(px, py + 104, `- ${this.betAmount.toLocaleString()} บาท`, {
        fontSize: '50px', color: '#ef5350', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 5, resolution: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(23);
      this.tweens.add({ targets: loseLabel, alpha: 1, duration: 500, delay: 450 });
      this.tweens.add({ targets: loseAmt, alpha: 1, duration: 500, delay: 550 });
    }

    // buttons — added directly to scene with high depth
    const btnY = py + ph / 2 - 80;

    // Play again button
    const playBtn = this.resultBtn(
      px - 195, btnY,
      win ? 0x6a1b9a : 0x1a237e,
      win ? 0x4a148c : 0x0d47a1,
      win ? 0x9b59b6 : 0x3f51b5,
      'เล่นต่อ',
      // play icon (triangle)
      (bx, by, g) => {
        g.fillStyle(0xffffff, 0.9);
        g.fillTriangle(bx - 10, by - 14, bx - 10, by + 14, bx + 16, by);
      },
      () => { window.dispatchEvent(new CustomEvent('khang:play_again')); }
    );
    playBtn.setDepth(24);
    this.add.existing(playBtn);

    // Lobby button
    const lobbyBtn = this.resultBtn(
      px + 195, btnY,
      0x1b5e20, 0x0a3d15, 0x2e7d32,
      'กลับ Lobby',
      // home icon
      (bx, by, g) => {
        g.fillStyle(0xffffff, 0.9);
        // roof
        g.fillTriangle(bx - 16, by, bx + 16, by, bx, by - 18);
        // body
        g.fillRect(bx - 11, by, 22, 16);
        // door
        g.fillStyle(win ? 0x6a1b9a : 0x1a237e, 1);
        g.fillRect(bx - 5, by + 5, 10, 11);
      },
      () => { window.location.href = '/'; }
    );
    lobbyBtn.setDepth(24);
    this.add.existing(lobbyBtn);

    // animate buttons in
    [playBtn, lobbyBtn].forEach((b, i) => {
      b.setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, y: b.y - 8, duration: 450, delay: 700 + i * 80, ease: 'Back.Out' });
    });
  }

  // ── Result button (icon + label) ──────────────────────────────────────────
  private resultBtn(
    x: number, y: number,
    col: number, hov: number, border: number,
    label: string,
    drawIcon: (bx: number, by: number, g: Phaser.GameObjects.Graphics) => void,
    cb: () => void,
  ): Phaser.GameObjects.Container {
    const w = 340, h = 80;
    const c = this.add.container(x, y);

    const sh = this.add.graphics();
    sh.fillStyle(0x000000, 0.5);
    sh.fillRoundedRect(-w / 2 + 4, -h / 2 + 6, w, h, h / 2);
    c.add(sh);

    const glow = this.add.graphics();
    glow.fillStyle(col, 0.22);
    glow.fillRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, h / 2 + 4);
    c.add(glow);

    const bg = this.add.graphics();
    bg.fillGradientStyle(col, col, Phaser.Display.Color.IntegerToColor(col).darken(20).color, Phaser.Display.Color.IntegerToColor(col).darken(20).color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bg);

    // shine strip
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.15);
    shine.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.35, h / 2 - 2);
    c.add(shine);

    // border
    const bdr = this.add.graphics();
    bdr.lineStyle(2, border, 0.8);
    bdr.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.add(bdr);

    // icon
    const iconG = this.add.graphics();
    drawIcon(-w / 2 + 56, 0, iconG);
    c.add(iconG);

    // vertical divider
    const divG = this.add.graphics();
    divG.lineStyle(1, 0xffffff, 0.2);
    divG.lineBetween(-w / 2 + 86, -h / 2 + 16, -w / 2 + 86, h / 2 - 16);
    c.add(divG);

    const t = this.add.text(w / 2 - 80, 0, label, {
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3, resolution: 2,
    }).setOrigin(0.5);
    c.add(t);

    c.setSize(w, h).setInteractive();
    c.on('pointerdown', () => {
      c.setScale(0.94);
      this.time.delayedCall(120, () => { c.setScale(1); cb(); });
    });
    c.on('pointerover', () => {
      bg.clear();
      bg.fillGradientStyle(hov, hov, Phaser.Display.Color.IntegerToColor(hov).darken(20).color, Phaser.Display.Color.IntegerToColor(hov).darken(20).color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      glow.setAlpha(0.5);
      c.setY(y - 6);
    });
    c.on('pointerout', () => {
      bg.clear();
      bg.fillGradientStyle(col, col, Phaser.Display.Color.IntegerToColor(col).darken(20).color, Phaser.Display.Color.IntegerToColor(col).darken(20).color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      glow.setAlpha(1);
      c.setY(y);
    });
    return c;
  }

  destroy() {
    const s = getSocket();
    s.off('kh:state'); s.off('kh:finished'); s.off('kh:wrong_khang');
  }
}
