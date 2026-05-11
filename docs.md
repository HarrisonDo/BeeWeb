# BeeWeb Current Protocol Notes

当前前端已经切换为 JSON 发送，不再使用纯文本发送。

## 已实现

- 每个用户问题生成独立 `messageId`。
- 前端发送 `user_message` JSON。
- 后端返回 `content/status/think/tool_call/tool_result/error/end` 时可以带同一个 `messageId`。
- 前端按 `messageId` 分流多个并发回答。
- 如果后端暂时没有返回 `messageId`，前端会落到最近一个 loading 回答里。
- WS 连接成功后，前端会发送 `history_request`。
- 前端支持 `history` 回包并渲染聊天记录。
- assistant 回复支持轻量 Markdown 渲染。

## 关键字段

```json
{
  "type": "user_message",
  "sessionId": "session-xxx",
  "messageId": "msg-xxx",
  "message": "用户问题",
  "createdAt": "2026-05-11T10:00:00.000Z"
}
```

后端所有该问题的流式事件都应带回同一个 `messageId`。

完整协议参考 `WS_BACKEND_TEMPLATE.md`。

