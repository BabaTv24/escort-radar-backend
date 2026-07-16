export type BulkPhotoOperation = 'approve' | 'reject';

export type BulkPhotoModerationItem = {
  image_id: string;
  status: 'approved' | 'rejected' | 'skipped' | 'failed';
  reason?: string;
};

export type BulkPhotoModerationResult = {
  requested: number;
  approved: number;
  rejected: number;
  skipped: number;
  failed: number;
  items: BulkPhotoModerationItem[];
};

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateBulkPhotoModerationInput(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const operation = input.operation === 'approve' || input.operation === 'reject' ? input.operation : null;
  const ids = Array.isArray(input.image_ids) ? input.image_ids.map(String) : [];
  if (!operation) return { error: 'operation must be approve or reject' } as const;
  if (!ids.length) return { error: 'image_ids are required' } as const;
  if (ids.length > 100) return { error: 'A maximum of 100 image_ids is allowed' } as const;
  if (new Set(ids).size !== ids.length) return { error: 'image_ids must be unique' } as const;
  if (ids.some((id) => !UUID_PATTERN.test(id))) return { error: 'Every image_id must be a UUID' } as const;
  return { operation, imageIds: ids } as const;
}

export async function runBulkPhotoModeration(
  imageIds: string[],
  operation: BulkPhotoOperation,
  moderateOne: (imageId: string, status: 'approved' | 'rejected') => Promise<'updated' | 'skipped'>
): Promise<BulkPhotoModerationResult> {
  const targetStatus = operation === 'approve' ? 'approved' : 'rejected';
  const items: BulkPhotoModerationItem[] = [];
  for (const imageId of imageIds) {
    try {
      const outcome = await moderateOne(imageId, targetStatus);
      items.push(outcome === 'updated'
        ? { image_id: imageId, status: targetStatus }
        : { image_id: imageId, status: 'skipped', reason: 'not_pending_or_not_found' });
    } catch (error) {
      items.push({ image_id: imageId, status: 'failed', reason: error instanceof Error ? error.message : 'unknown_error' });
    }
  }
  return {
    requested: imageIds.length,
    approved: items.filter((item) => item.status === 'approved').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
    skipped: items.filter((item) => item.status === 'skipped').length,
    failed: items.filter((item) => item.status === 'failed').length,
    items
  };
}
