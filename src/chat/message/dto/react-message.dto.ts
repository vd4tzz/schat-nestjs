import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ReactMessageDto {
  @IsUUID()
  conversationId: string;

  @IsUUID()
  messageId: string;

  @IsOptional()
  @IsString()
  emoji?: string; // undefined hoặc empty string → xóa reaction
}
