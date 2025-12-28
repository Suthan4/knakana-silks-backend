import { z } from "zod";

// Add to Wishlist DTO
export const AddToWishlistDTOSchema = z.object({
  productId: z.string(),
});

export type AddToWishlistDTO = z.infer<typeof AddToWishlistDTOSchema>;

// Update Wishlist DTO
export const UpdateWishlistDTOSchema = z.object({
  isPublic: z.boolean(),
});

export type UpdateWishlistDTO = z.infer<typeof UpdateWishlistDTOSchema>;
