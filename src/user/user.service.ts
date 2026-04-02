import { Injectable } from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
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

  async searchUsers(
    query: string,
    currentUserId: string,
    includeFriendship?: boolean,
  ) {
    const where = {
      id: { not: currentUserId } as const,
      OR: [
        { fullName: { contains: query, mode: 'insensitive' as const } },
        { username: { contains: query, mode: 'insensitive' as const } },
      ],
    };

    if (!includeFriendship) {
      return this.prisma.user.findMany({ where, take: 20 });
    }

    const users = await this.prisma.user.findMany({
      where,
      take: 20,
      include: {
        friendsSent: { where: { addresseeId: currentUserId } },
        friendsReceived: { where: { requesterId: currentUserId } },
      },
    });

    return users.map(({ friendsSent, friendsReceived, ...user }) => {
      const records = [...friendsSent, ...friendsReceived];
      const friendship = this.resolveFriendshipStatus(currentUserId, records);
      return { ...user, friendship };
    });
  }

  private resolveFriendshipStatus(
    userId: string,
    records: {
      id: string;
      requesterId: string;
      addresseeId: string;
      status: FriendshipStatus;
    }[],
  ) {
    const blockedByMe = records.find(
      (f) => f.requesterId === userId && f.status === FriendshipStatus.BLOCKED,
    );
    if (blockedByMe) {
      return {
        status: 'BLOCKED_BY_YOU' as const,
        friendshipId: blockedByMe.id,
      };
    }

    const blockedByThem = records.find(
      (f) => f.addresseeId === userId && f.status === FriendshipStatus.BLOCKED,
    );
    if (blockedByThem) {
      return { status: 'NONE' as const };
    }

    const record = records.find((f) => f.status !== FriendshipStatus.BLOCKED);
    if (!record) {
      return { status: 'NONE' as const };
    }

    if (record.status === FriendshipStatus.PENDING) {
      if (record.requesterId === userId) {
        return { status: 'PENDING_SENT' as const, friendshipId: record.id };
      }
      return { status: 'PENDING_RECEIVED' as const, friendshipId: record.id };
    }

    return { status: 'ACCEPTED' as const, friendshipId: record.id };
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
