import "reflect-metadata";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { container } from "tsyringe";
import { DriveService } from "@/modules/media/infrastructure/drive.service.js";
import { AuthController } from "@/modules/auth/presentation/auth.controller.js";
import { BulkImportDraftController } from "@/modules/product/presentation/controller/bulk-import-draft.controller.js";
import { setupContainer } from "@/config/container.js";

describe("Google Drive OAuth Integration Test Suite", () => {
  let mockPrisma: any;
  let driveService: DriveService;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "mock-client-id-12345.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "mock-client-secret-xyz";
    process.env.COOKIE_SECRET = "test-cookie-secret-key";
    process.env.FRONTEND_URL = "http://localhost:5173";
    process.env.QA_FRONTEND_URL = "https://qa.admin.kankanasilks.com";
    process.env.PROD_FRONTEND_URL = "https://admin.kankanasilks.com";

    mockPrisma = {
      driveOAuth: {
        upsert: async (args: any) => args,
        findUnique: async (args: any) => null,
      },
    };

    driveService = new DriveService(mockPrisma);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Dynamic Environment Resolution
  // ───────────────────────────────────────────────────────────────────────────
  describe("Dynamic Environment Resolution", () => {
    it("should resolve redirect URI for Local development with port", () => {
      const uri = driveService.getRedirectUri("localhost:3000");
      assert.equal(uri, "http://localhost:3000/api/auth/google/callback");
    });

    it("should resolve redirect URI for Local development with custom port", () => {
      const uri = driveService.getRedirectUri("localhost:5000");
      assert.equal(uri, "http://localhost:5000/api/auth/google/callback");
    });

    it("should resolve redirect URI for Local development on 127.0.0.1", () => {
      const uri = driveService.getRedirectUri("127.0.0.1:3000");
      assert.equal(uri, "http://127.0.0.1:3000/api/auth/google/callback");
    });

    it("should resolve redirect URI for Local development when host lacks port", () => {
      const uri = driveService.getRedirectUri("localhost");
      assert.equal(uri, "http://localhost:3000/api/auth/google/callback");
    });

    it("should resolve redirect URI for QA environment", () => {
      const uri1 = driveService.getRedirectUri("qa.api.kankanasilks.com");
      assert.equal(uri1, "https://qa.api.kankanasilks.com/api/auth/google/callback");

      const uri2 = driveService.getRedirectUri("qa.admin.kankanasilks.com");
      assert.equal(uri2, "https://qa.api.kankanasilks.com/api/auth/google/callback");
    });

    it("should resolve redirect URI for Production environment", () => {
      const uri1 = driveService.getRedirectUri("api.kankanasilks.com");
      assert.equal(uri1, "https://api.kankanasilks.com/api/auth/google/callback");

      const uri2 = driveService.getRedirectUri("admin.kankanasilks.com");
      assert.equal(uri2, "https://api.kankanasilks.com/api/auth/google/callback");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. OAuth URL Generation & State Security
  // ───────────────────────────────────────────────────────────────────────────
  describe("OAuth URL Generation & State Security", () => {
    it("should generate auth URL enforcing offline access and consent prompt", () => {
      const authUrl = driveService.getAuthUrl("101", "localhost:3000");
      const url = new URL(authUrl);

      assert.equal(url.searchParams.get("access_type"), "offline");
      assert.equal(url.searchParams.get("prompt"), "consent");
      assert.equal(url.searchParams.get("client_id"), process.env.GOOGLE_CLIENT_ID);
      assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/google/callback");
      assert.ok(url.searchParams.get("scope")?.includes("https://www.googleapis.com/auth/drive.readonly"));
      assert.ok(url.searchParams.get("state"));
    });

    it("should securely sign state parameter with HMAC and extract userId", () => {
      const state = driveService.generateState("42", "draft-999");
      const parsed = driveService.parseState(state);

      assert.equal(parsed.userId, "42");
      assert.equal(parsed.draftId, "draft-999");
    });

    it("should reject tampered state parameter with invalid signature", () => {
      const state = driveService.generateState("42");
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
      decoded.userId = "999"; // Tampering
      const tamperedState = Buffer.from(JSON.stringify(decoded)).toString("base64url");

      assert.throws(
        () => driveService.parseState(tamperedState),
        (err: any) => err.statusCode === 400 && err.message.includes("Invalid OAuth state signature")
      );
    });

    it("should reject expired state parameter", () => {
      const state = driveService.generateState("42");
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
      decoded.timestamp = Date.now() - 20 * 60 * 1000; // 20 minutes ago
      // Re-sign with old timestamp to isolate expiration check
      const secret = process.env.COOKIE_SECRET!;
      decoded.sig = crypto.createHmac("sha256", secret).update(`42:${decoded.timestamp}`).digest("hex");
      const expiredState = Buffer.from(JSON.stringify(decoded)).toString("base64url");

      assert.throws(
        () => driveService.parseState(expiredState),
        (err: any) => err.statusCode === 400 && err.message.includes("OAuth session expired")
      );
    });

    it("should accept raw numeric userId for backward compatibility", () => {
      const parsed = driveService.parseState("105");
      assert.equal(parsed.userId, "105");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Callback & Token Persistence Validation
  // ───────────────────────────────────────────────────────────────────────────
  describe("Callback & Token Persistence Validation", () => {
    it("should throw error if refresh token is missing when exchanging code", async () => {
      const { google } = await import("googleapis");
      const origOAuth2 = google.auth.OAuth2;

      (google.auth as any).OAuth2 = class {
        async getToken() {
          return {
            tokens: {
              access_token: "mock-access-token",
              refresh_token: undefined, // Missing refresh token
              scope: "https://www.googleapis.com/auth/drive.readonly",
            },
          };
        }
      };

      try {
        await assert.rejects(
          async () => {
            await driveService.saveTokenFromCode("101", "mock-auth-code", "localhost:3000");
          },
          (err: any) => {
            return (
              err.statusCode === 400 &&
              err.message.includes("No refresh token received from Google OAuth")
            );
          }
        );
      } finally {
        (google.auth as any).OAuth2 = origOAuth2;
      }
    });

    it("should securely upsert valid tokens to the database mapped to the user ID", async () => {
      let upsertArgs: any = null;
      mockPrisma.driveOAuth.upsert = async (args: any) => {
        upsertArgs = args;
        return args;
      };

      const { google } = await import("googleapis");
      const origOAuth2 = google.auth.OAuth2;

      (google.auth as any).OAuth2 = class {
        async getToken() {
          return {
            tokens: {
              access_token: "mock-access-token",
              refresh_token: "mock-valid-refresh-token-12345",
              scope: "https://www.googleapis.com/auth/drive.readonly",
            },
          };
        }
      };

      try {
        await driveService.saveTokenFromCode("202", "valid-code", "localhost:3000");

        assert.ok(upsertArgs);
        assert.equal(upsertArgs.where.userId, BigInt(202));
        assert.equal(upsertArgs.update.refreshToken, "mock-valid-refresh-token-12345");
        assert.equal(upsertArgs.create.refreshToken, "mock-valid-refresh-token-12345");
        assert.equal(upsertArgs.update.status, "ACTIVE");
        assert.equal(upsertArgs.create.status, "ACTIVE");
      } finally {
        (google.auth as any).OAuth2 = origOAuth2;
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Environment-Aware Redirection
  // ───────────────────────────────────────────────────────────────────────────
  describe("Environment-Aware Redirection", () => {
    it("should resolve frontend bulk upload view for Local environment", () => {
      const url = driveService.getFrontendBulkUploadUrl("localhost:3000", {
        drive_connected: "true",
      });
      assert.equal(url, "http://localhost:5173/admin/products/bulk-upload?drive_connected=true");
    });

    it("should resolve frontend bulk upload view for QA environment", () => {
      const url = driveService.getFrontendBulkUploadUrl("qa.api.kankanasilks.com", {
        drive_connected: "true",
      });
      assert.equal(url, "https://qa.admin.kankanasilks.com/admin/products/bulk-upload?drive_connected=true");
    });

    it("should resolve frontend bulk upload view for Production environment", () => {
      const url = driveService.getFrontendBulkUploadUrl("api.kankanasilks.com", {
        drive_connected: "true",
      });
      assert.equal(url, "https://admin.kankanasilks.com/admin/products/bulk-upload?drive_connected=true");
    });

    it("should include draftId parameter when provided", () => {
      const url = driveService.getFrontendBulkUploadUrl("localhost:3000", {
        drive_connected: "true",
        draftId: "12",
      });
      const parsed = new URL(url);
      assert.equal(parsed.pathname, "/admin/products/bulk-upload");
      assert.equal(parsed.searchParams.get("drive_connected"), "true");
      assert.equal(parsed.searchParams.get("draftId"), "12");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Controller Layer Error Handling & Callback
  // ───────────────────────────────────────────────────────────────────────────
  describe("AuthController Google OAuth Callback Handling", () => {
    it("should return 400 when user denies permissions (error=access_denied)", async () => {
      const mockAuthService: any = {};
      const controller = new AuthController(mockAuthService, driveService);

      const req: any = {
        query: { error: "access_denied" },
        get: () => "localhost:3000",
      };

      let statusCode: number = 0;
      let jsonPayload: any = null;

      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (payload: any) => {
          jsonPayload = payload;
          return res;
        },
      };

      await controller.handleGoogleCallback(req, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonPayload.success, false);
      assert.ok(jsonPayload.message.includes("denied"));
    });

    it("should return 400 when code or state parameter is missing", async () => {
      const mockAuthService: any = {};
      const controller = new AuthController(mockAuthService, driveService);

      const req: any = {
        query: { code: "only-code-no-state" },
        get: () => "localhost:3000",
      };

      let statusCode: number = 0;
      let jsonPayload: any = null;

      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (payload: any) => {
          jsonPayload = payload;
          return res;
        },
      };

      await controller.handleGoogleCallback(req, res);

      assert.equal(statusCode, 400);
      assert.equal(jsonPayload.success, false);
      assert.ok(jsonPayload.message.includes("code and state are required"));
    });

    it("should redirect to frontend bulk upload view upon successful callback", async () => {
      const mockAuthService: any = {};
      let saved = false;

      const mockDrive: any = {
        parseState: () => ({ userId: "101", draftId: "5" }),
        saveTokenFromCode: async () => {
          saved = true;
        },
        getFrontendBulkUploadUrl: (host: string, params: any) =>
          `http://localhost:5173/admin/products/bulk-upload?drive_connected=true&draftId=${params.draftId}`,
      };

      const controller = new AuthController(mockAuthService, mockDrive);

      const req: any = {
        query: { code: "valid-auth-code", state: "valid-state" },
        get: () => "localhost:3000",
      };

      let redirectUrl = "";
      const res: any = {
        redirect: (url: string) => {
          redirectUrl = url;
        },
      };

      await controller.handleGoogleCallback(req, res);

      assert.ok(saved);
      assert.equal(
        redirectUrl,
        "http://localhost:5173/admin/products/bulk-upload?drive_connected=true&draftId=5"
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Dependency Injection Container Resolution
  // ───────────────────────────────────────────────────────────────────────────
  describe("Dependency Injection Singleton Registration", () => {
    it("should register DriveService as a singleton and resolve consistently", () => {
      setupContainer();

      const instance1 = container.resolve(DriveService);
      const instance2 = container.resolve(DriveService);
      const instanceByName = container.resolve<DriveService>("DriveService");

      assert.ok(instance1);
      assert.equal(instance1, instance2);
      assert.equal(instance1, instanceByName);
    });

    it("should inject DriveService singleton into AuthController", () => {
      setupContainer();

      const authController = container.resolve(AuthController);
      assert.ok(authController);
      assert.ok((authController as any).driveService);
      assert.equal(
        (authController as any).driveService,
        container.resolve(DriveService)
      );
    });

    it("should inject DriveService singleton into BulkImportDraftController", () => {
      setupContainer();

      const bulkController = container.resolve(BulkImportDraftController);
      assert.ok(bulkController);
      assert.ok((bulkController as any).driveService);
      assert.equal(
        (bulkController as any).driveService,
        container.resolve(DriveService)
      );
    });
  });
});

