import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { CategoryService } from "../../application/service/category.service.js";
import { CreateCategoryDTOSchema, QueryCategoryDTOSchema, UpdateCategoryDTOSchema } from "../../application/category.dto.js";


@injectable()
export class CategoryController {
  constructor(@inject(CategoryService) private categoryService: CategoryService) {}

  async createCategory(req: Request, res: Response) {
    try {
      const data = CreateCategoryDTOSchema.parse(req.body);
      const category = await this.categoryService.createCategory(data);

      res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: category,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id || Array.isArray(id)) {
        res
          .status(400)
          .json({ success: false, message: "Category ID is required" });
        return;
      }
      const data = UpdateCategoryDTOSchema.parse(req.body);
      const category = await this.categoryService.updateCategory(id, data);

      res.json({
        success: true,
        message: "Category updated successfully",
        data: category,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id|| Array.isArray(id)) {
        res
          .status(400)
          .json({ success: false, message: "Category ID is required" });
        return;
      }
      await this.categoryService.deleteCategory(id);

      res.json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id || Array.isArray(id)) {
        res
          .status(400)
          .json({ success: false, message: "Category ID is required" });
        return;
      }
      const category = await this.categoryService.getCategory(id);

      res.json({
        success: true,
        data: category,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getCategoryBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      if (!slug || Array.isArray(slug)) {
        res
          .status(400)
          .json({ success: false, message: "Category slug is required" });
        return;
      }
      const category = await this.categoryService.getCategoryBySlug(slug);

      res.json({
        success: true,
        data: category,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async getCategories(req: Request, res: Response) {
    try {
      const params = QueryCategoryDTOSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        search: req.query.search as string,
        isActive:
          req.query.isActive === "true"
            ? true
            : req.query.isActive === "false"
            ? false
            : undefined,
        parentId: req.query.parentId as string,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
      });

      const result = await this.categoryService.getCategories(params);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getCategoryTree(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const tree = id && !Array.isArray(id) 
        ? await this.categoryService.getCategoryTree(id)
        : await this.categoryService.getCategoryTree();
      res.json({
        success: true,
        data: tree,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getRootCategories(req: Request, res: Response) {
    try {
      const tree = await this.categoryService.getCategoryTree();

      res.json({
        success: true,
        data: tree,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
