export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum SeatStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  BOOKED = 'BOOKED',
}

export enum ReservationStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum WalletTransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum WalletReferenceType {
  TOP_UP = 'TOP_UP',
  BOOKING = 'BOOKING',
  REFUND = 'REFUND',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  walletBalance: number; // in integer paise
  createdAt?: string;
  updatedAt?: string;
}

export interface Event {
  _id: string;
  title: string;
  description: string;
  venue: string;
  eventDate: string;
  eventTime: string;
  totalSeats: number;
  availableSeats?: number;
  price: number; // in integer paise
  status: EventStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Seat {
  _id: string;
  eventId: string;
  seatNumber: string;
  price: number; // in integer paise
  status: SeatStatus;
  reservationId?: string | null;
  bookingId?: string | null;
}

export interface Reservation {
  _id: string;
  userId: string;
  eventId: string;
  seatIds: string[];
  status: ReservationStatus;
  expiresAt: string;
  totalAmount: number;
}

export interface AdminUserSummary {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface PopulatedUser {
  _id: string;
  email: string;
  name?: string;
}

export interface Booking {
  _id: string;
  bookingReference: string;
  userId: string | PopulatedUser;
  eventId: string;
  reservationId: string;
  seatIds: string[];
  amount: number; // in integer paise
  status: BookingStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface WalletTransaction {
  _id: string;
  userId: string | PopulatedUser;
  type: WalletTransactionType;
  amount: number; // in integer paise
  balanceBefore: number;
  balanceAfter: number;
  referenceType: WalletReferenceType;
  referenceId?: string;
  description?: string;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data: T;
  errorCode?: string;
  details?: unknown;
}

export interface SystemMetrics {
  users: {
    total: number;
  };
  events: {
    total: number;
    byStatus: Record<string, number>;
  };
  seats: {
    total: number;
    byStatus: Record<string, number>;
  };
  reservations: {
    total: number;
    active: number;
  };
  bookings: {
    total: number;
    byStatus: Record<string, number>;
  };
  revenue: {
    grossRevenue: number;
    totalRefunds: number;
    netRevenue: number;
  };
}
