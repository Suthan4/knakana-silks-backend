import crypto from "crypto";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { injectable, inject } from "tsyringe";
import { PrismaClient } from "@/generated/prisma/client.js";
import { Response } from "express";
import { AppError } from "@/shared/utils/errors.js";

/**
 * Google Drive service for bulk import and image matching.
 * OAuth tokens are loaded per user from DriveOAuth.
 */
@injectable()
export class DriveService {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

  /**
   * Helper to determine correct OAuth redirect URI dynamically based on environment/request host.
   */
  getRedirectUri(host: string): string {
    const normalizedHost = (host || "").trim().toLowerCase();

    // QA environment
    if (
      normalizedHost.includes("qa.admin.kankanasilks.com") ||
      normalizedHost.includes("qa.api.kankanasilks.com") ||
      normalizedHost.startsWith("qa.")
    ) {
      return (
        process.env.GOOGLE_REDIRECT_URI_QA ||
        "https://qa.api.kankanasilks.com/api/auth/google/callback"
      );
    }

    // Production environment
    if (
      normalizedHost.includes("admin.kankanasilks.com") ||
      normalizedHost.includes("api.kankanasilks.com") ||
      normalizedHost.includes("kankanasilks.com")
    ) {
      return (
        process.env.GOOGLE_REDIRECT_URI_PROD ||
        "https://api.kankanasilks.com/api/auth/google/callback"
      );
    }

    // Local development
    if (
      normalizedHost.includes("localhost") ||
      normalizedHost.includes("127.0.0.1")
    ) {
      const port = process.env.PORT || "3000";
      const cleanHost = normalizedHost.includes(":")
        ? normalizedHost
        : `${normalizedHost}:${port}`;
      return `http://${cleanHost}/api/auth/google/callback`;
    }

    // Fallback to configured redirect URI or default local redirect URI
    return (
      process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:3000/api/auth/google/callback"
    );
  }

  /**
   * Helper to determine correct frontend URL at designated bulk upload view.
   */
  getFrontendBulkUploadUrl(
    host: string,
    queryParams?: Record<string, string>
  ): string {
    const normalizedHost = (host || "").trim().toLowerCase();
    let baseUrl: string;

    if (
      normalizedHost.includes("qa.admin.kankanasilks.com") ||
      normalizedHost.includes("qa.api.kankanasilks.com") ||
      normalizedHost.startsWith("qa.")
    ) {
      baseUrl =
        process.env.QA_FRONTEND_URL || "https://qa.admin.kankanasilks.com";
    } else if (
      normalizedHost.includes("admin.kankanasilks.com") ||
      normalizedHost.includes("api.kankanasilks.com") ||
      normalizedHost.includes("kankanasilks.com")
    ) {
      baseUrl =
        process.env.PROD_FRONTEND_URL || "https://admin.kankanasilks.com";
    } else {
      baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    }

    const cleanBase = baseUrl.replace(/\/+$/, "");
    const url = new URL(`${cleanBase}/admin/products/bulk-upload`);

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      }
    }

    return url.toString();
  }

  /**
   * Securely generates the OAuth state parameter signed with HMAC SHA-256.
   */
  generateState(userId: string, draftId?: string): string {
    const secret =
      process.env.COOKIE_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      "kangana-google-drive-oauth-secret";
    const timestamp = Date.now();
    const draftPart = draftId ? `:${draftId}` : "";
    const data = `${userId}:${timestamp}${draftPart}`;
    const hmac = crypto.createHmac("sha256", secret).update(data).digest("hex");

    const stateObj: any = {
      userId: String(userId),
      timestamp,
      sig: hmac,
    };
    if (draftId) {
      stateObj.draftId = String(draftId);
    }

    return Buffer.from(JSON.stringify(stateObj)).toString("base64url");
  }

  /**
   * Validates and extracts user ID (and optional draftId) from the OAuth state parameter.
   */
  parseState(state: string): { userId: string; draftId?: string } {
    if (!state) {
      throw new AppError(400, "Missing OAuth state parameter");
    }

    const secret =
      process.env.COOKIE_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      "kangana-google-drive-oauth-secret";

    try {
      const decodedStr = Buffer.from(state, "base64url").toString("utf-8");
      if (decodedStr.startsWith("{")) {
        const payload = JSON.parse(decodedStr);
        if (payload.userId && payload.timestamp && payload.sig) {
          const draftPart = payload.draftId ? `:${payload.draftId}` : "";
          const data = `${payload.userId}:${payload.timestamp}${draftPart}`;
          const expectedSig = crypto
            .createHmac("sha256", secret)
            .update(data)
            .digest("hex");

          const sigBuf = Buffer.from(payload.sig);
          const expBuf = Buffer.from(expectedSig);
          if (
            sigBuf.length === expBuf.length &&
            crypto.timingSafeEqual(sigBuf, expBuf)
          ) {
            // Validate expiration (15 minutes)
            const MAX_AGE_MS = 15 * 60 * 1000;
            if (Date.now() - payload.timestamp < MAX_AGE_MS) {
              return {
                userId: String(payload.userId),
                draftId: payload.draftId ? String(payload.draftId) : undefined,
              };
            }
            throw new AppError(
              400,
              "OAuth session expired. Please try connecting Google Drive again."
            );
          }
          throw new AppError(400, "Invalid OAuth state signature");
        }

        if (payload.userId) {
          return {
            userId: String(payload.userId),
            draftId: payload.draftId ? String(payload.draftId) : undefined,
          };
        }
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
    }

    // Support raw numeric userId string for backwards compatibility and direct testing
    if (/^\d+$/.test(state.trim())) {
      return { userId: state.trim() };
    }

    throw new AppError(400, "Invalid or corrupted OAuth state parameter");
  }

  /**
   * Generate Google OAuth URL dynamically based on request host and user ID.
   * Enforces offline access and consent prompt to ensure a refresh token is always returned.
   */
  getAuthUrl(userId: string, host: string, draftId?: string): string {
    const redirectUri = this.getRedirectUri(host);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AppError(
        500,
        "Google OAuth credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) are not configured"
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const state = this.generateState(userId, draftId);

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/drive.readonly"],
      state,
    });
  }

  /**
   * Exchange code for tokens, validate presence of refresh token, and upsert to database.
   */
  async saveTokenFromCode(
    userId: string,
    code: string,
    host: string
  ): Promise<void> {
    const redirectUri = this.getRedirectUri(host);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AppError(
        500,
        "Google OAuth credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) are not configured"
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    let tokens;
    try {
      const response = await oauth2Client.getToken(code);
      tokens = response.tokens;
    } catch (error: any) {
      throw new AppError(
        400,
        `Failed to exchange authorization code for tokens: ${error.message || "Unknown error"}`
      );
    }

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      throw new AppError(
        400,
        "No refresh token received from Google OAuth. Consent with offline access is required."
      );
    }

    const scopes =
      tokens.scope || "https://www.googleapis.com/auth/drive.readonly";

    await this.prisma.driveOAuth.upsert({
      where: { userId: BigInt(userId) },
      update: {
        refreshToken,
        clientId,
        clientSecret,
        scopes,
        status: "ACTIVE",
      },
      create: {
        userId: BigInt(userId),
        refreshToken,
        clientId,
        clientSecret,
        scopes,
        status: "ACTIVE",
      },
    });
  }

  /**
   * Returns true if the given user has a valid (non-revoked) Google Drive OAuth
   * token stored in the database, or if the global fallback env token is present.
   */
  async isConnected(userId: string): Promise<boolean> {
    try {
      const record = await this.prisma.driveOAuth.findUnique({
        where: { userId: BigInt(userId) },
        select: { refreshToken: true, status: true },
      });
      if (record && record.refreshToken && record.status === "ACTIVE") {
        return true;
      }
    } catch {
      // DB unavailable – fall through to env check
    }

    // Fallback: shared env-level refresh token
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN);
  }

  /** Build an OAuth2 client for the given user ID. */
  async getOAuthClient(userId: string): Promise<OAuth2Client> {
    try {
      const record = await this.prisma.driveOAuth.findUnique({
        where: { userId: BigInt(userId) },
      });
      if (record && record.refreshToken) {
        const { clientId, clientSecret, refreshToken } = record;
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        return oauth2Client;
      }
    } catch (e: any) {
      console.warn("Could not query DriveOAuth from DB:", e.message);
    }

    // Fallback to environment variables if available
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      });
      return oauth2Client;
    }

    throw new Error(
      "Google Drive OAuth token not found for user. Please connect Google Drive in Settings."
    );
  }

  /**
   * List folders in Google Drive for folder selection.
   * Includes shared drives and "Shared with me" folders.
   */
  async listFolders(userId: string): Promise<Array<{ id: string; name: string }>> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });
    const driveFolderRes: any = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)",
      pageSize: 100,
      orderBy: "name",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return (
      driveFolderRes.data?.files?.map((f: any) => ({
        id: f.id || "",
        name: f.name || "Untitled Folder",
      })) || []
    );
  }

  /**
   * Returns a recursive list of image/video files inside a folder and all its subfolders.
   * Supports shared drives and "Shared with me" folders.
   * Returns thumbnailLink for fast preview without downloading the full file.
   */
  async listFolderFiles(
    userId: string,
    folderId: string
  ): Promise<Array<{ id: string; name: string; mimeType: string; thumbnailLink?: string }>> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });

    const allFiles: Array<{ id: string; name: string; mimeType: string; thumbnailLink?: string }> = [];

    // BFS queue of folder IDs to traverse
    const folderQueue: string[] = [folderId];
    const visitedFolderIds = new Set<string>();

    while (folderQueue.length > 0) {
      const currentFolderId = folderQueue.shift()!;
      if (visitedFolderIds.has(currentFolderId)) continue;
      visitedFolderIds.add(currentFolderId);

      let pageToken: string | undefined = undefined;

      do {
        const driveListRes: any = await drive.files.list({
          q: `'${currentFolderId}' in parents and trashed = false`,
          fields: "nextPageToken, files(id, name, mimeType, thumbnailLink)",
          pageSize: 1000,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        if (driveListRes.data?.files) {
          for (const f of driveListRes.data.files) {
            if (!f.id || !f.name) continue;

            if (f.mimeType === "application/vnd.google-apps.folder") {
              // Queue subfolders for recursive traversal
              if (!visitedFolderIds.has(f.id)) {
                folderQueue.push(f.id);
              }
            } else {
              allFiles.push({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType || "application/octet-stream",
                thumbnailLink: f.thumbnailLink || undefined,
              });
            }
          }
        }

        pageToken = driveListRes.data?.nextPageToken || undefined;
      } while (pageToken);
    }

    return allFiles;
  }

  /**
   * Fetch Google's generated thumbnail for a Drive image.
   * This intentionally never falls back to the original file bytes: source images
   * can be 40+ MB, while previews should remain small and cheap to render.
   */
  async getImageThumbnail(
    userId: string,
    fileId: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });

    const meta: any = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, thumbnailLink",
      supportsAllDrives: true,
    });

    const thumbnailLink = meta.data?.thumbnailLink;
    if (!thumbnailLink) {
      throw new AppError(404, "Google Drive did not provide a thumbnail for this image.");
    }

    const response = await fetch(thumbnailLink, { redirect: "follow" });
    if (!response.ok) {
      throw new AppError(502, "Google Drive thumbnail could not be fetched.");
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!mimeType.toLowerCase().startsWith("image/")) {
      throw new AppError(502, "Google Drive returned an invalid image thumbnail.");
    }

    const maxThumbnailBytes = 5 * 1024 * 1024;
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxThumbnailBytes) {
      throw new AppError(413, "The generated image thumbnail is unexpectedly large.");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > maxThumbnailBytes) {
      throw new AppError(413, "The generated image thumbnail is empty or too large.");
    }

    return { buffer: Buffer.from(arrayBuffer), mimeType };
  }

  /**
   * Stream file from Drive directly to HTTP response.
   */
  async streamFile(userId: string, fileId: string, res: Response): Promise<void> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });

    const meta: any = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size",
      supportsAllDrives: true,
    });

    const stream: any = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true } as any,
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", meta.data?.mimeType || "image/jpeg");
    if (meta.data?.size) {
      res.setHeader("Content-Length", meta.data.size);
    }
    res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day cache
    stream.data.pipe(res);
  }

  /** Generate a temporary signed/proxied URL for a file. */
  async getSignedUrl(userId: string, fileId: string): Promise<string> {
    return `/api/products/bulk/drive-proxy/${fileId}`;
  }

  /**
   * Downloads a Drive file and returns its full text content.
   * Enforces a 10 MB size limit to prevent memory exhaustion.
   */
  async readFileAsText(userId: string, fileId: string): Promise<string> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });

    // Check file metadata first to enforce size limit
    const meta: any = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size",
    });

    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    if (meta.data?.size && Number(meta.data.size) > MAX_BYTES) {
      throw new AppError(
        413,
        `File "${meta.data.name ?? fileId}" is too large (${Math.round(Number(meta.data.size) / 1024 / 1024)} MB). Maximum allowed size is 10 MB. Please split it into smaller files.`
      );
    }

    const resp: any = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "text" }
    );

    return resp.data as string;
  }

  /**
   * Lists JSON / plain-text files accessible in the user's Google Drive,
   * ordered by most-recently modified first.
   */
  async listJsonFiles(
    userId: string
  ): Promise<Array<{ id: string; name: string; mimeType: string; size?: string }>> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });

    const res: any = await drive.files.list({
      q: "(mimeType='application/json' or mimeType='text/plain' or name contains '.json') and trashed = false",
      fields: "files(id, name, mimeType, size)",
      pageSize: 200,
      orderBy: "modifiedTime desc",
    });

    return (res.data?.files ?? []).map((f: any) => ({
      id: f.id ?? "",
      name: f.name ?? "Untitled",
      mimeType: f.mimeType ?? "application/json",
      ...(f.size !== undefined ? { size: f.size } : {}),
    }));
  }
}
