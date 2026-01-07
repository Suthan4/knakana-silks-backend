import { inject, injectable } from "tsyringe";
import {
  Review,
  ReviewHelpfulVote,
  ReviewMedia, // NEW
  PrismaClient,
} from "@/generated/prisma/client.js";
import { MediaType } from "@/generated/prisma/enums.js";
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
            media: {
              // UPDATED
              take: 1,
              where: { isActive: true },
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
        media: true, // NEW: Include review media
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
            media: {
              // UPDATED
              take: 1,
              where: { isActive: true },
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
        media: true, // NEW
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
            media: {
              // UPDATED
              take: 1,
              where: { isActive: true },
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
        media: true, // NEW
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
            media: {
              // UPDATED
              take: 1,
              where: { isActive: true },
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
        media: true, // NEW
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
    const vote = await this.prisma.reviewHelpfulVote.create({
      data: {
        reviewId,
        userId,
      },
    });

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
    await this.prisma.reviewHelpfulVote.delete({
      where: {
        reviewId_userId: {
          reviewId,
          userId,
        },
      },
    });

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

  // NEW: ReviewMedia methods
  async addReviewMedia(
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
  ): Promise<ReviewMedia> {
    return this.prisma.reviewMedia.create({
      data: {
        reviewId,
        type: data.type,
        url: data.url,
        key: data.key,
        thumbnailUrl: data.thumbnailUrl,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        duration: data.duration,
        width: data.width,
        height: data.height,
        order: data.order ?? 0,
      },
    });
  }

  async deleteReviewMedia(id: bigint): Promise<void> {
    await this.prisma.reviewMedia.delete({ where: { id } });
  }
}
