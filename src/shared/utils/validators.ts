import { z } from 'zod';

export const emailSchema = z.string().email();
export const uuidSchema = z.string().uuid();
export const phoneSchema = z.string().regex(/^[+]?[\d\s()-]{10,}$/);

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});

export const validateOrThrow = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  return schema.parse(data);
};
