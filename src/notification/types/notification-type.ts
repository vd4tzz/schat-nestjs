export enum NotificationType {
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
}

export type FRIEND_REQUEST = {
  friendshipId: string;
  fromUserId: string;
  fromUserAvatar: string;
  fromUserName: string;
};

export type FRIEND_ACCEPTED = {
  friendshipId: string;
  byUserId: string;
  byUserName: string;
  byUserAvatar: string;
};
