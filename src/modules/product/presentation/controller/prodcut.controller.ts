import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { ProductService } from "../../application/service/product.service.js";
import { CategoryService } from "@/modules/category/application/service/category.service.js";
import {
  QueryProductDTOSchema,
  CreateProductDTOSchema,
  UpdateProductDTOSchema,
  AddSpecificationDTOSchema,
  AddMediaDTOSchema,
  AddVariantDTOSchema,
  UpdateVariantDTOSchema,
  AddVariantMediaDTOSchema,
  UpdateStockDTOSchema,
} from "../../application/product.dto.js";

@injectable()
export class ProductController {
  constructor(
    @inject(ProductService) private productService: ProductService,
    @inject(CategoryService) private categoryService: CategoryService
  ) {}

  /**
   * ✅ ENHANCED: Get products with full URL params support + descendant fetching
   */
  async getProducts(req: Request, res: Response) {
    try {
      const params = QueryProductDTOSchema.parse(req.query);

      let categoryIds: string[] | undefined;

      if (params.categorySlug) {
        try {
          const { category, descendantIds } =
            await this.categoryService.getCategoryWithDescendants(
              params.categorySlug
            );

          categoryIds = descendantIds.map((id) => id.toString());

          console.log(
            `📂 Category: ${category.name} (slug: ${params.categorySlug})`
          );
          console.log(
            `📊 Fetching products from ${categoryIds.length} categories (including descendants)`
          );
        } catch (error: any) {
          return res.status(404).json({
            success: false,
            message: `Category with slug "${params.categorySlug}" not found`,
          });
        }
      } else if (params.categoryIds && params.categoryIds.length > 0) {
        categoryIds = params.categoryIds;
      } else if (params.categoryId) {
        categoryIds = [params.categoryId];
      }

      const result = await this.productService.getProducts({
        ...params,
        categoryIds,
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
      console.error("❌ Error creating product:", error);
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

  // ==========================================
  // STOCK ENDPOINTS
  // ==========================================

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

  async updateStock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const data = UpdateStockDTOSchema.parse(req.body);
      const stock = await this.productService.updateStock(
        id,
        data.variantId || null,
        data.warehouseId,
        data.quantity,
        data.lowStockThreshold,
        data.reason
      );

      res.json({
        success: true,
        message: "Stock updated successfully",
        data: stock,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // SPECIFICATION ENDPOINTS
  // ==========================================

  async addSpecification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const data = AddSpecificationDTOSchema.parse(req.body);
      const specification = await this.productService.addSpecification(
        id,
        data.key,
        data.value
      );

      res.status(201).json({
        success: true,
        message: "Specification added successfully",
        data: specification,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateSpecification(req: Request, res: Response) {
    try {
      const { specId } = req.params;
      const { value } = req.body;

      if (!specId || !value) {
        return res.status(400).json({
          success: false,
          message: "Specification ID and value are required",
        });
      }

      const specification = await this.productService.updateSpecification(
        specId,
        value
      );

      res.json({
        success: true,
        message: "Specification updated successfully",
        data: specification,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteSpecification(req: Request, res: Response) {
    try {
      const { specId } = req.params;
      if (!specId) {
        return res
          .status(400)
          .json({ success: false, message: "Specification ID is required" });
      }

      await this.productService.deleteSpecification(specId);

      res.json({
        success: true,
        message: "Specification deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // PRODUCT MEDIA ENDPOINTS
  // ==========================================

  async addMedia(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const data = AddMediaDTOSchema.parse(req.body);
      const media = await this.productService.addMedia(id, data);

      res.status(201).json({
        success: true,
        message: "Media added successfully",
        data: media,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteMedia(req: Request, res: Response) {
    try {
      const { mediaId } = req.params;
      if (!mediaId) {
        return res
          .status(400)
          .json({ success: false, message: "Media ID is required" });
      }

      await this.productService.deleteMedia(mediaId);

      res.json({
        success: true,
        message: "Media deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // VARIANT ENDPOINTS (ENHANCED)
  // ==========================================

  async addVariant(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const data = AddVariantDTOSchema.parse(req.body);
      const variant = await this.productService.addVariant(id, data);

      res.status(201).json({
        success: true,
        message: "Variant added successfully",
        data: variant,
      });
    } catch (error: any) {
      console.error("❌ Error adding variant:", error);
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateVariant(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      if (!variantId) {
        return res
          .status(400)
          .json({ success: false, message: "Variant ID is required" });
      }

      const data = UpdateVariantDTOSchema.parse(req.body);
      const variant = await this.productService.updateVariant(variantId, data);

      res.json({
        success: true,
        message: "Variant updated successfully",
        data: variant,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteVariant(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      if (!variantId) {
        return res
          .status(400)
          .json({ success: false, message: "Variant ID is required" });
      }

      await this.productService.deleteVariant(variantId);

      res.json({
        success: true,
        message: "Variant deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getVariant(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      if (!variantId) {
        return res
          .status(400)
          .json({ success: false, message: "Variant ID is required" });
      }

      const variant = await this.productService.getVariant(variantId);

      res.json({
        success: true,
        data: variant,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  // ==========================================
  // 🆕 VARIANT MEDIA ENDPOINTS
  // ==========================================

  async addVariantMedia(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      if (!variantId) {
        return res
          .status(400)
          .json({ success: false, message: "Variant ID is required" });
      }

      const data = AddVariantMediaDTOSchema.parse(req.body);
      const media = await this.productService.addVariantMedia(variantId, data);

      res.status(201).json({
        success: true,
        message: "Variant media added successfully",
        data: media,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteVariantMedia(req: Request, res: Response) {
    try {
      const { mediaId } = req.params;
      if (!mediaId) {
        return res
          .status(400)
          .json({ success: false, message: "Media ID is required" });
      }

      await this.productService.deleteVariantMedia(mediaId);

      res.json({
        success: true,
        message: "Variant media deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
