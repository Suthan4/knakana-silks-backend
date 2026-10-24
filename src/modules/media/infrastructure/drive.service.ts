import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { injectable, inject } from "tsyringe";
import { PrismaClient } from "@/generated/prisma/client.js";
import { Response } from "express";

/**
 * Google Drive service for bulk import and image matching.
 * OAuth tokens are loaded per user from DriveOAuth.
 */
@injectable()
export class DriveService {
  constructor(@inject(PrismaClient) private prisma: PrismaClient) {}

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
   * List folders in Google Drive for folder selection
   */
  async listFolders(userId: string): Promise<Array<{ id: string; name: string }>> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });
    const driveFolderRes: any = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)",
      pageSize: 100,
      orderBy: "name",
    });

    return (
      driveFolderRes.data?.files?.map((f: any) => ({
        id: f.id || "",
        name: f.name || "Untitled Folder",
      })) || []
    );
  }

  /**
   * Returns a list of files inside a folder.
   */
  async listFolderFiles(
    userId: string,
    folderId: string
  ): Promise<Array<{ id: string; name: string; mimeType: string }>> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });

    const allFiles: Array<{ id: string; name: string; mimeType: string }> = [];
    let pageToken: string | undefined = undefined;

    do {
      const driveListRes: any = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: 1000,
        pageToken,
      });

      if (driveListRes.data?.files) {
        for (const f of driveListRes.data.files) {
          if (f.id && f.name) {
            allFiles.push({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType || "application/octet-stream",
            });
          }
        }
      }

      pageToken = driveListRes.data?.nextPageToken || undefined;
    } while (pageToken);

    return allFiles;
  }

  /**
   * Stream file from Drive directly to HTTP response
   */
  async streamFile(userId: string, fileId: string, res: Response): Promise<void> {
    const auth = await this.getOAuthClient(userId);
    const drive = google.drive({ version: "v3", auth });

    const meta: any = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size",
    });

    const stream: any = await drive.files.get(
      { fileId, alt: "media" },
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
}
