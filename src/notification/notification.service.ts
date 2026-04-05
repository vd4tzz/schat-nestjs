import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PrismaService } from '../shared/prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // 1. Tạo mốc thời gian 30 ngày trước
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 2. Xác định mốc thời gian bắt đầu thực tế
    // Nếu query.since mới hơn 30 ngày trước thì dùng query.since, ngược lại dùng mốc 30 ngày
    let startDate = thirtyDaysAgo;
    if (query.since) {
      const querySinceDate = new Date(query.since);
      if (querySinceDate > thirtyDaysAgo) {
        startDate = querySinceDate;
      }
    }

    const where = {
      userId,
      ...(query.isRead !== undefined ? { isRead: query.isRead } : {}),
      createdAt: {
        gte: startDate,
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      throw new AppException(
        ErrorCode.NOTIFICATION_NOT_FOUND,
        'Notification not found',
        404,
      );
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: count };
  }

  async remove(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      throw new AppException(
        ErrorCode.NOTIFICATION_NOT_FOUND,
        'Notification not found',
        404,
      );
    }

    await this.prisma.notification.delete({ where: { id: notificationId } });
  }
}
