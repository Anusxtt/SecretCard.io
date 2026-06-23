import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { supabase } from '../lib/supabase';
import {
  Shield, Users, Gamepad2, BarChart3, Search,
  RefreshCw, LogOut, ChevronLeft, ChevronRight,
  Coins, Trophy, X, Edit3, Check, History
} from 'lucide-react';

/* ─── types ─── */
interface Stats {
  totalPlayers: number;
  totalGamesPlayed: number;
  activeGames: number;
  waitingRooms: number;
  onlinePlayers: number;
  richestPlayer: { username: string; balance: number } | null;
}
interface PlayerRow {
  id: string;
  username: string;
  balance: number;
  wins: number;
  losses: number;
  is_admin: boolean;
  created_at: string;
}
interface RoomInfo {
  roomId: string;
  gameType: string;
  betAmount: number;
  started: boolean;
  playerCount: number;
  botCount: number;
  players: { playerId: string; name: string; isBot: boolean; isGuest: boolean }[];
}

interface HistoryPlayer {
  id: string;
  name: string;
  isBot: boolean;
  hand: { id: string; suit: string; rank: number }[];
  total: number;
}

interface HistoryRow {
  id: string;
  game_type: string;
  winner_id: string | null;
  winner_name: string;
  pot: number;
  players: HistoryPlayer[];
  created_at: string;
}

type Tab = 'overview' | 'players' | 'rooms' | 'history';

/* ─── helpers ─── */
const fmt = (n: number) => n.toLocaleString();
const winRate = (w: number, l: number) =>
  w + l > 0 ? Math.round((w / (w + l)) * 100) : 0;

export function AdminPage() {
  const { user, loading } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [page, setPage] = useState(0);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<PlayerRow[] | null>(null);
  const [editingBalance, setEditingBalance] = useState<{ id: string; value: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [selectedHistory, setSelectedHistory] = useState<HistoryRow | null>(null);
  const PAGE_SIZE = 20;

  /* ─── verify admin ─── */
  useEffect(() => {
    if (loading) return;
    if (!user || user.isGuest) { navigate('/'); return; }
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!data?.is_admin) { navigate('/'); return; }
        setIsAdmin(true);
      });
  }, [user, loading, navigate]);

  /* ─── socket listeners ─── */
  useEffect(() => {
    if (!isAdmin) return;
    socket.on('admin:stats', setStats);
    socket.on('admin:players', ({ players: p, total }: { players: PlayerRow[]; total: number }) => {
      setPlayers(p);
      setTotalPlayers(total);
    });
    socket.on('admin:rooms', setRooms);
    socket.on('admin:search_result', ({ players: p }: { players: PlayerRow[] }) => setSearchRes(p));
    socket.on('admin:adjust_balance_ok', ({ targetId, newBalance }: { targetId: string; newBalance: number }) => {
      setPlayers((prev) => prev.map((p) => p.id === targetId ? { ...p, balance: newBalance } : p));
      setSearchRes((prev) => prev ? prev.map((p) => p.id === targetId ? { ...p, balance: newBalance } : p) : prev);
      showToast('อัปเดต balance แล้ว');
    });
    socket.on('admin:kick_room_ok', ({ roomId }: { roomId: string }) => {
      setRooms((prev) => prev.filter((r) => r.roomId !== roomId));
      showToast(`ปิดห้อง ${roomId} แล้ว`);
    });
    socket.on('admin:error', ({ message }: { message: string }) => showToast(`Error: ${message}`));
    socket.on('admin:history', ({ rows, total }: { rows: HistoryRow[]; total: number }) => {
      setHistory(rows);
      setHistoryTotal(total);
    });

    return () => {
      socket.off('admin:stats');
      socket.off('admin:players');
      socket.off('admin:rooms');
      socket.off('admin:search_result');
      socket.off('admin:adjust_balance_ok');
      socket.off('admin:kick_room_ok');
      socket.off('admin:error');
      socket.off('admin:history');
    };
  }, [socket, isAdmin]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  /* ─── data fetching ─── */
  const fetchStats = useCallback(() => {
    if (!user) return;
    socket.emit('admin:get_stats', { userId: user.id });
  }, [socket, user]);

  const fetchPlayers = useCallback((p: number) => {
    if (!user) return;
    socket.emit('admin:get_players', { userId: user.id, limit: PAGE_SIZE, offset: p * PAGE_SIZE });
  }, [socket, user]);

  const fetchRooms = useCallback(() => {
    if (!user) return;
    socket.emit('admin:get_rooms', { userId: user.id });
  }, [socket, user]);

  const fetchHistory = useCallback((p: number) => {
    if (!user) return;
    socket.emit('admin:get_history', { userId: user.id, limit: PAGE_SIZE, offset: p * PAGE_SIZE });
  }, [socket, user]);

  useEffect(() => {
    if (!isAdmin || !user) return;
    if (tab === 'overview') fetchStats();
    if (tab === 'players') { setSearchRes(null); setSearchQ(''); fetchPlayers(0); }
    if (tab === 'rooms') fetchRooms();
    if (tab === 'history') { setHistoryPage(0); fetchHistory(0); }
  }, [tab, isAdmin, user]);

  useEffect(() => {
    if (tab === 'players' && searchRes === null) fetchPlayers(page);
  }, [page]);

  useEffect(() => {
    if (tab === 'history') fetchHistory(historyPage);
  }, [historyPage]);

  const handleSearch = () => {
    if (!user || !searchQ.trim()) return;
    socket.emit('admin:search_player', { userId: user.id, query: searchQ.trim() });
  };

  const handleAdjustBalance = (targetId: string) => {
    if (!user || !editingBalance || editingBalance.id !== targetId) return;
    const val = parseInt(editingBalance.value);
    if (isNaN(val)) return;
    socket.emit('admin:adjust_balance', { userId: user.id, targetId, newBalance: val });
    setEditingBalance(null);
  };

  const handleKickRoom = (roomId: string) => {
    if (!user || !confirm(`ปิดห้อง ${roomId} ?`)) return;
    socket.emit('admin:kick_room', { userId: user.id, roomId });
  };

  /* ─── loading/auth ─── */
  if (loading || isAdmin === null) {
    return (
      <div style={s.center}>
        <Shield size={40} color="#ffd700" />
        <div style={{ color: '#888', marginTop: 12 }}>กำลังตรวจสอบสิทธิ์…</div>
      </div>
    );
  }

  const displayPlayers = searchRes ?? players;

  /* ─── render ─── */
  return (
    <div style={s.root}>
      {/* sidebar */}
      <aside style={s.sidebar}>
        <div style={s.logo}>
          <Shield size={22} color="#ffd700" />
          <span style={s.logoText}>Admin</span>
        </div>

        {(['overview', 'players', 'rooms', 'history'] as Tab[]).map((t) => {
          const icons = { overview: <BarChart3 size={16} />, players: <Users size={16} />, rooms: <Gamepad2 size={16} />, history: <History size={16} /> };
          const labels = { overview: 'ภาพรวม', players: 'ผู้เล่น', rooms: 'ห้อง/เกม', history: 'ประวัติการเล่น' };
          return (
            <button key={t} style={{ ...s.navBtn, ...(tab === t ? s.navActive : {}) }} onClick={() => setTab(t)}>
              {icons[t]}
              {labels[t]}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />
        <button style={s.backBtn} onClick={() => navigate('/')}>
          <LogOut size={14} />
          กลับ Lobby
        </button>
      </aside>

      {/* main */}
      <main style={s.main}>
        {/* header */}
        <div style={s.header}>
          <div style={s.headerTitle}>
            {tab === 'overview' && 'ภาพรวมระบบ'}
            {tab === 'players' && 'จัดการผู้เล่น'}
            {tab === 'rooms' && 'ห้องเกมที่กำลังเล่น'}
            {tab === 'history' && 'ประวัติการเล่นทั้งหมด'}
          </div>
          <button style={s.refreshBtn} onClick={() => {
            if (tab === 'overview') fetchStats();
            if (tab === 'players') fetchPlayers(page);
            if (tab === 'rooms') fetchRooms();
            if (tab === 'history') fetchHistory(historyPage);
          }}>
            <RefreshCw size={14} />
            รีเฟรช
          </button>
        </div>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div style={s.content}>
            {stats ? (
              <>
                <div style={s.statGrid}>
                  <StatCard icon={<Users size={20} color="#4fc3f7" />} label="ผู้เล่นทั้งหมด" value={fmt(stats.totalPlayers)} color="#4fc3f7" />
                  <StatCard icon={<Gamepad2 size={20} color="#81c784" />} label="เกมที่กำลังเล่น" value={fmt(stats.activeGames)} color="#81c784" />
                  <StatCard icon={<Users size={20} color="#ffb74d" />} label="ออนไลน์ตอนนี้" value={fmt(stats.onlinePlayers)} color="#ffb74d" />
                  <StatCard icon={<Trophy size={20} color="#ffd700" />} label="ห้องรอเกม" value={fmt(stats.waitingRooms)} color="#ffd700" />
                </div>
                {stats.richestPlayer && (
                  <div style={s.richCard}>
                    <Trophy size={16} color="#ffd700" />
                    <span style={{ color: '#aaa', fontSize: 13 }}>ผู้เล่นรวยสุด:</span>
                    <span style={{ color: '#ffd700', fontWeight: 700 }}>{stats.richestPlayer.username}</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{fmt(stats.richestPlayer.balance)} ฿</span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: '#555', padding: 40, textAlign: 'center' }}>กำลังโหลด…</div>
            )}
          </div>
        )}

        {/* ── PLAYERS ── */}
        {tab === 'players' && (
          <div style={s.content}>
            {/* search bar */}
            <div style={s.searchRow}>
              <div style={s.searchWrap}>
                <Search size={14} color="#888" />
                <input
                  style={s.searchInput}
                  placeholder="ค้นหาชื่อผู้เล่น…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                {searchQ && (
                  <button style={s.clearBtn} onClick={() => { setSearchQ(''); setSearchRes(null); fetchPlayers(0); }}>
                    <X size={12} />
                  </button>
                )}
              </div>
              <button style={s.searchBtn} onClick={handleSearch}>ค้นหา</button>
            </div>

            {/* table */}
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['#', 'ชื่อ', 'Balance', 'W/L', 'Win%', 'สมัครเมื่อ', 'แก้ไข'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayPlayers.map((p, i) => (
                    <tr key={p.id} style={{ ...s.tr, ...(i % 2 === 0 ? s.trEven : {}) }}>
                      <td style={s.td}>
                        <span style={{ color: '#555', fontSize: 12 }}>
                          {searchRes ? i + 1 : page * PAGE_SIZE + i + 1}
                        </span>
                      </td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#fff', fontWeight: 600 }}>{p.username}</span>
                          {p.is_admin && (
                            <span style={s.adminBadge}>admin</span>
                          )}
                        </div>
                      </td>
                      <td style={s.td}>
                        {editingBalance?.id === p.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              style={s.balInput}
                              value={editingBalance.value}
                              onChange={(e) => setEditingBalance({ id: p.id, value: e.target.value })}
                              onKeyDown={(e) => e.key === 'Enter' && handleAdjustBalance(p.id)}
                              autoFocus
                            />
                            <button style={s.iconBtn} onClick={() => handleAdjustBalance(p.id)}><Check size={12} /></button>
                            <button style={{ ...s.iconBtn, color: '#e74c3c' }} onClick={() => setEditingBalance(null)}><X size={12} /></button>
                          </div>
                        ) : (
                          <span style={{ color: '#ffd700', fontWeight: 600 }}>{fmt(p.balance)} ฿</span>
                        )}
                      </td>
                      <td style={s.td}>
                        <span style={{ color: '#81c784' }}>{p.wins}W</span>
                        <span style={{ color: '#555' }}> / </span>
                        <span style={{ color: '#e57373' }}>{p.losses}L</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ color: winRate(p.wins, p.losses) >= 50 ? '#81c784' : '#e57373' }}>
                          {winRate(p.wins, p.losses)}%
                        </span>
                      </td>
                      <td style={s.td}>
                        <span style={{ color: '#666', fontSize: 12 }}>
                          {new Date(p.created_at).toLocaleDateString('th-TH')}
                        </span>
                      </td>
                      <td style={s.td}>
                        <button style={s.editBtn} onClick={() => setEditingBalance({ id: p.id, value: String(p.balance) })}>
                          <Coins size={12} />
                          แก้ Balance
                        </button>
                      </td>
                    </tr>
                  ))}
                  {displayPlayers.length === 0 && (
                    <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#555', padding: 32 }}>ไม่พบข้อมูล</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* pagination — only when not searching */}
            {!searchRes && (
              <div style={s.pagination}>
                <button style={s.pageBtn} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ color: '#888', fontSize: 13 }}>
                  หน้า {page + 1} / {Math.max(1, Math.ceil(totalPlayers / PAGE_SIZE))}
                </span>
                <button style={s.pageBtn} disabled={(page + 1) * PAGE_SIZE >= totalPlayers} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ROOMS ── */}
        {tab === 'rooms' && (
          <div style={s.content}>
            {rooms.length === 0 ? (
              <div style={{ color: '#555', padding: 40, textAlign: 'center' }}>ไม่มีห้องที่เปิดอยู่</div>
            ) : (
              <div style={s.roomGrid}>
                {rooms.map((room) => (
                  <div key={room.roomId} style={s.roomCard}>
                    <div style={s.roomHeader}>
                      <span style={{ ...s.gameTypeBadge, background: room.gameType === 'khang' ? 'rgba(255,150,0,0.15)' : 'rgba(100,200,100,0.15)', color: room.gameType === 'khang' ? '#ffb74d' : '#81c784' }}>
                        {room.gameType === 'khang' ? 'แคง' : 'สมสิบ'}
                      </span>
                      <span style={s.roomId}>{room.roomId}</span>
                      <span style={{ ...s.statusBadge, background: room.started ? 'rgba(100,200,100,0.15)' : 'rgba(255,200,0,0.1)', color: room.started ? '#81c784' : '#ffd700' }}>
                        {room.started ? 'กำลังเล่น' : 'รอผู้เล่น'}
                      </span>
                    </div>
                    <div style={s.roomMeta}>
                      <span><Coins size={11} color="#ffd700" /> {fmt(room.betAmount)} ฿</span>
                      <span><Users size={11} color="#4fc3f7" /> {room.playerCount} คน</span>
                      {room.botCount > 0 && <span style={{ color: '#888' }}>Bot: {room.botCount}</span>}
                    </div>
                    <div style={s.playerList}>
                      {room.players.map((p) => (
                        <div key={p.playerId} style={s.playerChip}>
                          <span style={{ color: p.isBot ? '#888' : '#fff' }}>{p.name}</span>
                          {p.isBot && <span style={{ color: '#555', fontSize: 10 }}>bot</span>}
                          {p.isGuest && !p.isBot && <span style={{ color: '#666', fontSize: 10 }}>guest</span>}
                        </div>
                      ))}
                    </div>
                    {room.started && (
                      <button style={s.kickBtn} onClick={() => handleKickRoom(room.roomId)}>
                        <X size={12} /> ปิดห้อง
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ── HISTORY ── */}
        {tab === 'history' && (
          <div style={s.content}>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['#', 'เกม', 'ผู้ชนะ', 'เงินรางวัล', 'ผู้เล่น', 'เวลา', ''].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => (
                    <tr key={row.id} style={{ ...s.tr, ...(i % 2 === 0 ? s.trEven : {}) }}>
                      <td style={s.td}><span style={{ color: '#555', fontSize: 12 }}>{historyPage * PAGE_SIZE + i + 1}</span></td>
                      <td style={s.td}>
                        <span style={{ ...s.gameTypeBadge, background: row.game_type === 'khang' ? 'rgba(255,150,0,0.15)' : 'rgba(100,200,100,0.15)', color: row.game_type === 'khang' ? '#ffb74d' : '#81c784', borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                          {row.game_type === 'khang' ? 'แคง' : 'สมสิบ'}
                        </span>
                      </td>
                      <td style={s.td}><span style={{ color: '#ffd700', fontWeight: 600 }}>{row.winner_name}</span></td>
                      <td style={s.td}><span style={{ color: '#81c784', fontWeight: 600 }}>{fmt(row.pot)} ฿</span></td>
                      <td style={s.td}>
                        <span style={{ color: '#aaa', fontSize: 13 }}>
                          {row.players?.map((p) => p.name).join(', ') ?? '-'}
                        </span>
                      </td>
                      <td style={s.td}><span style={{ color: '#666', fontSize: 12 }}>{new Date(row.created_at).toLocaleString('th-TH')}</span></td>
                      <td style={s.td}>
                        <button style={s.editBtn} onClick={() => setSelectedHistory(row)}>
                          <Search size={12} /> ดูรายละเอียด
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#555', padding: 32 }}>ยังไม่มีประวัติการเล่น</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={s.pagination}>
              <button style={s.pageBtn} disabled={historyPage === 0} onClick={() => setHistoryPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              <span style={{ color: '#888', fontSize: 13 }}>หน้า {historyPage + 1} / {Math.max(1, Math.ceil(historyTotal / PAGE_SIZE))}</span>
              <button style={s.pageBtn} disabled={(historyPage + 1) * PAGE_SIZE >= historyTotal} onClick={() => setHistoryPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </main>

      {/* ── History Detail Modal ── */}
      {selectedHistory && (
        <div style={s.modalOverlay} onClick={() => setSelectedHistory(null)}>
          <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <History size={18} color="#ffd700" />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>รายละเอียดเกม</span>
                <span style={{ ...s.gameTypeBadge, background: selectedHistory.game_type === 'khang' ? 'rgba(255,150,0,0.15)' : 'rgba(100,200,100,0.15)', color: selectedHistory.game_type === 'khang' ? '#ffb74d' : '#81c784', borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                  {selectedHistory.game_type === 'khang' ? 'แคง' : 'สมสิบ'}
                </span>
              </div>
              <button style={s.modalClose} onClick={() => setSelectedHistory(null)}><X size={16} /></button>
            </div>
            <div style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
              {new Date(selectedHistory.created_at).toLocaleString('th-TH')} · เงินรางวัล <span style={{ color: '#ffd700', fontWeight: 600 }}>{fmt(selectedHistory.pot)} ฿</span>
            </div>
            <div style={s.playerCardGrid}>
              {(selectedHistory.players ?? []).map((p) => {
                const isWinner = p.id === selectedHistory.winner_id;
                return (
                  <div key={p.id} style={{ ...s.playerCard, ...(isWinner ? s.playerCardWinner : {}) }}>
                    <div style={s.playerCardName}>
                      {isWinner && <Trophy size={14} color="#ffd700" />}
                      <span style={{ color: isWinner ? '#ffd700' : '#ddd', fontWeight: 700 }}>{p.name}</span>
                      {p.isBot && <span style={{ color: '#555', fontSize: 11, fontWeight: 400 }}>bot</span>}
                      {isWinner && <span style={s.winnerBadge}>ชนะ</span>}
                    </div>
                    <div style={s.handRow}>
                      {(p.hand ?? []).map((card) => (
                        <CardChip key={card.id} suit={card.suit} rank={card.rank} />
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      แต้มรวม: <span style={{ color: p.total <= 5 ? '#81c784' : p.total <= 15 ? '#f39c12' : '#ef5350', fontWeight: 700, fontSize: 16 }}>{p.total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div style={s.toast}>{toast}</div>
      )}
    </div>
  );
}

/* ─── CardChip ─── */
const SUIT_COLOR: Record<string, string> = { H: '#ef5350', D: '#ef5350', S: '#fff', C: '#fff' };
const SUIT_SYM: Record<string, string> = { H: '♥', D: '♦', S: '♠', C: '♣' };
const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function CardChip({ suit, rank }: { suit: string; rank: number }) {
  const label = RANK_LABEL[rank] ?? String(rank);
  const color = SUIT_COLOR[suit] ?? '#fff';
  return (
    <div style={s.cardChip}>
      <span style={{ color, fontWeight: 700, fontSize: 13 }}>{label}</span>
      <span style={{ color, fontSize: 11 }}>{SUIT_SYM[suit]}</span>
    </div>
  );
}

/* ─── StatCard ─── */
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ ...s.statCard, borderColor: `${color}22` }}>
      <div style={{ ...s.statIcon, background: `${color}18` }}>{icon}</div>
      <div>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>{label}</div>
        <div style={{ color, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  );
}

/* ─── styles ─── */
const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', height: '100vh', width: '100vw',
    background: '#0a0a0f', color: '#fff',
    fontFamily: "'Kanit', 'Noto Sans Thai', sans-serif",
    overflow: 'hidden',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100vh', background: '#0a0a0f',
  },

  /* sidebar */
  sidebar: {
    width: 200, flexShrink: 0,
    background: 'rgba(255,255,255,0.03)',
    borderRight: '1px solid rgba(255,255,255,0.07)',
    display: 'flex', flexDirection: 'column',
    padding: '24px 12px',
    gap: 6,
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0 8px 20px',
    borderBottom: '1px solid rgba(255,215,0,0.12)',
    marginBottom: 10,
  },
  logoText: { fontSize: 18, fontWeight: 800, color: '#ffd700', letterSpacing: 1 },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px', borderRadius: 10,
    background: 'transparent', border: 'none', color: '#888',
    cursor: 'pointer', fontSize: 14, fontWeight: 500,
    transition: 'all 0.15s', textAlign: 'left',
  },
  navActive: {
    background: 'rgba(255,215,0,0.1)',
    color: '#ffd700',
    border: '1px solid rgba(255,215,0,0.2)',
  },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 10,
    background: 'rgba(255,59,59,0.1)',
    border: '1px solid rgba(255,59,59,0.2)',
    color: '#ff6b6b', cursor: 'pointer', fontSize: 13,
    marginTop: 8,
  },

  /* main */
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 28px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: 700, color: '#fff' },
  refreshBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#aaa', cursor: 'pointer', fontSize: 13,
  },
  content: { flex: 1, overflow: 'auto', padding: '24px 28px' },

  /* stats */
  statGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 16, marginBottom: 24,
  },
  statCard: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '20px 22px', borderRadius: 16,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid transparent',
  },
  statIcon: {
    width: 44, height: 44, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  richCard: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 20px', borderRadius: 14,
    background: 'rgba(255,215,0,0.06)',
    border: '1px solid rgba(255,215,0,0.15)',
    fontSize: 14,
  },

  /* search */
  searchRow: { display: 'flex', gap: 10, marginBottom: 16 },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8, flex: 1,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '0 12px',
  },
  searchInput: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    color: '#fff', fontSize: 14, padding: '10px 0',
  },
  clearBtn: {
    background: 'transparent', border: 'none', color: '#666', cursor: 'pointer',
    display: 'flex', alignItems: 'center',
  },
  searchBtn: {
    padding: '10px 20px', borderRadius: 10,
    background: 'rgba(255,215,0,0.12)',
    border: '1px solid rgba(255,215,0,0.25)',
    color: '#ffd700', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },

  /* table */
  tableWrap: { overflow: 'auto', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '12px 16px', textAlign: 'left',
    color: '#666', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  tr: { transition: 'background 0.1s' },
  trEven: { background: 'rgba(255,255,255,0.015)' },
  td: { padding: '12px 16px', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.04)' },

  adminBadge: {
    fontSize: 10, fontWeight: 700, color: '#ffd700',
    background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.25)',
    borderRadius: 6, padding: '1px 6px',
  },
  balInput: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,215,0,0.3)',
    borderRadius: 6, color: '#ffd700',
    padding: '4px 8px', fontSize: 13, width: 100,
    outline: 'none',
  },
  iconBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, color: '#81c784', cursor: 'pointer',
    padding: '4px 6px', display: 'flex', alignItems: 'center',
  },
  editBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 8,
    background: 'rgba(255,215,0,0.08)',
    border: '1px solid rgba(255,215,0,0.18)',
    color: '#ffd700', cursor: 'pointer', fontSize: 12,
  },

  /* pagination */
  pagination: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '16px 0', justifyContent: 'center',
  },
  pageBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#aaa', cursor: 'pointer',
    padding: '6px 10px', display: 'flex', alignItems: 'center',
  },

  /* rooms */
  roomGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  roomCard: {
    padding: 18, borderRadius: 16,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  roomHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  gameTypeBadge: {
    fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '3px 10px',
  },
  roomId: { flex: 1, fontSize: 13, color: '#888', fontFamily: 'monospace' },
  statusBadge: { fontSize: 11, fontWeight: 600, borderRadius: 8, padding: '2px 8px' },
  roomMeta: {
    display: 'flex', gap: 12, alignItems: 'center',
    fontSize: 13, color: '#aaa',
  },
  playerList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  playerChip: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 12, padding: '3px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.09)',
  },
  kickBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '7px 14px', borderRadius: 10,
    background: 'rgba(255,59,59,0.1)',
    border: '1px solid rgba(255,59,59,0.2)',
    color: '#ff6b6b', cursor: 'pointer', fontSize: 13,
    alignSelf: 'flex-start', marginTop: 4,
  },

  /* toast */
  toast: {
    position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(30,30,40,0.95)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12, padding: '10px 22px',
    color: '#fff', fontSize: 14, fontWeight: 500,
    backdropFilter: 'blur(12px)', zIndex: 1000,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },

  /* modal */
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, backdropFilter: 'blur(4px)',
  },
  modalBox: {
    background: '#0f0f1a', border: '1px solid rgba(255,215,0,0.2)',
    borderRadius: 20, padding: '28px 32px',
    minWidth: 560, maxWidth: '90vw', maxHeight: '85vh',
    overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalClose: {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#aaa', cursor: 'pointer',
    padding: '6px 8px', display: 'flex', alignItems: 'center',
  },
  playerCardGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 16,
  },
  playerCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: '16px 18px',
  },
  playerCardWinner: {
    background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.25)',
  },
  playerCardName: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
  },
  winnerBadge: {
    fontSize: 10, fontWeight: 700, color: '#000',
    background: '#ffd700', borderRadius: 6, padding: '1px 7px',
  },
  handRow: {
    display: 'flex', flexWrap: 'wrap' as const, gap: 5,
  },
  cardChip: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 7, padding: '4px 8px', minWidth: 30,
  },
};
