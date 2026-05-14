# BeeWeb

BeeWeb is a Vue 3 + Vite + TypeScript frontend for an existing WebSocket agent service.

Current backend:

```text
ws://192.168.254.10:8686
```

The page does not start or manage the backend. The backend owns model configuration, API keys, instructions, tools, and execution.

## Usage

Install dependencies and start the Vue dev server:

```bash
npm install
npm run dev
```

Default settings:

- WebSocket URL: `ws://192.168.254.10:8686`
- Send mode: JSON

## Files

- `src/`: Vue application source.
- `src/components/`: chat, session, composer, fold-block, and connection UI components.
- `src/composables/`: session persistence, WebSocket agent flow, and Markdown rendering.
- `src/protocol/`: WebSocket event types and normalizers.
- `old/`: archived native HTML/CSS/JS frontend.
- `WS_BACKEND_TEMPLATE.md`: WebSocket request/response templates for backend alignment.
- `BACKEND_REFERENCE_DEMO.md`: backend reference event flow.
- `docs.md`: current protocol implementation notes.
- `UPGRADE_PLAN.md`: Vue/Vite upgrade notes.

## Frontend Features

- Editable WebSocket URL.
- Connect and disconnect controls.
- JSON-only message sending.
- `messageId` based streaming response matching.
- Local conversation sessions.
- Browser-side history persistence through `localStorage`.
- Automatic local history pruning when browser storage is full, keeping newer conversations/messages first.
- New, clear, delete, and export session actions.
- Streaming assistant rendering.
- Stream output only auto-scrolls while the user is near the bottom.
- Markdown rendering with sanitization.
- Thinking/status rendering.
- Tool call and tool result rendering.
- Error rendering.
- Stop request button.
- Non-JSON backend response fallback.
- Enter sends, Ctrl/Cmd+Enter inserts a newline.

## Backend Contract

See `WS_BACKEND_TEMPLATE.md`.
