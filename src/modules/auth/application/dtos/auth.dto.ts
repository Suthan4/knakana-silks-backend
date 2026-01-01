import { z } from "zod";

// Register DTO
export const RegisterDTOSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Invalid phone number")
    .optional(),
});

export type RegisterDTO = z.infer<typeof RegisterDTOSchema>;

// Login DTO
export const LoginDTOSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export type LoginDTO = z.infer<typeof LoginDTOSchema>;

// Refresh Token DTO
export const RefreshTokenDTOSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RefreshTokenDTO = z.infer<typeof RefreshTokenDTOSchema>;

// Update Profile DTO
export const UpdateProfileDTOSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/)
    .optional(),
});

export type UpdateProfileDTO = z.infer<typeof UpdateProfileDTOSchema>;

// Change Password DTO
export const ChangePasswordDTOSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export type ChangePasswordDTO = z.infer<typeof ChangePasswordDTOSchema>;

// Create Admin DTO (Super Admin only)
export const CreateAdminDTOSchema = RegisterDTOSchema.extend({
  role: z.enum(["ADMIN"]),
});

export type CreateAdminDTO = z.infer<typeof CreateAdminDTOSchema>;
