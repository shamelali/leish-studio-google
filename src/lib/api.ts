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
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
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

// Auth API
export const authApi = {
  register: (data: { name: string; email: string; password: string; role?: string; phone?: string; bio?: string }) =>
    apiClient.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    apiClient.post('/auth/login', data),
  oauth: (supabaseToken: string) =>
    apiRequest('/auth/oauth', { method: 'POST', headers: { Authorization: `Bearer ${supabaseToken}` } }),
  getMe: () => apiClient.get('/auth/me'),
  updateProfile: (data: { id: string; name?: string; phone?: string; bio?: string; avatar?: string }) =>
    apiClient.put('/auth/profile', data),
};

// Salons API
export const salonsApi = {
  getAll: () => apiClient.get('/salons'),
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

// Bookings API
export const bookingsApi = {
  getAll: (params?: { email?: string; salonId?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiClient.get(`/bookings${query ? `?${query}` : ''}`);
  },
  create: (data: any) =>
    apiClient.post('/bookings', data),
  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/bookings/${id}/status`, { status }),
};

// Reviews API
export const reviewsApi = {
  getBySalon: (salonId: string) => apiClient.get(`/reviews/${salonId}`),
  create: (data: { salonId: string; clientName?: string; bookingId?: string; rating: number; text: string }) =>
    apiClient.post('/reviews', data),
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
