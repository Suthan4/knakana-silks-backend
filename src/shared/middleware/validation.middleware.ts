import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";
import { ValidationError } from "../utils/errors.js";


export const validate = (schema: ZodSchema) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map(
          (err) => `${err.path.join(".")}: ${err.message}`
        );
        next(new ValidationError(messages.join(", ")));
      } else {
        next(error);
      }
    }
  };
};

export const validateBody = (schema: ZodSchema) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map(
          (err) => `${err.path.join(".")}: ${err.message}`
        );
        next(new ValidationError(messages.join(", ")));
      } else {
        next(error);
      }
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      req.query = await schema.parseAsync(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map(
          (err) => `${err.path.join(".")}: ${err.message}`
        );
        next(new ValidationError(messages.join(", ")));
      } else {
        next(error);
      }
    }
  };
};
