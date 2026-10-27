
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

export interface ImageMatchDiagnostics {
  receivedReferenceCount: number;
  usableReferenceCount: number;
  indexedDriveFileCount: number;
  imageFileCount: number;
  sampleReferences: string[];
  sampleDriveFileNames: string[];
  sampleNormalizedReferences: string[];
  sampleNormalizedDriveNames: string[];
}

export interface ImageMatchResult {
  matched: MatchedEntry[];
  missing: MissingEntry[];
  ambiguous: AmbiguousEntry[];
  duplicates: DuplicateEntry[];
  folderFileCount: number;
  diagnostics: ImageMatchDiagnostics;
}

interface NormalizedMediaRef {
  key: string;
  candidates: string[];
  idx: number;
  media: BulkParsedMedia;
}

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "avif",
  "heic",
  "heif",
]);

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

    const driveFiles = await this.driveService.listFolderFiles(
      userId,
      folderId.trim()
    );

    const fileById = new Map<string, DriveFileRef>();

    // Map both full names and extensionless names to Drive files.
    const byFilename = new Map<string, DriveFileRef[]>();
    const byNormalizedFilename = new Map<string, DriveFileRef[]>();

    let imageFileCount = 0;

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

      const isImage =
        file.mimeType.startsWith("image/") ||
        IMAGE_EXTENSIONS.has(getExtension(file.name));

      if (isImage) imageFileCount++;

      const fullNameKey = normalizeFilename(file.name);
      const stemKey = normalizeFilename(removeImageExtension(file.name));

      addToMap(byFilename, fullNameKey, file);
      addToMap(byFilename, stemKey, file);

      // Secondary lookup handles harmless spaces, hyphens and underscores.
      addToMap(
        byNormalizedFilename,
        normalizeFilenameLoose(file.name),
        file
      );
      addToMap(
        byNormalizedFilename,
        normalizeFilenameLoose(removeImageExtension(file.name)),
        file
      );
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

      const duplicateKey = normalizeFilename(ref.key);
      const indices = occurrences.get(duplicateKey) || [];

      indices.push(ref.idx);
      occurrences.set(duplicateKey, indices);
    }

    const duplicates: DuplicateEntry[] = [];

    for (const [key, indices] of occurrences) {
      if (indices.length < 2) continue;

      const firstRef = refs.find((ref) => ref.idx === indices[0]);
      const candidates = firstRef
        ? findCandidates(
            firstRef.candidates,
            fileById,
            byFilename,
            byNormalizedFilename
          )
        : [];

      duplicates.push({
        reference: firstRef?.key || key,
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

      const confirmedFileId =
        confirmedAssignments[String(idx)] ||
        confirmedAssignments[reference] ||
        confirmedAssignments[normalizeFilename(reference)];

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

      const candidates = findCandidates(
        ref.candidates,
        fileById,
        byFilename,
        byNormalizedFilename
      );

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

    const diagnostics: ImageMatchDiagnostics = {
      receivedReferenceCount: mediaRefs.length,
      usableReferenceCount: refs.filter((ref) => ref.candidates.length > 0)
        .length,
      indexedDriveFileCount: fileById.size,
      imageFileCount,
      sampleReferences: refs
        .map((ref) => ref.key)
        .filter(Boolean)
        .slice(0, 10),
      sampleDriveFileNames: [...fileById.values()]
        .slice(0, 15)
        .map((file) => file.name),
      sampleNormalizedReferences: refs
        .map((ref) => ref.key)
        .filter(Boolean)
        .slice(0, 10)
        .map(normalizeFilename),
      sampleNormalizedDriveNames: [...fileById.values()]
        .slice(0, 15)
        .map((file) => normalizeFilename(removeImageExtension(file.name))),
    };

    // Safe diagnostics only: never log OAuth tokens or credentials.
    console.info("[DriveImageMatcher] Matching summary", {
      folderFileCount: driveFiles.length,
      matched: matched.length,
      missing: missing.length,
      ambiguous: ambiguous.length,
      diagnostics,
    });

    return {
      matched,
      missing,
      ambiguous,
      duplicates,
      folderFileCount: driveFiles.length,
      diagnostics,
    };
  }
}

function addToMap(
  map: Map<string, DriveFileRef[]>,
  key: string,
  file: DriveFileRef
): void {
  if (!key) return;

  const existing = map.get(key) || [];

  if (!existing.some((item) => item.id === file.id)) {
    existing.push(file);
  }

  map.set(key, existing);
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getBasename(value: string): string {
  const decoded = decodeSafely(value.trim());
  const clean = decoded.split(/[?#]/, 1)[0];
  const lastSlash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));

  return clean.slice(lastSlash + 1).trim().replace(/^["']|["']$/g, "");
}

function getExtension(value: string): string {
  const filename = getBasename(value);
  const dot = filename.lastIndexOf(".");

  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

function removeImageExtension(value: string): string {
  const filename = getBasename(value);
  const extension = getExtension(filename);

  if (!IMAGE_EXTENSIONS.has(extension)) return filename;

  return filename.slice(0, -(extension.length + 1));
}

function normalizeFilename(value: string): string {
  const normalized = removeImageExtension(value)
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US");

  // Some product-photo references use the letter "O" where the camera filename
  // uses the digit "0" (for example, NAVO2845 in product JSON vs NAV02845.JPG
  // in Drive). Canonicalize only compact camera-style identifiers so unrelated
  // names are not broadly rewritten and accidental collisions are minimized.
  const cameraReference = normalized.match(/^([a-z]{2,5})[o0](\\d{4,})$/);
  if (cameraReference) {
    return `${cameraReference[1]}0${cameraReference[2]}`;
  }

  return normalized;
}

function normalizeFilenameLoose(value: string): string {
  return normalizeFilename(value).replace(/[\s_-]+/g, "");
}

export function extractRef(value: string): string {
  if (!value?.trim()) return "";

  const raw = value.trim();

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();

    if (host === "drive.google.com" || host === "docs.google.com") {
      const queryId = parsed.searchParams.get("id");
      if (queryId) return queryId;

      const pathMatch = parsed.pathname.match(
        /\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([^/]+)/
      );

      if (pathMatch?.[1]) return decodeSafely(pathMatch[1]);
    }

    return getBasename(parsed.pathname);
  } catch {
    return getBasename(raw);
  }
}

function extractCandidates(media: BulkParsedMedia): string[] {
  const values = [media.key, media.url, media.altText, media.title];
  const candidates: string[] = [];

  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;

    const extracted = extractRef(value);

    if (
      extracted &&
      !candidates.some(
        (candidate) =>
          normalizeFilename(candidate) === normalizeFilename(extracted)
      )
    ) {
      candidates.push(extracted);
    }
  }

  return candidates;
}

function findCandidates(
  references: string[],
  fileById: Map<string, DriveFileRef>,
  byFilename: Map<string, DriveFileRef[]>,
  byNormalizedFilename: Map<string, DriveFileRef[]>
): DriveFileRef[] {
  for (const reference of references) {
    // A reference can be a direct Google Drive file ID.
    const directFile = fileById.get(reference);
    if (directFile) return [directFile];

    const keys = [
      normalizeFilename(reference),
      normalizeFilenameLoose(reference),
    ];

    for (const key of keys) {
      const exact = byFilename.get(key);

      if (exact?.length) {
        return uniqueFiles(exact);
      }
    }

    const loose = byNormalizedFilename.get(
      normalizeFilenameLoose(reference)
    );

    if (loose?.length) {
      return uniqueFiles(loose);
    }
  }

  return [];
}

function uniqueFiles(files: DriveFileRef[]): DriveFileRef[] {
  return [...new Map(files.map((file) => [file.id, file])).values()];
}
