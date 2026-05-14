<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next';
import type { ChatSession } from '../protocol/types';

defineProps<{
  activeSessionId: string | null;
  labels: Record<string, string>;
  sessions: ChatSession[];
}>();

const emit = defineEmits<{
  select: [sessionId: string];
}>();

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <div class="sessions">
    <button
      v-for="session in sessions"
      :key="session.id"
      type="button"
      class="session-item"
      :class="{ active: session.id === activeSessionId }"
      :title="session.title"
      @click="emit('select', session.id)"
    >
      <span class="session-title">
        <MessageSquare :size="14" aria-hidden="true" />
        <span>{{ session.title }}</span>
      </span>
      <span class="session-meta">{{ session.messages.length }} {{ labels.items }} · {{ formatDate(session.updatedAt) }}</span>
    </button>
  </div>
</template>
