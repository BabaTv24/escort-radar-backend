import { VIDEO_CHAT_IMPLEMENTED } from '../featureAvailability.js';
import { supabaseAdmin } from '../supabase.js';

export type CommunicationSettings = { text_chat_enabled: boolean; ai_assistant_enabled: boolean };
type ProfileLike = { id: string; sponsorship_type?: string | null };

/** Without a stored row: admin-sponsored profiles keep chat + AI (pre-059 behaviour), others are off. */
export function defaultCommunicationSettings(profile: ProfileLike): CommunicationSettings {
  const sponsored = profile.sponsorship_type === 'admin_sponsored';
  return { text_chat_enabled: sponsored, ai_assistant_enabled: sponsored };
}

export async function getCommunicationSettings(profile: ProfileLike): Promise<CommunicationSettings> {
  const map = await getCommunicationSettingsMap([profile]);
  return map.get(profile.id)!;
}

export async function getCommunicationSettingsMap(profiles: ProfileLike[]) {
  const result = new Map<string, CommunicationSettings>(profiles.map((profile) => [profile.id, defaultCommunicationSettings(profile)]));
  const ids = profiles.map((profile) => profile.id);
  if (!ids.length) return result;
  const { data, error } = await supabaseAdmin.from('profile_communication_settings')
    .select('profile_id, text_chat_enabled, ai_assistant_enabled')
    .in('profile_id', ids);
  if (error) throw error;
  for (const row of data || []) {
    result.set(row.profile_id, { text_chat_enabled: Boolean(row.text_chat_enabled), ai_assistant_enabled: Boolean(row.ai_assistant_enabled) });
  }
  return result;
}

export async function saveCommunicationSettings(profileId: string, settings: CommunicationSettings, userId: string) {
  const { error } = await supabaseAdmin.from('profile_communication_settings').upsert({
    profile_id: profileId,
    text_chat_enabled: settings.text_chat_enabled,
    ai_assistant_enabled: settings.ai_assistant_enabled,
    updated_by: userId,
    updated_at: new Date().toISOString()
  }, { onConflict: 'profile_id' });
  if (error) throw error;
}

/** What a visitor may know: booleans only. Video is never offered while it is not implemented. */
export function publicCommunication(settings: CommunicationSettings) {
  return {
    text_chat: settings.text_chat_enabled,
    ai_assistant: settings.ai_assistant_enabled,
    video_chat: false,
    video_chat_implemented: VIDEO_CHAT_IMPLEMENTED
  };
}
