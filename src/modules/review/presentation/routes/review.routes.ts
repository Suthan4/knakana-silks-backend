import { Router } from "express";
import { container } from "tsyringe";
import {
  authenticate,
  checkPermission,
} from "@/shared/middleware/auth.middleware.js";
import { ReviewController } from "../controller/review.controller.js";

const router = Router();

const getReviewController = () => container.resolve(ReviewController);

// ==================== PUBLIC ROUTES ====================

/**
 * Get product reviews
 * GET /api/reviews/product/:productId
 */
router.get("/reviews/product/:productId", (req, res) =>
  getReviewController().getProductReviews(req, res)
);

// ==================== USER ROUTES (Authenticated) ====================

/**
 * Create review
 * POST /api/reviews
 */
router.post("/reviews", authenticate, (req, res) =>
  getReviewController().createReview(req, res)
);

/**
 * Update review
 * PUT /api/reviews/:id
 */
router.put("/reviews/:id", authenticate, (req, res) =>
  getReviewController().updateReview(req, res)
);

/**
 * Delete review
 * DELETE /api/reviews/:id
 */
router.delete("/reviews/:id", authenticate, (req, res) =>
  getReviewController().deleteReview(req, res)
);

/**
 * Get user's reviews
 * GET /api/reviews/my-reviews
 */
router.get("/reviews/my-reviews", authenticate, (req, res) =>
  getReviewController().getUserReviews(req, res)
);

/**
 * Mark review as helpful
 * POST /api/reviews/:id/helpful
 */
router.post("/reviews/:id/helpful", authenticate, (req, res) =>
  getReviewController().markHelpful(req, res)
);

/**
 * Unmark review as helpful
 * DELETE /api/reviews/:id/helpful
 */
router.delete("/reviews/:id/helpful", authenticate, (req, res) =>
  getReviewController().unmarkHelpful(req, res)
);

// ==================== ADMIN ROUTES ====================

/**
 * Get all reviews
 * GET /api/admin/reviews
 */
router.get(
  "/admin/reviews",
  authenticate,
  checkPermission("reviews", "read"),
  (req, res) => getReviewController().getAllReviews(req, res)
);

/**
 * Approve/reject review
 * PUT /api/admin/reviews/:id/approve
 */
router.put(
  "/admin/reviews/:id/approve",
  authenticate,
  checkPermission("reviews", "update"),
  (req, res) => getReviewController().approveReview(req, res)
);

/**
 * Delete review
 * DELETE /api/admin/reviews/:id
 */
router.delete(
  "/admin/reviews/:id",
  authenticate,
  checkPermission("reviews", "delete"),
  (req, res) => getReviewController().adminDeleteReview(req, res)
);

export default router;
