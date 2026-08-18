import React from 'react';
import { Seat, SeatStatus } from '../types';
import { formatPaiseToRupees, naturalSortSeats } from '../utils/formatters';
import { Check, Lock } from 'lucide-react';

interface SeatGridProps {
  seats: Seat[];
  selectedSeatIds: string[];
  onToggleSeat: (seatId: string) => void;
}

export const SeatGrid: React.FC<SeatGridProps> = ({ seats, selectedSeatIds, onToggleSeat }) => {
  const sortedSeats = naturalSortSeats(seats);

  return (
    <div className="w-full">
      {/* Stage / Screen Indicator */}
      <div className="w-full mb-6 sm:mb-8 flex flex-col items-center">
        <div className="w-3/4 h-3 bg-gradient-to-b from-violet-500/40 to-transparent rounded-t-full shadow-lg shadow-violet-500/20 border-t border-violet-500/50" />
        <span className="text-[10px] sm:text-[11px] uppercase tracking-widest text-slate-400 font-semibold mt-2">
          Stage / Screen Area
        </span>
      </div>

      {/* Seat Status Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mb-6 sm:mb-8 text-xs font-medium text-slate-300 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-emerald-500/20 border border-emerald-500/50" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-violet-600 border border-violet-400" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-amber-500/20 border border-amber-500/40" />
          <span>Held</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-slate-800 border border-slate-700 opacity-60" />
          <span>Taken</span>
        </div>
      </div>

      {/* Seat Map Layout with horizontal scroll container on ultra-small devices */}
      {seats.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No seats generated for this event yet.
        </div>
      ) : (
        <div className="overflow-x-auto pb-4 pt-1">
          <div className="min-w-[300px] grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2.5 sm:gap-3 justify-items-center">
            {sortedSeats.map((seat) => {
              const isSelected = selectedSeatIds.includes(seat._id);
              const isAvailable = seat.status === SeatStatus.AVAILABLE;
              const isReserved = seat.status === SeatStatus.RESERVED;
              const isBooked = seat.status === SeatStatus.BOOKED;

              let buttonClass =
                'relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center transition-all duration-200 font-semibold text-xs border touch-manipulation ';

              if (isSelected) {
                buttonClass +=
                  'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white border-violet-400 shadow-lg shadow-violet-600/40 scale-105 z-10';
              } else if (isAvailable) {
                buttonClass +=
                  'bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30 hover:border-emerald-400 hover:scale-105 shadow-sm active:scale-95';
              } else if (isReserved) {
                buttonClass +=
                  'bg-amber-500/10 text-amber-400/60 border-amber-500/20 cursor-not-allowed opacity-80';
              } else if (isBooked) {
                buttonClass +=
                  'bg-slate-900/60 text-slate-600 border-slate-800 cursor-not-allowed opacity-50';
              }

              return (
                <button
                  key={seat._id}
                  disabled={!isAvailable}
                  onClick={() => onToggleSeat(seat._id)}
                  title={`${seat.seatNumber} - ${formatPaiseToRupees(seat.price)} (${seat.status})`}
                  className={buttonClass}
                >
                  {isSelected ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : isBooked ? (
                    <Lock className="w-3.5 h-3.5 opacity-60" />
                  ) : (
                    <span>{seat.seatNumber}</span>
                  )}
                  <span className="text-[9px] opacity-70 mt-0.5 font-normal">
                    {formatPaiseToRupees(seat.price)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
