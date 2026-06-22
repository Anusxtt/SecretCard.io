import { useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Phaser from 'phaser';
import { KhangScene } from '../game/khang/KhangScene';

export function KhangPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { playerId, betAmount } = (location.state as { playerId: string; betAmount: number }) ?? {};

  useEffect(() => {
    if (!roomId || !playerId || !containerRef.current) return;
    if (gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 1280,
      height: 720,
      parent: containerRef.current,
      backgroundColor: '#060315',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720,
      },
      scene: [KhangScene],
    };

    gameRef.current = new Phaser.Game(config);
    gameRef.current.events.once(Phaser.Core.Events.READY, () => {
      gameRef.current?.scene.start('KhangScene', { roomId, playerId, betAmount });
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [roomId, playerId, betAmount]);

  if (!playerId) {
    navigate('/');
    return null;
  }

  return (
    <div style={s.root}>
      <div style={s.topBar}>
        <div style={s.gameTitle}>🃏 แคง</div>
        <div style={s.roomInfo}>
          <span style={s.tag}>ห้อง: {roomId?.slice(0, 8).toUpperCase()}</span>
          <span style={s.tag}>💰 เดิมพัน: {betAmount} บาท</span>
        </div>
        <button style={s.backBtn} onClick={() => { window.location.href = '/'; }}>
          🏠 ออก
        </button>
      </div>
      <div style={s.canvasWrap}>
        <div ref={containerRef} style={s.canvas} />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    width: '100vw', height: '100vh',
    background: '#080810',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex', alignItems: 'center',
    padding: '10px 24px',
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(155,89,182,0.2)',
    gap: 16, flexShrink: 0,
  },
  gameTitle: {
    fontSize: 18, fontWeight: 800, letterSpacing: 1,
    background: 'linear-gradient(135deg, #ce93d8, #9b59b6)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  roomInfo: { display: 'flex', gap: 10, flex: 1 },
  tag: {
    fontSize: 12, color: '#aaa',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, padding: '4px 12px',
  },
  backBtn: {
    padding: '6px 16px',
    background: 'rgba(255,59,59,0.12)',
    border: '1px solid rgba(255,59,59,0.25)',
    borderRadius: 14, color: '#ff6b6b',
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  canvasWrap: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  canvas: {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
