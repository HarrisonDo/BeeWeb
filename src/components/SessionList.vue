<script setup lang="ts">
import { MessageSquare, Trash2 } from 'lucide-vue-next';
import type { ChatSession } from '../protocol/types';

defineProps<{
  activeSessionId: string | null;
  labels: Record<string, string>;
  sessions: ChatSession[];
}>();

const emit = defineEmits<{
  deleteSession: [sessionId: string];
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
    <div
      v-for="session in sessions"
      :key="session.id"
      class="session-item"
      :class="{ active: session.id === activeSessionId }"
    >
      <button
        type="button"
        class="session-select"
        :title="session.title"
        @click="emit('select', session.id)"
      >
        <span class="session-title">
          <MessageSquare :size="14" aria-hidden="true" />
          <span>{{ session.title }}</span>
        </span>
        <span class="session-meta">{{ session.messages.length }} {{ labels.items }} · {{ formatDate(session.updatedAt) }}</span>
      </button>
      <button
        type="button"
        class="session-delete icon-button"
        :title="labels.deleteSession"
        @click.stop="emit('deleteSession', session.id)"
      >
        <Trash2 :size="14" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
