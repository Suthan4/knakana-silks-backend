import { injectable, inject } from "tsyringe";
import { SlugUtil } from "@/shared/utils/index.js";
import { IProductRepository } from "../../infrastructure/interface/Iproductrepository.js";
import { ICategoryRepository } from "@/modules/category/infrastructure/interface/Icategoryrepository.js";
import { Prisma, Product, ProductVariant, PrismaClient } from "@/generated/prisma/client.js";
import { Decimal } from "@prisma/client/runtime/client";
import { IWarehouseRepository } from "@/modules/warehouse/infrastructure/interface/Iwarehouserepository.js";
import { MediaType } from "@/generated/prisma/enums.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/shared/utils/errors.js";
import {
  CreateProductDTO,
  UpdateProductDTO,
  PatchProductDTO,
  QueryProductDTO,
} from "../product.dto.js";
import { S3UploadService } from "@/config/s3-upload.js";

function isTemporaryGoogleMediaUrl(value?: string): boolean {
  return /drive\.google\.com|docs\.google\.com|googleusercontent\.com|\/products\/bulk\/drive-proxy\/|[?&]token=/i.test(
    value || "",
  );
}

/**
 * A Drive proxy is only a preview endpoint; it must never be stored as a
 * product's primary image URL/thumbnail. The browser may use it in memory,
 * but manual Product CRUD must receive permanent uploaded media URLs.
 */
function assertNoTemporaryGoogleProductMedia(data: {
  media?: any[];
  variants?: any[];
}): void {
  const collections: Array<{ where: string; media: any }> = [
    ...(data.media || []).map((media) => ({ where: "product media", media })),
    ...((data.variants || []).flatMap((variant, index) =>
      (variant.media || []).map((media: any) => ({
        where: `variant ${variant.sku || index + 1} media`,
        media,
      })),
    )),
  ];

  const unsafe = collections.find(({ media }) =>
    isTemporaryGoogleMediaUrl(media?.url) ||
    isTemporaryGoogleMediaUrl(media?.thumbnailUrl),
  );
  if (unsafe) {
    throw new ValidationError(
      `Cannot save ${unsafe.where} that still uses a temporary Google Drive preview URL. Upload the image to permanent storage and submit its returned storage URL first.`,
    );
  }
}

@injectable()
export class ProductService {
  constructor(
    @inject("IProductRepository") private productRepository: IProductRepository,
    @inject("ICategoryRepository")
    private categoryRepository: ICategoryRepository,
    @inject("IWarehouseRepository")
    private warehouseRepository: IWarehouseRepository,
    @inject("S3UploadService") private s3Service: S3UploadService,
    @inject(PrismaClient) private prisma: PrismaClient
  ) {}

  async createProduct(data: CreateProductDTO): Promise<Product | null> {
    try {
      assertNoTemporaryGoogleProductMedia(data);
      console.log("🔵 ProductService.createProduct called");

      return await this.prisma.$transaction(async (tx) => {
        // Validate category
        const category = await this.categoryRepository.findById(
          BigInt(data.categoryId)
        );
        if (!category) {
          throw new NotFoundError(
            `Category with ID ${data.categoryId} not found`
          );
        }

        const hasCustomVariants = Boolean(
          data.variants && data.variants.length > 0
        );
        const isMultiVariant = Boolean(
          data.hasVariants !== undefined ? data.hasVariants : hasCustomVariants
        );

        // Validate warehouses
        if (!isMultiVariant && data.stock) {
          const warehouse = await this.warehouseRepository.findById(
            BigInt(data.stock.warehouseId)
          );
          if (!warehouse) {
            throw new NotFoundError(
              `Warehouse with ID ${data.stock.warehouseId} not found`
            );
          }
          if (!warehouse.isActive) {
            throw new ValidationError(
              `Warehouse with ID ${data.stock.warehouseId} is inactive`
            );
          }
        }

        if (isMultiVariant && hasCustomVariants) {
          for (let i = 0; i < data.variants!.length; i++) {
            const variant = data.variants![i];
            if (variant.stock) {
              const warehouse = await this.warehouseRepository.findById(
                BigInt(variant.stock.warehouseId)
              );
              if (!warehouse) {
                throw new NotFoundError(
                  `Warehouse with ID ${variant.stock.warehouseId} not found for variant ${i + 1}`
                );
              }
              if (!warehouse.isActive) {
                throw new ValidationError(
                  `Warehouse with ID ${variant.stock.warehouseId} is inactive for variant ${i + 1}`
                );
              }
            }
          }
        }

        const volumetricWeight =
          (data.length * data.breadth * data.height) / 5000;

        let sku: string;
        if (data.sku) {
          const existingSku = await this.productRepository.findBySku(data.sku, tx);
          if (existingSku) {
            throw new ConflictError(`SKU "${data.sku}" is already in use`);
          }
          sku = data.sku;
        } else {
          sku = this.generateSKU(data.name);
          const existingSku = await this.productRepository.findBySku(sku, tx);
          if (existingSku) {
            sku = this.generateSKU(data.name + "-" + Date.now());
          }
        }

        const slug = SlugUtil.generateSlug(data.name);
        const existingSlug = await this.productRepository.findBySlug(slug, tx);
        if (existingSlug) {
          throw new ConflictError(
            `Product with name "${data.name}" already exists`
          );
        }

        const product = await this.productRepository.create(
          {
            name: data.name,
            slug,
            description: data.description,
            categoryId: BigInt(data.categoryId),
            basePrice: data.basePrice,
            sellingPrice: data.sellingPrice,
            sku,
            isActive: data.isActive ?? true,
            hasVariants: isMultiVariant,
            hsnCode: data.hsnCode,
            artisanName: data.artisanName || "",
            artisanAbout: data.artisanAbout || "",
            artisanLocation: data.artisanLocation || "",
            weight: data.weight,
            length: data.length,
            breadth: data.breadth,
            height: data.height,
            volumetricWeight,
            metaTitle: data.metaTitle,
            metaDesc: data.metaDesc,
            schemaMarkup: data.schemaMarkup,
            allowOutOfStockOrders: data.allowOutOfStockOrders ?? false,
            hasVideoConsultation: data.hasVideoConsultation ?? false,
            videoPurchasingEnabled: data.videoPurchasingEnabled ?? false,
            videoConsultationNote: data.videoConsultationNote,
          },
          tx
        );

        // Add specifications
        if (data.specifications?.length) {
          for (const spec of data.specifications) {
            await this.productRepository.addSpecification(
              product.id,
              spec.key,
              spec.value,
              tx
            );
          }
        }

        // Add product-level media
        if (data.media?.length) {
          for (const mediaItem of data.media) {
            await this.productRepository.addMedia(
              product.id,
              {
                type: mediaItem.type || MediaType.IMAGE,
                url: mediaItem.url,
                key: mediaItem.key,
                thumbnailUrl: mediaItem.thumbnailUrl,
                altText: mediaItem.altText,
                title: mediaItem.title,
                description: mediaItem.description,
                mimeType: mediaItem.mimeType,
                fileSize: mediaItem.fileSize
                  ? BigInt(mediaItem.fileSize)
                  : undefined,
                duration: mediaItem.duration,
                width: mediaItem.width,
                height: mediaItem.height,
                order: mediaItem.order,
                isActive: mediaItem.isActive,
              },
              tx
            );
          }
        }

        // Unified Product Model: Default Single Product
        if (!isMultiVariant) {
          const defaultVariant = await this.productRepository.addVariant(
            {
              productId: product.id,
              attributes: { default: "true" },
              basePrice: data.basePrice,
              sellingPrice: data.sellingPrice,
              price: data.sellingPrice,
              weight: data.weight,
              length: data.length,
              breadth: data.breadth,
              height: data.height,
              volumetricWeight,
              sku,
            },
            tx
          );

          if (data.stock) {
            await this.productRepository.updateStock(
              product.id,
              defaultVariant.id,
              BigInt(data.stock.warehouseId),
              data.stock.quantity,
              data.stock.lowStockThreshold || 10,
              "Initial product stock",
              tx
            );
          }
        } else if (hasCustomVariants) {
          // Multi-variant product: persist each custom variant
          for (const variant of data.variants!) {
            const variantSku =
              variant.sku ||
              this.generateSKU(
                `${data.name}-${variant.size || ""}-${variant.color || ""}-${
                  variant.fabric || ""
                }-${JSON.stringify(variant.attributes || {})}`
              );

            let variantVolumetricWeight: number | undefined;
            if (
              variant.weight &&
              variant.length &&
              variant.breadth &&
              variant.height
            ) {
              variantVolumetricWeight =
                (variant.length * variant.breadth * variant.height) / 5000;
            }

            const vBasePrice = variant.basePrice ?? data.basePrice;
            const vSellingPrice =
              variant.sellingPrice ?? variant.price ?? data.sellingPrice;
            const vPrice =
              variant.price ?? variant.sellingPrice ?? data.sellingPrice;

            const createdVariant = await this.productRepository.addVariant(
              {
                productId: product.id,
                attributes: variant.attributes,
                size: variant.size,
                color: variant.color,
                fabric: variant.fabric,
                basePrice: vBasePrice,
                sellingPrice: vSellingPrice,
                price: vPrice,
                weight: variant.weight ?? data.weight,
                length: variant.length ?? data.length,
                breadth: variant.breadth ?? data.breadth,
                height: variant.height ?? data.height,
                volumetricWeight: variantVolumetricWeight ?? volumetricWeight,
                sku: variantSku,
              },
              tx
            );

            if (variant.media?.length) {
              for (const mediaItem of variant.media) {
                await this.productRepository.addVariantMedia(
                  createdVariant.id,
                  {
                    type: mediaItem.type || MediaType.IMAGE,
                    url: mediaItem.url,
                    key: mediaItem.key,
                    thumbnailUrl: mediaItem.thumbnailUrl,
                    altText: mediaItem.altText,
                    title: mediaItem.title,
                    description: mediaItem.description,
                    mimeType: mediaItem.mimeType,
                    fileSize: mediaItem.fileSize
                      ? BigInt(mediaItem.fileSize)
                      : undefined,
                    duration: mediaItem.duration,
                    width: mediaItem.width,
                    height: mediaItem.height,
                    order: mediaItem.order,
                    isActive: mediaItem.isActive,
                  },
                  tx
                );
              }
            }

            if (variant.stock) {
              await this.productRepository.updateStock(
                product.id,
                createdVariant.id,
                BigInt(variant.stock.warehouseId),
                variant.stock.quantity,
                variant.stock.lowStockThreshold || 10,
                "Initial variant stock",
                tx
              );
            }
          }
        }

        return await this.productRepository.findById(product.id, tx);
      });
    } catch (error) {
      console.error("❌ Error in ProductService.createProduct:", error);
      throw error;
    }
  }

  async updateProduct(id: string, data: UpdateProductDTO): Promise<Product> {
    assertNoTemporaryGoogleProductMedia(data);
    const productId = BigInt(id);

    return (await this.prisma.$transaction(async (tx) => {
      const product = await this.productRepository.findById(productId, tx);
      if (!product) {
        throw new NotFoundError("Product not found");
      }

      if (data.categoryId) {
        const category = await this.categoryRepository.findById(
          BigInt(data.categoryId)
        );
        if (!category) {
          throw new NotFoundError("Category not found");
        }
      }

      let slug = product.slug;
      if (data.name && data.name !== product.name) {
        slug = SlugUtil.generateSlug(data.name);
        const existing = await this.productRepository.findBySlug(slug, tx);
        if (existing && existing.id !== productId) {
          throw new ConflictError("Product with this name already exists");
        }
      }

      if (data.sku && data.sku !== product.sku) {
        const existingSku = await this.productRepository.findBySku(data.sku, tx);
        if (existingSku && existingSku.id !== productId) {
          throw new ConflictError(`SKU "${data.sku}" is already in use`);
        }
      }

      const updateData: any = {
        ...(data.name !== undefined && { name: data.name }),
        ...(slug !== product.slug && { slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.categoryId !== undefined && { categoryId: BigInt(data.categoryId) }),
        ...(data.sku !== undefined && { sku: data.sku }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.hsnCode !== undefined && { hsnCode: data.hsnCode }),
        ...(data.artisanName !== undefined && { artisanName: data.artisanName }),
        ...(data.artisanAbout !== undefined && { artisanAbout: data.artisanAbout }),
        ...(data.artisanLocation !== undefined && { artisanLocation: data.artisanLocation }),
        ...(data.allowOutOfStockOrders !== undefined && { allowOutOfStockOrders: data.allowOutOfStockOrders }),
        ...(data.hasVideoConsultation !== undefined && { hasVideoConsultation: data.hasVideoConsultation }),
        ...(data.videoPurchasingEnabled !== undefined && { videoPurchasingEnabled: data.videoPurchasingEnabled }),
        ...(data.videoConsultationNote !== undefined && { videoConsultationNote: data.videoConsultationNote }),
        ...(data.metaTitle !== undefined && { metaTitle: data.metaTitle }),
        ...(data.metaDesc !== undefined && { metaDesc: data.metaDesc }),
        ...(data.schemaMarkup !== undefined && { schemaMarkup: data.schemaMarkup }),
      };

      if (data.basePrice !== undefined) {
        updateData.basePrice = new Decimal(data.basePrice);
      }
      if (data.sellingPrice !== undefined) {
        updateData.sellingPrice = new Decimal(data.sellingPrice);
      }

      let volumetricWeight: number | undefined;
      if (data.weight || data.length || data.breadth || data.height) {
        const weight = data.weight ?? Number(product.weight);
        const length = data.length ?? Number(product.length);
        const breadth = data.breadth ?? Number(product.breadth);
        const height = data.height ?? Number(product.height);
        volumetricWeight = (length * breadth * height) / 5000;
        updateData.weight = weight;
        updateData.length = length;
        updateData.breadth = breadth;
        updateData.height = height;
        updateData.volumetricWeight = volumetricWeight;
      }

      // Handle specifications
      if (data.specifications !== undefined) {
        if (product.specifications?.length) {
          for (const spec of product.specifications) {
            await this.productRepository.deleteSpecification(spec.id, tx);
          }
        }
        for (const spec of data.specifications) {
          await this.productRepository.addSpecification(productId, spec.key, spec.value, tx);
        }
      }

      // Synchronize product media without soft-deleting/recreating every row.
      // Existing media is retained by stable URL/key identity; removed references
      // are soft-deleted, and genuinely new/replaced images get new rows.
      if (data.media !== undefined) {
        const existingMedia = product.media || [];
        const incoming = data.media;
        const retainedIds = new Set<string>();
        const usedExistingIds = new Set<string>();

        for (const mediaItem of incoming) {
          const match = existingMedia.find((existing: any) => {
            const id = String(existing.id);
            if (usedExistingIds.has(id)) return false;
            const sameKey = Boolean(mediaItem.key && existing.key && mediaItem.key === existing.key);
            const sameUrl = Boolean(mediaItem.url && existing.url === mediaItem.url);
            return sameKey || sameUrl;
          });

          const mediaData = {
            type: mediaItem.type || MediaType.IMAGE,
            url: mediaItem.url,
            key: mediaItem.key,
            thumbnailUrl: mediaItem.thumbnailUrl,
            altText: mediaItem.altText,
            title: mediaItem.title,
            description: mediaItem.description,
            mimeType: mediaItem.mimeType,
            fileSize: mediaItem.fileSize ? BigInt(mediaItem.fileSize) : undefined,
            duration: mediaItem.duration,
            width: mediaItem.width,
            height: mediaItem.height,
            order: mediaItem.order ?? 0,
            isActive: mediaItem.isActive ?? true,
          };

          if (match) {
            const id = String(match.id);
            usedExistingIds.add(id);
            retainedIds.add(id);
            await this.productRepository.updateMedia(match.id, mediaData as any, tx);
          } else {
            await this.productRepository.addMedia(productId, mediaData, tx);
          }
        }

        for (const existing of existingMedia) {
          if (!retainedIds.has(String(existing.id)) && !usedExistingIds.has(String(existing.id))) {
            await this.productRepository.deleteMedia(existing.id, tx);
          }
        }
      }

      // Determine target variant state
      const targetIsMulti = data.hasVariants !== undefined
        ? data.hasVariants
        : (data.variants && data.variants.length > 0 ? true : product.hasVariants);

      updateData.hasVariants = targetIsMulti;
      await this.productRepository.update(productId, updateData, tx);

      // Transitions & Variant Handlers:
      if (!product.hasVariants && targetIsMulti) {
        // Simple -> Multi-Variant: delete default variant, create custom variants
        if (product.variants?.length) {
          for (const v of product.variants) {
            await this.productRepository.deleteVariant(v.id, tx);
          }
        }

        if (data.variants?.length) {
          for (const variant of data.variants) {
            const variantSku = variant.sku || this.generateSKU(
              `${data.name || product.name}-${variant.size || ""}-${variant.color || ""}-${
                variant.fabric || ""
              }-${JSON.stringify(variant.attributes || {})}`
            );

            let vVolWeight: number | undefined;
            if (variant.weight && variant.length && variant.breadth && variant.height) {
              vVolWeight = (variant.length * variant.breadth * variant.height) / 5000;
            }

            const createdVariant = await this.productRepository.addVariant({
              productId,
              attributes: variant.attributes,
              size: variant.size,
              color: variant.color,
              fabric: variant.fabric,
              basePrice: variant.basePrice ?? (data.basePrice ?? Number(product.basePrice)),
              sellingPrice: variant.sellingPrice ?? variant.price ?? (data.sellingPrice ?? Number(product.sellingPrice)),
              price: variant.price ?? variant.sellingPrice ?? (data.sellingPrice ?? Number(product.sellingPrice)),
              weight: variant.weight ?? (data.weight ?? (product.weight ? Number(product.weight) : undefined)),
              length: variant.length ?? (data.length ?? (product.length ? Number(product.length) : undefined)),
              breadth: variant.breadth ?? (data.breadth ?? (product.breadth ? Number(product.breadth) : undefined)),
              height: variant.height ?? (data.height ?? (product.height ? Number(product.height) : undefined)),
              volumetricWeight: vVolWeight,
              sku: variantSku,
            }, tx);

            if (variant.media?.length) {
              for (const mediaItem of variant.media) {
                await this.productRepository.addVariantMedia(createdVariant.id, {
                  type: mediaItem.type || MediaType.IMAGE,
                  url: mediaItem.url,
                  key: mediaItem.key,
                  thumbnailUrl: mediaItem.thumbnailUrl,
                  altText: mediaItem.altText,
                  title: mediaItem.title,
                  description: mediaItem.description,
                  mimeType: mediaItem.mimeType,
                  fileSize: mediaItem.fileSize ? BigInt(mediaItem.fileSize) : undefined,
                  duration: mediaItem.duration,
                  width: mediaItem.width,
                  height: mediaItem.height,
                  order: mediaItem.order,
                  isActive: mediaItem.isActive,
                }, tx);
              }
            }

            if (variant.stock) {
              await this.productRepository.updateStock(
                productId,
                createdVariant.id,
                BigInt(variant.stock.warehouseId),
                variant.stock.quantity,
                variant.stock.lowStockThreshold || 10,
                "Updated variant stock",
                tx
              );
            }
          }
        }
      } else if (product.hasVariants && !targetIsMulti) {
        // Multi-Variant -> Simple: delete all custom variants, collapse down to single default variant
        if (product.variants?.length) {
          for (const v of product.variants) {
            await this.productRepository.deleteVariant(v.id, tx);
          }
        }

        const effectiveBasePrice = data.basePrice ?? Number(product.basePrice);
        const effectiveSellingPrice = data.sellingPrice ?? Number(product.sellingPrice);
        const effectiveSku = data.sku ?? product.sku;

        const defaultVariant = await this.productRepository.addVariant({
          productId,
          attributes: { default: "true" },
          basePrice: effectiveBasePrice,
          sellingPrice: effectiveSellingPrice,
          price: effectiveSellingPrice,
          weight: data.weight ?? (product.weight ? Number(product.weight) : undefined),
          length: data.length ?? (product.length ? Number(product.length) : undefined),
          breadth: data.breadth ?? (product.breadth ? Number(product.breadth) : undefined),
          height: data.height ?? (product.height ? Number(product.height) : undefined),
          volumetricWeight: volumetricWeight ?? (product.volumetricWeight ? Number(product.volumetricWeight) : undefined),
          sku: effectiveSku,
        }, tx);

        if (data.stock) {
          await this.productRepository.updateStock(
            productId,
            defaultVariant.id,
            BigInt(data.stock.warehouseId),
            data.stock.quantity,
            data.stock.lowStockThreshold || 10,
            "Updated product stock",
            tx
          );
        }
      } else if (targetIsMulti) {
        // Synchronize by stable variant id first, then SKU. Do not destroy and
        // recreate every variant on each edit: carts/orders/stock/media refer to IDs.
        if (data.variants !== undefined) {
          const matchedVariantIds = new Set<string>();
          const existingVariants = product.variants || [];
          const variantSignature = (variant: any): string => {
            const attributes = variant.attributes && typeof variant.attributes === "object"
              ? Object.fromEntries(Object.entries(variant.attributes).sort(([a], [b]) => a.localeCompare(b)))
              : {};
            return JSON.stringify({
              size: String(variant.size ?? attributes.size ?? attributes.Size ?? "").trim().toLowerCase(),
              color: String(variant.color ?? attributes.color ?? attributes.Color ?? "").trim().toLowerCase(),
              fabric: String(variant.fabric ?? attributes.fabric ?? attributes.Fabric ?? "").trim().toLowerCase(),
              attributes,
            });
          };

          for (const variant of data.variants) {
            const variantSku = variant.sku || this.generateSKU(
              `${data.name || product.name}-${variant.size || ""}-${variant.color || ""}-${variant.fabric || ""}-${JSON.stringify(variant.attributes || {})}`
            );
            const unmatchedVariants = existingVariants.filter(
              (candidate: any) => !matchedVariantIds.has(String(candidate.id)),
            );
            const existingVariant =
              unmatchedVariants.find((candidate: any) =>
                variant.id && String(candidate.id) === String(variant.id),
              ) ||
              unmatchedVariants.find((candidate: any) =>
                Boolean(variantSku && candidate.sku === variantSku),
              ) ||
              unmatchedVariants.find((candidate: any) =>
                variantSignature(candidate) === variantSignature(variant),
              );

            let vVolWeight: number | undefined;
            if (variant.weight && variant.length && variant.breadth && variant.height) {
              vVolWeight = (variant.length * variant.breadth * variant.height) / 5000;
            }

            const variantData = {
              attributes: variant.attributes,
              size: variant.size,
              color: variant.color,
              fabric: variant.fabric,
              basePrice: variant.basePrice ?? (data.basePrice ?? Number(product.basePrice)),
              sellingPrice: variant.sellingPrice ?? variant.price ?? (data.sellingPrice ?? Number(product.sellingPrice)),
              price: variant.price ?? variant.sellingPrice ?? (data.sellingPrice ?? Number(product.sellingPrice)),
              weight: variant.weight ?? (data.weight ?? (product.weight ? Number(product.weight) : undefined)),
              length: variant.length ?? (data.length ?? (product.length ? Number(product.length) : undefined)),
              breadth: variant.breadth ?? (data.breadth ?? (product.breadth ? Number(product.breadth) : undefined)),
              height: variant.height ?? (data.height ?? (product.height ? Number(product.height) : undefined)),
              volumetricWeight: vVolWeight,
              sku: variantSku,
            };

            const savedVariant = existingVariant
              ? await this.productRepository.updateVariant(existingVariant.id, variantData, tx)
              : await this.productRepository.addVariant({ productId, ...variantData }, tx);
            matchedVariantIds.add(String(savedVariant.id));

            // Reconcile variant media by key/URL. Keep unchanged rows and only
            // soft-delete removed references, preserving order and metadata.
            if (variant.media !== undefined) {
              const oldMedia: any[] = existingVariant?.media || [];
              const matchedMediaIds = new Set<string>();
              const usedOldMediaIds = new Set<string>();

              for (let mediaIndex = 0; mediaIndex < variant.media.length; mediaIndex++) {
                const mediaItem = variant.media[mediaIndex];
                const old = oldMedia.find((item: any) => {
                  if (usedOldMediaIds.has(String(item.id))) return false;
                  return Boolean(
                    (mediaItem.key && item.key && mediaItem.key === item.key) ||
                    (mediaItem.url && item.url === mediaItem.url)
                  );
                });
                const mediaData = {
                  type: mediaItem.type || MediaType.IMAGE,
                  url: mediaItem.url,
                  key: mediaItem.key,
                  thumbnailUrl: mediaItem.thumbnailUrl,
                  altText: mediaItem.altText,
                  title: mediaItem.title,
                  description: mediaItem.description,
                  mimeType: mediaItem.mimeType,
                  fileSize: mediaItem.fileSize ? BigInt(mediaItem.fileSize) : undefined,
                  duration: mediaItem.duration,
                  width: mediaItem.width,
                  height: mediaItem.height,
                  order: mediaItem.order ?? mediaIndex,
                  isActive: mediaItem.isActive ?? true,
                };
                if (old) {
                  usedOldMediaIds.add(String(old.id));
                  matchedMediaIds.add(String(old.id));
                  await this.productRepository.updateVariantMedia(old.id, mediaData as any, tx);
                } else {
                  await this.productRepository.addVariantMedia(savedVariant.id, mediaData, tx);
                }
              }

              for (const old of oldMedia) {
                if (!matchedMediaIds.has(String(old.id)) && !usedOldMediaIds.has(String(old.id))) {
                  await this.productRepository.deleteVariantMedia(old.id, tx);
                }
              }
            }

            if (variant.stock) {
              await this.productRepository.updateStock(
                productId,
                savedVariant.id,
                BigInt(variant.stock.warehouseId),
                variant.stock.quantity,
                variant.stock.lowStockThreshold || 10,
                "Updated variant stock",
                tx
              );
            }
          }

          // Preserve variants that were submitted but matched via SKU/id; remove
          // only variants explicitly omitted from the submitted replacement list.
          for (const oldVariant of existingVariants) {
            if (!matchedVariantIds.has(String(oldVariant.id))) {
              await this.productRepository.deleteVariant(oldVariant.id, tx);
            }
          }
        }
      } else {
        // Remaining Simple: Single-variant sync
        let defaultVariant: ProductVariant | undefined = product.variants?.[0];
        const effectiveBasePrice = data.basePrice ?? Number(product.basePrice);
        const effectiveSellingPrice = data.sellingPrice ?? Number(product.sellingPrice);
        const effectiveSku = data.sku ?? product.sku;

        if (defaultVariant) {
          await this.productRepository.updateVariant(defaultVariant.id, {
            basePrice: effectiveBasePrice,
            sellingPrice: effectiveSellingPrice,
            price: effectiveSellingPrice,
            weight: data.weight ?? (product.weight ? Number(product.weight) : undefined),
            length: data.length ?? (product.length ? Number(product.length) : undefined),
            breadth: data.breadth ?? (product.breadth ? Number(product.breadth) : undefined),
            height: data.height ?? (product.height ? Number(product.height) : undefined),
            volumetricWeight: volumetricWeight ?? (product.volumetricWeight ? Number(product.volumetricWeight) : undefined),
            sku: effectiveSku,
          }, tx);
        } else {
          defaultVariant = await this.productRepository.addVariant({
            productId,
            attributes: { default: "true" },
            basePrice: effectiveBasePrice,
            sellingPrice: effectiveSellingPrice,
            price: effectiveSellingPrice,
            weight: data.weight ?? (product.weight ? Number(product.weight) : undefined),
            length: data.length ?? (product.length ? Number(product.length) : undefined),
            breadth: data.breadth ?? (product.breadth ? Number(product.breadth) : undefined),
            height: data.height ?? (product.height ? Number(product.height) : undefined),
            volumetricWeight: volumetricWeight ?? (product.volumetricWeight ? Number(product.volumetricWeight) : undefined),
            sku: effectiveSku,
          }, tx);
        }

        if (data.stock !== undefined) {
          await this.productRepository.updateStock(
            productId,
            defaultVariant.id,
            BigInt(data.stock.warehouseId),
            data.stock.quantity,
            data.stock.lowStockThreshold || 10,
            "Updated product stock",
            tx
          );
        }
      }

      return (await this.productRepository.findById(productId, tx)) as Product;
    })) as Product;
  }

  async patchProduct(id: string, data: PatchProductDTO): Promise<Product> {
    assertNoTemporaryGoogleProductMedia(data);
    const productId = BigInt(id);

    return (await this.prisma.$transaction(async (tx) => {
      const product = await this.productRepository.findById(productId, tx);
      if (!product) {
        throw new NotFoundError("Product not found");
      }

      if (data.categoryId) {
        const category = await this.categoryRepository.findById(
          BigInt(data.categoryId)
        );
        if (!category) {
          throw new NotFoundError("Category not found");
        }
      }

      let slug = product.slug;
      if (data.name && data.name !== product.name) {
        slug = SlugUtil.generateSlug(data.name);
        const existing = await this.productRepository.findBySlug(slug, tx);
        if (existing && existing.id !== productId) {
          throw new ConflictError("Product with this name already exists");
        }
      }

      if (data.sku && data.sku !== product.sku) {
        const existingSku = await this.productRepository.findBySku(data.sku, tx);
        if (existingSku && existingSku.id !== productId) {
          throw new ConflictError(`SKU "${data.sku}" is already in use`);
        }
      }

      // Partial core updates
      const patchData: any = {};
      if (data.name !== undefined) patchData.name = data.name;
      if (slug !== product.slug) patchData.slug = slug;
      if (data.description !== undefined) patchData.description = data.description;
      if (data.categoryId !== undefined) patchData.categoryId = BigInt(data.categoryId);
      if (data.basePrice !== undefined) patchData.basePrice = new Decimal(data.basePrice);
      if (data.sellingPrice !== undefined) patchData.sellingPrice = new Decimal(data.sellingPrice);
      if (data.sku !== undefined) patchData.sku = data.sku;
      if (data.isActive !== undefined) patchData.isActive = data.isActive;
      if (data.hsnCode !== undefined) patchData.hsnCode = data.hsnCode;
      if (data.artisanName !== undefined) patchData.artisanName = data.artisanName;
      if (data.artisanAbout !== undefined) patchData.artisanAbout = data.artisanAbout;
      if (data.artisanLocation !== undefined) patchData.artisanLocation = data.artisanLocation;
      if (data.allowOutOfStockOrders !== undefined) patchData.allowOutOfStockOrders = data.allowOutOfStockOrders;
      if (data.hasVideoConsultation !== undefined) patchData.hasVideoConsultation = data.hasVideoConsultation;
      if (data.videoPurchasingEnabled !== undefined) patchData.videoPurchasingEnabled = data.videoPurchasingEnabled;
      if (data.videoConsultationNote !== undefined) patchData.videoConsultationNote = data.videoConsultationNote;
      if (data.metaTitle !== undefined) patchData.metaTitle = data.metaTitle;
      if (data.metaDesc !== undefined) patchData.metaDesc = data.metaDesc;
      if (data.schemaMarkup !== undefined) patchData.schemaMarkup = data.schemaMarkup;

      let volumetricWeight: number | undefined;
      if (data.weight !== undefined || data.length !== undefined || data.breadth !== undefined || data.height !== undefined) {
        const weight = data.weight ?? Number(product.weight);
        const length = data.length ?? Number(product.length);
        const breadth = data.breadth ?? Number(product.breadth);
        const height = data.height ?? Number(product.height);
        volumetricWeight = (length * breadth * height) / 5000;
        if (data.weight !== undefined) patchData.weight = weight;
        if (data.length !== undefined) patchData.length = length;
        if (data.breadth !== undefined) patchData.breadth = breadth;
        if (data.height !== undefined) patchData.height = height;
        patchData.volumetricWeight = volumetricWeight;
      }

      if (data.hasVariants !== undefined) {
        patchData.hasVariants = data.hasVariants;
      }

      if (Object.keys(patchData).length > 0) {
        await this.productRepository.update(productId, patchData, tx);
      }

      // Specifications update if provided
      if (data.specifications !== undefined) {
        if (product.specifications?.length) {
          for (const s of product.specifications) {
            await this.productRepository.deleteSpecification(s.id, tx);
          }
        }
        for (const spec of data.specifications) {
          if (spec.key && spec.value) {
            await this.productRepository.addSpecification(productId, spec.key, spec.value, tx);
          }
        }
      }

      // Media update if provided
      if (data.media !== undefined) {
        if (product.media?.length) {
          for (const m of product.media) {
            await this.productRepository.deleteMedia(m.id, tx);
          }
        }
        for (const mediaItem of data.media) {
          if (mediaItem.url) {
            await this.productRepository.addMedia(productId, {
              type: mediaItem.type || MediaType.IMAGE,
              url: mediaItem.url,
              key: mediaItem.key,
              thumbnailUrl: mediaItem.thumbnailUrl,
              altText: mediaItem.altText,
              title: mediaItem.title,
              description: mediaItem.description,
              mimeType: mediaItem.mimeType,
              fileSize: mediaItem.fileSize ? BigInt(mediaItem.fileSize) : undefined,
              duration: mediaItem.duration,
              width: mediaItem.width,
              height: mediaItem.height,
              order: mediaItem.order,
              isActive: mediaItem.isActive,
            }, tx);
          }
        }
      }

      // Targeted Variant Updates vs Single-Variant Price Sync
      if (data.variants && data.variants.length > 0) {
        // Targeted variant update by id or append new variants
        for (const v of data.variants) {
          if (v.id) {
            const vId = BigInt(v.id);
            const existingVariant = product.variants?.find((ev) => ev.id === vId);
            if (existingVariant) {
              let vVolWeight: number | undefined;
              if (v.weight || v.length || v.breadth || v.height) {
                const w = v.weight ?? (existingVariant.weight ? Number(existingVariant.weight) : undefined);
                const l = v.length ?? (existingVariant.length ? Number(existingVariant.length) : undefined);
                const b = v.breadth ?? (existingVariant.breadth ? Number(existingVariant.breadth) : undefined);
                const h = v.height ?? (existingVariant.height ? Number(existingVariant.height) : undefined);
                if (l && b && h) {
                  vVolWeight = (l * b * h) / 5000;
                }
              }

              const variantUpdateData: any = {
                ...(v.attributes !== undefined && { attributes: v.attributes }),
                ...(v.size !== undefined && { size: v.size }),
                ...(v.color !== undefined && { color: v.color }),
                ...(v.fabric !== undefined && { fabric: v.fabric }),
                ...(v.basePrice !== undefined && { basePrice: v.basePrice }),
                ...(v.sellingPrice !== undefined && {
                  sellingPrice: v.sellingPrice,
                  price: v.price ?? v.sellingPrice,
                }),
                ...(v.price !== undefined && v.sellingPrice === undefined && {
                  price: v.price,
                  sellingPrice: v.price,
                }),
                ...(v.weight !== undefined && { weight: v.weight }),
                ...(v.length !== undefined && { length: v.length }),
                ...(v.breadth !== undefined && { breadth: v.breadth }),
                ...(v.height !== undefined && { height: v.height }),
                ...(vVolWeight !== undefined && { volumetricWeight: vVolWeight }),
                ...(v.sku !== undefined && { sku: v.sku }),
              };

              await this.productRepository.updateVariant(vId, variantUpdateData, tx);

              if (v.stock && v.stock.warehouseId) {
                await this.productRepository.updateStock(
                  productId,
                  vId,
                  BigInt(v.stock.warehouseId),
                  v.stock.quantity ?? 0,
                  v.stock.lowStockThreshold ?? 10,
                  "PATCH updated variant stock",
                  tx
                );
              }
            }
          } else {
            // New variant added without id
            const variantSku = v.sku || this.generateSKU(
              `${product.name}-${v.size || ""}-${v.color || ""}-${
                v.fabric || ""
              }-${JSON.stringify(v.attributes || {})}`
            );

            let vVolWeight: number | undefined;
            if (v.weight && v.length && v.breadth && v.height) {
              vVolWeight = (v.length * v.breadth * v.height) / 5000;
            }

            const createdVariant = await this.productRepository.addVariant({
              productId,
              attributes: v.attributes,
              size: v.size,
              color: v.color,
              fabric: v.fabric,
              basePrice: v.basePrice ?? (data.basePrice ?? Number(product.basePrice)),
              sellingPrice: v.sellingPrice ?? v.price ?? (data.sellingPrice ?? Number(product.sellingPrice)),
              price: v.price ?? v.sellingPrice ?? (data.sellingPrice ?? Number(product.sellingPrice)),
              weight: v.weight ?? (data.weight ?? (product.weight ? Number(product.weight) : undefined)),
              length: v.length ?? (data.length ?? (product.length ? Number(product.length) : undefined)),
              breadth: v.breadth ?? (data.breadth ?? (product.breadth ? Number(product.breadth) : undefined)),
              height: v.height ?? (data.height ?? (product.height ? Number(product.height) : undefined)),
              volumetricWeight: vVolWeight,
              sku: variantSku,
            }, tx);

            if (v.stock && v.stock.warehouseId) {
              await this.productRepository.updateStock(
                productId,
                createdVariant.id,
                BigInt(v.stock.warehouseId),
                v.stock.quantity ?? 0,
                v.stock.lowStockThreshold ?? 10,
                "PATCH added variant stock",
                tx
              );
            }
          }
        }
      } else if (data.variants === undefined) {
        // Variants untouched: Single-Variant Price Sync for simple product
        const isSimple = !product.hasVariants || (product.variants?.length === 1);
        if (isSimple && product.variants?.length) {
          const defaultVariant = product.variants[0];
          const hasPriceOrDimensionChange =
            data.basePrice !== undefined ||
            data.sellingPrice !== undefined ||
            data.weight !== undefined ||
            data.length !== undefined ||
            data.breadth !== undefined ||
            data.height !== undefined ||
            data.sku !== undefined;

          if (hasPriceOrDimensionChange) {
            await this.productRepository.updateVariant(defaultVariant.id, {
              ...(data.basePrice !== undefined && { basePrice: data.basePrice }),
              ...(data.sellingPrice !== undefined && {
                sellingPrice: data.sellingPrice,
                price: data.sellingPrice,
              }),
              ...(data.weight !== undefined && { weight: data.weight }),
              ...(data.length !== undefined && { length: data.length }),
              ...(data.breadth !== undefined && { breadth: data.breadth }),
              ...(data.height !== undefined && { height: data.height }),
              ...(volumetricWeight !== undefined && { volumetricWeight }),
              ...(data.sku !== undefined && { sku: data.sku }),
            }, tx);
          }

          if (data.stock && data.stock.warehouseId) {
            await this.productRepository.updateStock(
              productId,
              defaultVariant.id,
              BigInt(data.stock.warehouseId),
              data.stock.quantity ?? 0,
              data.stock.lowStockThreshold ?? 10,
              "PATCH updated product stock",
              tx
            );
          }
        }
      }

      // Handle transitions explicitly toggled via data.hasVariants
      if (data.hasVariants !== undefined && data.hasVariants !== product.hasVariants) {
        if (!data.hasVariants && product.variants?.length && product.variants.length > 1) {
          // Collapse multi-variant down to single default variant
          for (const v of product.variants) {
            await this.productRepository.deleteVariant(v.id, tx);
          }
          const defaultVariant = await this.productRepository.addVariant({
            productId,
            attributes: { default: "true" },
            basePrice: data.basePrice ?? Number(product.basePrice),
            sellingPrice: data.sellingPrice ?? Number(product.sellingPrice),
            price: data.sellingPrice ?? Number(product.sellingPrice),
            weight: data.weight ?? (product.weight ? Number(product.weight) : undefined),
            length: data.length ?? (product.length ? Number(product.length) : undefined),
            breadth: data.breadth ?? (product.breadth ? Number(product.breadth) : undefined),
            height: data.height ?? (product.height ? Number(product.height) : undefined),
            volumetricWeight: volumetricWeight ?? (product.volumetricWeight ? Number(product.volumetricWeight) : undefined),
            sku: data.sku ?? product.sku,
          }, tx);

          if (data.stock && data.stock.warehouseId) {
            await this.productRepository.updateStock(
              productId,
              defaultVariant.id,
              BigInt(data.stock.warehouseId),
              data.stock.quantity ?? 0,
              data.stock.lowStockThreshold ?? 10,
              "PATCH collapsed product stock",
              tx
            );
          }
        }
      }

      return (await this.productRepository.findById(productId, tx)) as Product;
    })) as Product;
  }

  async deleteProduct(id: string) {
    const product = await this.productRepository.findById(BigInt(id));
    if (!product) throw new NotFoundError("Product not found");

    // ✅ Collect all S3 URLs before deleting
    const allUrls: string[] = [
      ...(product.media?.map((m) => m.url) ?? []),
      ...(product.variants?.flatMap((v) => 
        (v as any).media?.map((m: any) => m.url) ?? []
      ) ?? []),
    ].filter((url): url is string => Boolean(url) && !isTemporaryGoogleMediaUrl(url));

    // Never treat a Drive proxy / Google thumbnail as an S3 object key.
    // ✅ Delete from S3 (non-fatal — still delete DB record if S3 fails)
    if (allUrls.length > 0) {
      try {
        const keys = allUrls.map((url) => this.s3Service.extractKeyFromUrl(url));
        await this.s3Service.deleteFiles(keys);
        console.log(`🗑️ Deleted ${keys.length} S3 files for product ${id}`);
      } catch (s3Error) {
        console.error("⚠️ S3 cleanup failed (non-fatal):", s3Error);
      }
    }

    await this.productRepository.delete(BigInt(id));
  }

  async getProduct(id: string) {
    const product = await this.productRepository.findById(BigInt(id));
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async getProductBySlug(slug: string) {
    const product = await this.productRepository.findBySlug(slug);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async getProducts(params: {
    page: number;
    limit: number;
    search?: string;
    categorySlug?: string;
    categoryId?: string;
    categoryIds?: string[];
    isActive?: boolean;
    hasVariants?: boolean;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: "createdAt" | "price" | "name" | "popularity";
    sortOrder?: "asc" | "desc";
    color?: string;
    fabric?: string[];
    size?: string;
    artisan?: string;
    inStock?: boolean;
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
        { sku: { contains: params.search, mode: "insensitive" } },
      ];
    }

    let targetCategoryIds: bigint[] | undefined = undefined;

    if (params.categoryIds && params.categoryIds.length > 0) {
      // If explicit categoryIds provided, also include all their descendants
      const allIds = new Set<bigint>();
      for (const idStr of params.categoryIds) {
        try {
          const ids = await this.categoryRepository.getAllDescendantIds(BigInt(idStr));
          ids.forEach((id) => allIds.add(id));
        } catch {
          allIds.add(BigInt(idStr));
        }
      }
      targetCategoryIds = Array.from(allIds);
    } else if (params.categorySlug) {
      // Resolve main category + sub-categories + sub-sub-categories via slug
      const categoryWithDescendants =
        await this.categoryRepository.getCategoryWithDescendants(
          params.categorySlug
        );
      if (categoryWithDescendants) {
        targetCategoryIds = categoryWithDescendants.descendantIds;
      } else {
        targetCategoryIds = [-1n];
      }
    } else if (params.categoryId) {
      // Resolve main category + sub-categories + sub-sub-categories via ID
      const ids = await this.categoryRepository.getAllDescendantIds(
        BigInt(params.categoryId)
      );
      targetCategoryIds = ids;
    }

    if (targetCategoryIds && targetCategoryIds.length > 0) {
      where.categoryId = {
        in: targetCategoryIds,
      };
    } else if (params.categoryId) {
      where.categoryId = BigInt(params.categoryId);
    }

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params.hasVariants !== undefined) {
      where.hasVariants = params.hasVariants;
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      where.sellingPrice = {};
      if (params.minPrice !== undefined) {
        where.sellingPrice.gte = params.minPrice;
      }
      if (params.maxPrice !== undefined) {
        where.sellingPrice.lte = params.maxPrice;
      }
    }

    if (params.color || params.fabric || params.size) {
      where.variants = {
        some: {
          ...(params.color && {
            color: {
              contains: params.color,
              mode: "insensitive",
            },
          }),
          ...(params.fabric && params.fabric.length > 0 &&  {
            fabric: {
              in: params.fabric,
            },
          }),
          ...(params.size && {
            size: {
              contains: params.size,
              mode: "insensitive",
            },
          }),
        },
      };
    }

    if (params.artisan) {
      where.artisanName = {
        contains: params.artisan,
        mode: "insensitive",
      };
    }

    if (params.inStock !== undefined && params.inStock) {
      where.stock = {
        some: {
          quantity: {
            gt: 0,
          },
        },
      };
    }

    const orderBy: any = {};

    if (params.sortBy === "price") {
      orderBy.sellingPrice = params.sortOrder || "asc";
    } else if (params.sortBy === "name") {
      orderBy.name = params.sortOrder || "asc";
    } else if (params.sortBy === "popularity") {
      orderBy.reviews = {
        _count: params.sortOrder || "desc",
      };
    } else {
      orderBy.createdAt = params.sortOrder || "desc";
    }

    const [products, total] = await Promise.all([
      this.productRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.productRepository.count(where),
    ]);

    return {
      products,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }
 
  /**
 * ADMIN: Get products without isActive filter
 */
async getAdminProducts(params: QueryProductDTO & { categoryIds?: string[] }) {
  const skip = (params.page - 1) * params.limit;

  let targetCategoryIds: bigint[] | undefined = undefined;

  if (params.categoryIds && params.categoryIds.length > 0) {
    const allIds = new Set<bigint>();
    for (const idStr of params.categoryIds) {
      try {
        const ids = await this.productRepository.getAllDescendantIdsAdmin(BigInt(idStr));
        ids.forEach((id) => allIds.add(id));
      } catch {
        allIds.add(BigInt(idStr));
      }
    }
    targetCategoryIds = Array.from(allIds);
  } else if (params.categorySlug) {
    const catWithDesc = await this.categoryRepository.getCategoryWithDescendantsAdmin(params.categorySlug);
    if (catWithDesc) {
      targetCategoryIds = catWithDesc.descendantIds;
    } else {
      targetCategoryIds = [-1n];
    }
  } else if (params.categoryId) {
    const ids = await this.productRepository.getAllDescendantIdsAdmin(BigInt(params.categoryId));
    targetCategoryIds = ids;
  }

  const where: Prisma.ProductWhereInput = {
    // Admin can browse all statuses, or filter explicitly by active/inactive.
    ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    ...(params.hasVariants !== undefined ? { hasVariants: params.hasVariants } : {}),
    ...(targetCategoryIds?.length && {
      categoryId: { in: targetCategoryIds },
    }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
        { sku: { contains: params.search, mode: "insensitive" } },
      ],
    }),
  };

  const orderBy: any = {};

  if (params.sortBy === "price") {
    orderBy.sellingPrice = params.sortOrder || "asc";
  } else if (params.sortBy === "name") {
    orderBy.name = params.sortOrder || "asc";
  } else if (params.sortBy === "popularity") {
    orderBy._count = {
      reviews: params.sortOrder || "desc",
    };
  } else {
    orderBy.createdAt = params.sortOrder || "desc";
  }

  const [products, total] = await Promise.all([
    this.productRepository.findAll({
      skip,
      take: params.limit,
      where,
      orderBy,
    }),
    this.productRepository.count(where),
  ]);

  return {
    products,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}

  // Stock methods
  async getStock(productId: string, warehouseId: string, variantId?: string) {
    return this.productRepository.getStock(
      BigInt(productId),
      BigInt(warehouseId),
      variantId ? BigInt(variantId) : null
    );
  }

  async updateStock(
    productId: string,
    variantId: string | null,
    warehouseId: string,
    quantity: number,
    lowStockThreshold: number,
    reason: string
  ) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (product.hasVariants && !variantId) {
      throw new ValidationError(
        "This product has variants. You must specify a variantId."
      );
    }

    if (!product.hasVariants && variantId) {
      throw new ValidationError(
        "This product has no variants. Do not specify a variantId."
      );
    }

    return this.productRepository.updateStock(
      BigInt(productId),
      variantId ? BigInt(variantId) : null,
      BigInt(warehouseId),
      quantity,
      lowStockThreshold,
      reason
    );
  }

  // Specification methods
  async addSpecification(productId: string, key: string, value: string) {
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return this.productRepository.addSpecification(
      BigInt(productId),
      key,
      value
    );
  }

  async updateSpecification(id: string, value: string) {
    return this.productRepository.updateSpecification(BigInt(id), value);
  }

  async deleteSpecification(id: string) {
    await this.productRepository.deleteSpecification(BigInt(id));
  }

  // Product Media methods
  async addMedia(
    productId: string,
    data: {
      type: MediaType;
      url: string;
      key?: string;
      thumbnailUrl?: string;
      altText?: string;
      title?: string;
      description?: string;
      mimeType?: string;
      fileSize?: number;
      duration?: number;
      width?: number;
      height?: number;
      order?: number;
      isActive?: boolean;
    }
  ) {
    assertNoTemporaryGoogleProductMedia({ media: [data] });
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    return this.productRepository.addMedia(BigInt(productId), {
      ...data,
      fileSize: data.fileSize ? BigInt(data.fileSize) : undefined,
    });
  }

  async deleteMedia(id: string) {
    await this.productRepository.deleteMedia(BigInt(id));
  }

  // 🆕 ENHANCED: Variant methods with media, pricing, and dimensions
  async addVariant(
    productId: string,
    data: {
      attributes?: Record<string, any>;
      size?: string;
      color?: string;
      fabric?: string;
      basePrice?: number;
      sellingPrice?: number;
      price: number;
      weight?: number;
      length?: number;
      breadth?: number;
      height?: number;
      media?: Array<{
        type: MediaType;
        url: string;
        key?: string;
        thumbnailUrl?: string;
        altText?: string;
        title?: string;
        description?: string;
        mimeType?: string;
        fileSize?: number;
        duration?: number;
        width?: number;
        height?: number;
        order?: number;
        isActive?: boolean;
      }>;
      stock?: {
        warehouseId: string;
        quantity: number;
        lowStockThreshold?: number;
      };
    }
  ): Promise<ProductVariant> {
    assertNoTemporaryGoogleProductMedia({ variants: [{ media: data.media }] });
    const product = await this.productRepository.findById(BigInt(productId));
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (!product.hasVariants) {
      throw new ValidationError("Cannot add variants to a simple product");
    }

    // Generate variant SKU
    const sku = this.generateSKU(
      `${product.name}-${data.size || ""}-${data.color || ""}-${
        data.fabric || ""
      }-${JSON.stringify(data.attributes || {})}`
    );

    // Calculate variant-specific volumetric weight if dimensions provided
    let volumetricWeight: number | undefined;
    if (data.weight && data.length && data.breadth && data.height) {
      volumetricWeight = (data.length * data.breadth * data.height) / 5000;
    }

    // Create variant
    const variant = await this.productRepository.addVariant({
      productId: BigInt(productId),
      attributes: data.attributes,
      size: data.size,
      color: data.color,
      fabric: data.fabric,
      basePrice: data.basePrice,
      sellingPrice: data.sellingPrice,
      price: data.price,
      weight: data.weight,
      length: data.length,
      breadth: data.breadth,
      height: data.height,
      volumetricWeight,
      sku,
    });

    // Add variant-specific media
    if (data.media?.length) {
      await Promise.all(
        data.media.map((mediaItem: any) =>
          this.productRepository.addVariantMedia(variant.id, {
            type: mediaItem.type || MediaType.IMAGE,
            url: mediaItem.url,
            key: mediaItem.key,
            thumbnailUrl: mediaItem.thumbnailUrl,
            altText: mediaItem.altText,
            title: mediaItem.title,
            description: mediaItem.description,
            mimeType: mediaItem.mimeType,
            fileSize: mediaItem.fileSize
              ? BigInt(mediaItem.fileSize)
              : undefined,
            duration: mediaItem.duration,
            width: mediaItem.width,
            height: mediaItem.height,
            order: mediaItem.order,
            isActive: mediaItem.isActive,
          })
        )
      );
    }

    // Add stock
    if (data.stock) {
      await this.productRepository.updateStock(
        BigInt(productId),
        variant.id,
        BigInt(data.stock.warehouseId),
        data.stock.quantity,
        data.stock.lowStockThreshold || 10,
        "Initial variant stock"
      );
    }

    return variant;
  }

  async updateVariant(
    id: string,
    data: {
      attributes?: Record<string, any>;
      size?: string;
      color?: string;
      fabric?: string;
      basePrice?: number;
      sellingPrice?: number;
      price?: number;
      weight?: number;
      length?: number;
      breadth?: number;
      height?: number;
    }
  ): Promise<ProductVariant> {
    const variant = await this.productRepository.findVariantById(BigInt(id));
    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    // Calculate volumetric weight if dimensions are updated
    let volumetricWeight: number | undefined;
    if (data.weight || data.length || data.breadth || data.height) {
      const weight = data.weight ?? Number(variant.weight);
      const length = data.length ?? Number(variant.length);
      const breadth = data.breadth ?? Number(variant.breadth);
      const height = data.height ?? Number(variant.height);

      if (weight && length && breadth && height) {
        volumetricWeight = (length * breadth * height) / 5000;
      }
    }

    return await this.productRepository.updateVariant(BigInt(id), {
      ...data,
      volumetricWeight,
    });
  }

  async deleteVariant(id: string) {
    await this.productRepository.deleteVariant(BigInt(id));
  }

  async getVariant(id: string): Promise<ProductVariant> {
    const variant = await this.productRepository.findVariantById(BigInt(id));
    if (!variant) {
      throw new NotFoundError("Variant not found");
    }
    return variant;
  }

  // 🆕 Variant Media methods
  async addVariantMedia(
    variantId: string,
    data: {
      type: MediaType;
      url: string;
      key?: string;
      thumbnailUrl?: string;
      altText?: string;
      title?: string;
      description?: string;
      mimeType?: string;
      fileSize?: number;
      duration?: number;
      width?: number;
      height?: number;
      order?: number;
      isActive?: boolean;
    }
  ) {
    assertNoTemporaryGoogleProductMedia({ media: [data] });
    const variant = await this.productRepository.findVariantById(
      BigInt(variantId)
    );
    if (!variant) {
      throw new NotFoundError("Variant not found");
    }

    return this.productRepository.addVariantMedia(BigInt(variantId), {
      ...data,
      fileSize: data.fileSize ? BigInt(data.fileSize) : undefined,
    });
  }

  async deleteVariantMedia(id: string) {
    await this.productRepository.deleteVariantMedia(BigInt(id));
  }


  /**
   * Consolidate existing simple products into one variable product.
   *
   * Existing ProductVariant IDs/SKUs are reused instead of recreating variants.
   * This preserves variant media, stock-adjustment history, cart links and
   * historical OrderItem references. Source products are archived, never deleted.
   */
  async consolidateSimpleProducts(data: {
    parentProductId: string;
    attributeName: "color" | "size" | "fabric" | "style";
    products: Array<{ productId: string; attributeValue: string }>;
  }) {
    const parentId = BigInt(data.parentProductId);
    const ids = data.products.map((item) => BigInt(item.productId));
    if (new Set(ids.map(String)).size !== ids.length) {
      throw new ValidationError("Each product can only be selected once");
    }
    if (!ids.some((id) => id === parentId)) {
      throw new ValidationError("The parent product must be one of the selected products");
    }

    return this.prisma.$transaction(async (tx) => {
      const selected = await tx.product.findMany({
        where: { id: { in: ids } },
        include: {
          variants: { include: { media: true, stock: true }, orderBy: { id: "asc" } },
          media: { orderBy: { order: "asc" } },
          stock: true,
          specifications: true,
        },
      });
      if (selected.length !== ids.length) {
        const found = new Set(selected.map((item) => String(item.id)));
        const missing = data.products.filter((item) => !found.has(item.productId)).map((item) => item.productId);
        throw new NotFoundError(`Product(s) not found: ${missing.join(", ")}`);
      }

      const parent = selected.find((product) => product.id === parentId)!;
      if (!parent.isActive) {
        throw new ValidationError("Activate the parent product before consolidating variants");
      }
      if (selected.some((product) => product.hasVariants)) {
        throw new ValidationError("Only simple products can be consolidated. Remove any variable product from the selection.");
      }
      if (selected.some((product) => !product.isActive)) {
        throw new ValidationError("Only active simple products can be consolidated. Archived or inactive products cannot be selected.");
      }
      if (selected.some((product) => product.categoryId !== parent.categoryId)) {
        throw new ValidationError("All selected products must belong to the same category");
      }
      if (selected.some((product) => product.variants.length !== 1)) {
        throw new ValidationError("Every selected simple product must have exactly one existing default variant. Resolve missing or duplicate default variants first.");
      }

      const values = data.products.map((item) => item.attributeValue.trim().toLocaleLowerCase());
      if (new Set(values).size !== values.length) {
        throw new ValidationError("Variant values must be unique");
      }

      const itemById = new Map(data.products.map((item) => [item.productId, item]));
      const variantByProductId = new Map(
        selected.map((product) => [String(product.id), product.variants[0]]),
      );
      // Keep the parent SKU stable; price fields on the parent represent the
      // lowest variant price so catalog cards can show a useful "from" price.
      const minBasePrice = Math.min(...selected.map((product) => Number(product.basePrice)));
      const minSellingPrice = Math.min(...selected.map((product) => Number(product.sellingPrice)));

      // Turn each existing default variant into a real color/size/fabric/style
      // variant and attach it to the parent product without changing its ID/SKU.
      for (const product of selected) {
        const variant = variantByProductId.get(String(product.id))!;
        const item = itemById.get(String(product.id))!;
        const attributeValue = item.attributeValue.trim();
        const attributes = { [data.attributeName]: attributeValue };
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            productId: parentId,
            attributes: attributes as Prisma.InputJsonValue,
            color: data.attributeName === "color" ? attributeValue : (variant.color ?? undefined),
            size: data.attributeName === "size" ? attributeValue : (variant.size ?? undefined),
            fabric: data.attributeName === "fabric" ? attributeValue : (variant.fabric ?? undefined),
          },
        });
      }

      // Move existing product-level media to variant-level media. Keep the old
      // media rows inactive for audit/history; do not upload duplicate files.
      for (const product of selected) {
        const variant = variantByProductId.get(String(product.id))!;
        for (const media of product.media) {
          await tx.productVariantMedia.create({
            data: {
              variantId: variant.id,
              type: media.type,
              url: media.url,
              key: media.key,
              thumbnailUrl: media.thumbnailUrl,
              altText: media.altText,
              title: media.title,
              description: media.description,
              mimeType: media.mimeType,
              fileSize: media.fileSize,
              duration: media.duration,
              width: media.width,
              height: media.height,
              order: media.order,
              isActive: media.isActive,
            },
          });
        }
        // Keep the retained parent's product-level media active for existing
        // catalog cards/SEO; only archive media on source products.
        if (product.id !== parentId && product.media.length) {
          await tx.productMedia.updateMany({
            where: { productId: product.id },
            data: { isActive: false },
          });
        }
      }

      // Move stock to the retained parent and associate it with the existing
      // variant. If product-level and variant-level stock collide, merge the
      // quantity and re-point stock adjustments before removing the duplicate row.
      for (const product of selected) {
        const variant = variantByProductId.get(String(product.id))!;
        for (const stock of product.stock) {
          const targetVariantId = stock.variantId ?? variant.id;
          const existing = await tx.stock.findFirst({
            where: {
              productId: parentId,
              variantId: targetVariantId,
              warehouseId: stock.warehouseId,
              NOT: { id: stock.id },
            },
          });
          if (existing) {
            await tx.stockAdjustment.updateMany({
              where: { stockId: stock.id },
              data: { stockId: existing.id },
            });
            await tx.stock.update({
              where: { id: existing.id },
              data: {
                quantity: existing.quantity + stock.quantity,
                lowStockThreshold: Math.min(existing.lowStockThreshold, stock.lowStockThreshold),
              },
            });
            await tx.stock.delete({ where: { id: stock.id } });
          } else {
            await tx.stock.update({
              where: { id: stock.id },
              data: { productId: parentId, variantId: targetVariantId },
            });
          }
        }
      }

      // Preserve active cart lines, moving each selected product to its existing
      // variant. Merge quantities if a matching target line already exists.
      for (const product of selected) {
        const variant = variantByProductId.get(String(product.id))!;
        const cartItems = await tx.cartItem.findMany({ where: { productId: product.id } });
        for (const cartItem of cartItems) {
          if (cartItem.productId === parentId && cartItem.variantId === variant.id) continue;
          const duplicate = await tx.cartItem.findFirst({
            where: {
              cartId: cartItem.cartId,
              productId: parentId,
              variantId: variant.id,
              NOT: { id: cartItem.id },
            },
          });
          if (duplicate) {
            await tx.cartItem.update({
              where: { id: duplicate.id },
              data: { quantity: duplicate.quantity + cartItem.quantity },
            });
            await tx.cartItem.delete({ where: { id: cartItem.id } });
          } else {
            await tx.cartItem.update({
              where: { id: cartItem.id },
              data: { productId: parentId, variantId: variant.id },
            });
          }
        }
      }

      // Wishlist has a unique (wishlistId, productId) pair, so avoid duplicates.
      for (const product of selected) {
        if (product.id === parentId) continue;
        const wishlistItems = await tx.wishlistItem.findMany({ where: { productId: product.id } });
        for (const item of wishlistItems) {
          const duplicate = await tx.wishlistItem.findFirst({
            where: { wishlistId: item.wishlistId, productId: parentId },
          });
          if (duplicate) {
            await tx.wishlistItem.delete({ where: { id: item.id } });
          } else {
            await tx.wishlistItem.update({
              where: { id: item.id },
              data: { productId: parentId },
            });
          }
        }
      }

      // Repoint product availability requests while retaining their variant IDs.
      for (const product of selected) {
        await tx.productRequest.updateMany({
          where: { productId: product.id },
          data: {
            productId: parentId,
            variantId: variantByProductId.get(String(product.id))!.id,
          },
        });
      }

      // Keep historical order item productIds unchanged. Their variant IDs still
      // resolve to the retained variant; archived source products remain available
      // for old order details and reports.
      await tx.product.update({
        where: { id: parentId },
        data: {
          hasVariants: true,
          basePrice: minBasePrice,
          sellingPrice: minSellingPrice,
        },
      });
      const sourceIds = ids.filter((id) => id !== parentId);
      if (sourceIds.length) {
        await tx.product.updateMany({
          where: { id: { in: sourceIds } },
          data: { isActive: false },
        });
      }

      const result = await tx.product.findUnique({
        where: { id: parentId },
        include: {
          category: true,
          specifications: true,
          media: { where: { isActive: true }, orderBy: { order: "asc" } },
          stock: true,
          variants: {
            include: {
              media: { where: { isActive: true }, orderBy: { order: "asc" } },
              stock: true,
            },
            orderBy: { id: "asc" },
          },
        },
      });
      return {
        product: result,
        archivedProductIds: sourceIds.map(String),
        variantsCreated: selected.length,
      };
    }, { timeout: 30000 });
  }

  private generateSKU(name: string): string {
    const slug = SlugUtil.generateSlug(name).substring(0, 10).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${slug}-${random}`;
  }
}