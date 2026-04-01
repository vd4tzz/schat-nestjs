import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationCreatedEvent } from './events/notification-created.event';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  @OnEvent('notification.created')
  handleNotificationCreated(event: NotificationCreatedEvent): void {
    this.logger.log(
      `Notification created: id=${event.notificationId} userId=${event.userId} type=${event.type}`,
    );
  }
}
