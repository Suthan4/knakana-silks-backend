import { injectable, inject } from "tsyringe";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomInt, randomUUID } from "node:crypto";
import { redisClient } from "@/config/redis.config.js";
import { sendLoginOtpEmail } from "./email.service.js";
import { IRefreshTokenRepository } from "../../interface/Irefreshtokenrepository.js";
import { UserRole } from "../../../../generated/prisma/enums.js";
import { sendPasswordResetEmail } from "./email.service.js";
import { IUserRepository } from "../../interface/Iuserrepository.js";


const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "your-secret-key";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "your-refresh-secret";

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

interface ResetPasswordPayload {
  userId: string;
  email: string;
}

@injectable()
export class AuthService {
  constructor(
    @inject("IUserRepository") private userRepository: IUserRepository,
    @inject("IRefreshTokenRepository")
    private refreshTokenRepository: IRefreshTokenRepository
  ) {}

  async sendEmailOtp(rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    const existingUser = await this.userRepository.findByEmail(email);
    const isNewAccount = !existingUser;
    const cooldownKey = `auth:email-otp-cooldown:${email}`;
    const otpKey = `auth:email-otp:${email}`;
    const attemptsKey = `auth:email-otp-attempts:${email}`;
    const cooldown = await redisClient.set(cooldownKey, "1", "EX", 60, "NX");
    if (cooldown !== "OK") throw new Error("Please wait 60 seconds before requesting another code");

    const otp = randomInt(100000, 1000000).toString();
    await redisClient.set(otpKey, otp, "EX", 300);
    await redisClient.del(attemptsKey);
    try {
      await sendLoginOtpEmail(email, otp);
    } catch (error) {
      await redisClient.del(otpKey, cooldownKey);
      throw error;
    }
    return { message: "Verification code sent", isNewAccount };
  }

  async verifyEmailOtp(rawEmail: string, rawOtp: string, termsAccepted = false) {
    const email = rawEmail.trim().toLowerCase();
    const otpKey = `auth:email-otp:${email}`;
    const attemptsKey = `auth:email-otp-attempts:${email}`;
    const attempts = Number(await redisClient.get(attemptsKey) || "0");
    if (attempts >= 5) {
      await redisClient.del(otpKey, attemptsKey);
      throw new Error("Too many incorrect attempts. Please request a new code");
    }

    const storedOtp = await redisClient.get(otpKey);
    if (!storedOtp || storedOtp !== rawOtp) {
      await redisClient.incr(attemptsKey);
      await redisClient.expire(attemptsKey, 300);
      throw new Error("Invalid or expired verification code");
    }

    let user = await this.userRepository.findByEmail(email);
    if (user && user.role !== UserRole.USER) throw new Error("Please use the admin sign-in page");
    if (!user && !termsAccepted) {
      throw new Error("Please accept the Terms of Service and Privacy Policy to create your account");
    }
    await redisClient.del(otpKey, attemptsKey, `auth:email-otp-cooldown:${email}`);
    if (!user) {
      const randomPassword = await bcrypt.hash(randomUUID(), 10);
      const firstName = email.split("@")[0].replace(/[._-]+/g, " ").trim().slice(0, 50) || "Customer";
      user = await this.userRepository.create({
        email,
        password: randomPassword,
        firstName,
        lastName: "",
        role: UserRole.USER,
        termsAccepted: true,
        emailVerified: true,
      });
    } else {
      if (!user.isActive) throw new Error("Account is deactivated");
      if (!user.emailVerified) user = await this.userRepository.update(user.id, { emailVerified: true });
    }

    const tokens = this.generateTokens({ userId: user.id.toString(), email: user.email, role: user.role });
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    const safeUser = {
      id: user.id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
    };
    return { user: safeUser, ...tokens };
  }

  // Register
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string,
    termsAccepted?:boolean,
  ) {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) throw new Error("User already exists");

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      role: UserRole.USER,
      termsAccepted
    });

    const tokens = this.generateTokens({
      userId: user.id.toString(),
      email: user.email,
      role: user.role,
    });

    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        termsAccepted: user.termsAccepted
      },
      ...tokens,
    };
  }

    // Update Profile (NEW)
  async updateProfile(
    userId: bigint,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
    }
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error("User not found");

    // If email is being updated, check if it's already taken by another user
    if (data.email && data.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(data.email);
      if (existingUser && existingUser.id !== userId) {
        throw new Error("Email already in use");
      }
    }

    // Update user
    const updatedUser = await this.userRepository.update(userId, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      email: data.email,
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

    // Change Password (NEW)
  async changePassword(
    userId: bigint,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error("User not found");

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) throw new Error("Current password is incorrect");

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(userId, { password: hashedPassword });

    // Revoke all refresh tokens for security
    await this.refreshTokenRepository.deleteByUserId(userId);

    return { message: "Password changed successfully. Please login again." };
  }

  // Login
  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new Error("Invalid credentials");
    if (user.role === UserRole.USER) throw new Error("Customers must sign in using email verification");
    if (!user.isActive) throw new Error("Account is deactivated");

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new Error("Invalid credentials");

    const tokens = this.generateTokens({
      userId: user.id.toString(),
      email: user.email,
      role: user.role,
    });

    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
      ...tokens,
    };
  }

  // Refresh Token
  async refreshToken(refreshToken: string) {
    const payload = jwt.verify(
      refreshToken,
      JWT_REFRESH_SECRET
    ) as TokenPayload;

    const storedToken = await this.refreshTokenRepository.findByToken(
      refreshToken
    );
    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new Error("Invalid or expired refresh token");
    }

    const user = await this.userRepository.findById(BigInt(payload.userId));
    if (!user || !user.isActive) throw new Error("User not found or inactive");

    // Delete old token
    await this.refreshTokenRepository.deleteByToken(refreshToken);

    // Generate new tokens
    const tokens = this.generateTokens({
      userId: user.id.toString(),
      email: user.email,
      role: user.role,
    });

    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // Revoke Token
  async revokeToken(refreshToken: string) {
    await this.refreshTokenRepository.deleteByToken(refreshToken);
  }

  // Logout (revoke all tokens for user)
  async logout(userId: bigint) {
    await this.refreshTokenRepository.deleteByUserId(userId);
  }

  // Forgot Password
  async forgotPassword(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return; // Don't reveal if user exists

    const resetToken = jwt.sign(
      {
        userId: user.id.toString(),
        email: user.email,
      },
      JWT_ACCESS_SECRET,
      {
        expiresIn: "1h",
      }
    );

    await sendPasswordResetEmail(user.email, resetToken);
  }

  // Reset Password
  async resetPassword(token: string, newPassword: string) {
    const payload = jwt.verify(
      token,
      JWT_ACCESS_SECRET
    ) as ResetPasswordPayload;

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.userRepository.update(BigInt(payload.userId), {
      password: hashedPassword,
    });

    // ✅ optional but recommended: revoke all refresh tokens
    await this.refreshTokenRepository.deleteByUserId(BigInt(payload.userId));
  }

  // Get user profile
  async getProfile(userId: bigint) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error("User not found");

    // Get permissions separately
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Generate tokens
  generateTokens(payload: TokenPayload) {
    const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: "7d",
    });
    return { accessToken, refreshToken };
  }

  // Save refresh token
  async saveRefreshToken(userId: bigint, token: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.refreshTokenRepository.create(userId, token, expiresAt);
  }

  // Verify token
  verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_ACCESS_SECRET) as TokenPayload;
  }
}