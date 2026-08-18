import { BookingStatus, EventStatus, ReservationStatus, SeatStatus, WalletTransactionType } from '../types';

/**
 * Formats integer paise to Indian Rupee string format (₹X,XXX.XX)
 */
export const formatPaiseToRupees = (paise: number): string => {
  if (isNaN(paise) || paise === null || paise === undefined) return '₹0';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
};

/**
 * Formats ISO date string to human readable format (e.g. 15 Aug 2026)
 */
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Formats ISO date/time string to full date & time (e.g. 15 Aug 2026, 07:30 PM)
 */
export const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Status badge styling helper
 */
export const getStatusBadgeClass = (
  status: EventStatus | SeatStatus | ReservationStatus | BookingStatus | WalletTransactionType | string
): string => {
  switch (status) {
    case EventStatus.PUBLISHED:
    case ReservationStatus.CONFIRMED:
    case BookingStatus.CONFIRMED:
    case WalletTransactionType.CREDIT:
    case 'ACTIVE':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case EventStatus.DRAFT:
    case SeatStatus.RESERVED:
    case ReservationStatus.ACTIVE:
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case EventStatus.CANCELLED:
    case ReservationStatus.EXPIRED:
    case BookingStatus.CANCELLED:
    case BookingStatus.REFUNDED:
    case WalletTransactionType.DEBIT:
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    case SeatStatus.BOOKED:
    case EventStatus.COMPLETED:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    default:
      return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
  }
};

/**
 * Performs a natural numeric sort on seat objects by seatNumber
 * (e.g. A1, A2, A3 ... A9, A10, A11 ... A100, B1, B2)
 */
export const naturalSortSeats = <T extends { seatNumber: string }>(seats: T[]): T[] => {
  return [...seats].sort((a, b) =>
    a.seatNumber.localeCompare(b.seatNumber, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
};
