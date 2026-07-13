import { Router } from 'express';
import { requireAdmin, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';

const referralCodePattern = /^ER-[A-Z0-9]{6,16}$/;
const allowedSources = new Set(['direct', 'referral_link', 'referral_code']);
export const referralsRouter = Router();

referralsRouter.get('/resolve/:code', asyncHandler(async (req, res) => {
  const code = optionalText(req.params.code, 32)?.toUpperCase();
  if (!code || !referralCodePattern.test(code)) return res.json({ valid: false, displayName: null });
  const { data } = await supabaseAdmin.from('client_referrals').select('user_id').eq('referral_code', code).maybeSingle();
  if (!data) return res.json({ valid: false, displayName: null });
  const { data: profile } = await supabaseAdmin.from('client_profiles').select('display_name').eq('user_id', data.user_id).maybeSingle();
  return res.json({ valid: true, displayName: profile?.display_name || 'Użytkownik Escort Radar' });
}));

referralsRouter.post('/assign-me', verifyUser, asyncHandler(async (req, res) => {
  const rawCode = optionalText(req.body.referralCode, 32)?.toUpperCase() || null;
  const referralCode = rawCode && referralCodePattern.test(rawCode) ? rawCode : null;
  const requestedSource = optionalText(req.body.registrationSource, 30) || 'direct';
  const registrationSource = allowedSources.has(requestedSource) ? requestedSource : 'direct';
  const { data, error } = await supabaseAdmin.rpc('assign_referral', {
    p_user_id: req.user!.id,
    p_referral_code: referralCode,
    p_source: registrationSource
  });
  if (error) return res.status(503).json({ error: 'Referral assignment is temporarily unavailable' });
  return res.json({ assigned: true, referralCode: data?.referral_code });
}));

referralsRouter.get('/me', verifyUser, asyncHandler(async (req, res) => {
  const { error: assignmentError } = await supabaseAdmin.rpc('assign_referral', { p_user_id: req.user!.id, p_referral_code: null, p_source: 'direct' });
  if (assignmentError) return res.status(503).json({ error: 'Referral assignment is temporarily unavailable' });
  const { data: referral, error } = await supabaseAdmin.from('client_referrals')
    .select('referral_code,referral_link,referred_by_user_id,registration_source,referral_depth').eq('user_id', req.user!.id).single();
  if (error) return res.status(400).json({ error: error.message });
  const [{ count: direct }, { data: tree }] = await Promise.all([
    supabaseAdmin.from('client_referrals').select('id', { count: 'exact', head: true }).eq('referred_by_user_id', req.user!.id),
    supabaseAdmin.rpc('get_admin_referral_tree', { p_root_user_id: req.user!.id, p_max_depth: 5, p_page: 1, p_page_size: 100, p_parent_user_id: null, p_search: null, p_role: null, p_source: null })
  ]);
  let referredByDisplay: string | null = null;
  if (referral.referred_by_user_id) {
    const { data } = await supabaseAdmin.from('client_profiles').select('display_name').eq('user_id', referral.referred_by_user_id).maybeSingle();
    referredByDisplay = data?.display_name || 'Użytkownik Escort Radar';
  }
  const own = (tree || []).find((node: Record<string, unknown>) => node.user_id === req.user!.id);
  res.json({ referralCode: referral.referral_code, referralLink: referral.referral_link,
    directReferralsCount: direct || 0, totalDescendantsCount: Number(own?.total_descendants_count || 0),
    referredByDisplay, registrationSource: referral.registration_source, referralDepth: referral.referral_depth });
}));

export const adminReferralsRouter = Router();
adminReferralsRouter.use(verifyUser, requireAdmin);

adminReferralsRouter.get('/tree', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 1), 100);
  const maxDepth = Math.min(Math.max(Number(req.query.maxDepth) || 1, 0), 5);
  const rpcParams = {
    p_parent_user_id: optionalText(req.query.parentUserId, 36) || null,
    p_root_user_id: optionalText(req.query.rootUserId, 36) || null,
    p_max_depth: maxDepth, p_page: page, p_page_size: pageSize,
    p_search: optionalText(req.query.search, 80) || null,
    p_role: optionalText(req.query.role, 30) || null,
    p_source: optionalText(req.query.registrationSource, 30) || null
  };
  const { data, error } = await supabaseAdmin.rpc('get_admin_referral_tree', rpcParams);
  if (error) return res.status(400).json({ error: error.message });
  const nodes = (data || []).map((row: Record<string, unknown>) => ({
    userId: row.user_id, parentUserId: row.parent_user_id, displayName: row.display_name,
    role: row.role, accountStatus: row.account_status, registrationSource: row.registration_source,
    activationStatus: row.activation_status, activationProvider: row.activation_provider,
    referralCode: row.referral_code, referralDepth: row.referral_depth, createdAt: row.created_at,
    directChildrenCount: Number(row.direct_children_count || 0), totalDescendantsCount: Number(row.total_descendants_count || 0),
    balanceBcu: Number(row.balance_bcu || 0), hasProfile: Boolean(row.has_profile),
    isSponsoredProfile: Boolean(row.is_sponsored_profile), isRoot: Number(row.referral_depth) === 0
  }));
  res.json({ nodes, page, pageSize, maxDepth, hasMore: nodes.length === pageSize });
}));

adminReferralsRouter.get('/summary', asyncHandler(async (_req, res) => {
  const [{ data: rows, count: totalUsers }, { data: authPage }] = await Promise.all([
    supabaseAdmin.from('client_referrals').select('referred_by_user_id,referral_depth,registration_source,created_at,user_id', { count: 'exact' }).limit(5000),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);
  const referrals = rows || [];
  const root = referrals.find(row => row.referral_depth === 0);
  const registrationsByDay: Record<string, number> = {}, usersBySource: Record<string, number> = {}, usersByRole: Record<string, number> = {};
  for (const row of referrals) {
    const day = String(row.created_at).slice(0, 10); registrationsByDay[day] = (registrationsByDay[day] || 0) + 1;
    usersBySource[row.registration_source || 'unresolved'] = (usersBySource[row.registration_source || 'unresolved'] || 0) + 1;
  }
  for (const user of authPage.users) { const role = String(user.app_metadata?.role || user.app_metadata?.auth_account_type || 'client'); usersByRole[role] = (usersByRole[role] || 0) + 1; }
  res.json({ totalUsers: totalUsers || 0, directToAdmin: referrals.filter(row => row.referred_by_user_id === root?.user_id).length,
    directUsers: referrals.filter(row => row.registration_source === 'direct').length,
    totalReferralRegistrations: referrals.filter(row => row.registration_source === 'referral_link' || row.registration_source === 'referral_code').length,
    sponsoredProfiles: referrals.filter(row => row.registration_source === 'sponsored_profile').length,
    unresolvedBackfill: referrals.filter(row => row.registration_source === 'backfill').length,
    usersWithoutResolvedParent: referrals.filter(row => row.referral_depth !== 0 && !row.referred_by_user_id).length,
    maximumDepth: Math.max(0, ...referrals.map(row => row.referral_depth || 0)),
    registrationsByDay: Object.entries(registrationsByDay).map(([date, count]) => ({ date, count })), usersBySource, usersByRole });
}));
