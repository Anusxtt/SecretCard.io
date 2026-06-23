import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = 'admin@game.io';
const ADMIN_PASSWORD = 'Admin@Game2025!';
const ADMIN_USERNAME = 'Administrator';

async function main() {
  console.log('Creating admin user...');

  // สร้าง auth user ผ่าน service key (bypass email verification)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { username: ADMIN_USERNAME },
  });

  if (authError) {
    console.error('Auth error:', authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`Auth user created: ${userId}`);

  // upsert profile พร้อม is_admin = true
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    username: ADMIN_USERNAME,
    balance: 999999,
    wins: 0,
    losses: 0,
    is_admin: true,
  });

  if (profileError) {
    console.error('Profile error:', profileError.message);
    console.log('Hint: Make sure the "is_admin" column exists in profiles table');
    process.exit(1);
  }

  console.log('\n✅ Admin account created successfully!\n');
  console.log('  Email    :', ADMIN_EMAIL);
  console.log('  Password :', ADMIN_PASSWORD);
  console.log('  Username :', ADMIN_USERNAME);
  console.log('  User ID  :', userId);
  console.log('\nLogin at the website then go to /admin');
}

main();
