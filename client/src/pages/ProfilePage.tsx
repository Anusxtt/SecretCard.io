import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { AvatarBubble, FRAME_COLORS, dicebearUrl } from '../components/AvatarBubble';
import {
  ArrowLeft, Check, Loader2, AlertTriangle,
  Wallet, Trophy, Pencil, Smile,
} from 'lucide-react';

const AVATAR_SEEDS = [
  'Dragon', 'Phoenix', 'Tiger', 'Ninja',
  'Wizard', 'Knight', 'Samurai', 'Pirate',
  'Fox', 'Panda', 'Wolf', 'Rabbit',
  'Ghost', 'Robot', 'Demon', 'Angel',
];

const FRAMES = [
  { id: 'none',   label: 'ไม่มี',   color: 'rgba(255,255,255,0.2)' },
  { id: 'gold',   label: 'ทอง',     color: '#ffd700' },
  { id: 'silver', label: 'เงิน',    color: '#bdc3c7' },
  { id: 'bronze', label: 'ทองแดง', color: '#cd7f32' },
  { id: 'blue',   label: 'น้ำเงิน', color: '#3498db' },
  { id: 'red',    label: 'แดง',     color: '#e74c3c' },
  { id: 'purple', label: 'ม่วง',    color: '#9b59b6' },
  { id: 'green',  label: 'เขียว',   color: '#27ae60' },
];

export function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [selectedSeed, setSelectedSeed] = useState(AVATAR_SEEDS[0]);
  const [selectedFrame, setSelectedFrame] = useState('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.name);
      setSelectedSeed(user.avatarSeed ?? AVATAR_SEEDS[0]);
      setSelectedFrame(user.avatarFrame ?? 'none');
    }
  }, [user]);

  if (!user || user.isGuest) {
    navigate('/');
    return null;
  }

  const handleSave = async () => {
    if (!username.trim()) { setError('กรุณาใส่ชื่อ'); return; }
    setSaving(true); setError(''); setSuccess(false);
    const { error: err } = await supabase
      .from('profiles')
      .update({ username: username.trim(), avatar_seed: selectedSeed, avatar_frame: selectedFrame })
      .eq('id', user.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    await refreshProfile();
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2500);
  };

  const frameColor = FRAME_COLORS[selectedFrame] ?? FRAME_COLORS.none;

  return (
    <div style={s.root}>
      <div style={s.bgOverlay} />

      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> กลับ Lobby
        </button>
        <div style={s.headerTitle}>โปรไฟล์ของฉัน</div>
        <div style={{ width: 110 }} />
      </header>

      <main style={s.main}>

        {/* Left card — avatar + frame */}
        <div style={s.card}>

          {/* Preview */}
          <div style={s.previewWrap}>
            <div
              style={{
                ...s.previewRing,
                borderColor: frameColor,
                boxShadow: selectedFrame === 'none' ? 'none' : `0 0 24px ${frameColor}66`,
              }}
            >
              <img src={dicebearUrl(selectedSeed)} alt={selectedSeed} style={s.previewImg} />
            </div>
            <div style={s.previewName}>{username || 'ชื่อของคุณ'}</div>
          </div>

          {/* Avatar Picker */}
          <div style={s.sectionTitle}>
            <Smile size={15} color="#ffd700" /> เลือก Avatar
          </div>
          <div style={s.avatarGrid}>
            {AVATAR_SEEDS.map((seed) => (
              <button
                key={seed}
                title={seed}
                onClick={() => setSelectedSeed(seed)}
                style={{
                  ...s.avatarBtn,
                  borderColor: selectedSeed === seed ? '#ffd700' : 'rgba(255,255,255,0.08)',
                  background: selectedSeed === seed ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)',
                  boxShadow: selectedSeed === seed ? '0 0 10px rgba(255,215,0,0.3)' : 'none',
                }}
              >
                <img src={dicebearUrl(seed)} alt={seed} style={s.avatarImg} />
                <span style={{ fontSize: 9, color: selectedSeed === seed ? '#ffd700' : '#666', marginTop: 2 }}>
                  {seed}
                </span>
                {selectedSeed === seed && (
                  <div style={s.avatarCheck}><Check size={8} strokeWidth={3} /></div>
                )}
              </button>
            ))}
          </div>

          {/* Frame Picker */}
          <div style={s.sectionTitle}>
            <Trophy size={15} color="#ffd700" /> กรอบ
          </div>
          <div style={s.frameGrid}>
            {FRAMES.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFrame(f.id)}
                style={{
                  ...s.frameBtn,
                  borderColor: f.id === 'none' ? 'rgba(255,255,255,0.15)' : f.color,
                  background: selectedFrame === f.id
                    ? (f.id === 'none' ? 'rgba(255,255,255,0.08)' : `${f.color}22`)
                    : 'rgba(255,255,255,0.03)',
                  boxShadow: selectedFrame === f.id && f.id !== 'none' ? `0 0 8px ${f.color}55` : 'none',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${f.id === 'none' ? 'rgba(255,255,255,0.2)' : f.color}`,
                  background: f.id === 'none' ? 'transparent' : `${f.color}44`,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: selectedFrame === f.id ? '#fff' : '#777' }}>
                  {f.label}
                </span>
                {selectedFrame === f.id && (
                  <Check size={10} color="#ffd700" style={{ marginLeft: 'auto', flexShrink: 0 }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right card — name + stats + save */}
        <div style={s.card}>
          <div style={s.sectionTitle}>
            <Pencil size={15} color="#ffd700" /> ข้อมูลส่วนตัว
          </div>

          <div style={s.field}>
            <label style={s.label}>ชื่อผู้เล่น</label>
            <input
              style={s.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ชื่อที่แสดงในเกม"
              maxLength={20}
            />
            <span style={s.inputHint}>{username.length}/20</span>
          </div>

          <div style={s.statRow}>
            <div style={s.statBox}>
              <Wallet size={18} color="#ffd700" />
              <div style={s.statVal}>{user.balance.toLocaleString()}</div>
              <div style={s.statLbl}>บาท</div>
            </div>
            <div style={s.statBox}>
              <Trophy size={18} color="#27ae60" />
              <div style={{ ...s.statVal, color: '#55d98d' }}>{user.wins}</div>
              <div style={s.statLbl}>ชนะ</div>
            </div>
            <div style={s.statBox}>
              <Trophy size={18} color="#e74c3c" />
              <div style={{ ...s.statVal, color: '#ff6b6b' }}>{user.losses}</div>
              <div style={s.statLbl}>แพ้</div>
            </div>
          </div>

          {/* Current avatar preview in context */}
          <div style={s.contextPreview}>
            <span style={{ fontSize: 12, color: '#666' }}>ตัวอย่างในเกม</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(0,0,0,0.4)', borderRadius: 14, padding: '10px 16px' }}>
              <AvatarBubble avatarSeed={selectedSeed} avatarFrame={selectedFrame} size={40} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{username || '—'}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{user.balance.toLocaleString()} บาท</div>
              </div>
            </div>
          </div>

          {error && (
            <div style={s.errorBox}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {success && (
            <div style={s.successBox}>
              <Check size={14} /> บันทึกสำเร็จ!
            </div>
          )}

          <button
            style={{ ...s.saveBtn, opacity: saving ? 0.65 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              : <Check size={16} />}
            {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์'}
          </button>
        </div>

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
  },
  bgOverlay: {
    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
    background: 'radial-gradient(ellipse at 20% 50%, rgba(120,40,200,0.07) 0%, transparent 60%)',
  },
  header: {
    position: 'relative', zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 40px',
    background: 'rgba(0,0,0,0.45)',
    backdropFilter: 'blur(24px)',
    borderBottom: '1px solid rgba(255,215,0,0.12)',
  },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 18px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20, color: '#ccc', cursor: 'pointer', fontSize: 13,
  },
  headerTitle: {
    fontSize: 18, fontWeight: 800, color: '#ffd700', letterSpacing: 1,
  },
  main: {
    position: 'relative', zIndex: 1,
    display: 'flex', gap: 24, flexWrap: 'wrap',
    padding: '32px 40px',
    maxWidth: 960, margin: '0 auto',
  },
  card: {
    flex: '1 1 400px',
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 24, padding: '28px 30px',
    backdropFilter: 'blur(20px)',
    display: 'flex', flexDirection: 'column', gap: 18,
  },
  sectionTitle: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 13, fontWeight: 700, color: '#ffd700',
    paddingBottom: 8, borderBottom: '1px solid rgba(255,215,0,0.1)',
  },

  previewWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '16px 0 8px',
  },
  previewRing: {
    width: 100, height: 100, borderRadius: '50%',
    border: '3px solid', overflow: 'hidden',
    transition: 'border-color 0.3s, box-shadow 0.3s',
    background: 'rgba(255,255,255,0.06)',
  },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  previewName: { fontSize: 15, fontWeight: 700, color: '#fff' },

  avatarGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
  },
  avatarBtn: {
    position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '5px 3px',
    border: '1px solid', borderRadius: 10,
    cursor: 'pointer', transition: 'all 0.15s',
    background: 'transparent',
  },
  avatarImg: { width: 36, height: 36 },
  avatarCheck: {
    position: 'absolute', top: 2, right: 2,
    width: 14, height: 14, borderRadius: '50%',
    background: '#ffd700', color: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  frameGrid: {
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  frameBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px',
    border: '1px solid', borderRadius: 12,
    cursor: 'pointer', transition: 'all 0.15s',
  },

  field: { display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' },
  label: { fontSize: 12, color: '#888', fontWeight: 600 },
  input: {
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, color: '#fff', fontSize: 14, outline: 'none',
  },
  inputHint: {
    position: 'absolute', right: 12, bottom: 12,
    fontSize: 11, color: '#555',
  },

  statRow: { display: 'flex', gap: 12 },
  statBox: {
    flex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '14px 10px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
  },
  statVal: { fontSize: 20, fontWeight: 800, color: '#ffd700' },
  statLbl: { fontSize: 11, color: '#666' },

  contextPreview: {
    display: 'flex', flexDirection: 'column', gap: 8,
  },

  errorBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px',
    background: 'rgba(255,59,59,0.1)',
    border: '1px solid rgba(255,59,59,0.2)',
    borderRadius: 10, color: '#ff8080', fontSize: 13,
  },
  successBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px',
    background: 'rgba(39,174,96,0.12)',
    border: '1px solid rgba(39,174,96,0.3)',
    borderRadius: 10, color: '#55d98d', fontSize: 13,
  },

  saveBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #ffd700, #ff9800)',
    border: 'none', borderRadius: 14,
    color: '#000', fontWeight: 800, cursor: 'pointer',
    fontSize: 15, letterSpacing: 0.3,
    boxShadow: '0 4px 18px rgba(255,165,0,0.3)',
    transition: 'opacity 0.2s', marginTop: 4,
  },
};
