import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Salon, Booking, Review, Service, User } from '../types';

const API_BASE = '/api';

export async function apiRequest<T = any>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('leish_auth_token');
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: 'Request failed' }));
    const error = new Error(payload.error || 'Request failed') as Error & { code?: string };
    // Machine-readable code (e.g. contact_unverified) drives UI branches.
    error.code = typeof payload.code === 'string' ? payload.code : undefined;
    throw error;
  }
  return res.json();
}

/** Shared authenticated JSON client for feature components outside React Query. */
export const apiClient = {
  get: <T = any>(url: string) => apiRequest<T>(url),
  post: <T = any>(url: string, body: unknown) =>
    apiRequest<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = any>(url: string, body: unknown) =>
    apiRequest<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = any>(url: string, body: unknown) =>
    apiRequest<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = any>(url: string) => apiRequest<T>(url, { method: 'DELETE' }),
};

// Paginated list envelope (server pagination contract, FR-006).
export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

/** Unwrap a paginated envelope, tolerating legacy bare arrays. */
function unwrapPage<T>(payload: PaginatedResponse<T> | T[]): T[] {
  return Array.isArray(payload) ? payload : payload.data;
}

// Auth API
export const authApi = {
  register: (data: { name: string; email: string; password: string; role?: string; phone?: string; bio?: string }) =>
    apiClient.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    apiClient.post('/auth/login', data),
  oauth: (supabaseToken: string) =>
    apiRequest('/auth/oauth', { method: 'POST', headers: { Authorization: `Bearer ${supabaseToken}` } }),
  oauthComplete: (supabaseToken: string, role: string) =>
    apiRequest('/auth/oauth/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }),
  getMe: () => apiClient.get('/auth/me'),
  updateProfile: (data: { id: string; name?: string; phone?: string; bio?: string; avatar?: string }) =>
    apiClient.put('/auth/profile', data),
};

// Salons API
export const salonsApi = {
  getAll: async () => unwrapPage<Salon>(await apiClient.get<PaginatedResponse<Salon> | Salon[]>('/salons')),
  getById: (id: string) => apiClient.get(`/salons/${id}`),
  update: (id: string, data: Partial<Salon>) =>
    apiClient.put(`/salons/${id}`, data),
  addService: (id: string, data: { name: string; price: number; duration: number; description?: string; category?: string }) =>
    apiClient.post(`/salons/${id}/services`, data),
  updateService: (id: string, serviceId: string, data: Pick<Service, 'name' | 'price' | 'duration' | 'description' | 'category'>) =>
    apiClient.put(`/salons/${id}/services/${serviceId}`, data),
  deleteService: (id: string, serviceId: string) =>
    apiClient.delete(`/salons/${id}/services/${serviceId}`),
};

// Admin Salon API
export const adminSalonsApi = {
  update: (id: string, data: Partial<Salon>) =>
    apiClient.put(`/admin/salons/${id}`, data),
  remove: (id: string) => apiClient.delete(`/admin/salons/${id}`),
};

// Bookings API
export const bookingsApi = {
  getAll: async (params?: { email?: string; salonId?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return unwrapPage<Booking>(await apiClient.get<PaginatedResponse<Booking> | Booking[]>(`/bookings${query ? `?${query}` : ''}`));
  },
  create: (data: any) =>
    apiClient.post('/bookings', data),
  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/bookings/${id}/status`, { status }),
};

// Admin Booking API
export const adminBookingsApi = {
  remove: (id: string) => apiClient.delete(`/admin/bookings/${id}`),
};

// Users API (admin panel)
export const usersApi = {
  list: async () => unwrapPage<User>(await apiClient.get<PaginatedResponse<User> | User[]>('/users')),
  update: (id: string, data: { name?: string; role?: string; salonId?: string | null; phone?: string; bio?: string }) =>
    apiClient.patch(`/users/${id}`, data),
  remove: (id: string) => apiClient.delete(`/users/${id}`),
};

// Reviews API
export const reviewsApi = {
  getBySalon: async (salonId: string) =>
    unwrapPage<Review>(await apiClient.get<PaginatedResponse<Review> | Review[]>(`/reviews/${salonId}`)),
  create: (data: { salonId: string; clientName?: string; bookingId?: string; rating: number; text: string }) =>
    apiClient.post('/reviews', data),
};

// Admin Review API
export const adminReviewsApi = {
  getAll: async (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiClient.get<PaginatedResponse<Review>>(`/admin/reviews${query ? `?${query}` : ''}`);
  },
  remove: (id: string) => apiClient.delete(`/admin/reviews/${id}`),
};

// React Query hooks
export const useSalons = () =>
  useQuery({ queryKey: ['salons'], queryFn: salonsApi.getAll });

export const useSalon = (id: string) =>
  useQuery({ queryKey: ['salon', id], queryFn: () => salonsApi.getById(id), enabled: !!id });

export const useBookings = (params?: { email?: string; salonId?: string }) =>
  useQuery({ queryKey: ['bookings', params], queryFn: () => bookingsApi.getAll(params) });

export const useReviews = (salonId: string) =>
  useQuery({ queryKey: ['reviews', salonId], queryFn: () => reviewsApi.getBySalon(salonId), enabled: !!salonId });

export const useCreateBooking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bookingsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
};

export const useCreateReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reviewsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reviews'] }),
  });
};

export const useUsers = (enabled = true) =>
  useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled });

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
};
