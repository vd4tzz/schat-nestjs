import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationController } from './conversation/conversation.controller';
import { ConversationService } from './conversation/conversation.service';
import { MessageController } from './message/message.controller';
import { MessageService } from './message/message.service';

@Module({
  imports: [AuthModule],
  controllers: [ConversationController, MessageController],
  providers: [ConversationService, MessageService],
  exports: [ConversationService, MessageService],
})
export class ChatModule {}
