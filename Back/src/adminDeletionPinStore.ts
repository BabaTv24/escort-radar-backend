import { normalizeAdminId, type AdminDeletionPinRecord, type AdminDeletionPinStore } from './adminDeletionPin.js';
import { supabaseAdmin } from './supabase.js';

export const supabaseAdminDeletionPinStore: AdminDeletionPinStore = {
  async get(adminId) {
    const { data, error } = await supabaseAdmin
      .from('admin_security_settings')
      .select('admin_id, deletion_pin_hash, deletion_pin_updated_at, failed_attempts, attempt_window_started_at, locked_until')
      .eq('admin_id', normalizeAdminId(adminId))
      .maybeSingle();
    if (error) throw error;
    return data as AdminDeletionPinRecord | null;
  },

  async save(adminId, hash, configured) {
    const now = new Date().toISOString();
    const row = {
      admin_id: normalizeAdminId(adminId),
      deletion_pin_hash: hash,
      ...(configured ? {} : { deletion_pin_set_at: now }),
      deletion_pin_updated_at: now,
      failed_attempts: 0,
      attempt_window_started_at: null,
      locked_until: null,
      updated_at: now
    };
    const { data, error } = await supabaseAdmin
      .from('admin_security_settings')
      .upsert(row, { onConflict: 'admin_id' })
      .select('admin_id, deletion_pin_hash, deletion_pin_updated_at, failed_attempts, attempt_window_started_at, locked_until')
      .single();
    if (error) throw error;
    return data as AdminDeletionPinRecord;
  },

  async recordFailure(adminId) {
    const { data, error } = await supabaseAdmin.rpc('record_admin_deletion_pin_failure', {
      p_admin_id: normalizeAdminId(adminId)
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    return {
      failed_attempts: Number(result?.failed_attempts || 0),
      locked_until: result?.locked_until ? String(result.locked_until) : null
    };
  },

  async resetFailures(adminId) {
    const { error } = await supabaseAdmin
      .from('admin_security_settings')
      .update({ failed_attempts: 0, attempt_window_started_at: null, locked_until: null, updated_at: new Date().toISOString() })
      .eq('admin_id', normalizeAdminId(adminId));
    if (error) throw error;
  }
};
