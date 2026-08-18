import { z } from 'zod';

export const CreateBookingSchema = z.object({
  reservationId: z.string().min(1, 'Reservation ID is required'),
});

export const BookingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
export type BookingQueryInput = z.infer<typeof BookingQuerySchema>;
