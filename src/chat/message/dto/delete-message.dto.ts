import { IsUUID } from 'class-validator';

export class DeleteMessageDto {
  @IsUUID()
  conversationId: string;

  @IsUUID()
  messageId: string;
}
