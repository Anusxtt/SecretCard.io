import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { useT } from '../lib/i18n';
import { AuthModal } from '../components/AuthModal';
import { Leaderboard } from '../components/Leaderboard';
import { AvatarBubble } from '../components/AvatarBubble';
import {
  Trophy, Bot, Globe, Wallet, LogOut, LogIn,
  Shield, Zap, Gamepad2, Users, Coins, Loader2, X, Check, Spade,
} from 'lucide-react';

type GameType = 'somsip' | 'khang';
const BET_OPTIONS = [2, 5, 10, 20, 50, 100];

// ── Floating card suits background ──────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];
const FLOATERS = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  suit: SUITS[i % 4],
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 18 + Math.random() * 28,
  dur: 8 + Math.random() * 14,
  delay: -Math.random() * 12,
  color: i % 4 < 2 ? 'rgba(255,215,0,0.07)' : 'rgba(255,215,0,0.05)',
}));

export function LobbyPage() {
  const { user, loading, logout } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, toggle } = useT();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [gameType, setGameType] = useState<GameType>('somsip');
  const [betAmount, setBetAmount] = useState(5);
  const [joining, setJoining] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [botCount, setBotCount] = useState(1);
  const [showBotConfig, setShowBotConfig] = useState(false);
  const wasLoggedIn = useRef(false);
  const autoJoinFired = useRef(false);

  useEffect(() => {
    if (!loading) {
      if (user) { wasLoggedIn.current = true; }
      else if (wasLoggedIn.current) { wasLoggedIn.current = false; }
    }
  }, [user, loading]);

  useEffect(() => {
    const ls = location.state as { autoJoin?: GameType; betAmount?: number } | null;
    if (!ls?.autoJoin || autoJoinFired.current || loading || !user) return;
    autoJoinFired.current = true;
    if (ls.betAmount) setBetAmount(ls.betAmount);
    setGameType(ls.autoJoin);
    setTimeout(() => joinGame(true, ls.autoJoin!, ls.betAmount ?? betAmount), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const joinGame = (withBots: boolean, gt: GameType = gameType, ba: number = betAmount) => {
    if (!user) return;
    if (user.balance < ba) return alert(t.notEnoughBalance);
    setJoining(true);
    socket.emit('join_lobby', {
      gameType: gt, betAmount: ba,
      playerName: user.name,
      playerId: user.isGuest ? undefined : user.id,
      balance: user.balance,
      avatarSeed: user.avatarSeed, avatarFrame: user.avatarFrame,
    });
    socket.once('joined_room', ({ roomId, playerId }: { roomId: string; playerId: string }) => {
      const goToGame = () => {
        navigate(`/${gt}/${roomId}`, {
          state: { playerId, betAmount: ba, avatarSeed: user.avatarSeed, avatarFrame: user.avatarFrame, playerName: user.name },
        });
        setJoining(false);
      };
      socket.once('game_ready', goToGame);
      socket.once('game_start', goToGame);
      if (withBots) socket.emit('start_with_bots', { roomId, botCount });
    });
  };

  const games = [
    { id: 'somsip' as GameType, name: t.games.somsip.name, desc: t.games.somsip.desc, players: lang === 'th' ? '2–5 คน' : '2–5 players', diff: lang === 'th' ? 'ปานกลาง' : 'Medium', diffColor: '#f39c12', accent: '#f39c12' },
    { id: 'khang' as GameType, name: t.games.khang.name, desc: t.games.khang.desc, players: lang === 'th' ? '2–5 คน' : '2–5 players', diff: lang === 'th' ? 'ง่าย' : 'Easy', diffColor: '#27ae60', accent: '#ffd700' },
  ];

  const infoBadges = [
    { Icon: Shield, text: lang === 'th' ? 'ปลอดภัย 100%' : '100% Safe' },
    { Icon: Zap, text: 'Realtime' },
    { Icon: Gamepad2, text: 'Free to Play' },
    { Icon: Trophy, text: 'Leaderboard' },
  ];

  return (
    <div style={s.root}>
      {/* Animated gradient background orbs */}
      <div style={s.orb1} />
      <div style={s.orb2} />
      <div style={s.orb3} />

      {/* Floating suit symbols */}
      <div style={s.floatLayer}>
        {FLOATERS.map(f => (
          <motion.div
            key={f.id}
            style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, fontSize: f.size, color: f.color, userSelect: 'none', pointerEvents: 'none' }}
            animate={{ y: [0, -40, 0], rotate: [0, 15, -10, 0], opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: f.dur, delay: f.delay, repeat: Infinity, ease: 'easeInOut' }}
          >
            {f.suit}
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </AnimatePresence>

      {/* Bot Config Modal */}
      <AnimatePresence>
        {showBotConfig && (
          <motion.div style={s.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowBotConfig(false)}>
            <motion.div style={s.botConfigModal} initial={{ scale: 0.85, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 40 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <button style={s.closeBtn} onClick={() => setShowBotConfig(false)}><X size={16} /></button>
              <div style={s.botConfigTitle}>
                <Bot size={20} color="#90caf9" />
                {lang === 'th' ? 'ตั้งค่าเกมกับบอท' : 'Play with Bots'}
              </div>
              <div style={s.botConfigSection}>
                <div style={s.sectionLabel}><Coins size={13} color="#888" /><span>{lang === 'th' ? 'เดิมพัน' : 'Bet Amount'}</span></div>
                <div style={s.betChips}>
                  {BET_OPTIONS.map((b) => (
                    <motion.button key={b} style={{ ...s.chip, ...(betAmount === b ? s.chipActive : {}) }}
                      onClick={() => setBetAmount(b)}
                      whileHover={{ y: -3 }} whileTap={{ scale: 0.93 }}>
                      <span style={s.chipVal}>{b}</span>
                      <span style={s.chipUnit}>{t.baht}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
              <div style={s.botConfigSection}>
                <div style={s.sectionLabel}><Bot size={13} color="#888" /><span>{lang === 'th' ? 'จำนวนบอท' : 'Number of Bots'}</span></div>
                <div style={s.botCountChips}>
                  {[1, 2, 3, 4].map((n) => (
                    <motion.button key={n} style={{ ...s.botChip, ...(botCount === n ? s.botChipActive : {}) }}
                      onClick={() => setBotCount(n)}
                      whileHover={{ y: -3 }} whileTap={{ scale: 0.9 }}>
                      {n}
                    </motion.button>
                  ))}
                </div>
              </div>
              <motion.button style={{ ...s.playBtn, ...s.botBtn, marginTop: 8 }}
                onClick={() => { setShowBotConfig(false); joinGame(true); }}
                disabled={joining}
                whileHover={joining ? {} : { scale: 1.03, boxShadow: '0 8px 32px rgba(21,101,192,0.55)' }}
                whileTap={joining ? {} : { scale: 0.97 }}>
                {joining ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Bot size={16} />}
                {joining ? t.joining : (lang === 'th' ? 'เริ่มเกม' : 'Start Game')}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLeaderboard && (
          <motion.div style={s.modalOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowLeaderboard(false)}>
            <motion.div style={s.lbModal} initial={{ scale: 0.85, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 40 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <button style={s.closeBtn} onClick={() => setShowLeaderboard(false)}><X size={16} /></button>
              <Leaderboard />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.header style={s.header} initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
        <div style={s.logo}>
          <motion.div animate={{ rotate: [0, 10, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
            <Spade size={34} color="#ffd700" fill="#ffd700" />
          </motion.div>
          <div>
            <div style={s.logoTitle}>SecretCard.io</div>
            <div style={s.logoSub}>{t.onlineCard}</div>
          </div>
        </div>
        <nav style={s.nav}>
          <motion.button style={s.langBtn} onClick={toggle} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            {lang === 'th' ? 'EN' : 'TH'}
          </motion.button>
          <motion.button style={s.navBtn} onClick={() => setShowLeaderboard(true)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Trophy size={14} />{t.rankBtn.replace('🏆 ', '')}
          </motion.button>
          {user ? (
            <div style={s.userArea}>
              <motion.div style={s.walletChip} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                <AvatarBubble avatarSeed={user.avatarSeed} avatarFrame={user.avatarFrame} size={36} />
                <div>
                  <div style={s.walletName}>{user.isGuest ? user.name : user.name}</div>
                  <div style={s.walletBal}>
                    <Wallet size={13} color="#ffd700" style={{ marginRight: 4 }} />
                    {user.balance.toLocaleString()} {t.baht}
                    {user.isGuest && <span style={s.guestTag}>Guest</span>}
                  </div>
                </div>
              </motion.div>
              {user.isGuest ? (
                <motion.button style={s.loginBtn} onClick={() => setShowAuthModal(true)} whileHover={{ scale: 1.05, boxShadow: '0 0 24px rgba(255,215,0,0.4)' }} whileTap={{ scale: 0.95 }}>
                  <LogIn size={14} />{t.loginSignup}
                </motion.button>
              ) : (
                <>
                  <motion.button style={s.profileBtn} onClick={() => navigate('/profile')} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>โปรไฟล์</motion.button>
                  <motion.button style={s.logoutBtn} onClick={logout} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <LogOut size={14} />{t.logoutBtn}
                  </motion.button>
                </>
              )}
            </div>
          ) : (
            <motion.button style={s.loginBtn} onClick={() => setShowAuthModal(true)} whileHover={{ scale: 1.05, boxShadow: '0 0 24px rgba(255,215,0,0.4)' }} whileTap={{ scale: 0.95 }}>
              <LogIn size={14} />{t.loginSignup}
            </motion.button>
          )}
        </nav>
      </motion.header>

      {/* Main */}
      <main style={s.main}>
        {/* Game Panel */}
        <motion.section style={s.gamePanel}
          initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>

          <div style={s.panelTitle}>
            <span>{lang === 'th' ? 'เลือกเกม' : 'Choose Game'}</span>
            <motion.div style={s.titleLine} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }} />
          </div>

          {/* Game cards */}
          <div style={s.gameCards}>
            {games.map((g, i) => {
              const active = gameType === g.id;
              return (
                <motion.button key={g.id} style={{ ...s.gCard, ...(active ? { ...s.gCardActive, borderColor: g.accent + '99' } : {}) }}
                  onClick={() => setGameType(g.id)}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                  whileHover={{ y: -6, boxShadow: `0 12px 36px ${g.accent}22` }}
                  whileTap={{ scale: 0.97 }}>
                  <motion.div style={{ ...s.gCardGlow, background: `radial-gradient(ellipse at 50% 0%, ${g.accent}20 0%, transparent 70%)`, opacity: active ? 1 : 0 }}
                    animate={{ opacity: active ? 1 : 0 }} />
                  <motion.div animate={active ? { rotate: [0, -8, 8, 0] } : {}} transition={{ duration: 0.4 }}>
                    <Gamepad2 size={48} color={active ? g.accent : '#555'} style={{ marginBottom: 4 }} />
                  </motion.div>
                  <div style={s.gName}>{g.name}</div>
                  <div style={s.gDesc}>{g.desc}</div>
                  <div style={s.gMeta}>
                    <span style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Users size={11} /> {g.players}
                    </span>
                    <span style={{ ...s.gDiff, color: g.diffColor, borderColor: g.diffColor }}>{g.diff}</span>
                  </div>
                  <AnimatePresence>
                    {active && (
                      <motion.div style={s.gCheck} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                        <Check size={12} strokeWidth={3} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          {/* Action buttons */}
          <motion.div style={s.actions} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <motion.button style={{ ...s.playBtn, ...s.botBtn }} onClick={() => setShowBotConfig(true)} disabled={joining}
              whileHover={joining ? {} : { scale: 1.03, boxShadow: '0 8px 32px rgba(21,101,192,0.55)' }}
              whileTap={joining ? {} : { scale: 0.97 }}
              animate={joining ? { opacity: 0.65 } : { opacity: 1 }}>
              <Bot size={16} />
              {t.playBot.replace('🤖 ', '')}
            </motion.button>
            <motion.button style={{ ...s.playBtn, ...s.onlineBtn }} onClick={() => joinGame(false)} disabled={joining}
              whileHover={joining ? {} : { scale: 1.03, boxShadow: '0 8px 32px rgba(198,40,40,0.55)' }}
              whileTap={joining ? {} : { scale: 0.97 }}
              animate={joining ? { opacity: 0.65 } : { opacity: 1 }}>
              {joining ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Globe size={16} />}
              {joining ? t.joining : t.playOnline.replace('🌐 ', '')}
            </motion.button>
          </motion.div>

          {/* Info badges */}
          <motion.div style={s.infoStrip} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
            {infoBadges.map(({ Icon, text }, i) => (
              <motion.div key={text} style={s.badge} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.55 + i * 0.07 }}
                whileHover={{ scale: 1.05, background: 'rgba(255,255,255,0.07)' }}>
                <Icon size={13} color="#888" />
                <span style={{ fontSize: 12, color: '#888' }}>{text}</span>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* Sidebar */}
        <motion.aside style={s.sidebar} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.25 }}>
          <Leaderboard compact />
          <motion.div style={s.rulesCard} whileHover={{ borderColor: 'rgba(255,215,0,0.2)' }} transition={{ duration: 0.2 }}>
            <div style={s.rulesTitle}>{t.games[gameType].name} — {lang === 'th' ? 'กติกา' : 'Rules'}</div>
            <AnimatePresence mode="wait">
              <motion.ul key={gameType} style={s.rulesList}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}>
                {t.games[gameType].rules.map((r, i) => (
                  <motion.li key={i} style={s.rulesItem} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    {r}
                  </motion.li>
                ))}
              </motion.ul>
            </AnimatePresence>
          </motion.div>
        </motion.aside>
      </main>

      <motion.footer style={s.footer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
        <span style={s.footerText}>© 2025 SecretCard.io</span>
        <span style={s.footerDot}>·</span>
        <span style={s.footerDev}>{t.footer} <span style={s.footerName}>SecretX</span></span>
      </motion.footer>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #06080f 0%, #0c1525 45%, #080f1e 75%, #04080e 100%)',
    color: '#fff',
    fontFamily: "'Segoe UI', 'Noto Sans Thai', sans-serif",
    position: 'relative',
    overflow: 'hidden',
  },
  // animated orbs
  orb1: {
    position: 'fixed', top: '-15%', left: '-10%',
    width: 700, height: 700, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(100,30,200,0.12) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
    animation: 'orbFloat1 18s ease-in-out infinite',
  },
  orb2: {
    position: 'fixed', bottom: '-20%', right: '-10%',
    width: 600, height: 600, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,120,255,0.1) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
    animation: 'orbFloat2 22s ease-in-out infinite',
  },
  orb3: {
    position: 'fixed', top: '40%', left: '50%',
    width: 400, height: 400, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,180,0,0.05) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
    animation: 'orbFloat3 14s ease-in-out infinite',
  },
  floatLayer: {
    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
  },

  header: {
    position: 'relative', zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 40px',
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(28px)',
    borderBottom: '1px solid rgba(255,215,0,0.15)',
    boxShadow: '0 1px 0 rgba(255,215,0,0.06)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 14 },
  logoTitle: {
    fontSize: 22, fontWeight: 900, letterSpacing: 4,
    background: 'linear-gradient(135deg, #ffd700, #ff9800, #ffd700)',
    backgroundSize: '200% 100%',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    animation: 'shimmer 3s linear infinite',
  },
  logoSub: { fontSize: 11, color: '#555', letterSpacing: 1, marginTop: 1 },
  nav: { display: 'flex', alignItems: 'center', gap: 14 },
  langBtn: {
    padding: '7px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 20, color: '#ddd', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 18px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
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
  walletBal: { fontSize: 17, fontWeight: 700, color: '#ffd700', display: 'flex', alignItems: 'center' },
  loginBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    border: 'none', borderRadius: 24, color: '#000',
    fontWeight: 700, cursor: 'pointer', fontSize: 14,
  },
  profileBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 16px',
    background: 'rgba(255,215,0,0.08)',
    border: '1px solid rgba(255,215,0,0.25)',
    borderRadius: 20, color: '#ffd700', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  logoutBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 16px',
    background: 'rgba(255,59,59,0.1)',
    border: '1px solid rgba(255,59,59,0.22)',
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
    borderRadius: 28, padding: '30px 32px',
    backdropFilter: 'blur(24px)',
    display: 'flex', flexDirection: 'column', gap: 24,
    boxShadow: '0 8px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
  },
  panelTitle: {
    display: 'flex', alignItems: 'center', gap: 14,
    fontSize: 18, fontWeight: 700, color: '#ffd700',
  },
  titleLine: {
    flex: 1, height: 1,
    background: 'linear-gradient(90deg, rgba(255,215,0,0.4), transparent)',
    transformOrigin: 'left',
  },

  gameCards: { display: 'flex', gap: 14 },
  gCard: {
    flex: 1, position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    padding: '24px 14px 20px',
    background: 'rgba(255,255,255,0.04)',
    border: '2px solid rgba(255,255,255,0.08)',
    borderRadius: 22, cursor: 'pointer', color: '#fff',
  },
  gCardActive: {
    background: 'rgba(255,215,0,0.06)',
    boxShadow: '0 8px 28px rgba(255,215,0,0.1), inset 0 1px 0 rgba(255,215,0,0.1)',
  },
  gCardGlow: { position: 'absolute', inset: 0 },
  gName: { fontSize: 22, fontWeight: 800, letterSpacing: 1 },
  gDesc: { fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 1.6 },
  gMeta: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  gDiff: { fontSize: 11, padding: '2px 10px', borderRadius: 10, border: '1px solid', fontWeight: 600 },
  gCheck: {
    position: 'absolute', top: 12, right: 12,
    width: 22, height: 22, borderRadius: '50%',
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    color: '#000', fontWeight: 700, fontSize: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  betBotRow: {
    display: 'flex', alignItems: 'flex-start', gap: 0,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 18, overflow: 'hidden',
  },
  betSection: { flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  botSection: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' },
  dividerV: { width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.07)', margin: '10px 0' },
  sectionLabel: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#666', fontWeight: 600 },
  betChips: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    padding: '8px 12px', borderRadius: 12, minWidth: 54,
    background: 'rgba(255,255,255,0.05)',
    border: '2px solid rgba(255,255,255,0.09)',
    cursor: 'pointer', color: '#fff',
  },
  chipActive: {
    background: 'rgba(255,215,0,0.1)',
    border: '2px solid rgba(255,215,0,0.7)',
    boxShadow: '0 0 14px rgba(255,215,0,0.2)',
  },
  chipVal: { fontSize: 17, fontWeight: 800, color: '#ffd700' },
  chipUnit: { fontSize: 10, color: '#666' },

  botCountChips: { display: 'flex', gap: 8 },
  botChip: {
    width: 38, height: 38, borderRadius: 10,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#bbb', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  botChipActive: {
    background: 'rgba(21,101,192,0.28)',
    border: '1px solid rgba(21,101,192,0.75)',
    color: '#90caf9',
    boxShadow: '0 0 12px rgba(21,101,192,0.3)',
  },

  actions: { display: 'flex', gap: 14 },
  playBtn: {
    flex: 1, padding: '15px 20px', borderRadius: 18,
    border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700,
    letterSpacing: 0.5,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  botBtn: {
    background: 'linear-gradient(135deg, #1565c0, #0d47a1)',
    boxShadow: '0 4px 20px rgba(21,101,192,0.4)', color: '#fff',
  },
  onlineBtn: {
    background: 'linear-gradient(135deg, #c62828, #b71c1c)',
    boxShadow: '0 4px 20px rgba(198,40,40,0.4)', color: '#fff',
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
    borderRadius: 20, cursor: 'default',
    transition: 'background 0.15s',
  },

  sidebar: { flex: '1 1 280px', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 18 },
  rulesCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20, padding: '18px 22px',
    transition: 'border-color 0.2s',
  },
  rulesTitle: { fontSize: 14, fontWeight: 700, color: '#ffd700', marginBottom: 10 },
  rulesList: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 },
  rulesItem: { fontSize: 13, color: '#bbb', lineHeight: 1.5 },

  modalOverlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  lbModal: {
    position: 'relative',
    background: 'rgba(8,8,22,0.97)',
    border: '1px solid rgba(255,215,0,0.18)',
    borderRadius: 24, padding: '32px 36px',
    minWidth: 340, maxWidth: 460, width: '90vw',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
  botConfigModal: {
    position: 'relative',
    background: 'rgba(8,8,22,0.97)',
    border: '1px solid rgba(21,101,192,0.35)',
    borderRadius: 24, padding: '32px 36px',
    minWidth: 340, maxWidth: 440, width: '90vw',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    display: 'flex', flexDirection: 'column', gap: 20,
  },
  botConfigTitle: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 18, fontWeight: 700, color: '#90caf9',
  },
  botConfigSection: {
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: 'none',
    color: '#fff', cursor: 'pointer', fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  footer: {
    position: 'relative', zIndex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '14px 0',
    borderTop: '1px solid rgba(255,255,255,0.04)',
  },
  footerText: { fontSize: 12, color: '#333' },
  footerDot: { fontSize: 12, color: '#2a2a2a' },
  footerDev: { fontSize: 12, color: '#444' },
  footerName: {
    fontWeight: 700,
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
};
