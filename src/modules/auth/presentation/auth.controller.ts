import { Response,Request } from "express";
import { inject, injectable } from "tsyringe";

import { z } from "zod";
import { AuthService } from "../application/services/auth.service.js";

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

@injectable()
export class AuthController {
  constructor(@inject(AuthService) private authService: AuthService) {}

  async register(req: Request, res: Response) {
    try {
      const data = registerSchema.parse(req.body);
      const result = await this.authService.register(
        data.email,
        data.password,
        data.firstName,
        data.lastName,
        data.phone
      );

      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const data = loginSchema.parse(req.body);
      const result = await this.authService.login(data.email, data.password);

      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        message: "Login successful",
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message });
    }
  }

  async refreshToken(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        return res
          .status(401)
          .json({ success: false, message: "No refresh token provided" });
      }

      const tokens = await this.authService.refreshToken(refreshToken);

      res.cookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        data: { accessToken: tokens.accessToken },
      });
    } catch (error: any) {
      res.status(401).json({ success: false, message: error.message });
    }
  }

  async revokeToken(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        return res
          .status(400)
          .json({ success: false, message: "No refresh token provided" });
      }

      await this.authService.revokeToken(refreshToken);
      res.clearCookie("refreshToken");

      res.json({
        success: true,
        message: "Token revoked successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const userId = BigInt(req.user!.userId);
      await this.authService.logout(userId);
      res.clearCookie("refreshToken");

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getProfile(req: Request, res: Response) {
    try {
      const userId = BigInt(req.user!.userId);
      const profile = await this.authService.getProfile(userId);

      res.json({
        success: true,
        data: profile,
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email) {
        return res
          .status(400)
          .json({ success: false, message: "Email is required" });
      }

      await this.authService.forgotPassword(email);

      res.json({
        success: true,
        message: "If the email exists, a password reset link has been sent",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async resetPassword(req: Request, res: Response) {
    try {
      const data = resetPasswordSchema.parse(req.body);
      await this.authService.resetPassword(data.token, data.password);

      res.json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
