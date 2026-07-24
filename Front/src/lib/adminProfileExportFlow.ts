import type { AdminProfileSelection, AdminProfileSelectionFilters } from './adminProfileSelection';
import { adminProfileSelectionFilterKey } from './adminProfileSelection';
import type { AdminProfileExportFileHandle } from './api';

export type AdminProfileExportScope = 'selected' | 'filtered' | 'all';

export type AdminProfileExportOption = {
  scope: AdminProfileExportScope;
  count: number;
};

export type PreparedAdminProfileExport = {
  blob: Blob;
  objectUrl: string;
  filename: string;
  profileCount: number;
};

const emptyFilterValues: AdminProfileSelectionFilters = {
  q: '',
  type: 'all',
  published: 'all',
  suspended: 'all',
  seed: 'all',
  verified: 'all',
  premium_tier: 'all',
  owner_email: '',
  city_query: '',
  country: '',
  city: ''
};

export function adminProfileExportFiltersActive(filters: AdminProfileSelectionFilters) {
  return adminProfileSelectionFilterKey(filters) !== adminProfileSelectionFilterKey(emptyFilterValues);
}

export function adminProfileSelectionMatchesFilters(
  selection: AdminProfileSelection,
  filters: AdminProfileSelectionFilters
) {
  return selection.mode === 'all_filtered'
    && selection.excluded_profile_ids.length === 0
    && adminProfileSelectionFilterKey(selection.filters) === adminProfileSelectionFilterKey(filters);
}

export function adminProfileExportOptions(input: {
  selectedCount: number;
  filteredCount: number;
  totalCount: number;
  filtersActive: boolean;
  selectionMatchesFilters: boolean;
}) {
  const options: AdminProfileExportOption[] = [];
  const filteredIsDistinct = input.filtersActive
    && input.filteredCount > 0
    && input.filteredCount < input.totalCount;
  const selectedIsDistinct = input.selectedCount > 0
    && input.selectedCount < input.totalCount
    && !(filteredIsDistinct && input.selectionMatchesFilters);

  if (selectedIsDistinct) options.push({ scope: 'selected', count: input.selectedCount });
  if (filteredIsDistinct) options.push({ scope: 'filtered', count: input.filteredCount });
  options.push({ scope: 'all', count: Math.max(0, input.totalCount) });
  return options;
}

export function replaceAdminProfileExportObjectUrl(
  blob: Blob,
  currentUrl: string | null,
  urlApi: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL
) {
  if (currentUrl) urlApi.revokeObjectURL(currentUrl);
  return urlApi.createObjectURL(blob);
}

export function releaseAdminProfileExportObjectUrl(
  objectUrl: string | null,
  urlApi: Pick<typeof URL, 'revokeObjectURL'> = URL
) {
  if (objectUrl) urlApi.revokeObjectURL(objectUrl);
}

export function savePreparedAdminProfileExportAs(
  blob: Blob,
  filename: string,
  picker: (options: Record<string, unknown>) => Promise<AdminProfileExportFileHandle>
) {
  let handlePromise: Promise<AdminProfileExportFileHandle>;
  try {
    // This must remain the first asynchronous browser action in the click handler.
    handlePromise = picker({
      suggestedName: filename,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
  } catch (error) {
    return Promise.reject(error);
  }
  return handlePromise.then(async (handle) => {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  });
}

export function adminProfileExportPickerFor(owner: {
  showSaveFilePicker: (options: Record<string, unknown>) => Promise<AdminProfileExportFileHandle>;
}) {
  return (options: Record<string, unknown>) => owner.showSaveFilePicker(options);
}

export function isAdminProfileExportPickerAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function formatAdminProfileExportSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
