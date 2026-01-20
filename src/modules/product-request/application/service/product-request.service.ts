import { injectable, inject } from "tsyringe";
import { IProductRequestRepository } from "../../infrastructure/interface/Iproductrequest.repository.js";
import { IProductRepository } from "@/modules/product/infrastructure/interface/Iproductrepository.js";
import { RequestStatus } from "@/generated/prisma/enums.js";
import { NumberUtil } from "@/shared/utils/index.js";

@injectable()
export class ProductRequestService {
  constructor(
    @inject("IProductRequestRepository")
    private productRequestRepository: IProductRequestRepository,
    @inject("IProductRepository")
    private productRepository: IProductRepository
  ) {}

  async createProductRequest(
    userId: string,
    data: {
      productId: string;
      variantId?: string;
      quantity: number;
      customerNote?: string;
    }
  ) {
    // Validate product exists
    const product = await this.productRepository.findById(BigInt(data.productId));
    if (!product) {
      throw new Error("Product not found");
    }

    // Validate variant if provided
    if (data.variantId) {
      const variant = await this.productRepository.findVariantById(
        BigInt(data.variantId)
      );
      if (!variant) {
        throw new Error("Variant not found");
      }
    }

    // Generate unique request number
    const requestNumber = this.generateRequestNumber();

    return this.productRequestRepository.create({
      userId: BigInt(userId),
      productId: BigInt(data.productId),
      variantId: data.variantId ? BigInt(data.variantId) : undefined,
      quantity: data.quantity,
      customerNote: data.customerNote,
      requestNumber,
    });
  }

  async getUserRequests(
    userId: string,
    params: {
      page: number;
      limit: number;
      status?: RequestStatus;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }
  ) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [requests, total] = await Promise.all([
      this.productRequestRepository.findByUserId(BigInt(userId), {
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.productRequestRepository.countByUserId(BigInt(userId), where),
    ]);

    return {
      requests,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getRequest(userId: string, id: string) {
    const request = await this.productRequestRepository.findById(BigInt(id));

    if (!request) {
      throw new Error("Request not found");
    }

    if (request.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    return request;
  }

  async cancelRequest(userId: string, id: string) {
    const request = await this.productRequestRepository.findById(BigInt(id));

    if (!request) {
      throw new Error("Request not found");
    }

    if (request.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new Error(`Cannot cancel request with status ${request.status}`);
    }

    return this.productRequestRepository.update(BigInt(id), {
      status: RequestStatus.CANCELLED,
    });
  }

  // Admin methods
  async getAllRequests(params: {
    page: number;
    limit: number;
    status?: RequestStatus;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [requests, total] = await Promise.all([
      this.productRequestRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.productRequestRepository.count(where),
    ]);

    return {
      requests,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async approveRequest(
    id: string,
    data: {
      adminNote?: string;
      estimatedAvailability?: string;
    }
  ) {
    const request = await this.productRequestRepository.findById(BigInt(id));

    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new Error(`Cannot approve request with status ${request.status}`);
    }

    return this.productRequestRepository.update(BigInt(id), {
      status: RequestStatus.APPROVED,
      adminNote: data.adminNote,
      estimatedAvailability: data.estimatedAvailability
        ? new Date(data.estimatedAvailability)
        : undefined,
      approvedAt: new Date(),
    });
  }

  async rejectRequest(id: string, adminNote: string) {
    const request = await this.productRequestRepository.findById(BigInt(id));

    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new Error(`Cannot reject request with status ${request.status}`);
    }

    return this.productRequestRepository.update(BigInt(id), {
      status: RequestStatus.REJECTED,
      adminNote,
    });
  }

  async fulfillRequest(id: string, orderId: string) {
    const request = await this.productRequestRepository.findById(BigInt(id));

    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== RequestStatus.APPROVED) {
      throw new Error("Only approved requests can be fulfilled");
    }

    return this.productRequestRepository.update(BigInt(id), {
      status: RequestStatus.FULFILLED,
      orderId: BigInt(orderId),
      fulfilledAt: new Date(),
    });
  }

  private generateRequestNumber(): string {
    return `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}