import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';

const conversationInclude = {
  participants: {
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  },
  lastMessage: {
    include: {
      sender: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

type ConversationWithIncludes = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateConversationDto) {
    if (dto.type === 'DIRECT') {
      const targetUserId = dto.targetUserId!;

      if (targetUserId === userId) {
        throw new AppException(
          ErrorCode.CONVERSATION_SELF_DIRECT,
          'Cannot create a conversation with yourself',
          400,
        );
      }

      const target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
      });
      if (!target) {
        throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found', 404);
      }

      const canonicalKey = [userId, targetUserId].sort().join(':');

      const existing = await this.prisma.conversation.findUnique({
        where: { canonicalKey },
        include: conversationInclude,
      });

      if (existing) {
        return this.mapConversation(existing, userId);
      }

      const conv = await this.prisma.conversation.create({
        data: {
          type: 'DIRECT',
          canonicalKey,
          createdById: userId,
          participants: {
            create: [{ userId }, { userId: targetUserId }],
          },
        },
        include: conversationInclude,
      });

      return this.mapConversation(conv, userId);
    }

    // GROUP
    const { name, memberIds = [] } = dto;
    const uniqueMemberIds = [
      ...new Set(memberIds.filter((id) => id !== userId)),
    ];

    const conv = await this.prisma.conversation.create({
      data: {
        type: 'GROUP',
        name,
        createdById: userId,
        participants: {
          create: [
            { userId, role: 'OWNER' },
            ...uniqueMemberIds.map((id) => ({ userId: id })),
          ],
        },
      },
      include: conversationInclude,
    });

    return this.mapConversation(conv, userId);
  }

  async list(userId: string, query: ListConversationsQueryDto) {
    const limit = query.limit ?? 20;
    const isSync = !!query.after;

    const where = {
      participants: { some: { userId, leftAt: null } },
      ...(query.before ? { updatedAt: { lt: new Date(query.before) } } : {}),
      ...(query.after ? { updatedAt: { gt: new Date(query.after) } } : {}),
    };

    const conversations = await this.prisma.conversation.findMany({
      where,
      include: conversationInclude,
      orderBy: { updatedAt: 'desc' },
      take: isSync ? undefined : limit + 1,
    });

    if (isSync) {
      return {
        data: conversations.map((conv) => this.mapConversation(conv, userId)),
        nextCursor: null,
      };
    }

    const hasMore = conversations.length > limit;
    const data = hasMore ? conversations.slice(0, limit) : conversations;
    const nextCursor = hasMore
      ? data[data.length - 1].updatedAt.toISOString()
      : null;

    return {
      data: data.map((conv) => this.mapConversation(conv, userId)),
      nextCursor,
    };
  }

  async findOne(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId, leftAt: null } },
      },
      include: conversationInclude,
    });

    if (!conv) {
      throw new AppException(
        ErrorCode.CONVERSATION_NOT_FOUND,
        'Conversation not found',
        404,
      );
    }

    return this.mapConversation(conv, userId);
  }

  private mapConversation(conv: ConversationWithIncludes, userId: string) {
    const other = conv.participants.find((p) => p.userId !== userId);

    return {
      id: conv.id,
      type: conv.type,
      lastSeq: conv.lastSeq,
      lastMessage: conv.lastMessage,
      updatedAt: conv.updatedAt,
      createdAt: conv.createdAt,
      name:
        conv.type === 'DIRECT' ? (other?.user?.fullName ?? null) : conv.name,
      avatarUrl:
        conv.type === 'DIRECT'
          ? (other?.user?.avatarUrl ?? null)
          : conv.avatarUrl,
      participants: conv.participants.map((p) => ({
        role: p.role,
        lastReadSeq: p.lastReadSeq,
        leftAt: p.leftAt,
        ...p.user,
      })),
    };
  }
}
