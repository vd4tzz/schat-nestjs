import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { ReactMessageDto } from './dto/react-message.dto';
import { SendMessageDto } from './dto/send-message.dto';

// const messageSenderSelect = {
//   id: true,
//   fullName: true,
//   avatarUrl: true,
// };

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * List messages in a conversation for an authenticated participant.
   * Verifies the user is a member before returning paginated results.
   */
  async findOne(userId: string, conversationId: string, messageId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) {
      throw new AppException(
        ErrorCode.CONVERSATION_NOT_FOUND,
        'Conversation not found',
        404,
      );
    }

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      include: { reactions: true },
    });

    if (!message) {
      throw new AppException(
        ErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
        404,
      );
    }

    return message;
  }

  async list(
    userId: string,
    conversationId: string,
    query: ListMessagesQueryDto,
  ) {
    const participant = await this.prisma.participant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) {
      throw new AppException(
        ErrorCode.CONVERSATION_NOT_FOUND,
        'Conversation not found',
        404,
      );
    }

    const limit = query.limit ?? 30;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(query.before ? { seq: { lt: BigInt(query.before) } } : {}),
        ...(query.after ? { seq: { gt: BigInt(query.after) } } : {}),
      },
      include: {
        reactions: true,
      },
      orderBy: { seq: 'desc' },
      take: limit,
    });

    return messages.reverse();
  }

  async send(userId: string, dto: SendMessageDto) {
    const { conversationId, content, type = 'TEXT', replyToId } = dto;

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId, leftAt: null } },
      },
      include: {
        participants: { where: { leftAt: null }, select: { userId: true } },
      },
    });

    if (!conversation) {
      throw new AppException(
        ErrorCode.CONVERSATION_NOT_FOUND,
        'Conversation not found',
        404,
      );
    }

    const seq = await this.getNextSeq(conversationId, conversation.lastSeq);

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          content,
          type,
          seq,
          replyToId,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastSeq: seq, lastMessageId: msg.id },
      });

      await tx.participant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadSeq: seq },
      });

      return msg;
    });

    const otherParticipantIds = conversation.participants
      .map((p) => p.userId)
      .filter((id) => id !== userId);

    return { message, otherParticipantIds };
  }

  async markRead(userId: string, dto: MarkReadDto) {
    const { conversationId, seq } = dto;

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId, leftAt: null } },
      },
      include: {
        participants: { where: { leftAt: null }, select: { userId: true } },
      },
    });

    if (!conversation) {
      throw new AppException(
        ErrorCode.CONVERSATION_NOT_FOUND,
        'Conversation not found',
        404,
      );
    }

    const readSeq = BigInt(seq);

    const participant = await this.prisma.participant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (participant && participant.lastReadSeq >= readSeq) {
      return {
        conversationId,
        userId,
        lastSeq: participant.lastReadSeq,
        participantIds: conversation.participants.map((p) => p.userId),
        readAt: new Date(),
      };
    }

    await this.prisma.participant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadSeq: readSeq },
    });

    const participantIds = conversation.participants.map((p) => p.userId);

    return {
      conversationId,
      userId,
      lastSeq: readSeq,
      participantIds,
      readAt: new Date(),
    };
  }

  async edit(userId: string, dto: EditMessageDto) {
    const { conversationId, messageId, content } = dto;

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });

    if (!message) {
      throw new AppException(
        ErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
        404,
      );
    }
    if (message.senderId !== userId) {
      throw new AppException(ErrorCode.MESSAGE_FORBIDDEN, 'Forbidden', 403);
    }
    if (message.isDeleted) {
      throw new AppException(
        ErrorCode.MESSAGE_DELETED,
        'Message is deleted',
        400,
      );
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true },
    });

    const participants = await this.prisma.participant.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });

    return {
      message: updated,
      participantIds: participants.map((p) => p.userId),
    };
  }

  async delete(userId: string, dto: DeleteMessageDto) {
    const { conversationId, messageId } = dto;

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });

    if (!message) {
      throw new AppException(
        ErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
        404,
      );
    }
    if (message.senderId !== userId) {
      throw new AppException(ErrorCode.MESSAGE_FORBIDDEN, 'Forbidden', 403);
    }
    if (message.isDeleted) {
      throw new AppException(
        ErrorCode.MESSAGE_DELETED,
        'Message already deleted',
        400,
      );
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null, deletedAt: new Date() },
    });

    const participants = await this.prisma.participant.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });

    return {
      conversationId,
      messageId,
      participantIds: participants.map((p) => p.userId),
    };
  }

  async react(userId: string, dto: ReactMessageDto) {
    const { conversationId, messageId, emoji } = dto;

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });

    if (!message) {
      throw new AppException(
        ErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
        404,
      );
    }

    if (emoji) {
      await this.prisma.reaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, emoji },
        update: { emoji },
      });
    } else {
      await this.prisma.reaction.deleteMany({
        where: { messageId, userId },
      });
    }

    const participants = await this.prisma.participant.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });

    return {
      conversationId,
      messageId,
      userId,
      emoji,
      participantIds: participants.map((p) => p.userId),
    };
  }

  private async getNextSeq(
    conversationId: string,
    lastSeq: bigint,
  ): Promise<bigint> {
    const key = `seq:conv:${conversationId}`;

    const exists = await this.redis.exists(key);
    if (!exists && lastSeq > 0n) {
      await this.redis.setRaw(key, String(lastSeq));
    }

    return BigInt(await this.redis.incr(key));
  }
}
