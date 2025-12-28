import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";

import { ProductService } from "../../application/service/product.service.js";
import {
  AddImageDTOSchema,
  AddSpecificationDTOSchema,
  AddVariantDTOSchema,
  CreateProductDTOSchema,
  QueryProductDTOSchema,
  UpdateProductDTOSchema,
  UpdateStockDTOSchema,
} from "../../application/product.dto.js";

@injectable()
export class ProductController {
  constructor(@inject(ProductService) private productService: ProductService) {}

  async createProduct(req: Request, res: Response) {
    try {
      console.log("🎯 Controller reached!"); // Add this
      console.log("Request body:", req.body); // Add this
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
        res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
        return;
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
        res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
        return;
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

  async getProduct(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
        return;
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
        res
          .status(400)
          .json({ success: false, message: "Product Slug is required" });
        return;
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

  async getProducts(req: Request, res: Response) {
    try {
      const params = QueryProductDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        search: req.query.search as string,
        categoryId: req.query.categoryId as string,
        isActive:
          req.query.isActive === "true"
            ? true
            : req.query.isActive === "false"
            ? false
            : undefined,
        minPrice: req.query.minPrice
          ? parseFloat(req.query.minPrice as string)
          : undefined,
        maxPrice: req.query.maxPrice
          ? parseFloat(req.query.maxPrice as string)
          : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.productService.getProducts(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Specification endpoints
  async addSpecification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = AddSpecificationDTOSchema.parse(req.body);
      if (!id) {
        res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
        return;
      }
      const spec = await this.productService.addSpecification(
        id,
        data.key,
        data.value
      );

      res.status(201).json({
        success: true,
        message: "Specification added successfully",
        data: spec,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateSpecification(req: Request, res: Response) {
    try {
      const { specId } = req.params;
      const { value } = req.body;
      if (!specId) {
        res.status(400).json({
          success: false,
          message: "Product specId is required",
        });
        return;
      }
      const spec = await this.productService.updateSpecification(specId, value);

      res.json({
        success: true,
        message: "Specification updated successfully",
        data: spec,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteSpecification(req: Request, res: Response) {
    try {
      const { specId } = req.params;
      if (!specId) {
        res.status(400).json({
          success: false,
          message: "Product specId is required",
        });
        return;
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

  // Image endpoints
  async addImage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = AddImageDTOSchema.parse(req.body);
      if (!id) {
        res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
        return;
      }
      const image = await this.productService.addImage(
        id,
        data.url,
        data.altText,
        data.order
      );

      res.status(201).json({
        success: true,
        message: "Image added successfully",
        data: image,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteImage(req: Request, res: Response) {
    try {
      const { imageId } = req.params;
      if (!imageId) {
        res.status(400).json({
          success: false,
          message: "Product imageId is required",
        });
        return;
      }
      await this.productService.deleteImage(imageId);

      res.json({
        success: true,
        message: "Image deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Variant endpoints
  async addVariant(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = AddVariantDTOSchema.parse(req.body);
      if (!id) {
        res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
        return;
      }
      const variant = await this.productService.addVariant(id, data);

      res.status(201).json({
        success: true,
        message: "Variant added successfully",
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
        res.status(400).json({
          success: false,
          message: "Product variantId is required",
        });
        return;
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

  // Stock endpoints
  async getStock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
        return;
      }
      const stock = await this.productService.getStock(id);

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
      const data = UpdateStockDTOSchema.parse(req.body);
      if (!id) {
        res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
        return;
      }
      const stock = await this.productService.updateStock(
        id,
        data.quantity,
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
}
