import React, { useState, useEffect, useRef } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';

interface ReservationTimerProps {
  expiresAt: string;
  onExpire?: () => void;
}

export const ReservationTimer: React.FC<ReservationTimerProps> = ({ expiresAt, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const hasExpiredRef = useRef<boolean>(false);

  useEffect(() => {
    hasExpiredRef.current = false;

    const calculateTime = () => {
      const expiry = new Date(expiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiry - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        if (onExpire) {
          onExpire();
        }
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isUrgent = timeLeft < 60 && timeLeft > 0;

  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-semibold border backdrop-blur-lg transition-all ${
        timeLeft === 0
          ? 'bg-rose-950/60 border-rose-500/40 text-rose-400'
          : isUrgent
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
      }`}
    >
      {isUrgent || timeLeft === 0 ? (
        <AlertTriangle className="w-4 h-4 text-rose-400" />
      ) : (
        <Timer className="w-4 h-4 text-amber-400" />
      )}
      <div>
        <span>{timeLeft === 0 ? 'Reservation Expired' : 'Seats Held For:'} </span>
        <span className="font-mono text-sm ml-1">{formattedTime}</span>
      </div>
    </div>
  );
};
