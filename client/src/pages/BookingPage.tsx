import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { bookingApi, walletApi, generateIdempotencyKey } from '../services/api';
import { ReservationTimer } from '../components/ReservationTimer';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatPaiseToRupees } from '../utils/formatters';
import { Reservation } from '../types';
import { CreditCard, Wallet, ShieldCheck, Loader2, CheckCircle2 } from 'lucide-react';

export const BookingPage: React.FC = () => {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateWalletBalance } = useAuth();
  const toast = useToast();

  const stateReservation = (location.state as { reservation?: Reservation })?.reservation;

  const [expiresAt, setExpiresAt] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<number>(stateReservation?.totalAmount || 0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPaying, setIsPaying] = useState<boolean>(false);

  // Persistent Idempotency Key held across retry attempts for this booking
  const bookingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!reservationId) {
      navigate('/');
      return;
    }

    if (stateReservation?.expiresAt) {
      setExpiresAt(stateReservation.expiresAt);
      setTotalAmount(stateReservation.totalAmount);
      setIsLoading(false);
    } else {
      // Fallback: fetch / initialize hold expiry (~5 min from server timestamp)
      const expiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      setExpiresAt(expiry);
      setIsLoading(false);
    }
  }, [reservationId, stateReservation, navigate]);

  const handlePay = async () => {
    if (!reservationId) return;

    // Generate booking idempotency key ONCE per payment attempt session
    if (!bookingKeyRef.current) {
      bookingKeyRef.current = generateIdempotencyKey('bk-action');
    }
    const currentKey = bookingKeyRef.current;

    setIsPaying(true);
    try {
      const res = await bookingApi.createBooking(reservationId, currentKey);
      if (res.success && res.data.booking) {
        toast.success(
          'Booking Confirmed!',
          `Ticket Reference: ${res.data.booking.bookingReference}`
        );
        // Clear key on success
        bookingKeyRef.current = null;
        try {
          const balRes = await walletApi.getBalance();
          if (balRes.success) {
            const bal = balRes.data.walletBalance ?? balRes.data.balance ?? 0;
            updateWalletBalance(bal);
          }
        } catch {
          // ignore
        }
        navigate('/my-bookings');
      }
    } catch (err: unknown) {
      const errorData = (err as { response?: { data?: { message?: string; errorCode?: string } } })?.response?.data;
      if (errorData?.errorCode === 'INSUFFICIENT_BALANCE') {
        toast.error('Insufficient Wallet Balance', 'Please top up your wallet to complete booking');
      } else {
        toast.error('Payment Failed', errorData?.message || 'Reservation expired or unavailable');
      }
    } finally {
      setIsPaying(false);
    }
  };

  const handleTimerExpire = () => {
    toast.error('Reservation Expired', 'The 5-minute seat hold time elapsed. Returning to events.');
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-3" />
        <p className="text-sm">Preparing checkout...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 sm:py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Reservation Hold Countdown Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/20 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Checkout & Payment</h2>
              <p className="text-xs text-slate-400">Reservation ID: {reservationId?.slice(-8)}</p>
            </div>
          </div>

          {expiresAt && (
            <div className="self-end sm:self-auto">
              <ReservationTimer expiresAt={expiresAt} onExpire={handleTimerExpire} />
            </div>
          )}
        </div>

        {/* Payment Card */}
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-5 sm:p-8 shadow-2xl space-y-6">
          <div className="border-b border-slate-800/80 pb-6">
            <h3 className="text-base font-bold text-white mb-4">Payment Method</h3>

            {/* Wallet Selection */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30 shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Eventix In-App Wallet</div>
                  <div className="text-xs text-emerald-400 font-semibold">
                    Current Balance: {formatPaiseToRupees(user?.walletBalance || 0)}
                  </div>
                </div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 self-end sm:self-auto" />
            </div>
          </div>

          {/* Amount Breakdown */}
          {totalAmount > 0 && (
            <div className="flex justify-between items-center text-sm font-bold text-white py-2 border-b border-slate-800">
              <span className="text-slate-400 text-xs">Total Amount Due</span>
              <span className="text-emerald-400 font-extrabold text-lg sm:text-xl">{formatPaiseToRupees(totalAmount)}</span>
            </div>
          )}

          {/* Atomic Transaction Security Highlight */}
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs">
            <ShieldCheck className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Atomic Transaction Safeguard:</span> If payment fails, seats are instantly released back to available inventory and zero funds are deducted.
            </div>
          </div>

          {/* Submit Action Button */}
          <button
            disabled={isPaying}
            onClick={handlePay}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-extrabold text-sm shadow-xl shadow-emerald-500/25 hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:scale-[0.99]"
          >
            {isPaying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing Payment...</span>
              </>
            ) : (
              <span>Confirm & Debit Wallet</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
