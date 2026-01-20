import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { SearchService } from "../../application/service/search.service.js";
import { UnifiedSearchDTOSchema } from "../../application/dtos/search.dto.js";


@injectable()
export class SearchController {
  constructor(@inject(SearchService) private searchService: SearchService) {}

  /**
   * POST /api/search
   * Unified search endpoint for products and categories
   */
  async search(req: Request, res: Response) {
    try {
      const params = UnifiedSearchDTOSchema.parse({
        query: req.query.q || req.query.query,
        page: req.query.page,
        limit: req.query.limit,
        type: req.query.type,
        includeInactive: req.query.includeInactive,
      });

      const results = await this.searchService.search(params);

      res.json({
        success: true,
        data: results,
      });
    } catch (error: any) {
      console.error("❌ Search error:", error);

      if (error.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid search parameters",
          errors: error.errors,
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || "Search failed",
      });
    }
  }

  /**
   * GET /api/search/suggestions
   * Get autocomplete suggestions
   */
  async getSuggestions(req: Request, res: Response) {
    try {
      const query = (req.query.q || req.query.query) as string;

      if (!query || query.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Query must be at least 2 characters",
        });
      }

      const limit = parseInt(req.query.limit as string) || 5;
      const suggestions = await this.searchService.getSuggestions(query, limit);

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error: any) {
      console.error("❌ Suggestions error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get suggestions",
      });
    }
  }

  /**
   * GET /api/search/trending
   * Get trending search queries
   */
  async getTrending(req: Request, res: Response) {
    try {
      const trending = await this.searchService.getTrendingSearches();

      res.json({
        success: true,
        data: trending,
      });
    } catch (error: any) {
      console.error("❌ Trending error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get trending searches",
      });
    }
  }
}