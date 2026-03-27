import { Injectable } from '@nestjs/common';
import { PrismaService } from './shared/prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHello() {
    const users = await this.prisma.user.findMany();
    return users;
  }
}
