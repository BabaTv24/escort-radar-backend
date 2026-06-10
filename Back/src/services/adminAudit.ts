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
    action,
    target_type: targetType,
    target_id: targetId,
    details
  };

  await Promise.all([
    supabaseAdmin.from('admin_audit_log').insert(auditRow),
    supabaseAdmin.from('admin_activity_logs').insert(auditRow)
  ]);
}
