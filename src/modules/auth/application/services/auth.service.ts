import { injectable, inject } from "tsyringe";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
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

  // Register
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string
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
        role: user.role,
        isActive: user.isActive,
      },
      ...tokens,
    };
  }

  // Login
  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new Error("Invalid credentials");
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
      expiresIn: "20s",
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