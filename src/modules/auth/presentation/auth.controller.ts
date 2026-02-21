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
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/).optional(),
  email: z.string().email().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
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
        data.phone,
        data.termsAccepted
      );

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

    // NEW: Update Profile
  async updateProfile(req: Request, res: Response) {
    try {
      const userId = BigInt(req.user!.userId);
      const data = updateProfileSchema.parse(req.body);

      const updatedUser = await this.authService.updateProfile(userId, data);

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: updatedUser,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // NEW: Change Password
  async changePassword(req: Request, res: Response) {
    try {
      const userId = BigInt(req.user!.userId);
      const data = changePasswordSchema.parse(req.body);

      const result = await this.authService.changePassword(
        userId,
        data.currentPassword,
        data.newPassword
      );

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }


  async login(req: Request, res: Response) {
    try {
      const data = loginSchema.parse(req.body);
      const result = await this.authService.login(data.email, data.password);

      res.json({
        success: true,
        message: "Login successful",
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
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

      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
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
