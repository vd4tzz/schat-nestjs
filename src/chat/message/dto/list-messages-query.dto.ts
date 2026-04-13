import { Type } from 'class-transformer';
import { IsInt, IsNumberString, IsOptional, Max, Min } from 'class-validator';

export class ListMessagesQueryDto {
  @IsOptional()
  @IsNumberString()
  before?: string; // seq cursor (BigInt as string)

  @IsOptional()
  @IsNumberString()
  after?: string; // seq cursor (BigInt as string)

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}
