import { z } from 'zod';

export const TopUpSchema = z.object({
  /** Top-up amount in integer paise (e.g., 10000 = Rs. 100). Never float. */
  amount: z
    .number({ required_error: 'Amount is required' })
    .int('Amount must be an integer in paise')
    .min(1, 'Amount must be at least 1 paise')
    .max(100000000, 'Top-up amount exceeds maximum allowed limit'), // Max 10 lakh rupees
});

export const WalletQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type TopUpInput = z.infer<typeof TopUpSchema>;
export type WalletQueryInput = z.infer<typeof WalletQuerySchema>;
