import { Router } from 'express';
import { bookingDisplayStatus } from '../bookingRules.js';
import { config } from '../config.js';
import { requireAdvertiserAccess, verifyUser } from '../middleware/auth.js';
import { markNotificationsRead } from '../services/inAppNotifications.js';
import { bcuToBc, getBcuWalletForUser, normalizeBcuDatabaseInteger } from '../services/bcuWallet.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';
import { countUnread } from './profileChatRoutes.js';

type Row = Record<string, any>;
const AWAITING = 'awaiting_owner_activation';

/**
 * Ledger credit types that count as digital earnings. Booking fees are reported separately, never mixed in.
 * Favorites and booking requests are free since contract V1 (060); their lines show historical credits only.
 */
export const DIGITAL_REVENUE_TYPES = {
  gifts: 'gift_received',
  favorites: 'favorite_received',
  text_chat: 'chat_received',
  video_chat: 'videochat_received'
} as const;
export const BOOKING_FEE_CREDIT_TYPE = 'booking_received';

export const advertiserActivityRouter = Router();
advertiserActivityRouter.use(verifyUser, requireAdvertiserAccess);

/**
 * Business counters for every profile the authenticated account owns.
 * All numbers come from the database (bookings, chat messages, notifications, BC ledger); nothing is projected.
 */
advertiserActivityRouter.get('/', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { data: ownedProfiles, error: profileError } = await supabaseAdmin.from('profiles')
    .select('id, owner_activation_status, opening_hours')
    .eq('user_id', userId);
  if (profileError) return res.status(500).json({ error: 'ACTIVITY_UNAVAILABLE', code: 'ACTIVITY_UNAVAILABLE' });
  // Sponsored profiles awaiting their real owner stay hidden from the technical account, as in bookings and chat.
  const profiles = (ownedProfiles || []).filter((profile: Row) => profile.owner_activation_status !== AWAITING);
  const profileIds = profiles.map((profile: Row) => profile.id as string);
  const timeZoneById = new Map(profiles.map((profile: Row) => [profile.id, profile.opening_hours?.timezone]));

  const empty = Promise.resolve({ data: [] as Row[], error: null });
  const [bookings, sessions, admirers, notifications] = await Promise.all([
    profileIds.length ? supabaseAdmin.from('booking_requests').select('profile_id, status, requested_date, requested_time, duration_minutes').in('profile_id', profileIds).limit(2000) : empty,
    profileIds.length ? supabaseAdmin.from('profile_chat_sessions').select('id, owner_read_at, client_read_at').in('profile_id', profileIds).limit(500) : empty,
    profileIds.length ? supabaseAdmin.from('client_favorites').select('profile_id').in('profile_id', profileIds).limit(5000) : empty,
    supabaseAdmin.from('radar_notifications').select('event_type').eq('user_id', userId).is('read_at', null).eq('event_type', 'favorite_received').limit(500)
  ]);

  const now = new Date();
  let newBookings = 0;
  let activeBookings = 0;
  for (const booking of (bookings.data || []) as Row[]) {
    const status = bookingDisplayStatus(booking as { status: unknown }, now, timeZoneById.get(booking.profile_id));
    if (status === 'pending') newBookings += 1;
    if (status === 'accepted') activeBookings += 1;
  }

  let unreadMessages = 0;
  const sessionRows = sessions.data || [];
  if (sessionRows.length) {
    const { data: messages } = await supabaseAdmin.from('profile_chat_messages')
      .select('session_id, sender_type, created_at')
      .in('session_id', sessionRows.map((session: Row) => session.id))
      .eq('sender_type', 'client')
      .order('created_at', { ascending: false })
      .limit(5000);
    for (const session of sessionRows) {
      unreadMessages += countUnread((messages || []).filter((message: Row) => message.session_id === session.id), 'owner', session);
    }
  }

  res.json({
    profiles_count: profileIds.length,
    new_bookings: newBookings,
    active_bookings: activeBookings,
    unread_messages: unreadMessages,
    admirers_total: (admirers.data || []).length,
    new_admirers: (notifications.data || []).length,
    wallet: config.bcuWalletEnabled ? await walletSummary(userId) : null,
    revenue: config.bcuWalletEnabled ? await revenueSummary(userId) : null
  });
}));

/** Opening the earnings view acknowledges new-admirer notifications. */
advertiserActivityRouter.post('/admirers/read', asyncHandler(async (req, res) => {
  const updated = await markNotificationsRead(req.user!.id, 'favorite_received');
  res.json({ updated });
}));

async function walletSummary(userId: string) {
  const wallet = await getBcuWalletForUser(userId);
  if (!wallet) return { available_bc: '0', locked_bc: '0' };
  const balance = BigInt(normalizeBcuDatabaseInteger(wallet.balance_bcu));
  const locked = BigInt(normalizeBcuDatabaseInteger((wallet as Row).locked_balance_bcu ?? 0));
  const available = balance > locked ? balance - locked : 0n;
  return { available_bc: bcuToBc(available.toString()), locked_bc: bcuToBc(locked.toString()) };
}

/** Sums completed ledger credits by type. Purchased BC, bonuses and transfers are never counted as earnings. */
async function revenueSummary(userId: string) {
  const types = [...Object.values(DIGITAL_REVENUE_TYPES), BOOKING_FEE_CREDIT_TYPE];
  const { data, error } = await supabaseAdmin.from('bcu_ledger_entries')
    .select('amount_bcu, transaction_type')
    .eq('user_id', userId)
    .eq('direction', 'credit')
    .eq('status', 'completed')
    .in('transaction_type', types)
    .limit(20000);
  if (error) throw error;
  const totals = new Map<string, bigint>(types.map((type) => [type, 0n]));
  const counts = new Map<string, number>(types.map((type) => [type, 0]));
  for (const row of data || []) {
    totals.set(row.transaction_type, (totals.get(row.transaction_type) || 0n) + BigInt(normalizeBcuDatabaseInteger(row.amount_bcu)));
    counts.set(row.transaction_type, (counts.get(row.transaction_type) || 0) + 1);
  }
  const line = (type: string) => ({ bc: bcuToBc((totals.get(type) || 0n).toString()), count: counts.get(type) || 0 });
  const digital = Object.values(DIGITAL_REVENUE_TYPES).reduce((sum, type) => sum + (totals.get(type) || 0n), 0n);
  return {
    gifts: line(DIGITAL_REVENUE_TYPES.gifts),
    favorites: line(DIGITAL_REVENUE_TYPES.favorites),
    text_chat: line(DIGITAL_REVENUE_TYPES.text_chat),
    video_chat: line(DIGITAL_REVENUE_TYPES.video_chat),
    digital_total_bc: bcuToBc(digital.toString()),
    booking_fees: line(BOOKING_FEE_CREDIT_TYPE)
  };
}
