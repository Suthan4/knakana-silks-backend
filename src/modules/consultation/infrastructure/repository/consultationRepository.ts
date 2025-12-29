import { inject, injectable } from "tsyringe";
import { Consultation, PrismaClient } from "@/generated/prisma/client.js";
import {
  IConsultationRepository,
  ConsultationWithRelations,
} from "../interface/Iconsultationrepository.js";

@injectable()
export class ConsultationRepository implements IConsultationRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async findById(id: bigint): Promise<ConsultationWithRelations | null> {
    return this.prisma.consultation.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  async findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ConsultationWithRelations[]> {
    return this.prisma.consultation.findMany({
      where: { userId, ...params.where },
      skip: params.skip,
      take: params.take,
      orderBy: params.orderBy,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  async countByUserId(userId: bigint, where?: any): Promise<number> {
    return this.prisma.consultation.count({
      where: { userId, ...where },
    });
  }

  async findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ConsultationWithRelations[]> {
    return this.prisma.consultation.findMany({
      skip: params.skip,
      take: params.take,
      where: params.where,
      orderBy: params.orderBy,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  async count(where?: any): Promise<number> {
    return this.prisma.consultation.count({ where });
  }

  async create(data: {
    userId: bigint;
    productId?: bigint;
    categoryId?: bigint;
    platform: any;
    preferredDate: Date;
    preferredTime: string;
    status: any;
  }): Promise<Consultation> {
    return this.prisma.consultation.create({
      data,
    });
  }

  async update(id: bigint, data: Partial<Consultation>): Promise<Consultation> {
    return this.prisma.consultation.update({
      where: { id },
      data,
    });
  }
}
