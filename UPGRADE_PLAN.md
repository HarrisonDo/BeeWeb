# BeeWeb Framework Upgrade Plan

## Recommendation

Use `Vue 3 + Vite + TypeScript` when BeeWeb outgrows the current native frontend.

The current app is a WebSocket chat workbench. The hard parts are session state, streamed message routing, Markdown rendering, foldable tool/think blocks, and future protocol growth. Vue 3 gives us a clean component model and composables without forcing a full application framework.

## Why Vue 3

- Single File Components keep template, logic, and local styles together.
- Composition API fits reusable logic such as WebSocket handling, sessions, Markdown, and protocol normalization.
- Vite gives fast local development and a small build setup.
- The ecosystem is common enough for future Codex/human maintenance.
- We can migrate gradually from the current `demo.html`, `styles.css`, and `app.js`.

## Compared Options

| Option | Fit | Notes |
| --- | --- | --- |
| Vue 3 + Vite | Best default | Balanced maintainability, ecosystem, and low migration risk. |
| Svelte 5 + Vite | Good | Very concise, but runes add some learning cost. |
| SolidJS + Vite | Good for performance | Fine-grained updates suit streaming, but ecosystem familiarity is lower. |
| React + Vite | Acceptable | Large ecosystem, but this project does not need a heavier React app stack yet. |

## Suggested Stack

- `vite`
- `vue`
- `typescript`
- `markdown-it` or `marked`
- `dompurify`
- Optional later: `pinia`
- Optional later: virtual list package for very long chat histories

## Target Structure

```text
src/
  components/
    ChatMessage.vue
    FoldBlock.vue
    SessionList.vue
    Composer.vue
    ConnectionPanel.vue
  composables/
    useWebSocketAgent.ts
    useSessions.ts
    useMarkdown.ts
  protocol/
    types.ts
    normalizers.ts
  styles/
    base.css
```

## Migration Plan

1. Keep the current native frontend as a stable baseline.
2. Create a Vite + Vue + TypeScript app in a separate branch or folder.
3. Move protocol types and normalizers first.
4. Move session and WebSocket logic into composables.
5. Build `ChatMessage` and `FoldBlock` from current rendering behavior.
6. Replace the custom Markdown renderer with a library plus sanitization.
7. Validate against current backend events:
   - `text`
   - `history_request`
   - `think`
   - `tool_calls`
   - `tool_result`
   - `close`
   - `end`
8. Switch the HTML entry only after feature parity.

## Current Priority Before Migration

- Fix native frontend scrolling during streamed output.
- Improve keyboard behavior.
- Keep protocol docs accurate for backend development.

