import type { AdminActivity, AdminReport, AdminStats, BcCoinPackage, BcuEntitlement, BcuLedgerEntry, BcuWallet, BookingRequest, ClientActivation, ClientFavorite, ClientIntent, ClientPersonalProfile, ClientProfile, ClientSearchPreferences, CoinTransaction, CoinWallet, Gift, HermesProfilePreview, MasterAdminWallet, Profile, ProfileAccess, RadarNotification, Tag, TokenPackage, TokenPurchaseRequest, TokenTransaction, Wallet } from '../types';

export type BulkPhotoModerationResponse = {
  requested: number;
  approved: number;
  rejected: number;
  skipped: number;
  failed: number;
  items: Array<{ image_id: string; status: 'approved' | 'rejected' | 'skipped' | 'failed'; reason?: string }>;
};

const API_URL = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || 'http://localhost:4000';

type RequestOptions = RequestInit & { token?: string; timeoutMs?: number };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly payload?: Record<string, unknown>) {
    super(`HTTP ${status}: ${message}`);
    this.name = 'ApiError';
  }
}

export type ReferralMe = { referralCode: string; referralLink: string; directReferralsCount: number; totalDescendantsCount: number; referredByDisplay: string | null; registrationSource: string; referralDepth: number };
export type AdminReferralNode = { userId: string; parentUserId: string | null; displayName: string; role: string; accountStatus: string; registrationSource: string; activationStatus: string; activationProvider: string | null; referralCode: string; referralDepth: number; createdAt: string; directChildrenCount: number; totalDescendantsCount: number; balanceBcu: number; hasProfile: boolean; isSponsoredProfile: boolean; isRoot: boolean };
export type BulkProfilePublishStatus = 'published' | 'already_published' | 'skipped_moderation_pending' | 'skipped_unpaid_or_inactive_subscription' | 'skipped_suspended' | 'skipped_incomplete' | 'not_found' | 'failed';
export type BulkProfilePublishResponse = {
  operation: 'publish';
  requested: number;
  published: number;
  already_published: number;
  skipped: number;
  failed: number;
  updated: number;
  items: Array<{ profile_id: string; status: BulkProfilePublishStatus; error?: string }>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  const { timeoutMs, token: _token, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { cache: 'no-store', ...fetchOptions, headers, signal: controller?.signal || fetchOptions.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw error;
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    const reason = payload.reason ? ` (${payload.reason})` : '';
    const stage = payload.stage ? ` [${payload.stage}]` : '';
    const details = payload.details ? `: ${typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details)}` : '';
    throw new ApiError(`${payload.error || 'Request failed'}${stage}${reason}${details}`, response.status, payload);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  profiles: (params = '') => request<{ profiles: Profile[] }>(`/api/profiles${params}`),
  authMe: (token: string) => request<{ user: { id: string; email?: string; auth_account_type: 'client' | 'escort' | 'business'; role?: string; app_metadata?: Record<string, unknown> }; client_profile: ClientProfile | null }>('/api/auth/me', { token }),
  updateClientProfile: (token: string, body: Partial<ClientProfile>) => request<{ client_profile: ClientProfile }>('/api/auth/client-profile', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  clientPreferences: (token: string) => request<{ preferences: ClientSearchPreferences }>('/api/client/preferences', { token }),
  updateClientPreferences: (token: string, body: Partial<ClientSearchPreferences>) => request<{ preferences: ClientSearchPreferences }>('/api/client/preferences', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  clearClientSearchLocation: (token: string) => request<{ preferences: ClientSearchPreferences }>('/api/client/preferences/location', {
    method: 'DELETE',
    token
  }),
  clientPersonalProfile: (token: string) => request<{ personal_profile: ClientPersonalProfile | null }>('/api/client/personal-profile', { token }),
  updateClientPersonalProfile: (token: string, body: Partial<ClientPersonalProfile>) => request<{ personal_profile: ClientPersonalProfile }>('/api/client/personal-profile', {
    method: 'PUT',
    token,
    body: JSON.stringify(body)
  }),
  register: (body: { email: string; password: string; username?: string; auth_account_type: 'client' | 'escort' | 'business'; identity?: string; referred_by_code?: string }) => request<{ user: { id: string; email?: string; auth_account_type: 'client' | 'escort' | 'business' } }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  referralMe: (token: string) => request<ReferralMe>('/api/referrals/me', { token }),
  assignMyReferral: (token: string, referralCode: string | null, registrationSource: 'direct' | 'referral_link' | 'referral_code' = 'referral_link') => request<{ assigned: boolean; referralCode: string }>('/api/referrals/assign-me', { method: 'POST', token, body: JSON.stringify({ referralCode, registrationSource }) }),
  resolveReferral: (code: string) => request<{ valid: boolean; displayName: string | null }>(`/api/referrals/resolve/${encodeURIComponent(code)}`),
  adminReferralTree: (token: string, params: URLSearchParams) => request<{ nodes: AdminReferralNode[]; page: number; pageSize: number; maxDepth: number; hasMore: boolean }>(`/api/admin/referrals/tree?${params}`, { token }),
  adminReferralSummary: (token: string) => request<Record<string, unknown>>('/api/admin/referrals/summary', { token }),
  tags: () => request<{ tags: Tag[] }>('/api/tags'),
  profile: (id: string) => request<{ profile: Profile }>(`/api/profiles/${id}`),
  profileAccess: (token: string, id: string) => request<{ access: ProfileAccess }>(`/api/profiles/${id}/access`, { token }),
  myProfile: (token: string) => request<{ profile: Profile | null }>('/api/profiles/me', { token }),
  createProfile: (token: string, body: Partial<Profile>) => request<{ profile: Profile }>('/api/profiles', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  updateProfile: (token: string, id: string, body: Partial<Profile>) => request<{ profile: Profile }>(`/api/profiles/${id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body)
  }),
  uploadImage: (token: string, form: FormData) => request<{ image: unknown }>('/api/uploads/profile-image', {
    method: 'POST',
    token,
    body: form,
    timeoutMs: 45000
  }),
  uploadClientAvatar: (token: string, form: FormData) => request<{ client_profile: ClientProfile; avatar_url: string }>('/api/uploads/client-avatar', {
    method: 'POST',
    token,
    body: form
  }),
  setCoverImage: (token: string, id: string) => request<{ image: unknown }>(`/api/uploads/profile-image/${id}/cover`, {
    method: 'PATCH',
    token
  }),
  deleteImage: (token: string, id: string) => request<void>(`/api/uploads/profile-image/${id}`, {
    method: 'DELETE',
    token
  }),
  report: (body: Record<string, string>) => request<{ report: unknown }>('/api/reports', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  createBookingRequest: (body: Partial<BookingRequest>) => request<{ booking_request: BookingRequest }>('/api/booking-requests', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  myBookingRequests: (token: string) => request<{ booking_requests: BookingRequest[] }>('/api/booking-requests/me', { token }),
  setBookingStatus: (token: string, id: string, status: BookingRequest['status']) => request<{ booking_request: BookingRequest }>(`/api/booking-requests/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status })
  }),
  adminLogin: (body: { email: string; password: string; two_factor_code?: string }) => request<{ token: string; admin: { id: string; email?: string; role?: string; admin?: boolean } }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  adminStats: (token: string) => request<{
    stats: AdminStats;
    latest_activity: AdminActivity[];
    revenue_events?: Record<string, unknown>[];
    top_cities?: Record<string, unknown>[];
    top_categories?: Record<string, unknown>[];
    top_profiles?: Record<string, unknown>[];
  }>('/api/admin/stats', { token }),
  adminMe: (token: string) => request<{ admin: { id: string; email?: string; role?: string; admin?: boolean } }>('/api/admin/me', { token }),
  adminProfiles: (token: string, params = '') => request<{ profiles: Profile[]; stats: Record<string, number> }>(`/api/admin/profiles${params}`, { token }),
  adminClients: (token: string, params = '') => request<{ clients: Record<string, unknown>[]; total: number; page: number; page_size: number; bigbaba?: Record<string, unknown> | null }>(`/api/admin/clients${params}`, { token }),
  adminClient: (token: string, id: string) => request<{ client: Record<string, unknown>; payments: Record<string, unknown>[]; coin_transactions: Record<string, unknown>[]; rewards: Record<string, unknown>[]; referrals: Record<string, unknown>[] }>(`/api/admin/clients/${id}`, { token }),
  setAdminClientActivation: (token: string, id: string, state: 'client_free' | 'client_activated') => request<{ client: Record<string, unknown> | null }>(`/api/admin/clients/${id}/activation`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ state })
  }),
  blockAdminClient: (token: string, id: string, blocked: boolean) => request(`/api/admin/clients/${id}/block`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ blocked })
  }),
  adjustAdminClientCoins: (token: string, id: string, amount: number, note = '') => request<{ wallet: CoinWallet }>(`/api/admin/clients/${id}/coins`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ amount, note })
  }),
  adminModeration: (token: string) => request<{ profiles: Profile[]; queues: Record<string, Profile[]> }>('/api/admin/moderation', { token }),
  adminUsers: (token: string) => request<{ users: Record<string, unknown>[] }>('/api/admin/users', { token }),
  adminSubscriptions: (token: string) => request<{ subscriptions: Record<string, unknown>[]; stats?: Record<string, number> }>('/api/admin/subscriptions', { token }),
  adminProfile: (token: string, id: string) => request<{ profile: Profile }>(`/api/admin/profiles/${id}`, { token }),
  adminProfileVisibilityAudit: (token: string, query = '') => request<{ context: Record<string, unknown>; profiles: Array<Record<string, unknown>> }>(`/api/admin/profiles/visibility-audit${query}`, { token }),
  createAdminProfile: (token: string, body: Partial<Profile>) => request<{ profile: Profile; account_created?: boolean; user_linked?: boolean }>('/api/admin/profiles', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  adminProfileMagicLink: (token: string, id: string) => request<{ link: string }>(`/api/admin/profiles/${id}/magic-link`, {
    method: 'POST',
    token
  }),
  createAdminProfileAccount: (token: string, id: string, body: { email: string; password: string; confirm_password: string }) => request<{ profile: Profile; account_created: boolean; user_linked: boolean }>(`/api/admin/profiles/${id}/create-account`, {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  setAdminProfileTempPassword: (token: string, id: string, body: { password: string; confirm_password: string }) => request<{ profile: Profile; user_id: string }>(`/api/admin/profiles/${id}/set-temp-password`, {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  adminProfilePasswordReset: (token: string, id: string) => request<{ link: string }>(`/api/admin/profiles/${id}/password-reset`, {
    method: 'POST',
    token
  }),
  adminProfileSecurity: (token: string, id: string) => request<{ security: Record<string, any> }>(`/api/admin/profiles/${id}/security`, { token }),
  sendAdminProfileLoginEmail: (token: string, id: string) => request<{ sent: boolean; email_to: string; subject: string; email_body: string; link: string; reason?: string }>(`/api/admin/profiles/${id}/send-login-email`, {
    method: 'POST',
    token
  }),
  sendAdminProfileResetEmail: (token: string, id: string) => request<{ sent: boolean; email_to: string; subject: string; email_body: string; link: string; reason?: string }>(`/api/admin/profiles/${id}/send-reset-email`, {
    method: 'POST',
    token
  }),
  importAdminProfiles: (token: string, form: FormData) => request<{ report: { created: number; skipped: number; failed: number; errors: Array<{ row: number; email?: string; error: string }> } }>('/api/admin/profiles/import', {
    method: 'POST',
    token,
    body: form
  }),
  updateAdminProfile: (token: string, id: string, body: Partial<Profile>) => request<{ profile: Profile }>(`/api/admin/profiles/${id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body)
  }),
  deleteAdminProfile: (token: string, id: string, deletionPin: string) => request<void>(`/api/admin/profiles/${id}`, {
    method: 'DELETE',
    token,
    body: JSON.stringify({ deletion_pin: deletionPin })
  }),
  publishAdminProfile: (token: string, id: string, is_published: boolean) => request<{ profile: Profile }>(`/api/admin/profiles/${id}/publish`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ is_published })
  }),
  moderateAdminProfile: (token: string, id: string, body: Record<string, unknown>) => request<{ profile: Profile }>(`/api/admin/profiles/${id}/moderation`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  bulkAdminProfiles: (token: string, body: Record<string, unknown>) => request<{ updated: number; operation: string; profiles?: Profile[] } | BulkProfilePublishResponse>('/api/admin/profiles/bulk', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  uploadAdminProfileImage: (token: string, id: string, form: FormData) => request<{ image: unknown }>(`/api/admin/profiles/${id}/images`, {
    method: 'POST',
    token,
    body: form
  }),
  setAdminProfileCoverImage: (token: string, profileId: string, imageId: string) => request<{ image: unknown }>(`/api/admin/profiles/${profileId}/images/${imageId}/cover`, {
    method: 'PATCH',
    token
  }),
  updateAdminProfileImage: (token: string, profileId: string, imageId: string, body: Record<string, unknown>) => request<{ image: unknown }>(`/api/admin/profiles/${profileId}/images/${imageId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  deleteAdminProfileImage: (token: string, profileId: string, imageId: string) => request<void>(`/api/admin/profiles/${profileId}/images/${imageId}`, {
    method: 'DELETE',
    token
  }),
  reorderAdminProfileImages: (token: string, profileId: string, image_ids: string[]) => request<{ images: unknown[] }>(`/api/admin/profiles/${profileId}/images/reorder`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ image_ids })
  }),
  adminReports: (token: string) => request<{ reports: AdminReport[]; reports_count: number }>('/api/admin/reports', { token }),
  createAdminReport: (token: string, body: Record<string, unknown>) => request<{ report: AdminReport }>('/api/admin/reports', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  updateAdminReport: (token: string, id: string, body: Record<string, unknown>) => request<{ report: AdminReport }>(`/api/admin/reports/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  adminActivityLogs: (token: string) => request<{ activity_logs: AdminActivity[] }>('/api/admin/activity-logs', { token }),
  adminRevenue: (token: string) => request<{ stats: AdminStats; payments: Record<string, unknown>[] }>('/api/admin/revenue', { token }),
  adminBookings: (token: string) => request<{ booking_requests: BookingRequest[] }>('/api/admin/bookings', { token }),
  adminSettings: (token: string) => request<{ settings: Record<string, unknown> }>('/api/admin/settings', { token }),
  adminDeletionPinStatus: (token: string) => request<{ configured: boolean; updated_at: string | null }>('/api/admin/security/pin-status', { token }),
  setAdminDeletionPin: (token: string, body: { current_pin?: string; new_pin: string; confirm_pin: string }) => request<{ configured: true; updated_at: string }>('/api/admin/security/deletion-pin', {
    method: 'PUT',
    token,
    body: JSON.stringify(body)
  }),
  setProfileStatus: (token: string, id: string, status: string) => request(`/api/admin/profiles/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status })
  }),
  setProfileVerification: (token: string, id: string, verification_status: string, moderation_status?: string) => request(`/api/admin/profiles/${id}/verification`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ verification_status, moderation_status })
  }),
  setProfileTestAccount: (token: string, id: string, body: Record<string, unknown>) => request(`/api/admin/profiles/${id}/test-account`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  setProfileAdminNote: (token: string, id: string, admin_note: string) => request(`/api/admin/profiles/${id}/admin-note`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ admin_note })
  }),
  setPhoneConflictStatus: (token: string, id: string, phone_conflict_status: string) => request(`/api/admin/profiles/${id}/phone-conflict-status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ phone_conflict_status })
  }),
  setReportStatus: (token: string, id: string, body: Record<string, unknown>) => request(`/api/admin/reports/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  setAdminBookingStatus: (token: string, id: string, status: string) => request(`/api/admin/bookings/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status })
  }),
  updateAdminSettings: (token: string, settings: Record<string, unknown>) => request<{ settings: Record<string, unknown> }>('/api/admin/settings', {
    method: 'PATCH',
    token,
    body: JSON.stringify({ settings })
  }),
  adminBcCoinPackages: (token: string) => request<{ packages: BcCoinPackage[] }>('/api/admin/bc-coin-packages', { token }),
  createAdminBcCoinPackage: (token: string, body: Partial<BcCoinPackage>) => request<{ package: BcCoinPackage }>('/api/admin/bc-coin-packages', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  updateAdminBcCoinPackage: (token: string, id: string, body: Partial<BcCoinPackage>) => request<{ package: BcCoinPackage }>(`/api/admin/bc-coin-packages/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  disableAdminBcCoinPackage: (token: string, id: string) => request<{ package: BcCoinPackage }>(`/api/admin/bc-coin-packages/${id}`, {
    method: 'DELETE',
    token
  }),
  tokenPackages: () => request<{ packages: TokenPackage[] }>('/api/tokens/packages'),
  myWallet: (token: string) => request<{ wallet: Wallet }>('/api/tokens/wallet/me', { token }),
  myFavorites: (token: string) => request<{ favorites: ClientFavorite[]; wallet: Wallet }>('/api/favorites', { token }),
  addFavorite: (token: string, profileId: string) => request<({ favorite: ClientFavorite; wallet: Wallet; already_favorited: boolean; already_exists?: boolean; charged: number; new_balance?: number } | { favorite: true; charged: boolean; amount_bcu: string; amount_bc: string; recipient: { profile_id: string; credited: boolean } })>(`/api/favorites/${profileId}`, {
    method: 'POST',
    token
  }),
  removeFavorite: (token: string, profileId: string) => request<{ ok: boolean; wallet: Wallet }>(`/api/favorites/${profileId}`, {
    method: 'DELETE',
    token
  }),
  bcuWallet: (token: string) => request<{ wallet: BcuWallet | null }>('/api/bcu/wallet', { token }),
  bcuLedger: (token: string) => request<{ ledger: BcuLedgerEntry[] }>('/api/bcu/ledger', { token }),
  tokenPurchaseIntent: (token: string, package_id?: string) => request('/api/tokens/purchase-intent', {
    method: 'POST',
    token,
    body: JSON.stringify({ package_id })
  }),
  manualPaymentProducts: () => request<{ products: Record<string, unknown>[]; providers: Record<string, boolean>; default_provider: string; support_email: string; bank_transfer?: Record<string, unknown> }>('/api/payments/manual-products'),
  createManualPaymentOrder: (token: string, body: Record<string, unknown>) => request<{ order: Record<string, unknown>; instructions: string; payment_reference: string; bank_transfer: Record<string, unknown>; support_email: string }>('/api/payments/manual-orders', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  myManualPaymentOrders: (token: string) => request<{ orders: Record<string, unknown>[] }>('/api/payments/my-orders', { token }),
  adminTokenStats: (token: string) => request<{ stats: Record<string, number> }>('/api/admin/tokens/stats', { token }),
  adminTags: (token: string) => request<{ tags: Tag[] }>('/api/admin/tags', { token }),
  createAdminTag: (token: string, body: Partial<Tag>) => request<{ tag: Tag }>('/api/admin/tags', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  updateAdminTag: (token: string, id: string, body: Partial<Tag>) => request<{ tag: Tag }>(`/api/admin/tags/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  adminWallets: (token: string) => request<{ wallets: Wallet[] }>('/api/admin/wallets', { token }),
  adminTokenTransactions: (token: string) => request<{ transactions: TokenTransaction[] }>('/api/admin/token-transactions', { token }),
  adminClientActivationPayments: (token: string) => request<{ client_activation_payments: Record<string, unknown>[] }>('/api/admin/client-activation-payments', { token }),
  adminManualPaymentOrders: (token: string) => request<{ orders: Record<string, unknown>[] }>('/api/admin/manual-payment-orders', { token }),
  approveManualPaymentOrder: (token: string, id: string) => request<{ order: Record<string, unknown> }>(`/api/admin/manual-payment-orders/${id}/approve`, {
    method: 'POST',
    token
  }),
  rejectManualPaymentOrder: (token: string, id: string, reason = '') => request<{ order: Record<string, unknown> }>(`/api/admin/manual-payment-orders/${id}/reject`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason })
  }),
  importProfilePreview: (token: string, url: string) => request<{ ok: boolean; source_url: string; profile: HermesProfilePreview; warnings: string[] }>('/api/admin/import-profile-preview', {
    method: 'POST',
    token,
    body: JSON.stringify({ url })
  }),
  discoverCityProfiles: (token: string, listingUrl: string, maxProfiles = 30) => request<{ listing_url: string; declared_count: number | null; found_count: number; profile_urls: string[]; warnings: string[] }>('/api/admin/import-city/discover', {
    method: 'POST',
    token,
    timeoutMs: 15000,
    body: JSON.stringify({ listing_url: listingUrl, max_profiles: maxProfiles })
  }),
  importProfileCreate: (token: string, body: { source_url: string; profile: HermesProfilePreview; create_as_draft: boolean; sponsored?: boolean; imageUrls?: string[] }) => request<{ ok: boolean; profile_id: string; profile: Profile; images_imported: number; images_failed: number; imported_images?: number; failed_images?: number; warnings: string[] }>('/api/admin/import-profile-create', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  activateAdminSubscription: (token: string, id: string, body: Record<string, unknown>) => request<{ subscription: Record<string, unknown> }>(`/api/admin/subscriptions/${id}/activate`, {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  extendAdminSubscription: (token: string, id: string, days: number) => request<{ subscription: Record<string, unknown> }>(`/api/admin/subscriptions/${id}/extend`, {
    method: 'POST',
    token,
    body: JSON.stringify({ days })
  }),
  setAdminSubscriptionDates: (token: string, id: string, body: Record<string, unknown>) => request<{ subscription: Record<string, unknown> }>(`/api/admin/subscriptions/${id}/set-dates`, {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  expireAdminSubscription: (token: string, id: string) => request<{ subscription: Record<string, unknown> }>(`/api/admin/subscriptions/${id}/expire`, {
    method: 'POST',
    token
  }),
  cancelAdminSubscription: (token: string, id: string) => request<{ subscription: Record<string, unknown> }>(`/api/admin/subscriptions/${id}/cancel`, {
    method: 'POST',
    token
  }),
  adminPurchaseRequests: (token: string) => request<{ purchase_requests: TokenPurchaseRequest[] }>('/api/admin/token-purchase-requests', { token }),
  setPurchaseRequestStatus: (token: string, id: string, status: string, admin_note = '') => request(`/api/admin/token-purchase-requests/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status, admin_note })
  }),
  adminMasterWallets: (token: string) => request<{ master_wallets: MasterAdminWallet[] }>('/api/admin/master-wallets', { token }),
  updateMasterWallet: (token: string, id: string, body: Partial<MasterAdminWallet>) => request<{ master_wallet: MasterAdminWallet }>(`/api/admin/master-wallets/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  setProfilePromotion: (token: string, id: string, body: Record<string, unknown>) => request(`/api/admin/profiles/${id}/promotion`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  adminPhotos: (token: string) => request<{ photos: unknown[] }>('/api/admin/photos', { token }),
  adminLocationCatalog: (token: string) => request<{ locations: Record<string, unknown>[] }>('/api/admin/location-catalog', { token }),
  createAdminLocationCatalog: (token: string, body: Record<string, unknown>) => request<{ location: Record<string, unknown> }>('/api/admin/location-catalog', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  setPhotoStatus: (token: string, id: string, moderation_status: string) => request(`/api/admin/photos/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ moderation_status })
  }),
  bulkModerateProfileImages: (token: string, image_ids: string[], operation: 'approve' | 'reject') => request<BulkPhotoModerationResponse>('/api/admin/profile-images/bulk-moderate', {
    method: 'POST',
    token,
    body: JSON.stringify({ image_ids, operation })
  }),
  adminLiveSessions: (token: string) => request<{ live_sessions: unknown[] }>('/api/admin/live-sessions', { token }),
  adminChatSessions: (token: string) => request<{ chat_sessions: unknown[] }>('/api/admin/chat-sessions', { token }),
  simulateLiveLab: (token: string, simulation: string) => request('/api/admin/live-lab/simulate', {
    method: 'POST',
    token,
    body: JSON.stringify({ simulation })
  }),
  clientActivationMe: (token: string) => request<{
    activation: ClientActivation;
    wallet: CoinWallet;
    transactions: CoinTransaction[];
    gifts_sent: Gift[];
    gifts_received: Gift[];
  }>('/api/client-activation/me', { token }),
  clientPremiumDashboardMe: (token: string) => request<({
    wallet_system: 'bcu';
    activation: Pick<ClientActivation, 'state' | 'activated_at'>;
    wallet: BcuWallet | null;
    premium_entitlement: BcuEntitlement | null;
    ledger: BcuLedgerEntry[];
    referral: Pick<ClientActivation, 'referral_code' | 'referral_link' | 'qr_image_url' | 'clicks' | 'registrations' | 'activations' | 'earned_rewards'>;
  } | {
    activation: ClientActivation;
    wallet_system: 'legacy';
    wallet: CoinWallet;
    transactions: CoinTransaction[];
    gifts_sent: Gift[];
    gifts_received: Gift[];
  })>('/api/client-activation/dashboard', { token }),
  trackReferralClick: (referral_code: string, landing_path = window.location.pathname) => request<{ ok: boolean }>('/api/client-activation/referral-click', {
    method: 'POST',
    body: JSON.stringify({ referral_code, landing_path })
  }),
  sendGift: (token: string, body: { profile_id: string; gift_type: string; coin_cost: number; message?: string }) => request<{ gift: Gift }>('/api/client-activation/gifts', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  unlockVipGallery: (token: string, profile_id: string, coin_cost = 25) => request('/api/client-activation/vip-gallery-unlocks', {
    method: 'POST',
    token,
    body: JSON.stringify({ profile_id, coin_cost })
  }),
  adminClientReferrals: (token: string) => request<{ referrals: Record<string, unknown>[] }>('/api/client-activation/admin/referral-stats', { token }),
  adminClientPersonalProfiles: (token: string, status = 'all') => request<{ client_profiles: ClientPersonalProfile[] }>(`/api/admin/client-profiles${status && status !== 'all' ? `?verification_status=${encodeURIComponent(status)}` : ''}`, { token }),
  setAdminClientPersonalVerification: (token: string, id: string, verification_status: ClientPersonalProfile['verification_status']) => request<{ client_profile: ClientPersonalProfile }>(`/api/admin/client-profiles/${id}/verification`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ verification_status })
  }),
  adminSetClientActivation: (token: string, userId: string, state: 'client_free' | 'client_activated') => request(`/api/client-activation/admin/users/${userId}/activation`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ state })
  }),
  adminAdjustCoins: (token: string, userId: string, amount: number, note = '') => request<{ wallet: CoinWallet }>(`/api/client-activation/admin/users/${userId}/coins`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ amount, note })
  }),
  clientIntentMe: (token: string) => request<{ intent: ClientIntent | null; nearby_advertisers: Profile[]; notifications: RadarNotification[] }>('/api/client-intent/me', { token }),
  createClientIntent: (token: string, body: Partial<ClientIntent>) => request<{ intent: ClientIntent; nearby_advertisers: Profile[] }>('/api/client-intent', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  updateClientIntentStatus: (token: string, body: Partial<ClientIntent>) => request<{ intent: ClientIntent }>('/api/client-intent/status', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body)
  }),
  advertiserNearbyClients: (token: string) => request<{ clients: ClientIntent[]; notifications: RadarNotification[] }>('/api/client-intent/advertiser/nearby-clients', { token })
};
