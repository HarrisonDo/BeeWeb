# AgentBee WebSocket Backend Template

This document describes the JSON protocol expected by the current `demo.html` frontend.

Current backend URL:

```text
ws://192.168.254.10:8686
```

## Key Rule

Every user question has a unique `messageId`.

The backend should include the same `messageId` in all streamed events for that question. This lets the frontend render multiple concurrent questions without mixing replies.

## Client To Server

### Load History After Connection

The frontend may request backend chat history after the WebSocket connection opens:

```json
{
  "type": "history_request",
  "sessionId": "browser-local-session-id"
}
```

### User Message

The frontend now sends JSON only:

```json
{
  "type": "user_message",
  "sessionId": "browser-local-session-id",
  "messageId": "question-message-id",
  "message": "用户输入的原始文本",
  "createdAt": "2026-05-11T10:00:00.000Z"
}
```

### Stop Request

```json
{
  "type": "stop",
  "sessionId": "browser-local-session-id",
  "messageId": "question-message-id"
}
```

## Server To Client

All server messages should be JSON strings.

### History Response

```json
{
  "type": "history",
  "sessionId": "browser-local-session-id",
  "messages": [
    {
      "role": "user",
      "messageId": "question-message-id",
      "content": "介绍一下这个项目"
    },
    {
      "role": "assistant",
      "messageId": "question-message-id",
      "content": "这是一个 WebSocket 前端聊天台。"
    }
  ]
}
```

### Assistant Content

```json
{
  "type": "content",
  "sessionId": "browser-local-session-id",
  "messageId": "question-message-id",
  "data": "流式正文片段"
}
```

Alternative content fields supported by the frontend:

```json
{
  "type": "content",
  "messageId": "question-message-id",
  "text": "流式正文片段"
}
```

```json
{
  "type": "content",
  "messageId": "question-message-id",
  "content": "流式正文片段"
}
```

### Thinking Or Status

```json
{
  "type": "status",
  "sessionId": "browser-local-session-id",
  "messageId": "question-message-id",
  "data": "Agent is thinking..."
}
```

Also supported:

```json
{
  "type": "think",
  "messageId": "question-message-id",
  "data": "模型思考或中间状态"
}
```

### Tool Call

```json
{
  "type": "tool_call",
  "sessionId": "browser-local-session-id",
  "messageId": "question-message-id",
  "toolCallId": "tool-call-id",
  "name": "exec_command",
  "args": {
    "cmd": "ls"
  }
}
```

### Tool Result

```json
{
  "type": "tool_result",
  "sessionId": "browser-local-session-id",
  "messageId": "question-message-id",
  "toolCallId": "tool-call-id",
  "ok": true,
  "data": "命令输出"
}
```

### Error

```json
{
  "type": "error",
  "sessionId": "browser-local-session-id",
  "messageId": "question-message-id",
  "message": "错误原因"
}
```

### End

```json
{
  "type": "end",
  "sessionId": "browser-local-session-id",
  "messageId": "question-message-id"
}
```

Also supported:

```json
{
  "type": "done",
  "messageId": "question-message-id"
}
```

```json
{
  "type": "finish",
  "messageId": "question-message-id"
}
```

## Recommended Minimal Stream

Client sends:

```json
{
  "type": "user_message",
  "sessionId": "session-1",
  "messageId": "msg-1",
  "message": "用 Markdown 回复一个列表",
  "createdAt": "2026-05-11T10:00:00.000Z"
}
```

Server streams:

```json
{"type":"status","sessionId":"session-1","messageId":"msg-1","data":"Agent is thinking..."}
```

```json
{"type":"content","sessionId":"session-1","messageId":"msg-1","data":"## 示例回复\n\n"}
```

```json
{"type":"content","sessionId":"session-1","messageId":"msg-1","data":"- 第一项\n- 第二项\n\n```js\nconsole.log('hello')\n```"}
```

```json
{"type":"end","sessionId":"session-1","messageId":"msg-1"}
```

## Concurrent Message Demo

When two questions are running at the same time, return each stream with its own `messageId`.

```json
{"type":"content","sessionId":"session-1","messageId":"msg-A","data":"A 的第一段"}
```

```json
{"type":"content","sessionId":"session-1","messageId":"msg-B","data":"B 的第一段"}
```

```json
{"type":"end","sessionId":"session-1","messageId":"msg-B"}
```

```json
{"type":"end","sessionId":"session-1","messageId":"msg-A"}
```

The frontend will render A and B into different assistant bubbles.

