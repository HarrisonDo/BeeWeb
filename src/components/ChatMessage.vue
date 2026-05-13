<script setup lang="ts">
import FoldBlock from './FoldBlock.vue';
import { useMarkdown } from '../composables/useMarkdown';
import type { ChatMessage } from '../protocol/types';

const props = defineProps<{
  message: ChatMessage;
}>();

const { renderMarkdown } = useMarkdown();

function roleName(role: ChatMessage['role']) {
  return {
    user: 'User',
    assistant: 'AgentBee',
    system: 'System',
    error: 'Error',
    tool: 'Tool',
  }[role] || role;
}
</script>

<template>
  <article class="message" :class="message.role">
    <div class="meta">{{ roleName(message.role) }} · {{ message.time }}</div>
    <div class="bubble">
      <FoldBlock
        v-if="message.think"
        class-name="think-card"
        :title="message.status === 'loading' ? 'Thinking' : 'Thinking process'"
        :text="message.think"
      />

      <FoldBlock
        v-for="(event, index) in message.toolEvents || []"
        :key="event.id || index"
        :class-name="event.kind === 'tool_result' ? 'tool-result-card' : 'tool-call-card'"
        :title="event.kind === 'tool_result' ? 'Tool result' : `Tool call${event.name ? ` · ${event.name}` : ''}`"
        :summary="event.summary"
        :text="event.data"
      />

      <div
        v-if="message.role === 'assistant'"
        class="markdown-body"
        v-html="renderMarkdown(message.content || '')"
      ></div>
      <div v-else class="markdown-body plain">{{ message.content }}</div>
    </div>
  </article>
</template>
