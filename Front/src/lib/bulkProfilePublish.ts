import type { BulkProfilePublishResponse } from './api';

export function selectedIdsAfterBulkPublish(selectedIds: string[], result: BulkProfilePublishResponse) {
  const publishedIds = new Set(result.items.filter((item) => item.status === 'published').map((item) => item.profile_id));
  return selectedIds.filter((id) => !publishedIds.has(id));
}
