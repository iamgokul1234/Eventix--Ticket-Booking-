import { z } from 'zod';

export const CreateReservationSchema = z.object({
  seatIds: z
    .array(z.string().min(1, 'Seat ID cannot be empty'))
    .min(1, 'At least one seat ID is required')
    .max(10, 'Cannot reserve more than 10 seats in a single reservation'),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
