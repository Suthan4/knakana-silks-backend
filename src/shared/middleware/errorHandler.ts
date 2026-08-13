import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { logger } from "../logger/logger.js";

/**
 * Logs via req.log when pino-http has run (so the line carries the request's
 * correlation id and route) and falls back to the app logger otherwise.
 */
const log = (req: Request) => req.log ?? logger.raw;

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof AppError) {
    // Expected/operational error (validation, not found, unauthorized, etc).
    // warn, not error — these are normal control flow, not incidents.
    log(req).warn(
      { err: { name: error.name, message: error.message }, statusCode: error.statusCode },
      `Operational error: ${error.message}`
    );

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
      log(req).warn(
        { err: { name: error.name, code: prismaError.code } },
        "Prisma unique constraint violation"
      );
      res.status(409).json({
        success: false,
        message: "A record with this value already exists",
      });
      return;
    }

    if (prismaError.code === "P2025") {
      log(req).warn(
        { err: { name: error.name, code: prismaError.code } },
        "Prisma record not found"
      );
      res.status(404).json({
        success: false,
        message: "Record not found",
      });
      return;
    }
  }

  // Unexpected / unhandled errors — always worth an alert.
  log(req).error(
    { err: { name: error.name, message: error.message, stack: error.stack } },
    "Unhandled server error"
  );

  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
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
