<script setup lang="ts">
import { computed } from 'vue';
import FoldBlock from './FoldBlock.vue';
import ToolEventsBlock from './ToolEventsBlock.vue';
import { useMarkdown } from '../composables/useMarkdown';
import type { ChatMessage } from '../protocol/types';

const props = defineProps<{
  message: ChatMessage;
}>();

const { renderMarkdown } = useMarkdown();

const hasAssistantOutput = computed(() => (
  Boolean(props.message.content?.trim()) ||
  Boolean(props.message.think?.trim()) ||
  Boolean(props.message.toolEvents?.length)
));

const isWaitingForResponse = computed(() => (
  props.message.role === 'assistant' &&
  props.message.status === 'loading' &&
  !hasAssistantOutput.value
));

const endedWithoutResponse = computed(() => (
  props.message.role === 'assistant' &&
  props.message.status !== 'loading' &&
  !hasAssistantOutput.value
));

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

      <ToolEventsBlock
        v-if="message.toolEvents?.length"
        :events="message.toolEvents"
      />

      <div v-if="isWaitingForResponse" class="message-loading" aria-live="polite">
        <span>Waiting for response</span>
        <span class="typing-dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </div>

      <div v-else-if="endedWithoutResponse" class="message-ended">
        No response received. Conversation ended.
      </div>

      <div
        v-else-if="message.role === 'assistant'"
        class="markdown-body"
        v-html="renderMarkdown(message.content || '')"
      ></div>
      <div v-else class="markdown-body plain">{{ message.content }}</div>
    </div>
  </article>
</template>
