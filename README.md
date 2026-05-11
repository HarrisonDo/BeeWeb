# BeeWeb

BeeWeb is a standalone web chat page for an existing WebSocket agent service.

Current backend:

```text
ws://192.168.254.10:8686
```

The page does not start or manage the backend. The backend owns model configuration, API keys, instructions, tools, and execution.

## Files

- `demo.html`: page structure and entry file.
- `styles.css`: frontend style file.
- `app.js`: frontend interaction logic.
- `WS_BACKEND_TEMPLATE.md`: WebSocket request/response templates for backend alignment.

## Usage

Open `demo.html` in a browser.

Default settings:

- WebSocket URL: `ws://192.168.254.10:8686`
- Send mode: plain text

Plain text mode is the compatibility mode for the current backend. JSON mode is available in the UI for future protocol upgrades.

## Frontend Features

- Editable WebSocket URL.
- Connect and disconnect controls.
- Plain text or JSON send mode.
- Local conversation sessions.
- Browser-side history persistence through `localStorage`.
- New, clear, delete, and export session actions.
- Streaming assistant rendering.
- Thinking/status rendering.
- Tool call and tool result rendering.
- Error rendering.
- Stop request button.
- Non-JSON backend response fallback.

## Backend Contract

See `WS_BACKEND_TEMPLATE.md`.
