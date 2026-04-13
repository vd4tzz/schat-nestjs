import { IsString, IsUUID, MinLength } from 'class-validator';

export class EditMessageDto {
  @IsUUID()
  conversationId: string;

  @IsUUID()
  messageId: string;

  @IsString()
  @MinLength(1)
  content: string;
}
