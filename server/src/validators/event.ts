import { z } from 'zod';

export const CreateEventSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().min(1).max(5000).trim(),
  venue: z.string().min(1).max(300).trim(),
  eventDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
  eventTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Event time must be HH:MM'),
  totalSeats: z.number().int().min(1),
  /** Price per seat in integer paise — client must send paise, never rupees/floats */
  price: z.number().int().min(0),
});

export const UpdateEventSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().min(1).max(5000).trim().optional(),
  venue: z.string().min(1).max(300).trim().optional(),
  eventDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' })
    .optional(),
  eventTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Event time must be HH:MM')
    .optional(),
  totalSeats: z.number().int().min(1).optional(),
  price: z.number().int().min(0).optional(),
  // status is never allowed in PATCH body — use explicit /publish or /cancel endpoints
}).strict();

export const EventQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

export const BulkCreateSeatsSchema = z.object({
  seats: z
    .array(
      z.object({
        seatNumber: z.string().min(1).max(20).trim(),
        /** Price override in integer paise; defaults to event price if omitted */
        price: z.number().int().min(0).optional(),
      })
    )
    .min(1, 'At least one seat is required')
    .max(500, 'Cannot create more than 500 seats at once'),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
export type EventQueryInput = z.infer<typeof EventQuerySchema>;
export type BulkCreateSeatsInput = z.infer<typeof BulkCreateSeatsSchema>;
