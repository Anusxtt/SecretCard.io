import { useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Phaser from 'phaser';
import { KhangScene } from '../game/khang/KhangScene';
import { AvatarBubble } from '../components/AvatarBubble';
import { useIsMobile } from '../hooks/useIsMobile';
import { useMyRank } from '../hooks/useMyRank';
import { Coins, LogOut, Gamepad2, Trophy } from 'lucide-react';

interface GameState {
  playerId: string;
  betAmount: number;
  avatarSeed?: string;
  avatarFrame?: string;
  playerName?: string;
  userId?: string;
}

export function KhangPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const { playerId, betAmount, avatarSeed, avatarFrame, playerName, userId } =
    (location.state as GameState) ?? {};

  const rankInfo = useMyRank(userId);

  useEffect(() => {
    if (!roomId || !playerId || !containerRef.current) return;
    if (gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 1920,
      height: 1080,
      parent: containerRef.current,
      backgroundColor: '#060315',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1920,
        height: 1080,
      },
      scene: [KhangScene],
    };

    gameRef.current = new Phaser.Game(config);
    gameRef.current.events.once(Phaser.Core.Events.READY, () => {
      gameRef.current?.scene.start('KhangScene', { roomId, playerId, betAmount, avatarSeed, avatarFrame });
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [roomId, playerId, betAmount, avatarSeed, avatarFrame]);

  useEffect(() => {
    const handler = () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      navigate('/', { state: { autoJoin: 'khang', betAmount, avatarSeed, avatarFrame, playerName } });
    };
    window.addEventListener('khang:play_again', handler);
    return () => window.removeEventListener('khang:play_again', handler);
  }, [navigate, betAmount, avatarSeed, avatarFrame, playerName]);

  if (!playerId) {
    navigate('/');
    return null;
  }

  return (
    <div style={s.root}>
      <div style={{ ...s.topBar, padding: isMobile ? '8px 12px' : '10px 24px', gap: isMobile ? 8 : 16 }}>
        <div style={s.left}>
          <Gamepad2 size={isMobile ? 16 : 20} color="#ce93d8" />
          <div style={{ ...s.gameTitle, fontSize: isMobile ? 14 : 18 }}>แคง</div>
        </div>
        <div style={s.roomInfo}>
          {/* Room tag — hidden on mobile */}
          {!isMobile && (
            <span style={s.tag}>ห้อง: {roomId?.slice(0, 8).toUpperCase()}</span>
          )}
          <span style={s.tag}>
            <Coins size={11} color="#ce93d8" style={{ marginRight: 4 }} />
            {isMobile ? `${betAmount}฿` : `เดิมพัน: ${betAmount} บาท`}
          </span>
        </div>
        <div style={{ ...s.right, gap: isMobile ? 6 : 8 }}>
          <AvatarBubble avatarSeed={avatarSeed} avatarFrame={avatarFrame} size={isMobile ? 26 : 32} />
          {!isMobile && playerName && <span style={s.playerName}>{playerName}</span>}
          {rankInfo && (
            <span style={s.rankBadge}>
              <Trophy size={11} color="#ffd700" />
              #{rankInfo.rank}
            </span>
          )}
          <button
            style={{ ...s.backBtn, padding: isMobile ? '5px 10px' : '6px 14px', fontSize: isMobile ? 12 : 13 }}
            onClick={() => { window.location.href = '/'; }}>
            <LogOut size={isMobile ? 12 : 13} />
            {!isMobile && 'ออก'}
          </button>
        </div>
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
  left: { display: 'flex', alignItems: 'center', gap: 8 },
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
    display: 'flex', alignItems: 'center',
  },
  right: { display: 'flex', alignItems: 'center', gap: 8 },
  playerName: { fontSize: 13, color: '#ccc', fontWeight: 600, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rankBadge: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 12, fontWeight: 700, color: '#ffd700',
    background: 'rgba(255,215,0,0.1)',
    border: '1px solid rgba(255,215,0,0.25)',
    borderRadius: 12, padding: '3px 10px',
  },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 14px',
    background: 'rgba(255,59,59,0.12)',
    border: '1px solid rgba(255,59,59,0.25)',
    borderRadius: 14, color: '#ff6b6b',
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  canvasWrap: {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    background: '#020509',
  },
  canvas: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
