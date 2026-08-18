import { Response } from 'express';

export interface SuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorResponse {
  success: false;
  message: string;
  errorCode: string;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200
): void {
  const response: SuccessResponse<T> = {
    success: true,
    message,
    data,
  };
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  message: string,
  errorCode: string,
  statusCode = 500
): void {
  const response: ErrorResponse = {
    success: false,
    message,
    errorCode,
  };
  res.status(statusCode).json(response);
}
