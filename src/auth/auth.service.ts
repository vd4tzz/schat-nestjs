import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PrismaService } from '../shared/prisma/prisma.service';
import { RedisService } from '../shared/redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';

const OTP_TTL = 300; // 5 minutes

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const [existingEmail, existingUsername] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.user.findUnique({ where: { username: dto.username } }),
    ]);

    if (existingEmail) {
      throw new AppException(
        ErrorCode.EMAIL_ALREADY_EXISTS,
        'Email already exists',
      );
    }
    if (existingUsername) {
      throw new AppException(
        ErrorCode.USERNAME_ALREADY_EXISTS,
        'Username already taken',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        accounts: {
          create: {
            provider: AuthProvider.LOCAL,
            providerId: dto.email,
            passwordHash,
          },
        },
      },
    });

    const otp = this.generateOtp();
    await this.redis.set(`otp:${dto.email}`, otp, OTP_TTL);

    console.log(`[OTP] Email: ${dto.email} | OTP: ${otp}`);

    return { otpExpiresIn: OTP_TTL };
  }

  async verifyOtp(email: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }
    if (user.isVerified) {
      throw new AppException(
        ErrorCode.ALREADY_VERIFIED,
        'Account is already verified',
      );
    }

    const stored = await this.redis.get(`otp:${email}`);
    if (stored === null) {
      throw new AppException(
        ErrorCode.OTP_EXPIRED,
        'OTP has expired. Please request a new one',
      );
    }
    if (stored !== otp) {
      throw new AppException(ErrorCode.INVALID_OTP, 'Invalid OTP');
    }

    await Promise.all([
      this.prisma.user.update({ where: { email }, data: { isVerified: true } }),
      this.redis.del(`otp:${email}`),
    ]);
  }

  async resendOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }
    if (user.isVerified) {
      throw new AppException(
        ErrorCode.ALREADY_VERIFIED,
        'Account is already verified',
      );
    }

    const otp = this.generateOtp();
    await this.redis.set(`otp:${email}`, otp, OTP_TTL);

    console.log(`[OTP] Email: ${email} | OTP: ${otp}`);
  }

  private createRefreshToken() {
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = this.getRefreshTokenExpiry();
    return { refreshToken, tokenHash, expiresAt };
  }

  async login(dto: LoginDto) {
    const isEmail = dto.identifier.includes('@');
    const user = await this.prisma.user.findUnique({
      where: isEmail ? { email: dto.identifier } : { username: dto.identifier },
      include: {
        accounts: {
          where: { provider: AuthProvider.LOCAL },
        },
      },
    });

    if (!user || user.accounts.length === 0) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid credentials',
        401,
      );
    }

    if (!user.isVerified) {
      throw new AppException(
        ErrorCode.ACCOUNT_NOT_VERIFIED,
        'Account is not verified. Please verify your email',
        403,
      );
    }

    const account = user.accounts[0];
    const passwordMatch = await bcrypt.compare(
      dto.password,
      account.passwordHash!,
    );
    if (!passwordMatch) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid credentials',
        401,
      );
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
    };
    const accessToken = this.jwt.sign(payload);

    const familyId = crypto.randomUUID();
    const { refreshToken, tokenHash, expiresAt } = this.createRefreshToken();

    await this.prisma.refreshToken.create({
      data: { familyId, userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
      },
    };
  }

  async refresh(token: string) {
    const tokenHash = this.hashToken(token);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new AppException(
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Invalid or expired refresh token',
        401,
      );
    }

    if (stored.isRevoked) {
      await this.prisma.refreshToken.deleteMany({
        where: { familyId: stored.familyId },
      });
      throw new AppException(
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Refresh token reuse detected. Please log in again',
        401,
      );
    }

    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.deleteMany({
        where: { familyId: stored.familyId },
      });
      throw new AppException(
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Invalid or expired refresh token',
        401,
      );
    }

    const {
      refreshToken,
      tokenHash: newTokenHash,
      expiresAt,
    } = this.createRefreshToken();

    // Atomic rotate dùng transaction để tránh race condition:
    //
    // Không có transaction:
    //   Request A: findUnique → isRevoked=false ✓
    //   Request B: findUnique → isRevoked=false ✓  (B đọc trước khi A write)
    //   Request A: update isRevoked=true, create Token B
    //   Request B: update isRevoked=true, create Token C  ← 2 token mới được cấp!
    //
    // Fix: dùng updateMany với điều kiện isRevoked=false bên trong transaction.
    // PostgreSQL lock row khi UPDATE nên chỉ 1 trong 2 request thắng:
    //   Request A: updateMany(isRevoked=false) → lock row → count=1 → create Token B ✓
    //   Request B: updateMany(isRevoked=false) → chờ A xong → isRevoked=true → count=0 → reuse!
    const { count } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.refreshToken.updateMany({
        where: { tokenHash, isRevoked: false },
        data: { isRevoked: true },
      });

      if (result.count === 0) {
        // Concurrent reuse: xóa toàn bộ family để force re-login
        await tx.refreshToken.deleteMany({
          where: { familyId: stored.familyId },
        });
        return result;
      }

      await tx.refreshToken.create({
        data: {
          familyId: stored.familyId,
          userId: stored.userId,
          tokenHash: newTokenHash,
          expiresAt,
        },
      });

      return result;
    });

    if (count === 0) {
      throw new AppException(
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Refresh token reuse detected. Please log in again',
        401,
      );
    }

    const payload: JwtPayload = {
      sub: stored.user.id,
      email: stored.user.email,
      fullName: stored.user.fullName,
    };

    return {
      accessToken: this.jwt.sign(payload),
      refreshToken,
    };
  }

  async logout(token: string) {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (stored) {
      await this.prisma.refreshToken.deleteMany({
        where: { familyId: stored.familyId },
      });
    }

    return { message: 'Logged out successfully' };
  }

  private getRefreshTokenExpiry(): Date {
    const days = parseInt(this.config.get('REFRESH_TOKEN_EXPIRE_IN_DAYS', '7'));
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }
}
