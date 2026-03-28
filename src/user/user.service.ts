import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { MinioService } from '../shared/minio/minio.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-codes.enum.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }

    if (user.avatarUrl) {
      await this.minio.delete(user.avatarUrl);
    }

    const avatarUrl = await this.minio.upload('avatars', file);
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
  }

  async deleteAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }
    if (!user.avatarUrl) {
      throw new AppException(
        ErrorCode.USER_AVATAR_NOT_FOUND,
        'No avatar to delete',
        404,
      );
    }

    await this.minio.delete(user.avatarUrl);
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });
  }

  async uploadBackground(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }

    if (user.backgroundUrl) {
      await this.minio.delete(user.backgroundUrl);
    }

    const backgroundUrl = await this.minio.upload('backgrounds', file);
    return this.prisma.user.update({
      where: { id: userId },
      data: { backgroundUrl },
    });
  }

  async deleteBackground(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
    }
    if (!user.backgroundUrl) {
      throw new AppException(
        ErrorCode.USER_BACKGROUND_NOT_FOUND,
        'No background to delete',
        404,
      );
    }

    await this.minio.delete(user.backgroundUrl);
    return this.prisma.user.update({
      where: { id: userId },
      data: { backgroundUrl: null },
    });
  }
}
