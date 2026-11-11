import { supabaseAdmin } from '../supabase.js';

export type InAppNotification = {
  userId: string | null | undefined;
  recipientType: 'client' | 'advertiser';
  eventType: string;
  title: string;
  body?: string | null;
  profileId?: string | null;
};

/**
 * Writes an in-app notification into the existing radar_notifications table (migration 019).
 * Notifications are best effort: a failure is logged and never undoes the business action.
 */
export async function notifyUser(notification: InAppNotification) {
  if (!notification.userId) return;
  try {
    const { error } = await supabaseAdmin.from('radar_notifications').insert({
      user_id: notification.userId,
      recipient_type: notification.recipientType,
      event_type: notification.eventType,
      title: notification.title.slice(0, 200),
      body: notification.body ? notification.body.slice(0, 1000) : null,
      profile_id: notification.profileId || null
    });
    if (error) console.error('[InAppNotifications] insert failed', notification.eventType, error.message);
  } catch (error) {
    console.error('[InAppNotifications] insert failed', notification.eventType, error instanceof Error ? error.message : error);
  }
}

/** Chat sends one notification per profile until the recipient has read it, instead of one per message. */
export async function notifyUserUnlessUnread(notification: InAppNotification) {
  if (!notification.userId) return;
  try {
    let query = supabaseAdmin.from('radar_notifications').select('id')
      .eq('user_id', notification.userId)
      .eq('event_type', notification.eventType)
      .is('read_at', null);
    if (notification.profileId) query = query.eq('profile_id', notification.profileId);
    const { data } = await query.limit(1);
    if (data?.length) return;
  } catch (error) {
    console.error('[InAppNotifications] lookup failed', notification.eventType, error instanceof Error ? error.message : error);
  }
  await notifyUser(notification);
}

export async function markNotificationsRead(userId: string, eventTypePrefix: string) {
  const { data, error } = await supabaseAdmin.from('radar_notifications')
    .select('id, event_type')
    .eq('user_id', userId)
    .is('read_at', null)
    .limit(500);
  if (error) throw error;
  const ids = (data || []).filter((row) => String(row.event_type).startsWith(eventTypePrefix)).map((row) => row.id);
  if (!ids.length) return 0;
  const { error: updateError } = await supabaseAdmin.from('radar_notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids);
  if (updateError) throw updateError;
  return ids.length;
}
