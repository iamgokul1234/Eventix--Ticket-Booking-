import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export type ValidateTarget = 'body' | 'query' | 'params';

/**
 * Middleware factory: validates request[target] against a Zod schema.
 * Throws ZodError on failure; the global errorHandler converts it to a 400.
 */
export function validate(schema: AnyZodObject, target: ValidateTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req[target] = schema.parse(req[target]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(err);
      } else {
        next(err);
      }
    }
  };
}
