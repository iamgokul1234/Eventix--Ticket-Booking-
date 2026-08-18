export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const EventStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const SeatStatus = {
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  BOOKED: 'BOOKED',
} as const;

export type SeatStatus = (typeof SeatStatus)[keyof typeof SeatStatus];

export const ReservationStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const BookingStatus = {
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const WalletTransactionType = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  REFUND: 'REFUND',
} as const;

export type WalletTransactionType = (typeof WalletTransactionType)[keyof typeof WalletTransactionType];

export const WalletReferenceType = {
  TOP_UP: 'TOP_UP',
  BOOKING: 'BOOKING',
  REFUND: 'REFUND',
  CANCELLATION: 'CANCELLATION',
} as const;

export type WalletReferenceType = (typeof WalletReferenceType)[keyof typeof WalletReferenceType];

export const WalletTransactionStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type WalletTransactionStatus = (typeof WalletTransactionStatus)[keyof typeof WalletTransactionStatus];

export const IdempotencyStatus = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type IdempotencyStatus = (typeof IdempotencyStatus)[keyof typeof IdempotencyStatus];
