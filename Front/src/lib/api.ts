import type { BookingRequest, Profile } from '../types';

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
  profile: (id: string) => request<{ profile: Profile }>(`/api/profiles/${id}`),
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
  adminProfiles: (token: string) => request<{ profiles: Profile[]; stats: Record<string, number> }>('/api/admin/profiles', { token }),
  adminReports: (token: string) => request<{ reports: any[]; reports_count: number }>('/api/admin/reports', { token }),
  setProfileStatus: (token: string, id: string, status: string) => request(`/api/admin/profiles/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status })
  }),
  setReportStatus: (token: string, id: string, status: string) => request(`/api/admin/reports/${id}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status })
  })
};
