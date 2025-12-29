import {
  Review,
  ReviewHelpfulVote,
  Prisma,
} from "@/generated/prisma/client.js";

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
        images: {
          take: 1;
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
    images?: string[];
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
}
