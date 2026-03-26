## Project Structure

```
src/
  ├── main.ts
  ├── app.module.ts
  │
  ├── auth/
  │   ├── auth.module.ts
  │   ├── auth.controller.ts
  │   ├── auth.service.ts
  │   ├── strategies/
  │   │   ├── jwt.strategy.ts
  │   │   └── google.strategy.ts
  │   └── dto/
  │
  ├── users/
  │   ├── users.module.ts
  │   ├── users.controller.ts
  │   ├── users.service.ts
  │   ├── users.repository.ts
  │   └── dto/
  │
  ├── chat/
  │   ├── chat.module.ts
  │   ├── conversations/
  │   │   ├── conversations.controller.ts
  │   │   ├── conversations.service.ts
  │   │   ├── conversations.repository.ts
  │   │   └── dto/
  │   └── messages/
  │       ├── messages.controller.ts
  │       ├── messages.service.ts
  │       ├── messages.repository.ts
  │       └── dto/
  │
  ├── friendships/
  │   ├── friendships.module.ts
  │   ├── friendships.controller.ts
  │   ├── friendships.service.ts
  │   └── dto/
  │
  ├── gateway/
  │   ├── gateway.module.ts
  │   └── gateway.ts
  │
  ├── storage/
  │   ├── storage.module.ts
  │   └── storage.service.ts
  │
  └── shared/
      ├── prisma/
      │   ├── prisma.module.ts
      │   └── prisma.service.ts
      └── redis/
          ├── redis.module.ts
          └── redis.service.ts
```

---

## Transaction Pattern

Service tạo transaction, truyền `tx` vào repository:

```typescript
// Service
async sendMessage(dto: SendMessageDto) {
  return this.prisma.$transaction(async (tx) => {
    const message = await this.messageRepo.create(dto, tx)
    await this.conversationRepo.updateLastMessage(dto.conversationId, message, tx)
  })
}

// Repository
async create(dto: CreateMessageDto, tx?: PrismaClient) {
  const client = tx ?? this.prisma
  return client.message.create({ data: dto })
}
```

---

## Data Models

```prisma
enum ConversationType {
  DIRECT
  GROUP
}

enum ParticipantRole {
  MEMBER
  ADMIN
  OWNER
}

enum MessageType {
  TEXT
  IMAGE
  FILE
  VIDEO
  AUDIO
  SYSTEM
  CALL
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  BLOCKED
}

enum AuthProvider {
  LOCAL
  GOOGLE
  FACEBOOK
  APPLE
}

model User {
  id          String    @id @default(uuid())
  displayName String
  avatarUrl   String?
  bio         String?
  lastSeenAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  accounts        Account[]
  participants    Participant[]
  sentMessages    Message[]
  reactions       Reaction[]
  friendsSent     Friendship[]   @relation("requester")
  friendsReceived Friendship[]   @relation("addressee")
  notifications   Notification[]
}

model Account {
  id           String       @id @default(uuid())
  userId       String
  provider     AuthProvider
  providerId   String
  passwordHash String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@unique([provider, providerId])
}

model Conversation {
  id            String           @id @default(uuid())
  type          ConversationType
  name          String?
  avatarUrl     String?
  createdById   String
  lastSeq       BigInt           @default(0)
  lastMessageId String?          @unique
  updatedAt     DateTime         @updatedAt
  createdAt     DateTime         @default(now())

  participants Participant[]
  messages     Message[]
  lastMessage  Message? @relation("lastMessage", fields: [lastMessageId], references: [id])
}

model Participant {
  id             String          @id @default(uuid())
  conversationId String
  userId         String
  role           ParticipantRole @default(MEMBER)
  lastReadSeq    BigInt          @default(0)
  isMuted        Boolean         @default(false)
  joinedAt       DateTime        @default(now())
  leftAt         DateTime?

  conversation Conversation @relation(fields: [conversationId], references: [id])
  user         User         @relation(fields: [userId], references: [id])

  @@unique([conversationId, userId])
}

model Message {
  id             String      @id @default(uuid())
  conversationId String
  senderId       String
  content        String?
  type           MessageType @default(TEXT)
  seq            BigInt
  replyToId      String?
  isEdited       Boolean     @default(false)
  isDeleted      Boolean     @default(false)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  deletedAt      DateTime?

  conversation      Conversation  @relation(fields: [conversationId], references: [id])
  sender            User          @relation(fields: [senderId], references: [id])
  replyTo           Message?      @relation("replies", fields: [replyToId], references: [id])
  replies           Message[]     @relation("replies")
  attachments       Attachment[]
  reactions         Reaction[]
  lastMessageOfConv Conversation? @relation("lastMessage")

  @@unique([conversationId, seq])
  @@index([conversationId, seq])
}

model Attachment {
  id        String @id @default(uuid())
  messageId String
  url       String
  filename  String
  mimeType  String
  sizeBytes Int

  message Message @relation(fields: [messageId], references: [id])
}

model Reaction {
  id        String   @id @default(uuid())
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())

  message Message @relation(fields: [messageId], references: [id])
  user    User    @relation(fields: [userId], references: [id])

  @@unique([messageId, userId])
}

model Friendship {
  id          String           @id @default(uuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  requester User @relation("requester", fields: [requesterId], references: [id])
  addressee User @relation("addressee", fields: [addresseeId], references: [id])

  @@unique([requesterId, addresseeId])
}

enum NotificationType {
  FRIEND_REQUEST
  FRIEND_ACCEPTED
}

model Notification {
  id        String           @id @default(uuid())
  userId    String
  type      NotificationType
  payload   Json
  isRead    Boolean          @default(false)
  createdAt DateTime         @default(now())

  user User @relation(fields: [userId], references: [id])
}
```
