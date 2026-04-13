import { IsUUID } from 'class-validator';
import { IsInt, Min } from 'class-validator';

export class MarkReadDto {
  @IsUUID()
  conversationId: string;

  @IsInt()
  @Min(1)
  seq: number;
}
