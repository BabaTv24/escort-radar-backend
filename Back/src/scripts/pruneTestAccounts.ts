import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW_TEST_PRUNE = process.env.ALLOW_TEST_PRUNE === 'true';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'profile-images';

const keepEmails = new Set([
  'mtvx007@gmail.com',
  'babatv24@proton.me',
  'mtvx007+test1@gmail.com',
  'mtvx007+test2@gmail.com',
  'mtvx007+test3@gmail.com'
]);

const pruneEmails = Array.from({ length: 22 }, (_, index) => `mtvx007+test${index + 4}@gmail.com`);

type AuthUser = {
  id: string;
  email?: string;
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

if (!ALLOW_TEST_PRUNE) {
  throw new Error('Refusing to prune test accounts unless ALLOW_TEST_PRUNE=true is set.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log('Escort Radar test account prune');
  console.log(`ALLOW_TEST_PRUNE=${ALLOW_TEST_PRUNE}`);
  console.log(`Protected emails: ${Array.from(keepEmails).join(', ')}`);
  console.log(`Target emails: ${pruneEmails.join(', ')}`);

  const users = await listAllUsers();
  const targetUsers = users.filter((user) => {
    const email = user.email?.toLowerCase() || '';
    return pruneEmails.includes(email) && !keepEmails.has(email);
  });

  if (!targetUsers.length) {
    console.log('No removable test users found. Nothing to prune.');
    return;
  }

  console.log(`Found ${targetUsers.length} removable test users:`);
  targetUsers.forEach((user) => console.log(`- ${user.email} (${user.id})`));

  for (const user of targetUsers) {
    await pruneUser(user);
  }

  console.log('Done. test1-test3 and admin accounts were kept untouched.');
}

async function listAllUsers() {
  const users: AuthUser[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email })));
    if (data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

async function pruneUser(user: AuthUser) {
  const email = user.email?.toLowerCase() || '';

  if (!pruneEmails.includes(email) || keepEmails.has(email) || !email.startsWith('mtvx007+test')) {
    throw new Error(`Refusing to prune protected or non-target email: ${email}`);
  }

  console.log(`Pruning ${email}`);

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id);
  if (profileError) throw profileError;

  const profileIds = (profiles || []).map((profile) => profile.id as string);

  const { data: wallets, error: walletError } = await supabase
    .from('wallets')
    .select('id')
    .eq('user_id', user.id);
  if (walletError) throw walletError;

  const walletIds = (wallets || []).map((wallet) => wallet.id as string);

  if (profileIds.length) {
    await markProfilesInactive(profileIds);
    await removeProfileImages(profileIds);
    await deleteRows('profile_tags', 'profile_id', profileIds);
    await deleteRows('booking_requests', 'profile_id', profileIds);
    await deleteRows('reports', 'profile_id', profileIds);
    await deleteRows('admin_notes', 'profile_id', profileIds);
    await deleteRows('premium_unlocks', 'target_profile_id', profileIds);
    await deleteRows('live_stream_sessions', 'profile_id', profileIds);
    await deleteRows('private_chat_sessions', 'profile_id', profileIds);
    await deleteRows('fan_club_memberships', 'profile_id', profileIds);
  }

  await deleteRows('premium_unlocks', 'user_id', [user.id]);
  await deleteRows('private_chat_sessions', 'user_id', [user.id]);
  await deleteRows('fan_club_memberships', 'user_id', [user.id]);
  await deleteRows('token_purchase_requests', 'user_id', [user.id]);

  if (walletIds.length) {
    await deleteRows('token_transactions', 'from_wallet_id', walletIds);
    await deleteRows('token_transactions', 'to_wallet_id', walletIds);
    await deleteRows('wallets', 'id', walletIds);
  }

  if (profileIds.length) {
    await deleteRows('profiles', 'id', profileIds);
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
  if (authError) throw authError;

  console.log(`Removed ${email}`);
}

async function markProfilesInactive(profileIds: string[]) {
  const { error } = await supabase
    .from('profiles')
    .update({
      status: 'suspended',
      moderation_status: 'rejected',
      availability_status: 'unavailable',
      is_test_account: true,
      admin_note: 'Pruned by test account cleanup script'
    })
    .in('id', profileIds);

  if (error) throw error;
}

async function removeProfileImages(profileIds: string[]) {
  const { data: images, error } = await supabase
    .from('profile_images')
    .select('id, storage_path')
    .in('profile_id', profileIds);

  if (error) throw error;

  const storagePaths = (images || [])
    .map((image) => image.storage_path as string | null)
    .filter((path): path is string => Boolean(path));

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(storagePaths);
    if (storageError) {
      console.warn(`Storage cleanup warning: ${storageError.message}`);
    }
  }

  await deleteRows('profile_images', 'profile_id', profileIds);
}

async function deleteRows(table: string, column: string, values: string[]) {
  if (!values.length) return;

  const { error } = await supabase.from(table).delete().in(column, values);
  if (error) {
    console.warn(`Cleanup warning for ${table}.${column}: ${error.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
