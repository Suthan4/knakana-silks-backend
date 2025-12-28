import { z } from "zod";

// Add to Cart DTO
export const AddToCartDTOSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().default(1),
});

export type AddToCartDTO = z.infer<typeof AddToCartDTOSchema>;

// Update Cart Item DTO
export const UpdateCartItemDTOSchema = z.object({
  quantity: z.number().int().positive(),
});

export type UpdateCartItemDTO = z.infer<typeof UpdateCartItemDTOSchema>;
