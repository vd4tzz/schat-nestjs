import { Injectable } from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PrismaService } from '../shared/prisma/prisma.service';
import { FriendshipQueryDto } from './dto/friendship-query.dto';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';

const USER_SELECT = {
  id: true,
  fullName: true,
  username: true,
  avatarUrl: true,
};

@Injectable()
export class FriendshipService {
  constructor(private readonly prisma: PrismaService) {}

  async sendRequest(
    userId: string,
    userFullName: string,
    dto: SendFriendRequestDto,
  ) {
    if (userId === dto.addresseeId) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_SELF_REQUEST,
        'Cannot send friend request to yourself',
        400,
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.addresseeId },
    });
    if (!target) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_TARGET_NOT_FOUND,
        'User not found',
        404,
      );
    }

    const existing = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: dto.addresseeId },
          { requesterId: dto.addresseeId, addresseeId: userId },
        ],
      },
    });

    for (const record of existing) {
      if (record.status === FriendshipStatus.BLOCKED) {
        throw new AppException(
          ErrorCode.FRIENDSHIP_BLOCKED,
          'Cannot send friend request to this user',
          403,
        );
      }
      if (
        record.status === FriendshipStatus.PENDING ||
        record.status === FriendshipStatus.ACCEPTED
      ) {
        throw new AppException(
          ErrorCode.FRIENDSHIP_ALREADY_EXISTS,
          'Friend request already exists',
          409,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const friendship = await tx.friendship.create({
        data: {
          requesterId: userId,
          addresseeId: dto.addresseeId,
          status: FriendshipStatus.PENDING,
        },
      });
      await tx.notification.create({
        data: {
          userId: dto.addresseeId,
          type: 'FRIEND_REQUEST',
          payload: {
            friendshipId: friendship.id,
            fromUserId: userId,
            fromUserName: userFullName,
          },
        },
      });
      return friendship;
    });
  }

  async acceptRequest(
    userId: string,
    userFullName: string,
    friendshipId: string,
  ) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!friendship || friendship.addresseeId !== userId) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_FOUND,
        'Friend request not found',
        404,
      );
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_PENDING,
        'Friend request is not pending',
        400,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.friendship.update({
        where: { id: friendshipId },
        data: { status: FriendshipStatus.ACCEPTED },
      });
      // notify the requester that their friend request was accepted
      await tx.notification.create({
        data: {
          userId: friendship.requesterId,
          type: 'FRIEND_ACCEPTED',
          payload: {
            friendshipId: friendship.id,
            byUserId: userId,
            byUserName: userFullName,
          },
        },
      });
      return updated;
    });
  }

  async rejectRequest(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!friendship || friendship.addresseeId !== userId) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_FOUND,
        'Friend request not found',
        404,
      );
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_PENDING,
        'Friend request is not pending',
        400,
      );
    }

    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  async cancelRequest(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!friendship || friendship.requesterId !== userId) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_FOUND,
        'Friend request not found',
        404,
      );
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_PENDING,
        'Friend request is not pending',
        400,
      );
    }

    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  async unfriend(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (
      !friendship ||
      (friendship.requesterId !== userId && friendship.addresseeId !== userId)
    ) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_FOUND,
        'Friendship not found',
        404,
      );
    }
    if (friendship.status !== FriendshipStatus.ACCEPTED) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_ACCEPTED,
        'You are not friends with this user',
        400,
      );
    }

    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  async blockUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_SELF_REQUEST,
        'Cannot block yourself',
        400,
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_TARGET_NOT_FOUND,
        'User not found',
        404,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // outgoing: userId -> tartgetUserId
      // incoming: targetUserId -> userId

      // Check if already blocked by current user
      const existingOutgoing = await tx.friendship.findUnique({
        where: {
          requesterId_addresseeId: {
            requesterId: userId,
            addresseeId: targetUserId,
          },
        },
      });
      if (existingOutgoing?.status === FriendshipStatus.BLOCKED) {
        throw new AppException(
          ErrorCode.FRIENDSHIP_ALREADY_EXISTS,
          'User is already blocked',
          409,
        );
      }

      // Delete existing record (any status) from current user to target
      if (existingOutgoing) {
        await tx.friendship.delete({ where: { id: existingOutgoing.id } });
      }

      // Delete incoming record from target if it's not a block
      const existingIncoming = await tx.friendship.findUnique({
        where: {
          requesterId_addresseeId: {
            requesterId: targetUserId,
            addresseeId: userId,
          },
        },
      });
      if (
        existingIncoming &&
        existingIncoming.status !== FriendshipStatus.BLOCKED
      ) {
        await tx.friendship.delete({ where: { id: existingIncoming.id } });
      }

      return tx.friendship.create({
        data: {
          requesterId: userId,
          addresseeId: targetUserId,
          status: FriendshipStatus.BLOCKED,
        },
      });
    });
  }

  async unblockUser(userId: string, targetUserId: string) {
    const record = await this.prisma.friendship.findUnique({
      where: {
        requesterId_addresseeId: {
          requesterId: userId,
          addresseeId: targetUserId,
        },
      },
    });
    if (!record || record.status !== FriendshipStatus.BLOCKED) {
      throw new AppException(
        ErrorCode.FRIENDSHIP_NOT_BLOCKED,
        'You have not blocked this user',
        400,
      );
    }

    await this.prisma.friendship.delete({ where: { id: record.id } });
  }

  async listFriends(userId: string, query: FriendshipQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      status: FriendshipStatus.ACCEPTED,
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    };

    const [data, total] = await Promise.all([
      this.prisma.friendship.findMany({
        where,
        include: {
          requester: { select: USER_SELECT },
          addressee: { select: USER_SELECT },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.friendship.count({ where }),
    ]);

    const friends = data.map((f) => ({
      friendshipId: f.id,
      friend: f.requesterId === userId ? f.addressee : f.requester,
      since: f.updatedAt,
    }));

    return { data: friends, total, page, limit };
  }

  async listIncomingRequests(userId: string, query: FriendshipQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { addresseeId: userId, status: FriendshipStatus.PENDING };

    const [data, total] = await Promise.all([
      this.prisma.friendship.findMany({
        where,
        include: { requester: { select: USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.friendship.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async listOutgoingRequests(userId: string, query: FriendshipQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { requesterId: userId, status: FriendshipStatus.PENDING };

    const [data, total] = await Promise.all([
      this.prisma.friendship.findMany({
        where,
        include: { addressee: { select: USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.friendship.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async checkStatus(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      return { status: 'SELF' };
    }

    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: userId },
        ],
      },
    });

    const blockedByMe = friendships.find(
      (f) => f.requesterId === userId && f.status === FriendshipStatus.BLOCKED,
    );
    if (blockedByMe) {
      return { status: 'BLOCKED_BY_YOU', friendshipId: blockedByMe.id };
    }

    const blockedByThem = friendships.find(
      (f) => f.addresseeId === userId && f.status === FriendshipStatus.BLOCKED,
    );
    if (blockedByThem) {
      return { status: 'NONE' };
    }

    const friendship = friendships.find(
      (f) => f.status !== FriendshipStatus.BLOCKED,
    );
    if (!friendship) {
      return { status: 'NONE' };
    }

    if (friendship.status === FriendshipStatus.PENDING) {
      if (friendship.requesterId === userId) {
        return { status: 'PENDING_SENT', friendshipId: friendship.id };
      }
      return { status: 'PENDING_RECEIVED', friendshipId: friendship.id };
    }

    return { status: 'ACCEPTED', friendshipId: friendship.id };
  }
}
