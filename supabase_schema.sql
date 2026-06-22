-- ==============================
-- Game.io — Supabase Schema
-- รันใน Supabase SQL Editor
-- ==============================

-- profiles (เชื่อมกับ auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  balance INTEGER DEFAULT 1000 CHECK (balance >= 0),
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  last_free_claim TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- เพิ่ม avatar columns (รันแยกถ้า table มีอยู่แล้ว)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_seed TEXT DEFAULT 'Dragon';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_frame TEXT DEFAULT 'none';

-- game_history
CREATE TABLE IF NOT EXISTS game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL CHECK (game_type IN ('somsip', 'khang')),
  winner_id UUID REFERENCES profiles(id),
  pot INTEGER DEFAULT 0,
  players JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RPC: increment wins
CREATE OR REPLACE FUNCTION increment_wins(user_id UUID)
RETURNS VOID AS $$
  UPDATE profiles SET wins = wins + 1 WHERE id = user_id;
$$ LANGUAGE SQL;

-- RPC: increment losses
CREATE OR REPLACE FUNCTION increment_losses(user_id UUID)
RETURNS VOID AS $$
  UPDATE profiles SET losses = losses + 1 WHERE id = user_id;
$$ LANGUAGE SQL;

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;

-- Policy: ผู้เล่นอ่าน profile ตัวเองได้
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

-- Policy: ผู้เล่นอัพเดต profile ตัวเองได้ (username, avatar_url, avatar_frame)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Policy: service role อ่าน/เขียนได้ทั้งหมด (ใช้ service key บน server)
-- (bypass RLS อัตโนมัติเมื่อใช้ service role key)

-- Policy: ทุกคนอ่าน leaderboard ได้
CREATE POLICY "Anyone can read profiles for leaderboard"
  ON profiles FOR SELECT USING (true);

-- Policy: ทุกคนอ่าน game history ได้
CREATE POLICY "Anyone can read game history"
  ON game_history FOR SELECT USING (true);

-- Trigger: สร้าง profile อัตโนมัติเมื่อ signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'player_' || substr(NEW.id::text, 1, 8)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ==============================
-- Storage: avatars bucket
-- สร้าง bucket ใน Supabase Dashboard > Storage > New bucket
-- Name: avatars, Public: true
-- แล้วรัน policies ด้านล่าง
-- ==============================

-- Policy: ผู้ใช้อัพโหลด avatar ตัวเองได้
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: ทุกคนดู avatar ได้ (public bucket)
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Policy: ผู้ใช้ลบ/อัพเดต avatar ตัวเองได้
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
