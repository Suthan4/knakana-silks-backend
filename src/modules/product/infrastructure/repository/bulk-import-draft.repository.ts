import { injectable, inject } from "tsyringe";
import { PrismaClient } from "@/generated/prisma/client.js";
import { DraftStatus as PrismaDraftStatus } from "@/generated/prisma/enums.js";
import type {
  CreateBulkImportDraftDto,
  UpdateBulkImportDraftDto,
} from "../../application/bulk/dto/bulk-import-draft.dto.js";

export interface DraftRecord {
  id: string;
  userId: bigint;
  rawInput: string;
  parsedData: any;
  imageMatches: any;
  confirmedAssignments: any;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toPrismaDraftStatus(status?: string): PrismaDraftStatus {
  if (!status) return PrismaDraftStatus.DRAFT;
  if (status === "COMPLETED" || status === "IMPORTED") return PrismaDraftStatus.COMPLETED;
  if (status === "FAILED") return PrismaDraftStatus.FAILED;
  if (status === "READY_FOR_IMPORT" || status === "VALIDATED" || status === "MATCHED") {
    return PrismaDraftStatus.READY_FOR_IMPORT;
  }
  return PrismaDraftStatus.DRAFT;
}

/**
 * Thin persistence wrapper for BulkImportDraft.
 * All ownership checks are the responsibility of the service layer.
 */
@injectable()
export class BulkImportDraftRepository {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  async create(userId: bigint, dto: CreateBulkImportDraftDto): Promise<DraftRecord> {
    const created = await this.prisma.bulkImportDraft.create({
      data: {
        userId,
        rawInput: dto.rawInput,
        parsedData: undefined,
        imageMatches: undefined,
        confirmedAssignments: undefined,
        status: PrismaDraftStatus.DRAFT,
      },
    });

    return {
      ...created,
      id: created.id.toString(),
    };
  }

  async findById(id: string): Promise<DraftRecord | null> {
    try {
      const draft = await this.prisma.bulkImportDraft.findUnique({
        where: { id: BigInt(id) },
      });
      if (!draft) return null;
      return {
        ...draft,
        id: draft.id.toString(),
      };
    } catch {
      return null;
    }
  }

  async findAllByUser(userId: bigint): Promise<DraftRecord[]> {
    const drafts = await this.prisma.bulkImportDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return drafts.map((d) => ({
      ...d,
      id: d.id.toString(),
    }));
  }

  async update(
    id: string,
    data: Partial<UpdateBulkImportDraftDto & { status: string }>
  ): Promise<DraftRecord> {
    const updated = await this.prisma.bulkImportDraft.update({
      where: { id: BigInt(id) },
      data: {
        ...(data.rawInput !== undefined && { rawInput: data.rawInput }),
        ...(data.parsedData !== undefined && { parsedData: data.parsedData }),
        ...(data.imageMatches !== undefined && { imageMatches: data.imageMatches }),
        ...(data.confirmedAssignments !== undefined && {
          confirmedAssignments: data.confirmedAssignments,
        }),
        ...(data.status !== undefined && {
          status: toPrismaDraftStatus(data.status),
        }),
      },
    });

    return {
      ...updated,
      id: updated.id.toString(),
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.bulkImportDraft.delete({
      where: { id: BigInt(id) },
    });
  }
}
