import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { NotificationCreatedEvent } from '../notification/events/notification-created.event';
import { MessageService } from '../chat/message/message.service';
import { SendMessageDto } from '../chat/message/dto/send-message.dto';
import { MarkReadDto } from '../chat/message/dto/mark-read.dto';
import { EditMessageDto } from '../chat/message/dto/edit-message.dto';
import { DeleteMessageDto } from '../chat/message/dto/delete-message.dto';
import { ReactMessageDto } from '../chat/message/dto/react-message.dto';

interface SocketData {
  userId: string;
}

type AppSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly messageService: MessageService,
  ) {}

  handleConnection(client: AppSocket) {
    const token = (client.handshake.auth as { token?: string })?.token;

    if (!token) {
      client.emit('auth_error', { code: 'MISSING_TOKEN' });
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      client.data.userId = payload.sub;

      void client.join(`user:${payload.sub}`);

      this.logger.log(
        `Client ${client.id} authenticated as user ${payload.sub}`,
      );
    } catch (error) {
      const code =
        error instanceof TokenExpiredError ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      client.emit('auth_error', { code });
      client.disconnect();
    }
  }

  handleDisconnect(client: AppSocket) {
    const userId = client.data.userId;
    if (!userId) return;
    this.logger.log(`Client ${client.id} disconnected (user ${userId})`);
  }

  // ─── Notifications ───────────────────────────────────────────────────────────

  @OnEvent('notification.created')
  handleNotificationCreated(event: NotificationCreatedEvent): void {
    this.server.to(`user:${event.userId}`).emit('notification', event);
  }

  // ─── Chat ────────────────────────────────────────────────────────────────────

  @SubscribeMessage('send_message')
  async handleSendMessage(client: AppSocket, dto: SendMessageDto) {
    const userId = client.data.userId;
    try {
      const { message, otherParticipantIds } = await this.messageService.send(
        userId,
        dto,
      );

      this.server
        .to(`user:${userId}`)
        .emit('message_sent', { message, tempId: dto.tempId });

      for (const pid of otherParticipantIds) {
        this.server.to(`user:${pid}`).emit('new_message', { message });
      }
    } catch (err) {
      client.emit('chat_error', {
        event: 'send_message',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(client: AppSocket, dto: MarkReadDto) {
    const userId = client.data.userId;

    try {
      const result = await this.messageService.markRead(userId, dto);

      for (const pid of result.participantIds) {
        this.server.to(`user:${pid}`).emit('read_receipt', {
          conversationId: result.conversationId,
          userId: result.userId,
          seq: result.lastSeq,
          readAt: result.readAt,
        });
      }
    } catch (err) {
      client.emit('chat_error', {
        event: 'mark_read',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('edit_message')
  async handleEditMessage(client: AppSocket, dto: EditMessageDto) {
    const userId = client.data.userId;
    try {
      const { message, participantIds } = await this.messageService.edit(
        userId,
        dto,
      );
      for (const pid of participantIds) {
        this.server.to(`user:${pid}`).emit('message_edited', { message });
      }
    } catch (err) {
      client.emit('chat_error', {
        event: 'edit_message',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(client: AppSocket, dto: DeleteMessageDto) {
    const userId = client.data.userId;
    try {
      const result = await this.messageService.delete(userId, dto);
      for (const pid of result.participantIds) {
        this.server.to(`user:${pid}`).emit('message_deleted', {
          conversationId: result.conversationId,
          messageId: result.messageId,
        });
      }
    } catch (err) {
      client.emit('chat_error', {
        event: 'delete_message',
        message: (err as Error).message,
      });
    }
  }

  @SubscribeMessage('react_message')
  async handleReactMessage(client: AppSocket, dto: ReactMessageDto) {
    const userId = client.data.userId;

    try {
      const result = await this.messageService.react(userId, dto);

      for (const pid of result.participantIds) {
        this.server.to(`user:${pid}`).emit('reaction_updated', {
          conversationId: result.conversationId,
          messageId: result.messageId,
          userId: result.userId,
          emoji: result.emoji,
        });
      }
    } catch (err) {
      client.emit('chat_error', {
        event: 'react_message',
        message: (err as Error).message,
      });
    }
  }
}
