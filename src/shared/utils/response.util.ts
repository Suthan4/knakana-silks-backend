import { Response } from "express";

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  statusCode: number;
  timestamp: string;
}

export class ResponseUtil {
  /**
   * Send success response
   */
  static success<T>(
    res: Response,
    data: T,
    message: string = "Success",
    statusCode: number = 200
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send created response
   */
  static created<T>(
    res: Response,
    data: T,
    message: string = "Resource created successfully"
  ): Response {
    return this.success(res, data, message, 201);
  }

  /**
   * Send error response
   */
  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    error?: string
  ): Response {
    const response: ApiResponse = {
      success: false,
      message,
      error,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   */
  static validationError(
    res: Response,
    errors: any,
    message: string = "Validation failed"
  ): Response {
    const response: ApiResponse = {
      success: false,
      message,
      data: errors,
      statusCode: 400,
      timestamp: new Date().toISOString(),
    };

    return res.status(400).json(response);
  }

  /**
   * Send unauthorized response
   */
  static unauthorized(
    res: Response,
    message: string = "Unauthorized access"
  ): Response {
    return this.error(res, message, 401);
  }

  /**
   * Send forbidden response
   */
  static forbidden(
    res: Response,
    message: string = "Forbidden resource"
  ): Response {
    return this.error(res, message, 403);
  }

  /**
   * Send not found response
   */
  static notFound(
    res: Response,
    message: string = "Resource not found"
  ): Response {
    return this.error(res, message, 404);
  }

  /**
   * Send conflict response
   */
  static conflict(
    res: Response,
    message: string = "Resource already exists"
  ): Response {
    return this.error(res, message, 409);
  }

  /**
   * Send bad request response
   */
  static badRequest(res: Response, message: string = "Bad request"): Response {
    return this.error(res, message, 400);
  }
}
