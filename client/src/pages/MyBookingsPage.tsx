import React, { useState, useEffect, useCallback } from 'react';
import { bookingApi, walletApi } from '../services/api';
import { Booking, BookingStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatPaiseToRupees, formatDateTime, getStatusBadgeClass } from '../utils/formatters';
import { TicketCheck, RotateCcw, Loader2, Ban } from 'lucide-react';

export const MyBookingsPage: React.FC = () => {
  const { updateWalletBalance } = useAuth();
  const toast = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await bookingApi.getUserBookings();
      if (res.success && res.data.bookings) {
        setBookings(res.data.bookings);
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
      toast.error('Failed to load booking history');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleCancelBooking = async (bookingId: string) => {
    setCancellingId(bookingId);
    try {
      const res = await bookingApi.cancelBooking(bookingId);
      if (res.success) {
        toast.success(
          'Booking Cancelled',
          `Refund of ${formatPaiseToRupees(res.data.refundAmount)} credited to wallet.`
        );
        // Refresh balance & bookings
        const balRes = await walletApi.getBalance();
        if (balRes.success) {
          const bal = balRes.data.walletBalance ?? balRes.data.balance ?? 0;
          updateWalletBalance(bal);
        }
        await fetchBookings();
      }
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error('Cancellation Failed', errorMsg || 'Unable to cancel booking');
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-3" />
        <p className="text-sm">Loading your bookings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-extrabold text-white">My Booking History</h1>
            <p className="text-xs text-slate-400 mt-1">
              View confirmed tickets and initiate instant wallet refunds
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <TicketCheck className="w-4 h-4 text-violet-400" />
            <span>{bookings.length} Bookings</span>
          </div>
        </div>

        {bookings.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800">
            <Ban className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-300">No Active Bookings</h3>
            <p className="text-xs text-slate-500 mt-1">You have not booked any event tickets yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const isConfirmed = booking.status === BookingStatus.CONFIRMED;

              return (
                <div
                  key={booking._id}
                  className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-white">
                        {booking.bookingReference}
                      </span>
                      <span
                        className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${getStatusBadgeClass(
                          booking.status
                        )}`}
                      >
                        {booking.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Booked on: {formatDateTime(booking.createdAt)}
                    </div>
                    <div className="text-xs text-slate-400">
                      Seats reserved: <span className="text-slate-200 font-medium">{booking.seatIds.length} seat(s)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Amount Paid</div>
                      <div className="text-base font-extrabold text-emerald-400">
                        {formatPaiseToRupees(booking.amount)}
                      </div>
                    </div>

                    {isConfirmed && (
                      <button
                        disabled={cancellingId === booking._id}
                        onClick={() => handleCancelBooking(booking._id)}
                        className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {cancellingId === booking._id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Cancel & Refund</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
