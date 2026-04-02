import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchUserQueryDto {
  @IsString()
  @IsNotEmpty()
  q: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeFriendship?: boolean;
}
