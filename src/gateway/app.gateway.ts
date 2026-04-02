import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { NotificationCreatedEvent } from '../notification/events/notification-created.event';

interface SocketData {
  userId: string;
}

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

  constructor(private readonly jwt: JwtService) {}

  handleConnection(
    client: Socket<
      DefaultEventsMap,
      DefaultEventsMap,
      DefaultEventsMap,
      SocketData
    >,
  ) {
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

  handleDisconnect(
    client: Socket<
      DefaultEventsMap,
      DefaultEventsMap,
      DefaultEventsMap,
      SocketData
    >,
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    this.logger.log(`Client ${client.id} disconnected (user ${userId})`);
  }

  @OnEvent('notification.created')
  handleNotificationCreated(event: NotificationCreatedEvent): void {
    this.logger.log(
      `Notification created: id=${event.notificationId} userId=${event.userId} type=${event.type}`,
    );

    this.server.to(`user:${event.userId}`).emit('notification', event);
  }
}
