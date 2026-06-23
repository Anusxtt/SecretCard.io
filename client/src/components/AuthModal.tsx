import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useIsMobile } from '../hooks/useIsMobile';
import { KeyRound, UserPlus, LogIn, Loader2, AlertTriangle, X, Eye, EyeOff, Mail, Lock, User } from 'lucide-react';

interface AuthModalProps {
  onClose: () => void;
}

type Tab = 'login' | 'signup';

const SUITS = ['♠', '♥', '♦', '♣'];

export function AuthModal({ onClose }: AuthModalProps) {
  const { loginWithEmail, loginWithGoogle, signupWithEmail } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = (t: Tab) => { setTab(t); setError(''); setSuccess(''); };

  const handleLogin = async () => {
    if (!email || !password) return setError('กรุณากรอกอีเมลและรหัสผ่าน');
    setLoading(true); setError('');
    const err = await loginWithEmail(email, password);
    setLoading(false);
    if (err) setError(err.message);
    else onClose();
  };

  const handleSignup = async () => {
    if (!name.trim()) return setError('กรุณากรอกชื่อผู้ใช้');
    if (!email || !password) return setError('กรุณากรอกอีเมลและรหัสผ่าน');
    if (password.length < 6) return setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    setLoading(true); setError('');
    const err = await signupWithEmail(email, password, name.trim());
    setLoading(false);
    if (err) setError(err.message);
    else setSuccess('สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยัน');
  };

  return (
    <motion.div
      style={s.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Floating suit particles */}
      {SUITS.map((suit, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            fontSize: 28 + i * 8,
            color: i < 2 ? 'rgba(255,215,0,0.12)' : 'rgba(255,215,0,0.08)',
            pointerEvents: 'none', userSelect: 'none',
            left: `${15 + i * 22}%`,
            top: `${20 + (i % 2) * 55}%`,
          }}
          animate={{ y: [0, -20, 0], rotate: [0, 10, -8, 0], opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 5 + i * 1.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.8 }}
        >
          {suit}
        </motion.div>
      ))}

      <motion.div
        style={{ ...s.modal, width: isMobile ? '95vw' : 420, padding: isMobile ? '24px 20px 18px' : '32px 32px 24px' }}
        initial={{ scale: 0.85, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, y: 50, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Glow ring */}
        <div style={s.glowRing} />

        {/* Header */}
        <div style={s.header}>
          <motion.div style={s.cardIcon}
            animate={{ rotateY: [0, 360] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}>
            ♠
          </motion.div>
          <div>
            <motion.div style={s.title}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
              SecretCard.io
            </motion.div>
            <motion.div style={s.subtitle}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
              เข้าสู่ระบบเพื่อบันทึกสถิติและเดิมพัน
            </motion.div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={s.tabBar}>
          {(['login', 'signup'] as Tab[]).map((tp) => (
            <motion.button
              key={tp}
              style={{ ...s.tabBtn, ...(tab === tp ? s.tabBtnActive : {}) }}
              onClick={() => reset(tp)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {tp === 'login' ? <KeyRound size={14} /> : <UserPlus size={14} />}
              {tp === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
              {tab === tp && (
                <motion.div style={s.tabIndicator} layoutId="tabIndicator" />
              )}
            </motion.button>
          ))}
        </div>

        {/* Form content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            style={s.form}
            initial={{ opacity: 0, x: tab === 'login' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tab === 'login' ? 20 : -20 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'signup' && (
              <InputField
                icon={<User size={16} color="#666" />}
                placeholder="ชื่อผู้ใช้"
                value={name}
                onChange={setName}
              />
            )}
            <InputField
              icon={<Mail size={16} color="#666" />}
              placeholder="อีเมล"
              type="email"
              value={email}
              onChange={setEmail}
              onEnter={tab === 'login' ? handleLogin : undefined}
            />
            <InputField
              icon={<Lock size={16} color="#666" />}
              placeholder="รหัสผ่าน"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              onEnter={tab === 'login' ? handleLogin : handleSignup}
              suffix={
                <button style={s.eyeBtn} onClick={() => setShowPass(!showPass)} tabIndex={-1}>
                  {showPass ? <EyeOff size={15} color="#666" /> : <Eye size={15} color="#666" />}
                </button>
              }
            />

            <AnimatePresence>
              {error && (
                <motion.div style={s.errorBox}
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <AlertTriangle size={14} />
                  <span>{error}</span>
                </motion.div>
              )}
              {success && (
                <motion.div style={s.successBox}
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <span>✓ {success}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              style={{ ...s.primaryBtn, opacity: loading ? 0.7 : 1 }}
              onClick={tab === 'login' ? handleLogin : handleSignup}
              disabled={loading}
              whileHover={loading ? {} : { scale: 1.02, boxShadow: '0 8px 32px rgba(255,165,0,0.45)' }}
              whileTap={loading ? {} : { scale: 0.97 }}
            >
              {loading
                ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
                : tab === 'login' ? <LogIn size={17} /> : <UserPlus size={17} />}
              {loading ? 'กำลังดำเนินการ...' : tab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </motion.button>

            <div style={s.orRow}>
              <div style={s.orLine} /><span style={s.orText}>หรือ</span><div style={s.orLine} />
            </div>

            <motion.button
              style={s.googleBtn}
              onClick={loginWithGoogle}
              whileHover={{ scale: 1.02, boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}
              whileTap={{ scale: 0.97 }}
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={18} height={18} alt="G" />
              <span>{tab === 'login' ? 'เข้าสู่ระบบด้วย Google' : 'สมัครด้วย Google'}</span>
            </motion.button>
          </motion.div>
        </AnimatePresence>

        {/* Guest note */}
        <motion.div style={s.guestNote}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          ตอนนี้คุณกำลังเล่นในฐานะ Guest — ข้อมูลจะไม่ถูกบันทึก
        </motion.div>

        {/* Close */}
        <motion.button style={s.closeBtn} onClick={onClose} whileHover={{ scale: 1.1, background: 'rgba(255,255,255,0.14)' }} whileTap={{ scale: 0.9 }}>
          <X size={15} />
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Input field component ────────────────────────────────────────────────────
function InputField({ icon, placeholder, type = 'text', value, onChange, onEnter, suffix }: {
  icon: React.ReactNode; placeholder: string; type?: string;
  value: string; onChange: (v: string) => void;
  onEnter?: () => void; suffix?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div style={{ ...s.inputWrap, ...(focused ? s.inputWrapFocused : {}) }}
      animate={focused ? { borderColor: 'rgba(255,215,0,0.5)', boxShadow: '0 0 0 3px rgba(255,215,0,0.08)' } : { borderColor: 'rgba(255,255,255,0.1)', boxShadow: 'none' }}
      transition={{ duration: 0.15 }}>
      <span style={s.inputIcon}>{icon}</span>
      <input
        style={s.input}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
      />
      {suffix}
    </motion.div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 300,
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(16px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  modal: {
    position: 'relative',
    width: 420, maxWidth: '95vw',
    background: 'linear-gradient(160deg, #0e0e20 0%, #080d18 60%, #0c0a1a 100%)',
    border: '1px solid rgba(255,215,0,0.18)',
    borderRadius: 28,
    padding: '32px 32px 24px',
    boxShadow: '0 32px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,215,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 20,
    overflow: 'hidden',
  },
  glowRing: {
    position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
    width: 280, height: 180,
    background: 'radial-gradient(ellipse, rgba(255,180,0,0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
  },

  header: { display: 'flex', alignItems: 'center', gap: 14 },
  cardIcon: {
    fontSize: 48, lineHeight: 1,
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    fontWeight: 900,
  },
  title: {
    fontSize: 24, fontWeight: 900, letterSpacing: 2,
    background: 'linear-gradient(135deg, #ffd700, #ffb300)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  subtitle: { fontSize: 12, color: '#666', marginTop: 3 },

  tabBar: {
    display: 'flex', gap: 0,
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 4,
  },
  tabBtn: {
    flex: 1, position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '10px 8px', borderRadius: 12,
    background: 'transparent', border: 'none',
    color: '#555', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    transition: 'color 0.2s',
    overflow: 'hidden',
  },
  tabBtnActive: { color: '#ffd700' },
  tabIndicator: {
    position: 'absolute', inset: 0, borderRadius: 12,
    background: 'rgba(255,215,0,0.1)',
    border: '1px solid rgba(255,215,0,0.25)',
    zIndex: -1,
  },

  form: { display: 'flex', flexDirection: 'column', gap: 12 },

  inputWrap: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '0 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  inputWrapFocused: {},
  inputIcon: { flexShrink: 0, display: 'flex', alignItems: 'center' },
  input: {
    flex: 1, padding: '13px 0',
    background: 'transparent',
    border: 'none', outline: 'none',
    color: '#fff', fontSize: 14,
  },
  eyeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '4px', display: 'flex', alignItems: 'center',
    flexShrink: 0,
  },

  errorBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px',
    background: 'rgba(255,60,60,0.1)',
    border: '1px solid rgba(255,60,60,0.22)',
    borderRadius: 12, color: '#ff8080', fontSize: 13,
    overflow: 'hidden',
  },
  successBox: {
    padding: '10px 14px',
    background: 'rgba(39,174,96,0.12)',
    border: '1px solid rgba(39,174,96,0.3)',
    borderRadius: 12, color: '#2ecc71', fontSize: 13,
    overflow: 'hidden',
  },

  primaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    border: 'none', borderRadius: 16,
    color: '#000', fontWeight: 800, cursor: 'pointer',
    fontSize: 15, letterSpacing: 0.3,
    boxShadow: '0 4px 20px rgba(255,165,0,0.3)',
  },

  orRow: { display: 'flex', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' },
  orText: { fontSize: 12, color: '#444', whiteSpace: 'nowrap' as const },

  googleBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '13px 20px',
    background: 'rgba(255,255,255,0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    color: '#333', fontWeight: 700, cursor: 'pointer', fontSize: 14,
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
  },

  guestNote: {
    textAlign: 'center' as const,
    fontSize: 12, color: '#444',
    padding: '8px 0 0',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#666', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  },
};
