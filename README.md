# Game.io — สมสิบ & แคง

เว็บเกมไพ่ไทยออนไลน์ 2 เกม: **สมสิบ** และ **แคง** พร้อมระบบเงินในเกม, leaderboard, และ multiplayer

## Stack
- **Frontend**: React + Phaser 3 + Vite + TypeScript
- **Backend**: Node.js + Express + Socket.io + TypeScript
- **Database**: Supabase (PostgreSQL + Auth)

---

## การตั้งค่า (Setup)

### 1. ตั้งค่า Supabase

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com)
2. ไปที่ **SQL Editor** แล้ว copy เนื้อหาจาก `supabase_schema.sql` ไปรัน
3. เปิด **Authentication → Settings** → เปิด Email auth

### 2. ตั้งค่า Environment Variables

**server/.env**
```
PORT=3001
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx...   (service_role key — ไม่ใช่ anon key)
CLIENT_URL=http://localhost:5173
```

**client/.env**
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...   (anon key)
VITE_SERVER_URL=http://localhost:3001
```

### 3. ติดตั้ง Dependencies

```bash
npm run install:all
```

### 4. รัน Development

```bash
npm run dev
```

เปิด [http://localhost:5173](http://localhost:5173)

---

## โครงสร้างโปรเจกต์

```
Game.io/
├── client/          # React + Phaser frontend
│   └── src/
│       ├── game/somsip/   # Phaser Scene สมสิบ
│       ├── game/khang/    # Phaser Scene แคง
│       ├── pages/         # Lobby, SomSip, Khang pages
│       ├── components/    # AuthModal, Leaderboard, WalletDisplay
│       └── hooks/         # useSocket, useAuth
└── server/          # Node.js + Socket.io backend
    └── src/
        ├── games/somsip/  # Rules, Game, Bot
        ├── games/khang/   # Rules, Game, Bot
        ├── rooms/         # Room, RoomManager
        ├── services/      # Supabase, Wallet, Leaderboard
        └── socket/        # Event handlers
```

---

## วิธีเล่น

### สมสิบ
- เป้าหมาย: จับคู่ไพ่ให้ครบ 3 คู่
- คู่ที่ valid: ไพ่รวม 10 | หน้าเดียวกัน (10-10, J-J, Q-Q, K-K) | โจ๊ก+ไพ่อะไรก็ได้
- กดจั่ว หรือหยิบกองทิ้งของคนก่อนหน้า → ทิ้ง 1 ใบ

### แคง
- เป้าหมาย: มีแต้มรวมน้อยสุด (A=1, J/Q/K=10)
- เลือก: แคง (จบรอบ) | จั่ว+ทิ้ง | ไหล (ขัดเทิร์น ถ้ามีไพ่เลขเดียวกัน)

---

## ระบบเงิน
- เงินเริ่มต้น: **1,000 บาท** (virtual)
- เดิมพัน: 2 / 5 / 10 / 20 บาทต่อรอบ
- ผู้ชนะได้ pot ทั้งหมด
- เงินธุรกรรมทั้งหมดประมวลผลฝั่ง server
