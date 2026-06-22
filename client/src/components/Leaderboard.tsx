import { useEffect, useState } from 'react';
import { useSocket } from '../hooks/useSocket';

interface Entry {
  username: string;
  balance: number;
  wins: number;
  losses: number;
}

const RANK_STYLES: Record<number, { icon: string; color: string }> = {
  0: { icon: '🥇', color: '#ffd700' },
  1: { icon: '🥈', color: '#bdc3c7' },
  2: { icon: '🥉', color: '#cd7f32' },
};

export function Leaderboard({ compact = false }: { compact?: boolean }) {
  const socket = useSocket();
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    socket.emit('get_leaderboard');
    socket.on('leaderboard', (data: Entry[]) => setEntries(data));
    return () => { socket.off('leaderboard'); };
  }, [socket]);

  const displayEntries = compact ? entries.slice(0, 5) : entries;

  return (
    <div style={{ ...s.container, ...(compact ? s.compact : {}) }}>
      <div style={s.header}>
        <span style={s.headerIcon}>🏆</span>
        <span style={s.headerTitle}>Leaderboard</span>
        {compact && entries.length > 5 && (
          <span style={s.headerSub}>Top 5</span>
        )}
      </div>

      {displayEntries.length === 0 ? (
        <div style={s.empty}>ยังไม่มีข้อมูล</div>
      ) : (
        <div style={s.list}>
          {displayEntries.map((e, i) => {
            const rank = RANK_STYLES[i];
            const winRate = e.wins + e.losses > 0
              ? Math.round((e.wins / (e.wins + e.losses)) * 100)
              : 0;

            return (
              <div key={e.username} style={{ ...s.row, ...(i === 0 ? s.rowFirst : {}) }}>
                <div style={s.rankCell}>
                  {rank ? (
                    <span style={{ fontSize: compact ? 18 : 22 }}>{rank.icon}</span>
                  ) : (
                    <span style={{ ...s.rankNum, color: '#666' }}>{i + 1}</span>
                  )}
                </div>

                <div style={s.nameCell}>
                  <div style={{ ...s.username, color: rank?.color ?? '#fff' }}>
                    {e.username}
                  </div>
                  {!compact && (
                    <div style={s.wlRow}>
                      <span style={s.winTag}>{e.wins}W</span>
                      <span style={s.loseTag}>{e.losses}L</span>
                      <span style={s.rateTag}>{winRate}%</span>
                    </div>
                  )}
                  {compact && (
                    <div style={s.wlRow}>
                      <span style={{ fontSize: 10, color: '#27ae60' }}>{e.wins}W</span>
                      <span style={{ fontSize: 10, color: '#888' }}>/{e.losses}L</span>
                    </div>
                  )}
                </div>

                <div style={{ ...s.balCell, color: rank?.color ?? '#ffd700' }}>
                  <span style={s.balNum}>{e.balance.toLocaleString()}</span>
                  <span style={s.balUnit}>฿</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '20px 22px',
    backdropFilter: 'blur(12px)',
  },
  compact: {
    padding: '16px 18px',
  },

  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    marginBottom: 14, paddingBottom: 10,
    borderBottom: '1px solid rgba(255,215,0,0.12)',
  },
  headerIcon: { fontSize: 20 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: 700, color: '#ffd700' },
  headerSub: { fontSize: 11, color: '#666' },

  empty: { color: '#555', fontSize: 13, textAlign: 'center', padding: '12px 0' },

  list: { display: 'flex', flexDirection: 'column', gap: 6 },

  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 12,
    background: 'rgba(255,255,255,0.03)',
    transition: 'background 0.15s',
  },
  rowFirst: {
    background: 'rgba(255,215,0,0.07)',
    border: '1px solid rgba(255,215,0,0.15)',
  },

  rankCell: { width: 28, display: 'flex', justifyContent: 'center' },
  rankNum: { fontSize: 14, fontWeight: 700 },

  nameCell: { flex: 1, minWidth: 0 },
  username: { fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  wlRow: { display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' },
  winTag: { fontSize: 10, color: '#27ae60', fontWeight: 600 },
  loseTag: { fontSize: 10, color: '#e74c3c', fontWeight: 600 },
  rateTag: {
    fontSize: 10, color: '#888', padding: '0 5px',
    background: 'rgba(255,255,255,0.06)', borderRadius: 6,
  },

  balCell: { display: 'flex', alignItems: 'baseline', gap: 2 },
  balNum: { fontSize: 15, fontWeight: 700 },
  balUnit: { fontSize: 11, opacity: 0.7 },
};
