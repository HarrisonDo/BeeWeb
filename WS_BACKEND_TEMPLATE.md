# AgentBee WebSocket Backend Template

This document describes the message shapes supported by `demo.html`.

The current frontend defaults to sending plain text for compatibility with the existing backend at:

```text
ws://192.168.254.10:8686
```

The frontend can also switch to JSON send mode from the UI.

## Client To Server

### Default Plain Text Mode

```text
用户输入的原始文本
```

### Optional JSON Mode

```json
{
  "type": "user_message",
  "sessionId": "browser-local-session-id",
  "message": "用户输入的原始文本"
}
```

### Stop Request

The stop button always sends JSON:

```json
{
  "type": "stop",
  "sessionId": "browser-local-session-id"
}
```

## Server To Client

All server messages can be JSON strings.

### Assistant Content

```json
{
  "type": "content",
  "data": "流式正文片段"
}
```

Alternative supported fields:

```json
{
  "type": "content",
  "text": "流式正文片段"
}
```

```json
{
  "type": "content",
  "content": "流式正文片段"
}
```

### Thinking Or Status

```json
{
  "type": "think",
  "data": "模型思考或中间状态"
}
```

Also supported:

```json
{
  "type": "status",
  "data": "正在读取文件..."
}
```

### Tool Call

```json
{
  "type": "tool_call",
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
  "ok": true,
  "data": "命令输出"
}
```

### Error

```json
{
  "type": "error",
  "message": "错误原因"
}
```

### End

```json
{
  "type": "end"
}
```

Also supported:

```json
{
  "type": "done"
}
```

```json
{
  "type": "finish"
}
```

## Non-JSON Server Messages

If the server returns a plain string that is not JSON, the frontend renders it as assistant content.

```text
普通字符串回复
```

## Recommended Minimal Stream

```json
{"type":"status","data":"Agent is thinking..."}
```

```json
{"type":"content","data":"你好，"}
```

```json
{"type":"content","data":"我是 AgentBee。"}
```

```json
{"type":"end"}
```

