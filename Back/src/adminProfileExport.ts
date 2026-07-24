export const profileExportFormatVersion = 1;
export const profileExportPageSize = 1000;

const sensitiveKeys = new Set([
  'password',
  'password_hash',
  'encrypted_password',
  'authorization',
  'credential',
  'credentials',
  'cookie',
  'api_key',
  'apikey',
  'private_key',
  'service_role_key',
  'secret',
  'session',
  'token',
  'session_token',
  'access_token',
  'refresh_token',
  'auth_token',
  'claim_token',
  'claim_token_hash',
  'invite_token',
  'token_hash'
]);

const sensitiveKeySuffixes = ['_password', '_secret', '_api_key', '_access_token', '_refresh_token', '_session_token', '_claim_token', '_token_hash'];

export type ProfileExport = {
  format_version: number;
  exported_at: string;
  profile_count: number;
  profiles: Record<string, unknown>[];
};

export type ProfileExportPageLoader = (afterId: string | null, pageSize: number) => Promise<Record<string, unknown>[]>;

function normalizedKey(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

export function removeProfileExportSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeProfileExportSecrets);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => {
      const normalized = normalizedKey(key);
      return !sensitiveKeys.has(normalized) && !sensitiveKeySuffixes.some((suffix) => normalized.endsWith(suffix));
    })
    .map(([key, nestedValue]) => [key, removeProfileExportSecrets(nestedValue)]));
}

export async function loadAllProfilesForExport(loadPage: ProfileExportPageLoader, pageSize = profileExportPageSize) {
  const profiles: Record<string, unknown>[] = [];
  let afterId: string | null = null;

  while (true) {
    const page = await loadPage(afterId, pageSize);
    if (!page.length) break;
    profiles.push(...page);
    if (page.length < pageSize) break;

    const nextId = String(page[page.length - 1]?.id || '');
    if (!nextId || nextId === afterId) throw new Error('Profile export pagination did not advance');
    afterId = nextId;
  }

  return profiles;
}

export function buildProfileExport(profiles: Record<string, unknown>[], exportedAt = new Date()): ProfileExport {
  const safeProfiles = removeProfileExportSecrets(profiles) as Record<string, unknown>[];
  return {
    format_version: profileExportFormatVersion,
    exported_at: exportedAt.toISOString(),
    profile_count: safeProfiles.length,
    profiles: safeProfiles
  };
}

export function profileExportFilename(exportedAt = new Date()) {
  const iso = exportedAt.toISOString();
  return `escort-radar-profiles-backup-${iso.slice(0, 10)}-${iso.slice(11, 16).replace(':', '')}.json`;
}

export function selectedProfileExportFilename(exportedAt = new Date()) {
  const iso = exportedAt.toISOString();
  return `escort-radar-profiles-selected-${iso.slice(0, 10)}-${iso.slice(11, 16).replace(':', '')}.json`;
}
