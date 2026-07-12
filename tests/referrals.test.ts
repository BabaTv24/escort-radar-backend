import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('047 requires and persists the admin root with canonical depth and no parent', async () => {
  const sql=await read('../supabase/migrations/047_master_admin_referral_tree.sql');
  assert.match(sql,/lower\(email\) = 'mtvx007@gmail.com'/); assert.match(sql,/REFERRAL_ROOT_ACCOUNT_NOT_FOUND/);
  assert.match(sql,/root_referrer_user_id/); assert.match(sql,/referred_by_user_id=null[\s\S]*root_user_id=v_admin_id[\s\S]*referral_depth=0/);
  assert.match(sql,/registration_source='admin_created'/);
});

test('Master BCU wallet is exactly-once and never changes an existing balance', async()=>{
  const sql=await read('../supabase/migrations/047_master_admin_referral_tree.sql');
  assert.match(sql,/insert into public\.bcu_wallets\(user_id\) values\(v_admin_id\) on conflict\(user_id\) do nothing/);
  assert.doesNotMatch(sql,/update public\.bcu_wallets[\s\S]{0,200}balance_bcu/i);
});

test('backfill covers every auth user including no-profile users without inventing users for orphan profiles',async()=>{
  const sql=await read('../supabase/migrations/047_master_admin_referral_tree.sql');
  assert.match(sql,/from auth\.users u where u\.id<>v_admin_id[\s\S]*on conflict\(user_id\) do nothing/);
  assert.match(sql,/Profiles without user_id create no node/);
  assert.match(sql,/p\.user_id=u\.id[\s\S]*sponsored_profile/);
  assert.match(sql,/else 'backfill'/);
});

test('legacy parents are preserved and ancestry has cycle detection',async()=>{
  const sql=await read('../supabase/migrations/047_master_admin_referral_tree.sql');
  assert.match(sql,/referred_by_user_id is null/); assert.match(sql,/REFERRAL_CYCLE_DETECTED_IN_EXISTING_DATA/);
  assert.match(sql,/not child\.user_id=any\(tree\.path\)/); assert.match(sql,/REFERRAL_PARENT_IMMUTABLE/);
  assert.match(sql,/client_referrals_not_self/);
});

test('assign_referral is race-safe idempotent unpredictable and service-role only',async()=>{
  const sql=await read('../supabase/migrations/047_master_admin_referral_tree.sql');
  assert.match(sql,/security definer set search_path=public,pg_temp/); assert.match(sql,/for update/);
  assert.match(sql,/if found then return v_result/); assert.match(sql,/exception when unique_violation/);
  assert.match(sql,/gen_random_bytes\(8\)/); assert.doesNotMatch(sql,/email.*referral_code|p_user_id::text/);
  assert.match(sql,/revoke all on function public\.assign_referral[\s\S]*from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.assign_referral[\s\S]*to service_role/);
});

test('system settings and direct writes are unavailable publicly',async()=>{
  const sql=await read('../supabase/migrations/047_master_admin_referral_tree.sql');
  assert.match(sql,/alter table public\.system_settings enable row level security/);
  assert.match(sql,/revoke all on public\.system_settings from anon,authenticated/);
  assert.match(sql,/revoke insert,update,delete on public\.client_referrals from anon,authenticated/);
});

test('signup assigns by code, retries root fallback and never deletes the auth account',async()=>{
  const source=await read('../Back/src/routes/auth.ts');
  assert.match(source,/rpc\('assign_referral'/); assert.match(source,/p_referral_code: referredByCode \|\| null/);
  assert.match(source,/retrying root fallback/); assert.match(source,/referral_pending: true/);
  assert.doesNotMatch(source,/deleteUser/); assert.doesNotMatch(source,/req\.body\.(referrer_id|referred_by_user_id|sponsor_id)/);
});

test('OAuth assignment is session-bound retry-idempotent and clears code only on success',async()=>{
  const dashboard=await read('../Front/src/pages/DashboardPage.tsx'); const api=await read('../Front/src/lib/api.ts');
  assert.match(dashboard,/assignMyReferral\(session\.access_token/); assert.match(dashboard,/localStorage\.removeItem\('escortRadar\.referralCode'\)/);
  assert.match(api,/assignMyReferral:[\s\S]*\/api\/referrals\/assign-me/);
  const route=await read('../Back/src/routes/referrals.ts'); assert.match(route,/post\('\/assign-me', verifyUser/); assert.match(route,/p_user_id: req\.user!\.id/);
});

test('user and public APIs expose no referral UUID email metadata or balances',async()=>{
  const source=await read('../Back/src/routes/referrals.ts');
  const resolve=source.slice(source.indexOf("get('/resolve"),source.indexOf("post('/assign-me"));
  assert.match(resolve,/valid: true, displayName/); assert.doesNotMatch(resolve,/email|balance_bcu|referrer_user_id/);
  const me=source.slice(source.indexOf("get('/me"),source.indexOf('export const adminReferralsRouter'));
  assert.match(me,/referralDepth/); assert.doesNotMatch(me,/email|balanceBcu|app_metadata/);
});

test('admin tree is protected filtered paginated lazy and uses one RPC without per-node queries',async()=>{
  const source=await read('../Back/src/routes/referrals.ts');
  assert.match(source,/adminReferralsRouter\.use\(verifyUser, requireAdmin\)/); assert.match(source,/Math\.min[\s\S]*100/);
  assert.match(source,/p_role:/); assert.match(source,/p_source:/); assert.match(source,/p_parent_user_id:/);
  const handler=source.slice(source.indexOf("get('/tree"),source.indexOf("get('/summary"));
  assert.equal((handler.match(/supabaseAdmin\.rpc/g)||[]).length,1); assert.doesNotMatch(handler,/Promise\.all\(\(data/);
});

test('dashboard QR is local canonical and Web Share has clipboard fallback',async()=>{
  const source=await read('../Front/src/pages/DashboardPage.tsx');
  assert.match(source,/QRCode\.toDataURL\(referralLink/); assert.doesNotMatch(source,/api\.qrserver\.com/);
  assert.match(source,/https:\/\/escort-radar\.fun\/register\?ref=/); assert.match(source,/if \(navigator\.share\)/); assert.match(source,/else await copyReferralLink/);
});

test('admin tree UI provides filters lazy children responsive hierarchy and pagination',async()=>{
  const source=await read('../Front/src/components/AdminReferralTree.tsx');
  assert.match(source,/parentUserId/); assert.match(source,/registrationSource/); assert.match(source,/p_page|pageSize/);
  assert.match(source,/showChildren/); assert.match(source,/hasMore/); assert.match(source,/role/);
});

test('all referral UI keys exist in PL EN and DE',async()=>{
  for(const lang of ['pl','en','de']) { const json=JSON.parse(await read(`../Front/src/locales/${lang}.json`)); for(const key of ['referrals.title','referrals.yourCode','referrals.yourLink','referrals.copy','referrals.copied','referrals.share','referrals.qrCode','referrals.direct','referrals.subtree','referrals.referredBy','admin.nav.referralTree','referralTree.showChildren','referralTree.loadError','referralTree.roleFilter','referralTree.sourceFilter']) assert.equal(typeof json[key],'string',`${lang}:${key}`); }
});

test('047 retry is atomic and uses Supabase pgcrypto schema after partial apply',async()=>{
  const sql=await read('../supabase/migrations/047_master_admin_referral_tree.sql');
  assert.match(sql,/^--[\s\S]*\nbegin;/i); assert.match(sql,/commit;\s*$/i);
  assert.match(sql,/create extension if not exists pgcrypto with schema extensions/);
  assert.match(sql,/extensions\.gen_random_bytes\(8\)/);
  assert.doesNotMatch(sql,/(?<!extensions\.)gen_random_bytes\(8\)/);
});

test('047 can resume after partial schema apply without replacing codes balances or ledger',async()=>{
  const sql=await read('../supabase/migrations/047_master_admin_referral_tree.sql');
  assert.match(sql,/create table if not exists public\.system_settings/);
  assert.match(sql,/add column if not exists referred_by_user_id/);
  assert.match(sql,/drop trigger if exists client_referrals_parent_immutable/);
  assert.match(sql,/drop policy if exists "No direct access to system settings"/);
  assert.match(sql,/on conflict \(user_id\) do nothing/);
  assert.match(sql,/on conflict \(key\) do update/);
  assert.doesNotMatch(sql,/set\s+referral_code\s*=/i);
  assert.doesNotMatch(sql,/update public\.bcu_wallets|insert into public\.bcu_ledger_entries/i);
});

test('post-failure precheck is read-only and inspects partial 047 state',async()=>{
  const sql=await read('../scripts/sql/047_post_failure_precheck.sql');
  assert.match(sql,/begin transaction read only;/i); assert.match(sql,/commit;\s*$/i);
  assert.match(sql,/extensions\.gen_random_bytes\(integer\)/);
  assert.match(sql,/system_settings/); assert.match(sql,/client_referrals_parent_immutable/);
  assert.doesNotMatch(sql,/\b(insert|update|delete|alter|create|drop|truncate)\b/i);
});

test('048 removes residual referral and system setting privileges without changing data',async()=>{
  const sql=await read('../supabase/migrations/048_referral_security_and_summary_fix.sql');
  assert.match(sql,/^--[\s\S]*\nbegin;/i); assert.match(sql,/commit;\s*$/i);
  assert.match(sql,/revoke insert, update, delete, truncate, references, trigger[\s\S]*public\.client_referrals[\s\S]*from anon, authenticated/i);
  assert.match(sql,/alter table public\.system_settings enable row level security/i);
  assert.match(sql,/revoke all privileges on table public\.system_settings from anon, authenticated/i);
  assert.match(sql,/grant all privileges on table public\.client_referrals to service_role/i);
  assert.match(sql,/grant all privileges on table public\.system_settings to service_role/i);
  assert.doesNotMatch(sql,/\b(insert into|update\s+public\.|delete from|truncate table)\b/i);
  assert.doesNotMatch(sql,/bcu_wallets|bcu_ledger_entries|balance_bcu/i);
});

test('admin referral summary is implemented in backend and does not require a summary RPC',async()=>{
  const route=await read('../Back/src/routes/referrals.ts');
  const handler=route.slice(route.indexOf("get('/summary"));
  assert.match(handler,/supabaseAdmin\.from\('client_referrals'\)/);
  assert.match(handler,/supabaseAdmin\.auth\.admin\.listUsers/);
  assert.match(handler,/totalReferralRegistrations/);
  assert.match(handler,/registrationsByDay/);
  assert.match(handler,/usersBySource/);
  assert.match(handler,/usersByRole/);
  assert.doesNotMatch(handler,/get_admin_referral_summary|\.rpc\(/);
  const migration=await read('../supabase/migrations/048_referral_security_and_summary_fix.sql');
  assert.doesNotMatch(migration,/create\s+(or replace\s+)?function/i);
});
