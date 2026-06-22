import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../lib/i18n';

interface AuthModalProps {
  onClose: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const { loginAsGuest, loginWithEmail, signupWithEmail } = useAuth();
  const { t } = useT();
  const [tab, setTab] = useState<'guest' | 'login' | 'signup'>('guest');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGuest = () => {
    if (!name.trim()) return setError(t.errNickname);
    loginAsGuest(name.trim());
    onClose();
  };

  const handleLogin = async () => {
    setLoading(true); setError('');
    const err = await loginWithEmail(email, password);
    setLoading(false);
    if (err) setError(err.message);
    else onClose();
  };

  const handleSignup = async () => {
    if (!name.trim()) return setError(t.errNickname);
    setLoading(true); setError('');
    const err = await signupWithEmail(email, password, name.trim());
    setLoading(false);
    if (err) setError(err.message);
    else onClose();
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        <div style={s.modalHeader}>
          <span style={{ fontSize: 32 }}>🃏</span>
          <div>
            <div style={s.modalTitle}>{t.authTitle}</div>
            <div style={s.modalSub}>{t.authSub}</div>
          </div>
        </div>

        <div style={s.tabs}>
          {(['guest', 'login', 'signup'] as const).map((tp) => (
            <button
              key={tp}
              style={{ ...s.tab, ...(tab === tp ? s.activeTab : {}) }}
              onClick={() => { setTab(tp); setError(''); }}
            >
              {tp === 'guest' ? t.tabGuest : tp === 'login' ? t.tabLogin : t.tabSignup}
            </button>
          ))}
        </div>

        <div style={s.content}>
          {tab === 'guest' && (
            <>
              <div style={s.fieldLabel}>{t.nickname}</div>
              <input
                style={s.input}
                placeholder={t.nicknamePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGuest()}
                autoFocus
              />
              <div style={s.guestNote}>{t.guestNote}</div>
              <button style={s.submitBtn} onClick={handleGuest}>
                {t.playAsGuest}
              </button>
            </>
          )}

          {tab === 'login' && (
            <>
              <div style={s.fieldLabel}>{t.email}</div>
              <input
                style={s.input}
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div style={s.fieldLabel}>{t.password}</div>
              <input
                style={s.input}
                type="password"
                placeholder={t.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <button style={{ ...s.submitBtn, opacity: loading ? 0.6 : 1 }} onClick={handleLogin} disabled={loading}>
                {loading ? t.loggingIn : t.loginBtn}
              </button>
            </>
          )}

          {tab === 'signup' && (
            <>
              <div style={s.fieldLabel}>{t.nickname}</div>
              <input
                style={s.input}
                placeholder={t.leaderboardNickPlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div style={s.fieldLabel}>{t.email}</div>
              <input
                style={s.input}
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div style={s.fieldLabel}>{t.password}</div>
              <input
                style={s.input}
                type="password"
                placeholder={t.passwordMinPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
              />
              <button style={{ ...s.submitBtn, opacity: loading ? 0.6 : 1 }} onClick={handleSignup} disabled={loading}>
                {loading ? t.signingUp : t.signupBtn}
              </button>
            </>
          )}

          {error && <div style={s.error}>⚠️ {error}</div>}
        </div>

        <button style={s.closeBtn} onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.8)',
    backdropFilter: 'blur(12px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    position: 'relative',
    width: 400, maxWidth: '94vw',
    background: 'linear-gradient(145deg, #0d0d22, #0a1020)',
    border: '1px solid rgba(255,215,0,0.2)',
    borderRadius: 24,
    padding: '28px 30px 24px',
    boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,215,0,0.08)',
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', gap: 12,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22, fontWeight: 800, color: '#fff',
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  modalSub: { fontSize: 12, color: '#888', marginTop: 2 },
  tabs: {
    display: 'flex', gap: 6, marginBottom: 20,
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 4,
  },
  tab: {
    flex: 1, padding: '9px 6px',
    background: 'transparent', border: 'none',
    borderRadius: 10, color: '#777', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
  },
  activeTab: {
    background: 'rgba(255,215,0,0.12)',
    color: '#ffd700',
    boxShadow: '0 0 0 1px rgba(255,215,0,0.25)',
  },
  content: { display: 'flex', flexDirection: 'column', gap: 10 },
  fieldLabel: { fontSize: 12, color: '#888', fontWeight: 600, marginBottom: -4 },
  input: {
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, color: '#fff', fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  guestNote: {
    fontSize: 12, color: '#666',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, padding: '8px 12px',
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: 6,
    padding: '13px 20px',
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    border: 'none', borderRadius: 14,
    color: '#000', fontWeight: 800, cursor: 'pointer',
    fontSize: 15, letterSpacing: 0.3,
    boxShadow: '0 4px 18px rgba(255,165,0,0.3)',
    transition: 'opacity 0.2s',
  },
  error: {
    padding: '10px 14px',
    background: 'rgba(255,59,59,0.1)',
    border: '1px solid rgba(255,59,59,0.2)',
    borderRadius: 10,
    color: '#ff8080', fontSize: 13,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    width: 30, height: 30, borderRadius: '50%',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#888', cursor: 'pointer', fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
