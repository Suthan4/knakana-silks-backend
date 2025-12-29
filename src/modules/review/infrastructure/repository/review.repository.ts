import { inject, injectable } from "tsyringe";
import {
  Review,
  ReviewHelpfulVote,
  PrismaClient,
} from "@/generated/prisma/client.js";
import {
  IReviewRepository,
  ReviewWithRelations,
} from "../interface/Ireviewrepository.js";

@injectable()
export class ReviewRepository implements IReviewRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<ReviewWithRelations | null> {
    return this.prisma.review.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: {
              take: 1,
              orderBy: {
                order: "asc",
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
    });
  }

  async findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ReviewWithRelations[]> {
    return this.prisma.review.findMany({
      where: { userId, ...params.where },
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: {
              take: 1,
              orderBy: {
                order: "asc",
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
    });
  }

  async countByUserId(userId: bigint, where?: any): Promise<number> {
    return this.prisma.review.count({
      where: { userId, ...where },
    });
  }

  async findByProductId(
    productId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ReviewWithRelations[]> {
    return this.prisma.review.findMany({
      where: { productId, ...params.where },
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: {
              take: 1,
              orderBy: {
                order: "asc",
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
    });
  }

  async countByProductId(productId: bigint, where?: any): Promise<number> {
    return this.prisma.review.count({
      where: { productId, ...where },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ReviewWithRelations[]> {
    return this.prisma.review.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: {
              take: 1,
              orderBy: {
                order: "asc",
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.review.count({ where });
  }

  async create(data: {
    userId: bigint;
    productId: bigint;
    orderId?: bigint;
    rating: number;
    comment?: string;
    images?: string[];
    isVerifiedPurchase: boolean;
    isApproved: boolean;
  }): Promise<Review> {
    return this.prisma.review.create({
      data: {
        userId: data.userId,
        productId: data.productId,
        orderId: data.orderId ?? null,
        rating: data.rating,
        comment: data.comment,
        images: data.images || [],
        isVerifiedPurchase: data.isVerifiedPurchase,
        isApproved: data.isApproved,
      },
    });
  }

  async update(id: bigint, data: Partial<Review>): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data,
    });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.review.delete({ where: { id } });
  }

  async hasUserReviewedProduct(
    userId: bigint,
    productId: bigint
  ): Promise<boolean> {
    const count = await this.prisma.review.count({
      where: { userId, productId },
    });
    return count > 0;
  }

  async getAverageRating(productId: bigint): Promise<number> {
    const result = await this.prisma.review.aggregate({
      where: { productId, isApproved: true },
      _avg: {
        rating: true,
      },
    });

    return result._avg.rating || 0;
  }

  async getRatingDistribution(
    productId: bigint
  ): Promise<{ rating: number; count: number }[]> {
    const reviews = await this.prisma.review.groupBy({
      by: ["rating"],
      where: { productId, isApproved: true },
      _count: {
        rating: true,
      },
      orderBy: {
        rating: "desc",
      },
    });

    return reviews.map((r) => ({
      rating: r.rating,
      count: r._count.rating,
    }));
  }

  async markHelpful(
    reviewId: bigint,
    userId: bigint
  ): Promise<ReviewHelpfulVote> {
    // Create helpful vote
    const vote = await this.prisma.reviewHelpfulVote.create({
      data: {
        reviewId,
        userId,
      },
    });

    // Increment helpful count
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        helpfulCount: {
          increment: 1,
        },
      },
    });

    return vote;
  }

  async unmarkHelpful(reviewId: bigint, userId: bigint): Promise<void> {
    // Delete helpful vote
    await this.prisma.reviewHelpfulVote.delete({
      where: {
        reviewId_userId: {
          reviewId,
          userId,
        },
      },
    });

    // Decrement helpful count
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        helpfulCount: {
          decrement: 1,
        },
      },
    });
  }

  async hasUserMarkedHelpful(
    reviewId: bigint,
    userId: bigint
  ): Promise<boolean> {
    const vote = await this.prisma.reviewHelpfulVote.findUnique({
      where: {
        reviewId_userId: {
          reviewId,
          userId,
        },
      },
    });

    return !!vote;
  }
}
