import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  // Prisma errors
  if (error.name === "PrismaClientKnownRequestError") {
    const prismaError = error as any;

    if (prismaError.code === "P2002") {
      res.status(409).json({
        success: false,
        message: "A record with this value already exists",
      });
      return;
    }

    if (prismaError.code === "P2025") {
      res.status(404).json({
        success: false,
        message: "Record not found",
      });
      return;
    }
  }

  // Unexpected errors
  console.error("Unexpected error:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
};
