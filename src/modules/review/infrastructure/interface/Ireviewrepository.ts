import {
  Review,
  ReviewHelpfulVote,
  ReviewMedia, // NEW
  Prisma,
} from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";

export type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        email: true;
      };
    };
    product: {
      select: {
        id: true;
        name: true;
        slug: true;
        media: {
          // UPDATED
          take: 1;
          where: {
            isActive: true;
          };
          orderBy: {
            order: "asc";
          };
        };
      };
    };
    order: {
      select: {
        id: true;
        orderNumber: true;
      };
    };
    media: true; // NEW: Include review media
  };
}>;

export interface IReviewRepository {
  findById(id: bigint): Promise<ReviewWithRelations | null>;
  findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ReviewWithRelations[]>;
  countByUserId(userId: bigint, where?: any): Promise<number>;
  findByProductId(
    productId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ReviewWithRelations[]>;
  countByProductId(productId: bigint, where?: any): Promise<number>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ReviewWithRelations[]>;
  count(where?: any): Promise<number>;
  create(data: {
    userId: bigint;
    productId: bigint;
    orderId?: bigint;
    rating: number;
    comment?: string;
    images?: string[]; // Keep for backward compatibility
    isVerifiedPurchase: boolean;
    isApproved: boolean;
  }): Promise<Review>;
  update(id: bigint, data: Partial<Review>): Promise<Review>;
  delete(id: bigint): Promise<void>;
  hasUserReviewedProduct(userId: bigint, productId: bigint): Promise<boolean>;
  getAverageRating(productId: bigint): Promise<number>;
  getRatingDistribution(productId: bigint): Promise<
    {
      rating: number;
      count: number;
    }[]
  >;
  markHelpful(reviewId: bigint, userId: bigint): Promise<ReviewHelpfulVote>;
  unmarkHelpful(reviewId: bigint, userId: bigint): Promise<void>;
  hasUserMarkedHelpful(reviewId: bigint, userId: bigint): Promise<boolean>;

  // NEW: ReviewMedia methods
  addReviewMedia(
    reviewId: bigint,
    data: {
      type: MediaType;
      url: string;
      key?: string;
      thumbnailUrl?: string;
      mimeType?: string;
      fileSize?: bigint;
      duration?: number;
      width?: number;
      height?: number;
      order?: number;
    }
  ): Promise<ReviewMedia>;
  deleteReviewMedia(id: bigint): Promise<void>;
}
