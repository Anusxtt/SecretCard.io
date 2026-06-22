import { createContext, useContext, useState, ReactNode } from 'react';

const th = {
  // Auth Modal
  authTitle: 'เข้าสู่เกม',
  authSub: 'เงินเริ่มต้น 1,000 บาท ฟรี!',
  tabGuest: '👤 Guest',
  tabLogin: '🔑 Login',
  tabSignup: '📝 สมัคร',
  nickname: 'ชื่อเล่น',
  email: 'อีเมล',
  password: 'รหัสผ่าน',
  nicknamePlaceholder: 'ใส่ชื่อเล่นของคุณ...',
  leaderboardNickPlaceholder: 'ชื่อที่จะแสดงใน Leaderboard',
  passwordPlaceholder: '••••••••',
  passwordMinPlaceholder: 'อย่างน้อย 6 ตัวอักษร',
  guestNote: '🎮 เล่นได้ทันที ไม่ต้องสมัคร (ข้อมูลไม่ถูกบันทึก)',
  playAsGuest: 'เล่นเป็น Guest →',
  loginBtn: '🔑 เข้าสู่ระบบ',
  loggingIn: '⏳ กำลังเข้า...',
  signupBtn: '📝 สมัครสมาชิก (รับ 1,000 บาทฟรี)',
  signingUp: '⏳ กำลังสมัคร...',
  errNickname: 'กรุณาใส่ชื่อเล่น',

  // Lobby
  onlineCard: 'ไพ่ไทยออนไลน์',
  rankBtn: '🏆 อันดับ',
  guest: '👤 Guest',
  baht: 'บาท',
  logoutBtn: 'ออก',
  loginSignup: 'เข้าสู่ระบบ / สมัคร',
  betLabel: 'เดิมพัน',
  playBot: '🤖 เล่นกับ Bot',
  playOnline: '🌐 เล่น Online',
  joining: 'กำลังหาห้อง...',
  notEnoughBalance: 'เงินไม่พอสำหรับการเดิมพัน',
  rulesTitle: '📖 กติกา',
  leaderboardTitle: '🏆 อันดับ',
  footer: 'Dev by',
  games: {
    somsip: {
      name: 'สมสิบ',
      desc: 'จับคู่ให้ครบ 3 คู่ก่อนคนอื่น',
      rules: [
        '🃏 ได้ไพ่ 5 ใบ จั่วหรือหยิบกองทิ้ง',
        '🔁 ทิ้งไพ่ 1 ใบให้กองทิ้งตัวเอง',
        '🏆 จับคู่ครบ 3 คู่ก็ชนะ',
        '⚡ ขัดเทิร์นได้ถ้าครบ 3 คู่ทันที',
        '🃏 โจ๊กเกอร์ = ไพ่ที่ขึ้นเปิด',
      ],
    },
    khang: {
      name: 'แคง',
      desc: 'แต้มน้อยที่สุดชนะ',
      rules: [
        '🃏 ได้ไพ่ 5 ใบทุกคน',
        '🔢 A=1, 2-10=ตามหน้า, J/Q/K=10',
        '👑 ประกาศแคงถ้าแต้มน้อยสุด',
        '⚡ ไหลได้ถ้ามีไพ่หน้าเดียวกับกองทิ้ง',
        '🏆 แต้มน้อยสุดชนะ',
      ],
    },
  },

  // Leaderboard
  rank: 'อันดับ',
  player: 'ผู้เล่น',
  wins: 'ชนะ',
  winRate: 'อัตรา',
  balance: 'เงิน',
  loading: 'กำลังโหลด...',
  noData: 'ยังไม่มีข้อมูล',
};

const en: typeof th = {
  authTitle: 'Enter Game',
  authSub: 'Get 1,000 starting coins free!',
  tabGuest: '👤 Guest',
  tabLogin: '🔑 Login',
  tabSignup: '📝 Sign Up',
  nickname: 'Nickname',
  email: 'Email',
  password: 'Password',
  nicknamePlaceholder: 'Enter your nickname...',
  leaderboardNickPlaceholder: 'Name shown on Leaderboard',
  passwordPlaceholder: '••••••••',
  passwordMinPlaceholder: 'At least 6 characters',
  guestNote: '🎮 Play instantly, no registration (data not saved)',
  playAsGuest: 'Play as Guest →',
  loginBtn: '🔑 Login',
  loggingIn: '⏳ Logging in...',
  signupBtn: '📝 Sign Up (Get 1,000 coins free)',
  signingUp: '⏳ Signing up...',
  errNickname: 'Please enter a nickname',

  onlineCard: 'Thai Card Games Online',
  rankBtn: '🏆 Ranking',
  guest: '👤 Guest',
  baht: 'coins',
  logoutBtn: 'Logout',
  loginSignup: 'Login / Sign Up',
  betLabel: 'Bet',
  playBot: '🤖 Play vs Bot',
  playOnline: '🌐 Play Online',
  joining: 'Finding room...',
  notEnoughBalance: 'Not enough balance to bet',
  rulesTitle: '📖 Rules',
  leaderboardTitle: '🏆 Leaderboard',
  footer: 'Dev by',
  games: {
    somsip: {
      name: 'Som Sip',
      desc: 'Match 3 pairs before others',
      rules: [
        '🃏 Get 5 cards, draw or pick from discard pile',
        '🔁 Discard 1 card to your pile',
        '🏆 Win with 3 complete pairs',
        '⚡ Intercept if you complete 3 pairs instantly',
        '🃏 Joker = the flipped open card',
      ],
    },
    khang: {
      name: 'Khang',
      desc: 'Lowest score wins',
      rules: [
        '🃏 Everyone gets 5 cards',
        '🔢 A=1, 2-10=face value, J/Q/K=10',
        '👑 Declare Khang if you have the lowest score',
        '⚡ Flow if you hold a card matching the discard',
        '🏆 Lowest total score wins',
      ],
    },
  },

  rank: 'Rank',
  player: 'Player',
  wins: 'Wins',
  winRate: 'Win%',
  balance: 'Coins',
  loading: 'Loading...',
  noData: 'No data yet',
};

type Lang = 'th' | 'en';
type T = typeof th;

interface I18nCtx {
  lang: Lang;
  t: T;
  toggle: () => void;
}

const I18nContext = createContext<I18nCtx>({ lang: 'th', t: th, toggle: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'th');

  const toggle = () => {
    const next: Lang = lang === 'th' ? 'en' : 'th';
    localStorage.setItem('lang', next);
    setLang(next);
  };

  return (
    <I18nContext.Provider value={{ lang, t: lang === 'th' ? th : en, toggle }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useT = () => useContext(I18nContext);
