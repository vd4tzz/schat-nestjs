import { NotificationType } from '@prisma/client';

export class NotificationCreatedEvent {
  constructor(
    public readonly notificationId: string,
    public readonly userId: string,
    public readonly type: NotificationType,
    public readonly payload: Record<string, unknown>,
    public readonly createdAt: Date,
  ) {}
}
