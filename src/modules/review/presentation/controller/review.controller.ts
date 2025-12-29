import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { ReviewService } from "../../application/service/review.service.js";
import {
  CreateReviewDTOSchema,
  UpdateReviewDTOSchema,
  QueryReviewDTOSchema,
  ApproveReviewDTOSchema,
} from "../../application/dtos/review.dtos.js";

@injectable()
export class ReviewController {
  constructor(@inject(ReviewService) private reviewService: ReviewService) {}

  /**
   * Create review (User)
   */
  async createReview(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = CreateReviewDTOSchema.parse(req.body);

      const review = await this.reviewService.createReview(userId, data);

      res.status(201).json({
        success: true,
        message: "Review created successfully",
        data: review,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Update review (User)
   */
  async updateReview(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Review ID is required" });
        return;
      }

      const data = UpdateReviewDTOSchema.parse(req.body);
      const review = await this.reviewService.updateReview(userId, id, data);

      res.json({
        success: true,
        message: "Review updated successfully",
        data: review,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete review (User)
   */
  async deleteReview(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Review ID is required" });
        return;
      }

      await this.reviewService.deleteReview(userId, id);

      res.json({
        success: true,
        message: "Review deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get product reviews (Public)
   */
  async getProductReviews(req: Request, res: Response) {
    try {
      const { productId } = req.params;

      if (!productId) {
        res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
        return;
      }

      const params = QueryReviewDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        rating: req.query.rating
          ? parseInt(req.query.rating as string)
          : undefined,
        isApproved: true, // Only show approved reviews
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.reviewService.getProductReviews(
        productId,
        params
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get user reviews (User)
   */
  async getUserReviews(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const params = QueryReviewDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.reviewService.getUserReviews(userId, params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Mark review as helpful (User)
   */
  async markHelpful(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Review ID is required" });
        return;
      }

      const review = await this.reviewService.markHelpful(userId, id);

      res.json({
        success: true,
        message: "Review marked as helpful",
        data: review,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Unmark review as helpful (User)
   */
  async unmarkHelpful(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Review ID is required" });
        return;
      }

      const review = await this.reviewService.unmarkHelpful(userId, id);

      res.json({
        success: true,
        message: "Review unmarked as helpful",
        data: review,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get all reviews (Admin)
   */
  async getAllReviews(req: Request, res: Response) {
    try {
      const params = QueryReviewDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        productId: req.query.productId as string,
        rating: req.query.rating
          ? parseInt(req.query.rating as string)
          : undefined,
        isApproved:
          req.query.isApproved === "true"
            ? true
            : req.query.isApproved === "false"
            ? false
            : undefined,
        isVerifiedPurchase:
          req.query.isVerifiedPurchase === "true"
            ? true
            : req.query.isVerifiedPurchase === "false"
            ? false
            : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.reviewService.getAllReviews(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Approve/reject review (Admin)
   */
  async approveReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = ApproveReviewDTOSchema.parse(req.body);

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Review ID is required" });
        return;
      }

      const review = await this.reviewService.approveReview(
        id,
        data.isApproved
      );

      res.json({
        success: true,
        message: `Review ${
          data.isApproved ? "approved" : "rejected"
        } successfully`,
        data: review,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete review (Admin)
   */
  async adminDeleteReview(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Review ID is required" });
        return;
      }

      await this.reviewService.adminDeleteReview(id);

      res.json({
        success: true,
        message: "Review deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
