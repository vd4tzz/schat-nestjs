import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED,
        'Missing access token',
        401,
      );
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      request['user'] = payload;
      return true;
    } catch {
      throw new AppException(
        ErrorCode.UNAUTHORIZED,
        'Invalid or expired access token',
        401,
      );
    }
  }

  private extractToken(request: Request): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}
