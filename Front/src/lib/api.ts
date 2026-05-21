import type { AdminActivity, AdminReport, BookingRequest, MasterAdminWallet, Profile, Tag, TokenPackage, TokenPurchaseRequest, TokenTransaction, Wallet } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type RequestOptions = RequestInit & { token?: string };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(payload.error || 'Request failed');
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  profiles: (params = '') => request<{ profiles: Profile[] }>(`/api/profiles${params}`),
  tags: () => request<{ tags: Tag[] }>('/api/tags'),
  profile: (id: string) => request<{ profile: Profile }>(`/api/profiles/${id}`),
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
  setCoverImage: (token: string, id: string) => request<{ image: unknown }>(`/api/uploads/profile-image/${id}/cover`, {
    method: 'PATCH',
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
  adminStats: (token: string) => request<{ stats: Record<string, number>; latest_activity: AdminActivity[] }>('/api/admin/stats', { token }),
  adminProfiles: (token: string, params = '') => request<{ profiles: Profile[]; stats: Record<string, number> }>(`/api/admin/profiles${params}`, { token }),
  adminUsers: (token: string) => request<{ users: Record<string, unknown>[] }>('/api/admin/users', { token }),
  adminSubscriptions: (token: string) => request<{ subscriptions: Record<string, unknown>[] }>('/api/admin/subscriptions', { token }),
  adminProfile: (token: string, id: string) => request<{ profile: Profile }>(`/api/admin/profiles/${id}`, { token }),
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
  })
};
