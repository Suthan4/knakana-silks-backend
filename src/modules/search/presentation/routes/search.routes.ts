import { Router } from "express";
import { container } from "tsyringe";
import { SearchController } from "../controller/search.controller.js";

const router = Router();

const getSearchController = () => container.resolve(SearchController);

// ==========================================
// PUBLIC ROUTES
// ==========================================

/**
 * GET /api/search?q=query&page=1&limit=10&type=all
 * Unified search endpoint
 * 
 * Query parameters:
 * - q or query: Search query (required)
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 10, max: 50)
 * - type: "all" | "products" | "categories" (default: "all")
 * - includeInactive: Include inactive items (default: false)
 */
router.get("/search", (req, res) =>
  getSearchController().search(req, res)
);

/**
 * GET /api/search/suggestions?q=query&limit=5
 * Get autocomplete suggestions
 * 
 * Query parameters:
 * - q or query: Search query (required, min 2 chars)
 * - limit: Number of suggestions (default: 5)
 */
router.get("/search/suggestions", (req, res) =>
  getSearchController().getSuggestions(req, res)
);

/**
 * GET /api/search/trending
 * Get trending search queries
 */
router.get("/search/trending", (req, res) =>
  getSearchController().getTrending(req, res)
);

export default router;