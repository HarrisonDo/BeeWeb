# BeeWeb

## 中文

BeeWeb 是一个基于 `Vue 3 + Vite + TypeScript` 的 WebSocket Agent 聊天前端。

它本身只负责浏览器端界面、会话管理、消息渲染和 WebSocket 通信，不负责启动或管理模型、工具、API Key、系统提示词等后端能力。

完整运行需要配合核心支援项目：

- [AgentBee](https://github.com/Jerry-Shaw/AgentBee)

当前默认 WebSocket 后端地址：

```text
ws://192.168.254.10:8686
```

### 使用方式

安装依赖并启动开发服务器：

```bash
npm install
npm run dev
```

构建生产版本：

```bash
npm run build
```

### 发布版本

推送 `v*` 标签会触发 GitHub Actions 自动构建并创建 Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

Release 附件会包含 `BeeWeb-v0.1.0.zip`。解压后可直接部署解压目录，入口是 `index.html`，协议说明文档在 `docs/` 目录。

默认设置：

- WebSocket URL: `ws://192.168.254.10:8686`
- 发送模式：JSON

### 本地历史记录

当前暂不开发 WebSocket 获取聊天记录功能，聊天记录保存在浏览器 `localStorage` 中。

当浏览器存储空间不足时，BeeWeb 会自动裁剪旧记录：

- 优先裁剪最旧会话里的旧消息。
- 优先保留当前会话。
- 优先保留较新的会话和消息。
- 如果所有会话都已经很短，再删除最旧的非当前会话。

### 文件结构

- `src/`: Vue 应用源码。
- `src/components/`: 聊天消息、会话列表、输入框、折叠块、连接面板等组件。
- `src/composables/`: 会话持久化、WebSocket Agent 流程、Markdown 渲染。
- `src/protocol/`: WebSocket 事件类型和 normalizer。
- `old/`: 旧版原生 HTML/CSS/JS 前端归档。
- `WS_BACKEND_TEMPLATE.md`: WebSocket 请求/响应模板。
- `BACKEND_REFERENCE_DEMO.md`: 后端事件流参考。
- `docs.md`: 当前协议实现说明。
- `UPGRADE_PLAN.md`: Vue/Vite 升级记录。

### 前端功能

- 可编辑 WebSocket URL。
- 连接和断开控制。
- JSON 消息发送。
- 基于 `messageId` 的流式响应匹配。
- 本地会话管理。
- 浏览器本地历史记录持久化。
- 浏览器存储满时自动裁剪旧记录。
- 新建、清空、删除、导出会话。
- 流式 assistant 消息渲染。
- 用户不在底部时不强制自动滚动。
- Markdown 渲染和内容清理。
- thinking/status 折叠渲染。
- tool call 和 tool result 聚合折叠渲染。
- 错误消息渲染。
- 停止生成请求。
- 非 JSON 后端响应兜底显示。
- Enter 发送，Ctrl/Cmd+Enter 换行。

### 后端协议

见 `WS_BACKEND_TEMPLATE.md`。

## English

BeeWeb is a `Vue 3 + Vite + TypeScript` WebSocket Agent chat frontend.

It only handles the browser UI, session management, message rendering, and WebSocket communication. It does not start or manage the backend, model configuration, API keys, system instructions, or tools.

To run the full system, use it together with the core supporting project:

- [AgentBee](https://github.com/Jerry-Shaw/AgentBee)

Current default WebSocket backend:

```text
ws://192.168.254.10:8686
```

### Usage

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

### Release

Pushing a `v*` tag triggers GitHub Actions to build the app and create a GitHub Release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release asset contains `BeeWeb-v0.1.0.zip`. After extraction, deploy the extracted directory directly. The entry file is `index.html`, and protocol docs are in `docs/`.

Default settings:

- WebSocket URL: `ws://192.168.254.10:8686`
- Send mode: JSON

### Local History

WebSocket-based history loading is not enabled for now. Chat history is stored in browser `localStorage`.

When browser storage is full, BeeWeb automatically prunes older records:

- Prune old messages from the oldest conversations first.
- Prefer keeping the current conversation.
- Prefer keeping newer conversations and messages.
- If every conversation is already short, remove the oldest non-current conversation.

### Files

- `src/`: Vue application source.
- `src/components/`: chat message, session list, composer, fold block, and connection panel components.
- `src/composables/`: session persistence, WebSocket Agent flow, and Markdown rendering.
- `src/protocol/`: WebSocket event types and normalizers.
- `old/`: archived native HTML/CSS/JS frontend.
- `WS_BACKEND_TEMPLATE.md`: WebSocket request/response templates.
- `BACKEND_REFERENCE_DEMO.md`: backend event-flow reference.
- `docs.md`: current protocol implementation notes.
- `UPGRADE_PLAN.md`: Vue/Vite upgrade notes.

### Frontend Features

- Editable WebSocket URL.
- Connect and disconnect controls.
- JSON-only message sending.
- `messageId` based streaming response matching.
- Local conversation sessions.
- Browser-side history persistence through `localStorage`.
- Automatic local history pruning when browser storage is full.
- New, clear, delete, and export session actions.
- Streaming assistant rendering.
- Stream output only auto-scrolls while the user is near the bottom.
- Markdown rendering with sanitization.
- Thinking/status fold rendering.
- Aggregated fold rendering for tool calls and tool results.
- Error rendering.
- Stop request button.
- Non-JSON backend response fallback.
- Enter sends, Ctrl/Cmd+Enter inserts a newline.

### Backend Contract

See `WS_BACKEND_TEMPLATE.md`.
