import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { useT } from '../lib/i18n';
import { AuthModal } from '../components/AuthModal';
import { Leaderboard } from '../components/Leaderboard';

type GameType = 'somsip' | 'khang';
const BET_OPTIONS = [2, 5, 10, 20];

export function LobbyPage() {
  const { user, loading, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const { t, lang, toggle } = useT();
  const [dismissed, setDismissed] = useState(false);
  const [gameType, setGameType] = useState<GameType>('somsip');
  const [betAmount, setBetAmount] = useState(5);
  const [joining, setJoining] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const wasLoggedIn = useRef(false);

  useEffect(() => {
    if (!loading) {
      if (user) {
        wasLoggedIn.current = true;
      } else if (wasLoggedIn.current) {
        wasLoggedIn.current = false;
        setDismissed(false);
      }
    }
  }, [user, loading]);

  const showAuth = !loading && !user && !dismissed;

  const joinGame = (withBots: boolean) => {
    if (!user) return setDismissed(false);
    if (user.balance < betAmount) return alert(t.notEnoughBalance);
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

  const games = [
    {
      id: 'somsip' as GameType, icon: '🀄',
      name: t.games.somsip.name,
      desc: t.games.somsip.desc,
      players: lang === 'th' ? '2–5 คน' : '2–5 players',
      diff: lang === 'th' ? 'ปานกลาง' : 'Medium', diffColor: '#f39c12',
    },
    {
      id: 'khang' as GameType, icon: '🃏',
      name: t.games.khang.name,
      desc: t.games.khang.desc,
      players: lang === 'th' ? '2–5 คน' : '2–5 players',
      diff: lang === 'th' ? 'ง่าย' : 'Easy', diffColor: '#27ae60',
    },
  ];

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
            <div style={s.logoTitle}>SecretCard.io</div>
            <div style={s.logoSub}>{t.onlineCard}</div>
          </div>
        </div>
        <nav style={s.nav}>
          {/* Language toggle */}
          <button style={s.langBtn} onClick={toggle} title="Switch language">
            {lang === 'th' ? '🇬🇧 EN' : '🇹🇭 TH'}
          </button>
          <button style={s.navBtn} onClick={() => setShowLeaderboard(true)}>{t.rankBtn}</button>
          {user ? (
            <div style={s.userArea}>
              <div style={s.walletChip}>
                <span style={{ fontSize: 20 }}>💰</span>
                <div>
                  <div style={s.walletName}>{user.isGuest ? t.guest : '⭐ ' + user.name}</div>
                  <div style={s.walletBal}>{user.balance.toLocaleString()} {t.baht}</div>
                </div>
              </div>
              <button style={s.logoutBtn} onClick={logout}>{t.logoutBtn}</button>
            </div>
          ) : (
            <button style={s.loginBtn} onClick={() => setDismissed(false)}>{t.loginSignup}</button>
          )}
        </nav>
      </header>

      {/* Main */}
      <main style={s.main}>
        <section style={s.gamePanel}>
          <div style={s.panelTitle}>
            <span>{lang === 'th' ? 'เลือกเกม' : 'Choose Game'}</span>
            <div style={s.titleLine} />
          </div>

          <div style={s.gameCards}>
            {games.map((g) => {
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

          <div>
            <div style={s.betLabel}>{lang === 'th' ? 'เลือกเดิมพัน' : 'Select Bet'}</div>
            <div style={s.betChips}>
              {BET_OPTIONS.map((b) => (
                <button
                  key={b}
                  style={{ ...s.chip, ...(betAmount === b ? s.chipActive : {}) }}
                  onClick={() => setBetAmount(b)}
                >
                  <span style={{ fontSize: 18 }}>🪙</span>
                  <span style={s.chipVal}>{b}</span>
                  <span style={s.chipUnit}>{t.baht}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={s.actions}>
            <button
              style={{ ...s.playBtn, ...s.botBtn, opacity: joining ? 0.65 : 1 }}
              onClick={() => joinGame(true)}
              disabled={joining}
            >
              {joining ? `⏳ ${t.joining}` : t.playBot}
            </button>
            <button
              style={{ ...s.playBtn, ...s.onlineBtn, opacity: joining ? 0.65 : 1 }}
              onClick={() => joinGame(false)}
              disabled={joining}
            >
              {joining ? `⏳ ${t.joining}` : t.playOnline}
            </button>
          </div>

          <div style={s.infoStrip}>
            {[
              ['🛡', lang === 'th' ? 'ปลอดภัย 100%' : '100% Safe'],
              ['⚡', 'Realtime'],
              ['🎮', 'Free to Play'],
              ['🏆', 'Leaderboard'],
            ].map(([icon, text]) => (
              <div key={text} style={s.badge}>
                <span>{icon}</span>
                <span style={{ fontSize: 12, color: '#888' }}>{text}</span>
              </div>
            ))}
          </div>
        </section>

        <aside style={s.sidebar}>
          <Leaderboard compact />
          <div style={s.rulesCard}>
            <div style={s.rulesTitle}>{t.rulesTitle} {t.games[gameType].name}</div>
            <ul style={s.rulesList}>
              {t.games[gameType].rules.map((r, i) => (
                <li key={i} style={s.rulesItem}>{r}</li>
              ))}
            </ul>
          </div>
        </aside>
      </main>

      <footer style={s.footer}>
        <span style={s.footerText}>© 2025 SecretCard.io</span>
        <span style={s.footerDot}>·</span>
        <span style={s.footerDev}>{t.footer} <span style={s.footerName}>SecretX</span></span>
      </footer>
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
  langBtn: {
    padding: '7px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 20, color: '#ddd', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    transition: 'all 0.2s',
  },
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

  footer: {
    position: 'relative', zIndex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '14px 0',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  footerText: { fontSize: 12, color: '#444' },
  footerDot: { fontSize: 12, color: '#333' },
  footerDev: { fontSize: 12, color: '#555' },
  footerName: {
    fontWeight: 700,
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
};
