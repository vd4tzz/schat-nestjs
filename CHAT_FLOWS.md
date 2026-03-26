# Chat Flows

## Send Message

```
Client emit "send_message" { conversationId, content, type, tempId }
      │
      ▼
1. Validate
   - content không rỗng
   - type hợp lệ
   - user có trong conversation không
      │
      ▼
2. Lấy seq
   - INCR seq:conv:{id} từ Redis
   - Miss → query DB → warm Redis → INCR
      │
      ▼
3. Transaction
   - INSERT message { seq, content, type, senderId, conversationId }
   - UPDATE conversation SET lastSeq, lastMessageId, updatedAt
   - UPDATE participant SET lastReadSeq WHERE userId = sender
      │
      ▼
4. Update Redis
   - HSET last_message:conv:{id} { content, type, senderId, seq, createdAt }
   - HINCRBY unread:{userId}:{convId} 1  (tất cả participant trừ sender)
      │
      ▼
5. Fanout
   - socket.to("user:A").emit("message_sent", { message, tempId })
   - io.to("user:B").emit("new_message", { message })
   - io.to("user:C").emit("new_message", { message })
```

| Event | Chiều | Payload |
|---|---|---|
| `send_message` | Client → Server | conversationId, content, type, tempId |
| `message_sent` | Server → user:A | message, tempId |
| `new_message` | Server → user:B,C | message |

---

## Mark Read

```
Client emit "mark_read" { conversationId }
      │
      ▼
1. UPDATE participant SET lastReadSeq = conversation.lastSeq
   WHERE userId = currentUser AND conversationId = X
      │
      ▼
2. Emit
   - socket.to("user:A").emit("read_sync", { conversationId, unreadCount: 0 })
   - io.to("user:B").emit("read_receipt", { conversationId, userId: A, readAt })
   - io.to("user:C").emit("read_receipt", { conversationId, userId: A, readAt })
```

| Event | Chiều | Payload |
|---|---|---|
| `mark_read` | Client → Server | conversationId |
| `read_sync` | Server → user:A | conversationId, unreadCount: 0 |
| `read_receipt` | Server → user:B,C | conversationId, userId, readAt |

---

## Delete Message

```
Client emit "delete_message" { conversationId, messageId }
      │
      ▼
1. UPDATE message SET isDeleted = true, content = null, deletedAt = NOW()
      │
      ▼
2. Nếu message là lastMessage → UPDATE conversation SET lastMessageId = message trước đó
      │
      ▼
3. Emit
   - socket.to("user:A").to("user:B").to("user:C").emit("message_deleted", { conversationId, messageId })
```

| Event | Chiều | Payload |
|---|---|---|
| `delete_message` | Client → Server | conversationId, messageId |
| `message_deleted` | Server → tất cả | conversationId, messageId |

---

## Edit Message

```
Client emit "edit_message" { conversationId, messageId, content }
      │
      ▼
1. UPDATE message SET content = newContent, isEdited = true
      │
      ▼
2. Nếu message là lastMessage → UPDATE Redis last_message:conv:{id}
      │
      ▼
3. Emit
   - socket.to("user:A").to("user:B").to("user:C").emit("message_edited", { conversationId, message })
```

| Event | Chiều | Payload |
|---|---|---|
| `edit_message` | Client → Server | conversationId, messageId, content |
| `message_edited` | Server → tất cả | conversationId, message |

---

## Emoji Reaction

```
Client emit "react_message" { conversationId, messageId, emoji? }
      │
      ├── có emoji → UPSERT reaction { messageId, userId, emoji }
      └── không emoji → DELETE reaction WHERE messageId + userId
      │
      ▼
Emit
   - socket.to("user:A").to("user:B").to("user:C").emit("reaction_updated", { conversationId, messageId, userId, emoji })
```

| Event | Chiều | Payload |
|---|---|---|
| `react_message` | Client → Server | conversationId, messageId, emoji? |
| `reaction_updated` | Server → tất cả | conversationId, messageId, userId, emoji |
