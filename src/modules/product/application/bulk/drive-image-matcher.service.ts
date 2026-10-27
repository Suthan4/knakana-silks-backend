
import { injectable, inject } from "tsyringe";
import { DriveService } from "@/modules/media/infrastructure/drive.service.js";
import type { BulkParsedMedia } from "./bulk-product.dto.js";

export interface DriveFileRef {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
  thumbnailLink?: string;
}

export interface MatchedEntry {
  reference: string;
  file: DriveFileRef;
  mediaIndex: number;
  productGroupId?: string;
  variantSku?: string;
}

export interface MissingEntry {
  reference: string;
  mediaIndex: number;
  productGroupId?: string;
  variantSku?: string;
}

export interface AmbiguousEntry {
  reference: string;
  candidates: DriveFileRef[];
  mediaIndex: number;
  productGroupId?: string;
  variantSku?: string;
}

export interface DuplicateEntry {
  reference: string;
  occurrences: number[];
  file?: DriveFileRef;
}

export interface ImageMatchResult {
  matched: MatchedEntry[];
  missing: MissingEntry[];
  ambiguous: AmbiguousEntry[];
  duplicates: DuplicateEntry[];
  folderFileCount: number;
}

interface NormalizedMediaRef {
  key: string;
  candidates: string[];
  idx: number;
  media: BulkParsedMedia;
}

@injectable()
export class DriveImageMatcherService {
  constructor(
    @inject(DriveService)
    private readonly driveService: DriveService
  ) {}

  async match(
    userId: string,
    folderId: string,
    mediaRefs: BulkParsedMedia[],
    confirmedAssignments: Record<string, string> = {}
  ): Promise<ImageMatchResult> {
    if (!folderId?.trim()) {
      throw new Error("Google Drive folder ID is required.");
    }

    if (!Array.isArray(mediaRefs)) {
      throw new Error("Media references must be an array.");
    }

    let driveFiles: Array<{
      id: string;
      name: string;
      mimeType: string;
      thumbnailLink?: string;
    }>;

    try {
      driveFiles = await this.driveService.listFolderFiles(
        userId,
        folderId.trim()
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown Drive error";

      throw new Error(`Drive folder listing failed: ${message}`);
    }

    const byExactName = new Map<string, DriveFileRef[]>();
    const byBaseName = new Map<string, DriveFileRef[]>();
    const byNormalized = new Map<string, DriveFileRef[]>();
    const fileById = new Map<string, DriveFileRef>();

    for (const driveFile of driveFiles) {
      if (!driveFile.id || !driveFile.name) continue;

      const file: DriveFileRef = {
        id: driveFile.id,
        name: driveFile.name,
        mimeType: driveFile.mimeType || "application/octet-stream",
        previewUrl: `/api/products/bulk/drive-proxy/${encodeURIComponent(
          driveFile.id
        )}`,
        thumbnailLink: driveFile.thumbnailLink || undefined,
      };

      fileById.set(file.id, file);

      addToMap(byExactName, normalize(file.name), file);

      const baseName = stripExtension(file.name);
      addToMap(byBaseName, normalize(baseName), file);
      addToMap(byNormalized, normalizeZeros(baseName), file);
    }

    const refs: NormalizedMediaRef[] = mediaRefs.map((media, idx) => {
      const candidates = extractCandidates(media);
      return {
        key: candidates[0] || "",
        candidates,
        idx,
        media,
      };
    });

    const occurrences = new Map<string, number[]>();

    for (const ref of refs) {
      if (!ref.key) continue;

      const duplicateKey = normalize(ref.key);
      const indices = occurrences.get(duplicateKey) || [];

      indices.push(ref.idx);
      occurrences.set(duplicateKey, indices);
    }

    const duplicates: DuplicateEntry[] = [];

    for (const [key, indices] of occurrences) {
      if (indices.length < 2) continue;

      const candidates = findCandidates(
        refs.find((ref) => ref.idx === indices[0])?.candidates || [],
        byExactName,
        byBaseName,
        byNormalized
      );

      duplicates.push({
        reference: refs.find((ref) => ref.idx === indices[0])?.key || key,
        occurrences: indices,
        file: candidates.length === 1 ? candidates[0] : undefined,
      });
    }

    const matched: MatchedEntry[] = [];
    const missing: MissingEntry[] = [];
    const ambiguous: AmbiguousEntry[] = [];

    for (const ref of refs) {
      const { idx, media } = ref;
      const reference = ref.key;

      // Preserve an administrator's confirmed assignment when the file
      // still exists in the selected Drive folder.
      const confirmedFileId =
        confirmedAssignments[String(idx)] ||
        confirmedAssignments[reference] ||
        confirmedAssignments[normalize(reference)];

      const confirmedFile = confirmedFileId
        ? fileById.get(confirmedFileId)
        : undefined;

      if (confirmedFile) {
        matched.push({
          reference,
          file: confirmedFile,
          mediaIndex: idx,
          productGroupId: media.productGroupId,
          variantSku: media.variantSku,
        });
        continue;
      }

      if (ref.candidates.length === 0) {
        missing.push({
          reference: "",
          mediaIndex: idx,
          productGroupId: media.productGroupId,
          variantSku: media.variantSku,
        });
        continue;
      }

      // A direct Drive file ID is the most reliable reference.
      let candidates: DriveFileRef[] = [];

      for (const candidate of ref.candidates) {
        const byId = fileById.get(candidate);

        if (byId) {
          candidates = [byId];
          break;
        }
      }

      if (candidates.length === 0) {
        candidates = findCandidates(
          ref.candidates,
          byExactName,
          byBaseName,
          byNormalized
        );
      }

      if (candidates.length === 0) {
        missing.push({
          reference,
          mediaIndex: idx,
          productGroupId: media.productGroupId,
          variantSku: media.variantSku,
        });
        continue;
      }

      if (candidates.length > 1) {
        ambiguous.push({
          reference,
          candidates,
          mediaIndex: idx,
          productGroupId: media.productGroupId,
          variantSku: media.variantSku,
        });
        continue;
      }

      matched.push({
        reference,
        file: candidates[0],
        mediaIndex: idx,
        productGroupId: media.productGroupId,
        variantSku: media.variantSku,
      });
    }

    return {
      matched,
      missing,
      ambiguous,
      duplicates,
      folderFileCount: driveFiles.length,
    };
  }
}

function addToMap(
  map: Map<string, DriveFileRef[]>,
  key: string,
  file: DriveFileRef
): void {
  if (!key) return;

  const files = map.get(key) || [];

  if (!files.some((existing) => existing.id === file.id)) {
    files.push(file);
  }

  map.set(key, files);
}

function normalize(value: string): string {
  return decodeSafely(value)
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("en-US");
}

function stripExtension(value: string): string {
  const lastSlash = Math.max(
    value.lastIndexOf("/"),
    value.lastIndexOf("\\")
  );
  const filename = value.slice(lastSlash + 1);
  const lastDot = filename.lastIndexOf(".");

  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

function normalizeZeros(value: string): string {
  return normalize(value).replace(/(^|[^\d])0+(\d+)/g, "$1$2");
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Convert a URL, S3 key, filename, or Drive reference into a comparable
 * filename/identifier. For Drive share URLs, prefer the actual file ID.
 */
export function extractRef(value: string): string {
  if (!value?.trim()) return "";

  const raw = value.trim();

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();

    if (
      host === "drive.google.com" ||
      host === "docs.google.com"
    ) {
      const queryId = parsed.searchParams.get("id");

      if (queryId) return queryId;

      const pathMatch = parsed.pathname.match(
        /\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([^/]+)/
      );

      if (pathMatch?.[1]) return decodeSafely(pathMatch[1]);
    }

    const pathname = decodeSafely(parsed.pathname);
    return pathname.substring(pathname.lastIndexOf("/") + 1);
  } catch {
    const clean = raw.split(/[?#]/, 1)[0];
    const parts = clean.split(/[/\\]/);

    return decodeSafely(parts[parts.length - 1] || clean);
  }
}

/**
 * Prioritize key and URL references. Alt text/title are fallback identifiers,
 * not substitutes for a valid filename when one is already available.
 */
function extractCandidates(media: BulkParsedMedia): string[] {
  const values = [
    media.key,
    media.url,
    media.altText,
    media.title,
  ];

  const candidates: string[] = [];

  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;

    const extracted = extractRef(value);

    if (
      extracted &&
      !candidates.some(
        (candidate) => normalize(candidate) === normalize(extracted)
      )
    ) {
      candidates.push(extracted);
    }
  }

  return candidates;
}

function findCandidates(
  references: string[],
  byExactName: Map<string, DriveFileRef[]>,
  byBaseName: Map<string, DriveFileRef[]>,
  byNormalized: Map<string, DriveFileRef[]>
): DriveFileRef[] {
  for (const reference of references) {
    const exactKey = normalize(reference);
    const baseKey = normalize(stripExtension(reference));
    const normalizedKey = normalizeZeros(stripExtension(reference));

    const candidates =
      byExactName.get(exactKey) ||
      byBaseName.get(baseKey) ||
      byNormalized.get(normalizedKey);

    if (candidates?.length) {
      // Do not combine lower-priority matches with an exact match.
      return [...candidates];
    }
  }

  return [];
}
