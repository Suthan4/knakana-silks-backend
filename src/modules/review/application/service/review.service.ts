import { injectable, inject } from "tsyringe";
import { IReviewRepository } from "../../infrastructure/interface/Ireviewrepository.js";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";
import { IOrderRepository } from "@/modules/order/infrastructure/interface/Iorderrepository.js";
import { OrderStatus } from "@/generated/prisma/enums.js";

@injectable()
export class ReviewService {
  constructor(
    @inject("IReviewRepository") private reviewRepository: IReviewRepository,
    @inject("IProductRepository") private productRepository: IProductRepository,
    @inject("IOrderRepository") private orderRepository: IOrderRepository
  ) {}

  /**
   * Create review
   */
  async createReview(
    userId: string,
    data: {
      productId: string;
      orderId?: string;
      rating: number;
      comment?: string;
      images?: string[];
    }
  ) {
    const userIdBigInt = BigInt(userId);
    const productId = BigInt(data.productId);

    // Check if product exists
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new Error("Product not found");
    }

    // Check if user has already reviewed this product
    const hasReviewed = await this.reviewRepository.hasUserReviewedProduct(
      userIdBigInt,
      productId
    );

    if (hasReviewed) {
      throw new Error("You have already reviewed this product");
    }

    // Verify purchase if orderId is provided
    let isVerifiedPurchase = false;
    if (data.orderId) {
      const order = await this.orderRepository.findById(BigInt(data.orderId));

      if (!order) {
        throw new Error("Order not found");
      }

      // Verify user owns the order
      if (order.userId !== userIdBigInt) {
        throw new Error("Unauthorized: Order does not belong to you");
      }

      // Check if order is delivered or completed
      if (
        order.status !== OrderStatus.DELIVERED &&
        order.status !== OrderStatus.COMPLETED
      ) {
        throw new Error("You can only review delivered orders");
      }

      // Check if product is in the order
      const hasProduct = order.items.some(
        (item) => item.productId === productId
      );

      if (!hasProduct) {
        throw new Error("Product not found in this order");
      }

      isVerifiedPurchase = true;
    }

    // Create review (auto-approve for now, can be changed to require approval)
    const review = await this.reviewRepository.create({
      userId: userIdBigInt,
      productId,
      orderId: data.orderId ? BigInt(data.orderId) : undefined,
      rating: data.rating,
      comment: data.comment,
      images: data.images,
      isVerifiedPurchase,
      isApproved: true, // Auto-approve (change to false if manual approval needed)
    });

    console.log(
      `✅ Review created: User ${userId} reviewed product ${data.productId}`
    );

    return this.reviewRepository.findById(review.id);
  }

  /**
   * Update review
   */
  async updateReview(
    userId: string,
    reviewId: string,
    data: {
      rating?: number;
      comment?: string;
      images?: string[];
    }
  ) {
    const review = await this.reviewRepository.findById(BigInt(reviewId));

    if (!review) {
      throw new Error("Review not found");
    }

    // Verify user owns the review
    if (review.userId !== BigInt(userId)) {
      throw new Error("Unauthorized: You can only update your own reviews");
    }

    const updated = await this.reviewRepository.update(BigInt(reviewId), data);

    console.log(`✅ Review updated: ${reviewId}`);

    return this.reviewRepository.findById(updated.id);
  }

  /**
   * Delete review
   */
  async deleteReview(userId: string, reviewId: string) {
    const review = await this.reviewRepository.findById(BigInt(reviewId));

    if (!review) {
      throw new Error("Review not found");
    }

    // Verify user owns the review
    if (review.userId !== BigInt(userId)) {
      throw new Error("Unauthorized: You can only delete your own reviews");
    }

    await this.reviewRepository.delete(BigInt(reviewId));

    console.log(`✅ Review deleted: ${reviewId}`);
  }

  /**
   * Get product reviews
   */
  async getProductReviews(
    productId: string,
    params: {
      page: number;
      limit: number;
      rating?: number;
      isApproved?: boolean;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }
  ) {
    const skip = (params.page - 1) * params.limit;
    const where: any = { isApproved: params.isApproved ?? true };

    if (params.rating) {
      where.rating = params.rating;
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [reviews, total, averageRating, ratingDistribution] =
      await Promise.all([
        this.reviewRepository.findByProductId(BigInt(productId), {
          skip,
          take: params.limit,
          where,
          orderBy,
        }),
        this.reviewRepository.countByProductId(BigInt(productId), where),
        this.reviewRepository.getAverageRating(BigInt(productId)),
        this.reviewRepository.getRatingDistribution(BigInt(productId)),
      ]);

    return {
      reviews,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
      stats: {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        totalReviews: total,
        ratingDistribution,
      },
    };
  }

  /**
   * Get user reviews
   */
  async getUserReviews(
    userId: string,
    params: {
      page: number;
      limit: number;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }
  ) {
    const skip = (params.page - 1) * params.limit;
    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [reviews, total] = await Promise.all([
      this.reviewRepository.findByUserId(BigInt(userId), {
        skip,
        take: params.limit,
        orderBy,
      }),
      this.reviewRepository.countByUserId(BigInt(userId)),
    ]);

    return {
      reviews,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  /**
   * Mark review as helpful
   */
  async markHelpful(userId: string, reviewId: string) {
    const review = await this.reviewRepository.findById(BigInt(reviewId));

    if (!review) {
      throw new Error("Review not found");
    }

    // Check if user has already marked this review as helpful
    const hasMarked = await this.reviewRepository.hasUserMarkedHelpful(
      BigInt(reviewId),
      BigInt(userId)
    );

    if (hasMarked) {
      throw new Error("You have already marked this review as helpful");
    }

    await this.reviewRepository.markHelpful(BigInt(reviewId), BigInt(userId));

    console.log(`✅ Review marked as helpful: ${reviewId} by user ${userId}`);

    return this.reviewRepository.findById(BigInt(reviewId));
  }

  /**
   * Unmark review as helpful
   */
  async unmarkHelpful(userId: string, reviewId: string) {
    const review = await this.reviewRepository.findById(BigInt(reviewId));

    if (!review) {
      throw new Error("Review not found");
    }

    // Check if user has marked this review as helpful
    const hasMarked = await this.reviewRepository.hasUserMarkedHelpful(
      BigInt(reviewId),
      BigInt(userId)
    );

    if (!hasMarked) {
      throw new Error("You have not marked this review as helpful");
    }

    await this.reviewRepository.unmarkHelpful(BigInt(reviewId), BigInt(userId));

    console.log(`✅ Review unmarked as helpful: ${reviewId} by user ${userId}`);

    return this.reviewRepository.findById(BigInt(reviewId));
  }

  /**
   * Admin: Get all reviews
   */
  async getAllReviews(params: {
    page: number;
    limit: number;
    productId?: string;
    rating?: number;
    isApproved?: boolean;
    isVerifiedPurchase?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.productId) {
      where.productId = BigInt(params.productId);
    }

    if (params.rating) {
      where.rating = params.rating;
    }

    if (params.isApproved !== undefined) {
      where.isApproved = params.isApproved;
    }

    if (params.isVerifiedPurchase !== undefined) {
      where.isVerifiedPurchase = params.isVerifiedPurchase;
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [reviews, total] = await Promise.all([
      this.reviewRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.reviewRepository.count(where),
    ]);

    return {
      reviews,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  /**
   * Admin: Approve/reject review
   */
  async approveReview(reviewId: string, isApproved: boolean) {
    const review = await this.reviewRepository.findById(BigInt(reviewId));

    if (!review) {
      throw new Error("Review not found");
    }

    const updated = await this.reviewRepository.update(BigInt(reviewId), {
      isApproved,
    });

    console.log(
      `✅ Review ${isApproved ? "approved" : "rejected"}: ${reviewId}`
    );

    return this.reviewRepository.findById(updated.id);
  }

  /**
   * Admin: Delete review
   */
  async adminDeleteReview(reviewId: string) {
    await this.reviewRepository.delete(BigInt(reviewId));

    console.log(`✅ Review deleted by admin: ${reviewId}`);
  }
}
