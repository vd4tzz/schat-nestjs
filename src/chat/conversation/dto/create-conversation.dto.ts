import { ConversationType } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class CreateConversationDto {
  @IsEnum(ConversationType)
  type: ConversationType;

  @ValidateIf((o: CreateConversationDto) => o.type === ConversationType.DIRECT)
  @IsUUID()
  targetUserId?: string;

  @ValidateIf((o: CreateConversationDto) => o.type === ConversationType.GROUP)
  @IsString()
  name?: string;

  @ValidateIf((o: CreateConversationDto) => o.type === ConversationType.GROUP)
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  memberIds?: string[];
}
