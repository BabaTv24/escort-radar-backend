import type { AdminActivity, AdminReport, BookingRequest, ClientActivation, ClientIntent, ClientProfile, CoinTransaction, CoinWallet, Gift, MasterAdminWallet, Profile, ProfileAccess, RadarNotification, Tag, TokenPackage, TokenPurchaseRequest, TokenTransaction, Wallet } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type RequestOptions = RequestInit & { token?: string };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    const reason = payload.reason ? ` (${payload.reason})` : '';
    const details = payload.details ? `: ${typeof payload.details === 'string' ? payload.details : JSON.stringify(payload.details)}` : '';
    throw new Error(`${payload.error || 'Request failed'}${reason}${details}`);
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
  register: (body: { email: string; password: string; username?: string; auth_account_type: 'client' | 'escort' | 'business'; identity?: string; referred_by_code?: string }) => request<{ user: { id: string; email?: string; auth_account_type: 'client' | 'escort' | 'business' } }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
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
    body: form
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
    stats: Record<string, number>;
    latest_activity: AdminActivity[];
    revenue_events?: Record<string, unknown>[];
    top_cities?: Record<string, unknown>[];
    top_categories?: Record<string, unknown>[];
    top_profiles?: Record<string, unknown>[];
  }>('/api/admin/stats', { token }),
  adminMe: (token: string) => request<{ admin: { id: string; email?: string; role?: string; admin?: boolean } }>('/api/admin/me', { token }),
  adminProfiles: (token: string, params = '') => request<{ profiles: Profile[]; stats: Record<string, number> }>(`/api/admin/profiles${params}`, { token }),
  adminUsers: (token: string) => request<{ users: Record<string, unknown>[] }>('/api/admin/users', { token }),
  adminSubscriptions: (token: string) => request<{ subscriptions: Record<string, unknown>[]; stats?: Record<string, number> }>('/api/admin/subscriptions', { token }),
  adminProfile: (token: string, id: string) => request<{ profile: Profile }>(`/api/admin/profiles/${id}`, { token }),
  createAdminProfile: (token: string, body: Partial<Profile>) => request<{ profile: Profile }>('/api/admin/profiles', {
    method: 'POST',
    token,
    body: JSON.stringify(body)
  }),
  updateAdminProfile: (token: string, id: string, body: Partial<Profile>) => request<{ profile: Profile }>(`/api/admin/profiles/${id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body)
  }),
  deleteAdminProfile: (token: string, id: string) => request<void>(`/api/admin/profiles/${id}`, {
    method: 'DELETE',
    token
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
  seedBerlinProfiles: (token: string) => request<{ profiles: Profile[]; created: number }>('/api/admin/profiles/seed/berlin', {
    method: 'POST',
    token
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
  adminBookings: (token: string) => request<{ booking_requests: BookingRequest[] }>('/api/admin/bookings', { token }),
  adminSettings: (token: string) => request<{ settings: Record<string, unknown> }>('/api/admin/settings', { token }),
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
  tokenPackages: () => request<{ packages: TokenPackage[] }>('/api/tokens/packages'),
  myWallet: (token: string) => request<{ wallet: Wallet }>('/api/tokens/wallet/me', { token }),
  tokenPurchaseIntent: (token: string, package_id?: string) => request('/api/tokens/purchase-intent', {
    method: 'POST',
    token,
    body: JSON.stringify({ package_id })
  }),
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
  setPhotoStatus: (token: string, id: string, moderation_status: string) => request(`/api/admin/photos/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ moderation_status })
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
  clientActivationCheckout: (token: string, referred_by_code?: string | null) => request<{ checkout_session_id: string; checkout_url: string }>('/api/client-activation/checkout', {
    method: 'POST',
    token,
    body: JSON.stringify({ referred_by_code })
  }),
  confirmClientActivation: (token: string, checkout_session_id: string) => request<{ activation: ClientActivation }>('/api/client-activation/confirm', {
    method: 'POST',
    token,
    body: JSON.stringify({ checkout_session_id })
  }),
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
