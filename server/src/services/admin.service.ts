import mongoose from 'mongoose';
import { User } from '../models/User';
import { Event } from '../models/Event';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { Booking } from '../models/Booking';
import { WalletTransaction, IWalletTransaction } from '../models/WalletTransaction';
import {
  EventStatus,
  SeatStatus,
  ReservationStatus,
  BookingStatus,
  WalletTransactionType,
  WalletReferenceType,
  WalletTransactionStatus,
} from '../constants/enums';
import { NotFoundError } from '../utils/errors';
import { ErrorCode } from '../constants/errorCodes';
import { PaginatedBookings } from '../repositories/booking.repository';

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

export interface EventOccupancy {
  eventId: string;
  totalSeats: number;
  availableSeats: number;
  reservedSeats: number;
  bookedSeats: number;
  occupancyPercentage: number;
  totalRevenue: number;
}

export interface AdminGetBookingsFilter {
  userId?: string;
  eventId?: string;
  status?: BookingStatus;
  page?: number;
  limit?: number;
}

export interface AdminGetTransactionsFilter {
  userId?: string;
  type?: WalletTransactionType;
  referenceType?: WalletReferenceType;
  status?: WalletTransactionStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedTransactions {
  transactions: IWalletTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminUserSummary {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface PaginatedUsers {
  users: AdminUserSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [
    totalUsers,
    eventStats,
    seatStats,
    totalReservations,
    activeReservations,
    bookingCombinedStats,
  ] = await Promise.all([
    User.countDocuments(),
    Event.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Seat.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Reservation.countDocuments(),
    Reservation.countDocuments({ status: ReservationStatus.ACTIVE, expiresAt: { $gt: new Date() } }),
    Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  // Format Event stats
  const eventByStatus: Record<string, number> = {
    [EventStatus.DRAFT]: 0,
    [EventStatus.PUBLISHED]: 0,
    [EventStatus.CANCELLED]: 0,
    [EventStatus.COMPLETED]: 0,
  };
  let totalEventsCount = 0;
  for (const stat of eventStats) {
    eventByStatus[stat._id] = stat.count;
    totalEventsCount += stat.count;
  }

  // Format Seat stats
  const seatByStatus: Record<string, number> = {
    [SeatStatus.AVAILABLE]: 0,
    [SeatStatus.RESERVED]: 0,
    [SeatStatus.BOOKED]: 0,
  };
  let totalSeatsCount = 0;
  for (const stat of seatStats) {
    seatByStatus[stat._id] = stat.count;
    totalSeatsCount += stat.count;
  }

  // Format Booking stats & Revenue calculation (single aggregation pass)
  const bookingByStatus: Record<string, number> = {
    [BookingStatus.CONFIRMED]: 0,
    [BookingStatus.CANCELLED]: 0,
  };
  let totalBookingsCount = 0;
  let grossRevenue = 0;
  let totalRefunds = 0;

  for (const stat of bookingCombinedStats) {
    bookingByStatus[stat._id] = stat.count;
    totalBookingsCount += stat.count;

    if (stat._id === BookingStatus.CONFIRMED) {
      grossRevenue = stat.totalAmount;
    } else if (stat._id === BookingStatus.CANCELLED) {
      totalRefunds = stat.totalAmount;
    }
  }

  return {
    users: {
      total: totalUsers,
    },
    events: {
      total: totalEventsCount,
      byStatus: eventByStatus,
    },
    seats: {
      total: totalSeatsCount,
      byStatus: seatByStatus,
    },
    reservations: {
      total: totalReservations,
      active: activeReservations,
    },
    bookings: {
      total: totalBookingsCount,
      byStatus: bookingByStatus,
    },
    revenue: {
      grossRevenue,
      totalRefunds,
      netRevenue: grossRevenue - totalRefunds,
    },
  };
}

export async function getEventOccupancy(eventId: string): Promise<EventOccupancy> {
  const eventObjId = new mongoose.Types.ObjectId(eventId);
  const eventDoc = await Event.findById(eventObjId).exec();
  if (!eventDoc) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }

  const [seatStats, revenueStats] = await Promise.all([
    Seat.aggregate([
      { $match: { eventId: eventObjId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { eventId: eventObjId, status: BookingStatus.CONFIRMED } },
      { $group: { _id: null, totalRevenue: { $sum: '$amount' } } },
    ]),
  ]);

  let availableSeats = 0;
  let reservedSeats = 0;
  let bookedSeats = 0;
  let totalSeats = 0;

  for (const stat of seatStats) {
    totalSeats += stat.count;
    if (stat._id === SeatStatus.AVAILABLE) availableSeats = stat.count;
    if (stat._id === SeatStatus.RESERVED) reservedSeats = stat.count;
    if (stat._id === SeatStatus.BOOKED) bookedSeats = stat.count;
  }

  const occupancyPercentage =
    totalSeats > 0 ? Math.round((bookedSeats / totalSeats) * 10000) / 100 : 0;
  const totalRevenue = revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0;

  return {
    eventId,
    totalSeats,
    availableSeats,
    reservedSeats,
    bookedSeats,
    occupancyPercentage,
    totalRevenue,
  };
}

/**
 * Admin monitoring: paginated booking list with user/event/status query filters.
 */
export async function adminGetBookings(filter: AdminGetBookingsFilter): Promise<PaginatedBookings> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (filter.userId) query.userId = new mongoose.Types.ObjectId(filter.userId);
  if (filter.eventId) query.eventId = new mongoose.Types.ObjectId(filter.eventId);
  if (filter.status) query.status = filter.status;

  const [bookings, total] = await Promise.all([
    Booking.find(query).populate('userId', 'email name').sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    Booking.countDocuments(query).exec(),
  ]);

  return {
    bookings,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Admin monitoring: paginated wallet transaction list with user/type/referenceType/status/date-range query filters.
 */
export async function adminGetTransactions(
  filter: AdminGetTransactionsFilter
): Promise<PaginatedTransactions> {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.max(1, Math.min(100, filter.limit ?? 20));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (filter.userId) query.userId = new mongoose.Types.ObjectId(filter.userId);
  if (filter.type) query.type = filter.type;
  if (filter.referenceType) query.referenceType = filter.referenceType;
  if (filter.status) query.status = filter.status;

  if (filter.startDate || filter.endDate) {
    const dateQuery: Record<string, Date> = {};
    if (filter.startDate) dateQuery.$gte = new Date(filter.startDate);
    if (filter.endDate) dateQuery.$lte = new Date(filter.endDate);
    query.createdAt = dateQuery;
  }

  const [transactions, total] = await Promise.all([
    WalletTransaction.find(query).populate('userId', 'email name').sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    WalletTransaction.countDocuments(query).exec(),
  ]);

  return {
    transactions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Admin monitoring: paginated user list. Projects only safe fields — never passwordHash.
 */
export async function adminGetUsers(page = 1, limit = 50): Promise<PaginatedUsers> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(200, limit));
  const skip = (safePage - 1) * safeLimit;

  const [users, total] = await Promise.all([
    User.find({}, { _id: 1, name: 1, email: 1, role: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean()
      .exec(),
    User.countDocuments().exec(),
  ]);

  return {
    users: users as unknown as AdminUserSummary[],
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}
