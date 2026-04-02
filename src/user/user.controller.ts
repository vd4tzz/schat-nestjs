import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SearchUserQueryDto } from './dto/get-user-query.dto';
import { createUploadOptions } from './upload.config';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.userService.getProfile(user.sub);
  }

  @Get('search')
  searchUsers(
    @CurrentUser() user: JwtPayload,
    @Query() query: SearchUserQueryDto,
  ) {
    return this.userService.searchUsers(
      query.q,
      user.sub,
      query.includeFriendship,
    );
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.sub, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', createUploadOptions()))
  uploadAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new AppException(
        ErrorCode.INVALID_FILE_TYPE,
        'No valid image file provided',
        400,
      );
    }
    return this.userService.uploadAvatar(user.sub, file);
  }

  @Delete('me/avatar')
  @HttpCode(200)
  deleteAvatar(@CurrentUser() user: JwtPayload) {
    return this.userService.deleteAvatar(user.sub);
  }

  @Post('me/background')
  @UseInterceptors(FileInterceptor('background', createUploadOptions()))
  uploadBackground(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new AppException(
        ErrorCode.INVALID_FILE_TYPE,
        'No valid image file provided',
        400,
      );
    }
    return this.userService.uploadBackground(user.sub, file);
  }

  @Delete('me/background')
  @HttpCode(200)
  deleteBackground(@CurrentUser() user: JwtPayload) {
    return this.userService.deleteBackground(user.sub);
  }
}
