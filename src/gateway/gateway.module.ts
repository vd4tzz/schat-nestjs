import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { AppGateway } from './app.gateway';

@Module({
  imports: [AuthModule, ChatModule],
  providers: [AppGateway],
})
export class GatewayModule {}
