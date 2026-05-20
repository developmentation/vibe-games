import { z } from 'zod';

/**
 * Validates form definition ID parameter.
 */
export const formIdSchema = z.object({
  id: z.string().uuid('Invalid form ID format'),
});

/**
 * Validates submission query parameters (pagination).
 * Uses coerce for string-to-number conversion from query params.
 */
export const submissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Validates submission ID parameter.
 */
export const submissionIdSchema = z.object({
  id: z.string().uuid('Invalid submission ID format'),
});
