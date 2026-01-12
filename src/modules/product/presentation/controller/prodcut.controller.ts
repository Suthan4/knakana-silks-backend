import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { ProductService } from "../../application/service/product.service.js";
import { CategoryService } from "@/modules/category/application/service/category.service.js";
import {
  QueryProductDTOSchema,
  CreateProductDTOSchema,
  UpdateProductDTOSchema,
} from "../../application/product.dto.js";

@injectable()
export class ProductController {
  constructor(
    @inject(ProductService) private productService: ProductService,
    @inject(CategoryService) private categoryService: CategoryService
  ) {}

  /**
   * ✅ ENHANCED: Get products with full URL params support + descendant fetching
   *
   * Supports:
   * - categorySlug: Fetch from category + all subcategories
   * - categoryId: Single category
   * - categoryIds: Multiple specific categories
   * - All filters: price, search, sort, pagination, etc.
   */
  async getProducts(req: Request, res: Response) {
    try {
      // Parse and validate query parameters
      const params = QueryProductDTOSchema.parse(req.query);

      // ✅ Handle categorySlug - fetch category + all descendants
      let categoryIds: string[] | undefined;

      if (params.categorySlug) {
        try {
          const { category, descendantIds } =
            await this.categoryService.getCategoryWithDescendants(
              params.categorySlug
            );

          // Convert bigint[] to string[]
          categoryIds = descendantIds.map((id) => id.toString());

          console.log(
            `📂 Category: ${category.name} (slug: ${params.categorySlug})`
          );
          console.log(
            `📊 Fetching products from ${categoryIds.length} categories (including descendants)`
          );
        } catch (error: any) {
          // Category not found
          return res.status(404).json({
            success: false,
            message: `Category with slug "${params.categorySlug}" not found`,
          });
        }
      } else if (params.categoryIds && params.categoryIds.length > 0) {
        // Use provided categoryIds array (already parsed by DTO)
        categoryIds = params.categoryIds;
      } else if (params.categoryId) {
        // Single category ID (backward compatible)
        categoryIds = [params.categoryId];
      }

      // Call product service with processed parameters
      const result = await this.productService.getProducts({
        ...params,
        categoryIds, // ✅ Pass processed category IDs (overrides if exists)
      });

      res.json({
        success: true,
        data: result,
        meta: {
          query: {
            categorySlug: params.categorySlug,
            categoriesSearched: categoryIds?.length || 0,
          },
        },
      });
    } catch (error: any) {
      console.error("❌ Error fetching products:", error);

      // Handle Zod validation errors
      if (error.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid query parameters",
          errors: error.errors,
        });
      }

      res.status(400).json({
        success: false,
        message: error.message || "Failed to fetch products",
      });
    }
  }

  async getProduct(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const product = await this.productService.getProduct(id);

      res.json({
        success: true,
        data: product,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getProductBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      if (!slug) {
        return res
          .status(400)
          .json({ success: false, message: "Product slug is required" });
      }

      const product = await this.productService.getProductBySlug(slug);

      res.json({
        success: true,
        data: product,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async createProduct(req: Request, res: Response) {
    try {
      const data = CreateProductDTOSchema.parse(req.body);
      const product = await this.productService.createProduct(data);

      res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: product,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateProduct(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const data = UpdateProductDTOSchema.parse(req.body);
      const product = await this.productService.updateProduct(id, data);

      res.json({
        success: true,
        message: "Product updated successfully",
        data: product,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteProduct(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      await this.productService.deleteProduct(id);

      res.json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getProductStock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { warehouseId, variantId } = req.query;

      if (!id || !warehouseId) {
        return res.status(400).json({
          success: false,
          message: "Product ID and warehouse ID are required",
        });
      }

      const stock = await this.productService.getStock(
        id,
        warehouseId as string,
        variantId as string | undefined
      );

      res.json({
        success: true,
        data: stock,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
}
