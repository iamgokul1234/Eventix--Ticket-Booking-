import { releaseExpiredReservations } from '../services/reservation.service';

let cleanupInterval: NodeJS.Timeout | null = null;

export function startReservationCleanupJob(intervalMs = 30000): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(async () => {
    try {
      const released = await releaseExpiredReservations();
      if (released > 0) {
        console.log(`[Cleanup Job] Released ${released} expired reservation(s)`);
      }
    } catch (err) {
      console.error('[Cleanup Job] Error releasing expired reservations:', err);
    }
  }, intervalMs);
}

export function stopReservationCleanupJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
