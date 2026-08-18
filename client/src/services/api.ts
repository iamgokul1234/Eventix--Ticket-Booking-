import apiClient from '../api/axios';
import {
  ApiResponse,
  User,
  Event,
  Seat,
  Reservation,
  Booking,
  WalletTransaction,
  SystemMetrics,
  AdminUserSummary,
} from '../types';

export const generateIdempotencyKey = (prefix = 'key'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string) => {
    const res = await apiClient.post<ApiResponse<{ user: User; token: string }>>('/auth/login', {
      email,
      password,
    });
    return res.data;
  },

  signup: async (name: string, email: string, password: string) => {
    const res = await apiClient.post<ApiResponse<{ user: User; token: string }>>('/auth/signup', {
      name,
      email,
      password,
    });
    return res.data;
  },

  getProfile: async () => {
    const res = await apiClient.get<ApiResponse<{ user: User }>>('/auth/me');
    return res.data;
  },
};

// ─── Events & Seats API ───────────────────────────────────────────────────────
export const eventApi = {
  getEvents: async (params?: { page?: number; limit?: number; status?: string }) => {
    const res = await apiClient.get<ApiResponse<{ events: Event[]; total: number; page: number; limit: number }>>(
      '/events',
      { params }
    );
    return res.data;
  },

  getEventById: async (eventId: string) => {
    const res = await apiClient.get<ApiResponse<{ event: Event }>>(`/events/${eventId}`);
    return res.data;
  },

  getEventSeats: async (eventId: string) => {
    const res = await apiClient.get<ApiResponse<{ seats: Seat[] }>>(`/events/${eventId}/seats`);
    return res.data;
  },
};

// ─── Reservations API ─────────────────────────────────────────────────────────
export const reservationApi = {
  createReservation: async (eventId: string, seatIds: string[], idempotencyKey?: string) => {
    const key = idempotencyKey || generateIdempotencyKey('res');
    const res = await apiClient.post<ApiResponse<{ reservation: Reservation; totalAmount: number }>>(
      `/events/${eventId}/reservations`,
      { seatIds },
      { headers: { 'Idempotency-Key': key } }
    );
    return res.data;
  },
};

// ─── Bookings API ─────────────────────────────────────────────────────────────
export const bookingApi = {
  createBooking: async (reservationId: string, idempotencyKey?: string) => {
    const key = idempotencyKey || generateIdempotencyKey('booking');
    const res = await apiClient.post<ApiResponse<{ booking: Booking }>>(
      '/bookings',
      { reservationId },
      { headers: { 'Idempotency-Key': key } }
    );
    return res.data;
  },

  getUserBookings: async (page = 1, limit = 20) => {
    const res = await apiClient.get<ApiResponse<{ bookings: Booking[]; total: number; page: number; limit: number }>>(
      '/bookings',
      { params: { page, limit } }
    );
    return res.data;
  },

  getBookingById: async (bookingId: string) => {
    const res = await apiClient.get<ApiResponse<{ booking: Booking; seats: { id: string; seatNumber: string; price: number }[] }>>(
      `/bookings/${bookingId}`
    );
    return res.data;
  },

  cancelBooking: async (bookingId: string, idempotencyKey?: string) => {
    const key = idempotencyKey || generateIdempotencyKey('cancel');
    const res = await apiClient.delete<ApiResponse<{ booking: Booking; refundAmount: number }>>(
      `/bookings/${bookingId}`,
      { headers: { 'Idempotency-Key': key } }
    );
    return res.data;
  },
};

export const walletApi = {
  getBalance: async () => {
    const res = await apiClient.get<ApiResponse<{ walletBalance: number; balance?: number }>>('/wallet');
    return res.data;
  },

  topUp: async (amountPaise: number, idempotencyKey?: string) => {
    const key = idempotencyKey || generateIdempotencyKey('topup');
    const res = await apiClient.post<ApiResponse<{ newBalance: number; transaction: WalletTransaction }>>(
      '/wallet/top-up',
      { amount: amountPaise },
      { headers: { 'Idempotency-Key': key } }
    );
    return res.data;
  },

  getTransactions: async (page = 1, limit = 20) => {
    const res = await apiClient.get<ApiResponse<{ transactions: WalletTransaction[]; total: number; page: number; limit: number }>>(
      '/wallet/transactions',
      { params: { page, limit } }
    );
    return res.data;
  },
};

// ─── Admin API ────────────────────────────────────────────────────────────────
export const adminApi = {
  getMetrics: async () => {
    const res = await apiClient.get<ApiResponse<SystemMetrics>>('/admin/metrics');
    return res.data;
  },

  listEvents: async (params?: { page?: number; limit?: number; status?: string }) => {
    const res = await apiClient.get<ApiResponse<{ events: Event[]; total: number; page: number; limit: number }>>(
      '/admin/events',
      { params }
    );
    return res.data;
  },

  createEvent: async (eventData: {
    title: string;
    description: string;
    venue: string;
    eventDate: string;
    eventTime: string;
    totalSeats: number;
    price: number;
  }) => {
    const res = await apiClient.post<ApiResponse<{ event: Event }>>('/admin/events', eventData);
    return res.data;
  },

  updateEvent: async (eventId: string, updateData: Partial<Event>) => {
    const res = await apiClient.patch<ApiResponse<{ event: Event }>>(`/admin/events/${eventId}`, updateData);
    return res.data;
  },

  publishEvent: async (eventId: string) => {
    const res = await apiClient.post<ApiResponse<{ event: Event }>>(`/admin/events/${eventId}/publish`);
    return res.data;
  },

  cancelEvent: async (eventId: string) => {
    const res = await apiClient.post<ApiResponse<{ event: Event }>>(`/admin/events/${eventId}/cancel`);
    return res.data;
  },

  deleteEvent: async (eventId: string) => {
    const res = await apiClient.delete<ApiResponse<null>>(`/admin/events/${eventId}`);
    return res.data;
  },

  bulkCreateSeats: async (eventId: string, seats: { seatNumber: string; price?: number }[]) => {
    const res = await apiClient.post<ApiResponse<{ seats: Seat[]; count: number }>>(
      `/admin/events/${eventId}/seats/bulk`,
      { seats }
    );
    return res.data;
  },

  refundBooking: async (bookingId: string, idempotencyKey?: string) => {
    const key = idempotencyKey || generateIdempotencyKey('admin-refund');
    const res = await apiClient.post<ApiResponse<{ booking: Booking; refundAmount: number }>>(
      `/admin/bookings/${bookingId}/refund`,
      {},
      { headers: { 'Idempotency-Key': key } }
    );
    return res.data;
  },

  getBookings: async (params?: { userId?: string; eventId?: string; status?: string; page?: number; limit?: number }) => {
    const res = await apiClient.get<ApiResponse<{ bookings: Booking[]; total: number; page: number; limit: number }>>(
      '/admin/bookings',
      { params }
    );
    return res.data;
  },

  getTransactions: async (params?: { userId?: string; type?: string; referenceType?: string; status?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const res = await apiClient.get<ApiResponse<{ transactions: WalletTransaction[]; total: number; page: number; limit: number }>>(
      '/admin/transactions',
      { params }
    );
    return res.data;
  },

  getUsers: async (params?: { page?: number; limit?: number }) => {
    const res = await apiClient.get<ApiResponse<{ users: AdminUserSummary[]; total: number; page: number; limit: number }>>(
      '/admin/users',
      { params }
    );
    return res.data;
  },
};
