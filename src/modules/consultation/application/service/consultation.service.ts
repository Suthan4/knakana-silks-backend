import { injectable, inject } from "tsyringe";
import {
  ConsultationPlatform,
  ConsultationStatus,
} from "@/generated/prisma/enums.js";
import { IConsultationRepository } from "../../infrastructure/interface/Iconsultationrepository.js";

@injectable()
export class ConsultationService {
  constructor(
    @inject("IConsultationRepository")
    private consultationRepository: IConsultationRepository
  ) {}

  async createConsultation(
    userId: string,
    data: {
      productId?: string;
      categoryId?: string;
      platform: ConsultationPlatform;
      preferredDate: string;
      preferredTime: string;
    }
  ) {
    const preferredDateTime = new Date(data.preferredDate);

    // Validate date is in future
    if (preferredDateTime < new Date()) {
      throw new Error("Consultation date must be in the future");
    }

    return this.consultationRepository.create({
      userId: BigInt(userId),
      productId: data.productId ? BigInt(data.productId) : undefined,
      categoryId: data.categoryId ? BigInt(data.categoryId) : undefined,
      platform: data.platform,
      preferredDate: preferredDateTime,
      preferredTime: data.preferredTime,
      status: ConsultationStatus.REQUESTED,
    });
  }

  async updateConsultationStatus(
    id: string,
    data: {
      status: ConsultationStatus;
      meetingLink?: string;
      rejectionReason?: string;
      approvedBy?: string;
    }
  ) {
    const consultationId = BigInt(id);
    const consultation = await this.consultationRepository.findById(
      consultationId
    );

    if (!consultation) {
      throw new Error("Consultation not found");
    }

    // Validate status transitions
    if (
      consultation.status === ConsultationStatus.COMPLETED ||
      consultation.status === ConsultationStatus.CANCELLED
    ) {
      throw new Error(
        `Cannot update consultation with status ${consultation.status}`
      );
    }

    const updateData: any = {
      status: data.status,
    };

    if (data.status === ConsultationStatus.APPROVED) {
      if (!data.meetingLink) {
        throw new Error("Meeting link is required for approval");
      }
      updateData.meetingLink = data.meetingLink;
      updateData.approvedBy = data.approvedBy;
    }

    if (data.status === ConsultationStatus.REJECTED) {
      if (!data.rejectionReason) {
        throw new Error("Rejection reason is required");
      }
      updateData.rejectionReason = data.rejectionReason;
    }

    return this.consultationRepository.update(consultationId, updateData);
  }

  async cancelConsultation(userId: string, id: string) {
    const consultationId = BigInt(id);
    const consultation = await this.consultationRepository.findById(
      consultationId
    );

    if (!consultation) {
      throw new Error("Consultation not found");
    }

    // Verify user owns the consultation
    if (consultation.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    // Can only cancel if status is REQUESTED or APPROVED
    if (
      consultation.status !== ConsultationStatus.REQUESTED &&
      consultation.status !== ConsultationStatus.APPROVED
    ) {
      throw new Error(
        `Cannot cancel consultation with status ${consultation.status}`
      );
    }

    return this.consultationRepository.update(consultationId, {
      status: ConsultationStatus.CANCELLED,
    });
  }

  async getConsultation(userId: string, id: string) {
    const consultation = await this.consultationRepository.findById(BigInt(id));

    if (!consultation) {
      throw new Error("Consultation not found");
    }

    // Verify user owns the consultation
    if (consultation.userId !== BigInt(userId)) {
      throw new Error("Unauthorized");
    }

    return consultation;
  }

  async getUserConsultations(
    userId: string,
    params: {
      page: number;
      limit: number;
      status?: ConsultationStatus;
      platform?: ConsultationPlatform;
      startDate?: string;
      endDate?: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }
  ) {
    const skip = (params.page - 1) * params.limit;
    const where: any = { userId: BigInt(userId) };

    if (params.status) {
      where.status = params.status;
    }

    if (params.platform) {
      where.platform = params.platform;
    }

    if (params.startDate || params.endDate) {
      where.preferredDate = {};
      if (params.startDate) {
        where.preferredDate.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.preferredDate.lte = new Date(params.endDate);
      }
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [consultations, total] = await Promise.all([
      this.consultationRepository.findByUserId(BigInt(userId), {
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.consultationRepository.countByUserId(BigInt(userId), where),
    ]);

    return {
      consultations,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  // Admin methods
  async getAllConsultations(params: {
    page: number;
    limit: number;
    status?: ConsultationStatus;
    platform?: ConsultationPlatform;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const skip = (params.page - 1) * params.limit;
    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.platform) {
      where.platform = params.platform;
    }

    if (params.startDate || params.endDate) {
      where.preferredDate = {};
      if (params.startDate) {
        where.preferredDate.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.preferredDate.lte = new Date(params.endDate);
      }
    }

    const orderBy: any = {};
    orderBy[params.sortBy || "createdAt"] = params.sortOrder || "desc";

    const [consultations, total] = await Promise.all([
      this.consultationRepository.findAll({
        skip,
        take: params.limit,
        where,
        orderBy,
      }),
      this.consultationRepository.count(where),
    ]);

    return {
      consultations,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getAdminConsultation(id: string) {
    const consultation = await this.consultationRepository.findById(BigInt(id));
    if (!consultation) {
      throw new Error("Consultation not found");
    }
    return consultation;
  }
}
