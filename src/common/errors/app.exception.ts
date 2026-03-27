import { ErrorCode } from './error-codes.enum';

export class AppException extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppException';
  }
}
