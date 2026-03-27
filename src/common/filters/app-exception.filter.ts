import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes.enum';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof AppException) {
      return response.status(exception.statusCode).json({
        errorCode: exception.errorCode,
        message: exception.message,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'object' && 'message' in res
          ? Array.isArray((res as { message: unknown }).message)
            ? (res as { message: string[] }).message.join(', ')
            : (res as { message: string }).message
          : exception.message;

      return response.status(status).json({
        errorCode: ErrorCode.VALIDATION_ERROR,
        message,
      });
    }

    console.error(exception);
    return response.status(500).json({
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    });
  }
}
