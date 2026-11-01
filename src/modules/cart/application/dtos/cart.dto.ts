import { z } from "zod";

// Keep identifiers as decimal strings until the service converts them to BigInt.
const databaseIdSchema = z.string().trim().regex(/^\d+$/, "Please select a valid product.");

export const AddToCartDTOSchema = z.object({
  productId: databaseIdSchema,
  variantId: databaseIdSchema.optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1.").default(1),
}).strict();

export type AddToCartDTO = z.infer<typeof AddToCartDTOSchema>;

export const UpdateCartItemDTOSchema = z.object({
  quantity: z.number().int().min(1, "Quantity must be at least 1."),
}).strict();

export type UpdateCartItemDTO = z.infer<typeof UpdateCartItemDTOSchema>;
