import { supabaseAdmin } from '../supabase.js';

export async function writeAdminAuditLog(
  adminEmail: string | undefined,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown>
) {
  const auditRow = {
    admin_email: adminEmail || null,
    admin_id: adminEmail || null,
    action,
    target_type: targetType,
    target_id: targetId,
    entity_type: targetType,
    entity_id: targetId,
    details,
    after: details,
    note: typeof details.note === 'string' ? details.note : null
  };

  await Promise.all([
    supabaseAdmin.from('admin_audit_log').insert(auditRow),
    supabaseAdmin.from('admin_activity_logs').insert(auditRow)
  ]);
}
