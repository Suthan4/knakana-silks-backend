import { Consultation, Prisma } from "@/generated/prisma/client.js";

export type ConsultationWithRelations = Prisma.ConsultationGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        firstName: true;
        lastName: true;
        phone: true;
      };
    };
  };
}>;

export interface IConsultationRepository {
  findById(id: bigint): Promise<ConsultationWithRelations | null>;
  findByUserId(
    userId: bigint,
    params: { skip: number; take: number; where?: any; orderBy?: any }
  ): Promise<ConsultationWithRelations[]>;
  countByUserId(userId: bigint, where?: any): Promise<number>;
  findAll(params: {
    skip: number;
    take: number;
    where?: any;
    orderBy?: any;
  }): Promise<ConsultationWithRelations[]>;
  count(where?: any): Promise<number>;
  create(data: {
    userId: bigint;
    productId?: bigint;
    categoryId?: bigint;
    platform: any;
    preferredDate: Date;
    preferredTime: string;
    status: any;
  }): Promise<Consultation>;
  update(id: bigint, data: Partial<Consultation>): Promise<Consultation>;
}
