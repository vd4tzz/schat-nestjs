import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { FriendshipService } from './friendship.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { FriendshipQueryDto } from './dto/friendship-query.dto';

@Controller('friendships')
@UseGuards(JwtAuthGuard)
export class FriendshipController {
  constructor(private readonly friendshipService: FriendshipService) {}

  @Post('requests')
  sendRequest(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendshipService.sendRequest(user.sub, user.fullName, dto);
  }

  @Post('requests/:id/accept')
  acceptRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendshipService.acceptRequest(user.sub, user.fullName, id);
  }

  @Post('requests/:id/reject')
  @HttpCode(200)
  rejectRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendshipService.rejectRequest(user.sub, id);
  }

  @Delete('requests/:id')
  cancelRequest(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendshipService.cancelRequest(user.sub, id);
  }

  @Post('block')
  blockUser(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendshipService.blockUser(user.sub, dto.addresseeId);
  }

  @Delete('block/:userId')
  unblockUser(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.friendshipService.unblockUser(user.sub, targetUserId);
  }

  @Get('requests/incoming')
  listIncomingRequests(
    @CurrentUser() user: JwtPayload,
    @Query() query: FriendshipQueryDto,
  ) {
    return this.friendshipService.listIncomingRequests(user.sub, query);
  }

  @Get('requests/outgoing')
  listOutgoingRequests(
    @CurrentUser() user: JwtPayload,
    @Query() query: FriendshipQueryDto,
  ) {
    return this.friendshipService.listOutgoingRequests(user.sub, query);
  }

  @Get('status/:userId')
  checkStatus(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.friendshipService.checkStatus(user.sub, targetUserId);
  }

  @Get()
  listFriends(
    @CurrentUser() user: JwtPayload,
    @Query() query: FriendshipQueryDto,
  ) {
    return this.friendshipService.listFriends(user.sub, query);
  }

  @Delete(':id')
  unfriend(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendshipService.unfriend(user.sub, id);
  }
}
