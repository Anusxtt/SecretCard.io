import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { AuthModal } from '../components/AuthModal';
import { Leaderboard } from '../components/Leaderboard';

type GameType = 'somsip' | 'khang';
const BET_OPTIONS = [2, 5, 10, 20];

export function LobbyPage() {
  const { user, loading, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [gameType, setGameType] = useState<GameType>('somsip');
  const [betAmount, setBetAmount] = useState(5);
  const [joining, setJoining] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    if (!loading && !user) setDismissed(false);
  }, [user, loading]);

  const showAuth = !loading && !user && !dismissed;

  const joinGame = (withBots: boolean) => {
    if (!user) return setDismissed(false);
    if (user.balance < betAmount) return alert('เงินไม่พอสำหรับการเดิมพัน');
    setJoining(true);

    socket.emit('join_lobby', {
      gameType,
      betAmount,
      playerName: user.name,
      playerId: user.isGuest ? undefined : user.id,
      balance: user.balance,
    });

    socket.once('joined_room', ({ roomId, playerId }: { roomId: string; playerId: string }) => {
      const goToGame = () => {
        navigate(`/${gameType}/${roomId}`, { state: { playerId, betAmount } });
        setJoining(false);
      };
      socket.once('game_ready', goToGame);
      socket.once('game_start', goToGame);
      if (withBots) socket.emit('start_with_bots', { roomId });
    });
  };

  return (
    <div style={s.root}>
      <div style={s.bgOverlay} />

      {showAuth && <AuthModal onClose={() => setDismissed(true)} />}
      {showLeaderboard && (
        <div style={s.modalOverlay} onClick={() => setShowLeaderboard(false)}>
          <div style={s.lbModal} onClick={(e) => e.stopPropagation()}>
            <button style={s.closeBtn} onClick={() => setShowLeaderboard(false)}>✕</button>
            <Leaderboard />
          </div>
        </div>
      )}

      {/* Header */}
      <header style={s.header}>
        <div style={s.logo}>
          <span style={{ fontSize: 36 }}>🃏</span>
          <div>
            <div style={s.logoTitle}>GAME.IO</div>
            <div style={s.logoSub}>ไพ่ไทยออนไลน์</div>
          </div>
        </div>
        <nav style={s.nav}>
          <button style={s.navBtn} onClick={() => setShowLeaderboard(true)}>🏆 อันดับ</button>
          {user ? (
            <div style={s.userArea}>
              <div style={s.walletChip}>
                <span style={{ fontSize: 20 }}>💰</span>
                <div>
                  <div style={s.walletName}>{user.isGuest ? '👤 Guest' : '⭐ ' + user.name}</div>
                  <div style={s.walletBal}>{user.balance.toLocaleString()} บาท</div>
                </div>
              </div>
              <button style={s.logoutBtn} onClick={logout}>ออก</button>
            </div>
          ) : (
            <button style={s.loginBtn} onClick={() => setDismissed(false)}>เข้าสู่ระบบ / สมัคร</button>
          )}
        </nav>
      </header>

      {/* Main */}
      <main style={s.main}>
        {/* Left panel */}
        <section style={s.gamePanel}>
          <div style={s.panelTitle}>
            <span>เลือกเกม</span>
            <div style={s.titleLine} />
          </div>

          {/* Game cards */}
          <div style={s.gameCards}>
            {([
              {
                id: 'somsip' as GameType, icon: '🀄', name: 'สมสิบ',
                desc: 'จับคู่ให้ได้ 3 คู่ รวมแต้ม 10', players: '2–5 คน', diff: 'ปานกลาง', diffColor: '#f39c12',
              },
              {
                id: 'khang' as GameType, icon: '🃏', name: 'แคง',
                desc: 'แต้มน้อยสุดชนะ หรือประกาศแคง', players: '2–5 คน', diff: 'ง่าย', diffColor: '#27ae60',
              },
            ]).map((g) => {
              const active = gameType === g.id;
              return (
                <button key={g.id} style={{ ...s.gCard, ...(active ? s.gCardActive : {}) }} onClick={() => setGameType(g.id)}>
                  <div style={{ ...s.gCardGlow, opacity: active ? 1 : 0 }} />
                  <span style={{ fontSize: 48, marginBottom: 4 }}>{g.icon}</span>
                  <div style={s.gName}>{g.name}</div>
                  <div style={s.gDesc}>{g.desc}</div>
                  <div style={s.gMeta}>
                    <span style={{ fontSize: 11, color: '#888' }}>👥 {g.players}</span>
                    <span style={{ ...s.gDiff, color: g.diffColor, borderColor: g.diffColor }}>{g.diff}</span>
                  </div>
                  {active && <div style={s.gCheck}>✓</div>}
                </button>
              );
            })}
          </div>

          {/* Bet */}
          <div>
            <div style={s.betLabel}>เลือกเดิมพัน</div>
            <div style={s.betChips}>
              {BET_OPTIONS.map((b) => (
                <button
                  key={b}
                  style={{ ...s.chip, ...(betAmount === b ? s.chipActive : {}) }}
                  onClick={() => setBetAmount(b)}
                >
                  <span style={{ fontSize: 18 }}>🪙</span>
                  <span style={s.chipVal}>{b}</span>
                  <span style={s.chipUnit}>บาท</span>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={s.actions}>
            <button
              style={{ ...s.playBtn, ...s.botBtn, opacity: joining ? 0.65 : 1 }}
              onClick={() => joinGame(true)}
              disabled={joining}
            >
              {joining ? '⏳ กำลังเข้า...' : '🤖 เล่นกับ Bot'}
            </button>
            <button
              style={{ ...s.playBtn, ...s.onlineBtn, opacity: joining ? 0.65 : 1 }}
              onClick={() => joinGame(false)}
              disabled={joining}
            >
              {joining ? '⏳ กำลังรอ...' : '🌐 Online Multiplayer'}
            </button>
          </div>

          {/* Badges */}
          <div style={s.infoStrip}>
            {[['🛡', 'ปลอดภัย 100%'], ['⚡', 'Realtime'], ['🎮', 'Free to Play'], ['🏆', 'Leaderboard']].map(([icon, text]) => (
              <div key={text} style={s.badge}>
                <span>{icon}</span>
                <span style={{ fontSize: 12, color: '#888' }}>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Right sidebar */}
        <aside style={s.sidebar}>
          <Leaderboard compact />
          <div style={s.rulesCard}>
            <div style={s.rulesTitle}>📖 กติกา {gameType === 'somsip' ? 'สมสิบ' : 'แคง'}</div>
            <ul style={s.rulesList}>
              {(gameType === 'somsip' ? [
                '🃏 ได้ไพ่ 5 ใบ จั่วหรือหยิบกองทิ้ง',
                '🔁 ทิ้งไพ่ 1 ใบให้กองทิ้งตัวเอง',
                '🏆 จับคู่ครบ 3 คู่ก็ชนะ',
                '⚡ ขัดเทิร์นได้ถ้าครบ 3 คู่ทันที',
                '🃏 โจ๊กเกอร์ = ไพ่ที่ขึ้นเปิด',
              ] : [
                '🃏 ได้ไพ่ 5 ใบทุกคน',
                '🔢 A=1, 2-10=ตามหน้า, J/Q/K=10',
                '👑 ประกาศแคงถ้าแต้มน้อยสุด',
                '⚡ ไหลได้ถ้ามีไพ่หน้าเดียวกับกองทิ้ง',
                '🏆 แต้มน้อยสุดชนะ',
              ]).map((r, i) => (
                <li key={i} style={s.rulesItem}>{r}</li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #080810 0%, #0d1b2a 40%, #0a1628 70%, #060d18 100%)',
    color: '#fff',
    fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },
  bgOverlay: {
    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
    background: 'radial-gradient(ellipse at 20% 50%, rgba(120,40,200,0.07) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(0,150,255,0.05) 0%, transparent 50%)',
  },

  header: {
    position: 'relative', zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 40px',
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(24px)',
    borderBottom: '1px solid rgba(255,215,0,0.12)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 14 },
  logoTitle: {
    fontSize: 22, fontWeight: 900, letterSpacing: 4,
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  logoSub: { fontSize: 11, color: '#666', letterSpacing: 1, marginTop: 1 },
  nav: { display: 'flex', alignItems: 'center', gap: 14 },
  navBtn: {
    padding: '8px 18px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20, color: '#ccc', cursor: 'pointer', fontSize: 13,
  },
  userArea: { display: 'flex', alignItems: 'center', gap: 12 },
  walletChip: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(255,215,0,0.07)',
    border: '1px solid rgba(255,215,0,0.2)',
    borderRadius: 24, padding: '8px 18px',
  },
  walletName: { fontSize: 11, color: '#999' },
  walletBal: { fontSize: 17, fontWeight: 700, color: '#ffd700' },
  loginBtn: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    border: 'none', borderRadius: 24, color: '#000',
    fontWeight: 700, cursor: 'pointer', fontSize: 14,
  },
  logoutBtn: {
    padding: '8px 16px',
    background: 'rgba(255,59,59,0.12)',
    border: '1px solid rgba(255,59,59,0.25)',
    borderRadius: 20, color: '#ff6b6b', cursor: 'pointer', fontSize: 13,
  },

  main: {
    position: 'relative', zIndex: 1,
    display: 'flex', gap: 24,
    padding: '32px 40px',
    maxWidth: 1300, margin: '0 auto',
    flexWrap: 'wrap',
  },

  gamePanel: {
    flex: '2 1 520px',
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 24, padding: '30px 32px',
    backdropFilter: 'blur(20px)',
    display: 'flex', flexDirection: 'column', gap: 26,
  },
  panelTitle: {
    display: 'flex', alignItems: 'center', gap: 14,
    fontSize: 18, fontWeight: 700, color: '#ffd700',
  },
  titleLine: {
    flex: 1, height: 1,
    background: 'linear-gradient(90deg, rgba(255,215,0,0.35), transparent)',
  },

  gameCards: { display: 'flex', gap: 14 },
  gCard: {
    flex: 1, position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    padding: '22px 14px 18px',
    background: 'rgba(255,255,255,0.04)',
    border: '2px solid rgba(255,255,255,0.08)',
    borderRadius: 20, cursor: 'pointer', color: '#fff',
    transition: 'all 0.2s',
  },
  gCardActive: {
    background: 'rgba(255,215,0,0.07)',
    border: '2px solid rgba(255,215,0,0.55)',
    transform: 'translateY(-4px)',
    boxShadow: '0 8px 28px rgba(255,215,0,0.12)',
  },
  gCardGlow: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at 50% 0%, rgba(255,215,0,0.12) 0%, transparent 70%)',
    transition: 'opacity 0.2s',
  },
  gName: { fontSize: 22, fontWeight: 800, letterSpacing: 1 },
  gDesc: { fontSize: 12, color: '#999', textAlign: 'center', lineHeight: 1.5 },
  gMeta: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  gDiff: { fontSize: 11, padding: '2px 10px', borderRadius: 10, border: '1px solid', fontWeight: 600 },
  gCheck: {
    position: 'absolute', top: 12, right: 12,
    width: 22, height: 22, borderRadius: '50%',
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    color: '#000', fontWeight: 700, fontSize: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  betLabel: { fontSize: 14, fontWeight: 600, color: '#999', marginBottom: 10 },
  betChips: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  chip: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '12px 18px', borderRadius: 16, minWidth: 70,
    background: 'rgba(255,255,255,0.05)',
    border: '2px solid rgba(255,255,255,0.09)',
    cursor: 'pointer', color: '#fff', transition: 'all 0.2s',
  },
  chipActive: {
    background: 'rgba(255,215,0,0.1)',
    border: '2px solid rgba(255,215,0,0.7)',
    boxShadow: '0 0 14px rgba(255,215,0,0.18)',
    transform: 'translateY(-2px)',
  },
  chipVal: { fontSize: 20, fontWeight: 800, color: '#ffd700' },
  chipUnit: { fontSize: 11, color: '#777' },

  actions: { display: 'flex', gap: 14 },
  playBtn: {
    flex: 1, padding: '15px 20px', borderRadius: 16,
    border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700,
    transition: 'all 0.2s', letterSpacing: 0.5,
  },
  botBtn: {
    background: 'linear-gradient(135deg, #1565c0, #0d47a1)',
    boxShadow: '0 4px 18px rgba(21,101,192,0.35)', color: '#fff',
  },
  onlineBtn: {
    background: 'linear-gradient(135deg, #c62828, #b71c1c)',
    boxShadow: '0 4px 18px rgba(198,40,40,0.35)', color: '#fff',
  },

  infoStrip: {
    display: 'flex', gap: 10, flexWrap: 'wrap',
    paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  badge: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20,
  },

  sidebar: {
    flex: '1 1 280px', maxWidth: 340,
    display: 'flex', flexDirection: 'column', gap: 18,
  },

  rulesCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20, padding: '18px 22px',
  },
  rulesTitle: { fontSize: 14, fontWeight: 700, color: '#ffd700', marginBottom: 10 },
  rulesList: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 },
  rulesItem: { fontSize: 13, color: '#bbb', lineHeight: 1.5 },

  modalOverlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  lbModal: {
    position: 'relative',
    background: 'rgba(8,8,22,0.97)',
    border: '1px solid rgba(255,215,0,0.18)',
    borderRadius: 24, padding: '32px 36px',
    minWidth: 340, maxWidth: 460, width: '90vw',
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: 'none',
    color: '#fff', cursor: 'pointer', fontSize: 14,
  },
};
