import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { eventApi, reservationApi, generateIdempotencyKey } from '../services/api';
import { Event, Seat, SeatStatus } from '../types';
import { SeatGrid } from '../components/SeatGrid';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatPaiseToRupees, formatDate } from '../utils/formatters';
import { MapPin, Calendar, ArrowLeft, Loader2, Sparkles, ShieldCheck, Ban } from 'lucide-react';

export const EventDetailPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [event, setEvent] = useState<Event | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReserving, setIsReserving] = useState<boolean>(false);

  // Idempotency-Key held in a ref per user action attempt (reused across retries)
  const reservationKeyRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!eventId) return;
    try {
      const [eventRes, seatsRes] = await Promise.all([
        eventApi.getEventById(eventId),
        eventApi.getEventSeats(eventId),
      ]);

      if (eventRes.success && eventRes.data.event) {
        setEvent(eventRes.data.event);
      }
      if (seatsRes.success && seatsRes.data.seats) {
        setSeats(seatsRes.data.seats);
      }
    } catch (err) {
      console.error('Error loading event detail:', err);
      toast.error('Failed to load event details');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleSeat = (seatId: string) => {
    setSelectedSeatIds((prev) =>
      prev.includes(seatId) ? prev.filter((id) => id !== seatId) : [...prev, seatId]
    );
    // Reset idempotency key when seat selection changes
    reservationKeyRef.current = null;
  };

  const selectedSeats = seats.filter((s) => selectedSeatIds.includes(s._id));
  const totalPrice = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  // Computed Sold Out logic from actual seat status array
  const availableSeatCount = seats.filter((s) => s.status === SeatStatus.AVAILABLE).length;
  const isSoldOut = seats.length > 0 && availableSeatCount === 0;

  const handleReserve = async () => {
    if (!user) {
      toast.error('Authentication Required', 'Please sign in to reserve tickets');
      navigate('/login');
      return;
    }

    if (selectedSeatIds.length === 0) {
      toast.error('No Seats Selected', 'Please select at least one seat');
      return;
    }

    // Generate idempotency key ONCE per action attempt; reuse SAME key on retries
    if (!reservationKeyRef.current) {
      reservationKeyRef.current = generateIdempotencyKey('res-action');
    }
    const currentKey = reservationKeyRef.current;

    setIsReserving(true);
    try {
      const res = await reservationApi.createReservation(eventId!, selectedSeatIds, currentKey);
      if (res.success && res.data.reservation) {
        toast.success(
          'Seats Held Successfully!',
          `Reserved ${selectedSeatIds.length} seat(s). Complete payment within 5 minutes.`
        );
        // Clear key on success
        reservationKeyRef.current = null;
        navigate(`/checkout/${res.data.reservation._id}`, {
          state: { reservation: res.data.reservation, event },
        });
      }
    } catch (err: unknown) {
      const errorResponse = (err as { response?: { data?: { message?: string } } })?.response?.data;
      toast.error('Reservation Failed', errorResponse?.message || 'Seat is unavailable or reserved');

      // CRITICAL FIX: On seat unavailability / 409 error, REFETCH seat map from server immediately
      // so stale seat data is refreshed and taken seats show as RESERVED/BOOKED
      await fetchData();
    } finally {
      setIsReserving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-3" />
        <p className="text-sm">Loading seat map...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-300">
        <h2 className="text-xl font-bold">Event Not Found</h2>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold hover:bg-slate-700"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Back Header */}
      <div className="border-b border-slate-800/80 bg-slate-900/40 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Events</span>
          </button>

          {/* Computed Availability & Sold Out Badge */}
          {isSoldOut ? (
            <div className="flex items-center gap-2 text-xs text-rose-400 font-bold bg-rose-500/10 px-3.5 py-1 rounded-full border border-rose-500/30">
              <Ban className="w-3.5 h-3.5" />
              <span>SOLD OUT</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{availableSeatCount} Available Seats</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Interactive Seat Grid Map */}
          <div className="lg:col-span-2 bg-slate-900/60 p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-bold text-white">Interactive Seat Map</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Click available seats to select/deselect
                </p>
              </div>
              <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-3 py-1.5 rounded-xl border border-violet-500/20 font-semibold">
                {selectedSeatIds.length} Selected
              </span>
            </div>

            <SeatGrid seats={seats} selectedSeatIds={selectedSeatIds} onToggleSeat={handleToggleSeat} />
          </div>

          {/* Right Column: Event Details & Reservation Summary Panel */}
          <div className="space-y-6">
            <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-2xl font-extrabold text-white">{event.title}</h1>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">{event.description}</p>

              <div className="space-y-3 pt-4 border-t border-slate-800/80 text-xs">
                <div className="flex items-center gap-3 text-slate-300">
                  <MapPin className="w-4 h-4 text-violet-400 shrink-0" />
                  <span>{event.venue}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>
                    {formatDate(event.eventDate)} at {event.eventTime}
                  </span>
                </div>
              </div>
            </div>

            {/* Order Summary & Checkout Trigger */}
            <div className="bg-slate-900/90 p-6 rounded-3xl border border-violet-500/30 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Sparkles className="w-24 h-24 text-violet-400" />
              </div>

              <h3 className="text-base font-bold text-white mb-4">Reservation Summary</h3>

              <div className="space-y-3 mb-6 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Selected Seats ({selectedSeatIds.length})</span>
                  <span className="font-semibold text-slate-200">
                    {selectedSeats.map((s) => s.seatNumber).join(', ') || 'None'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Base Ticket Price</span>
                  <span>{formatPaiseToRupees(event.price)} / seat</span>
                </div>
                <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-sm font-bold text-white">
                  <span>Total Amount</span>
                  <span className="text-lg text-emerald-400 font-extrabold">
                    {formatPaiseToRupees(totalPrice)}
                  </span>
                </div>
              </div>

              <button
                disabled={selectedSeatIds.length === 0 || isReserving || isSoldOut}
                onClick={handleReserve}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-sm shadow-xl shadow-violet-600/30 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isReserving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Holding Seats...</span>
                  </>
                ) : isSoldOut ? (
                  <span>Event Sold Out</span>
                ) : (
                  <span>Hold Seats & Proceed</span>
                )}
              </button>
              <p className="text-[10px] text-center text-slate-500 mt-3">
                Holding seats reserves them for 5 minutes during checkout.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
