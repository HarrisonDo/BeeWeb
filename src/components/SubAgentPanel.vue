<script setup lang="ts">
import { computed, ref } from 'vue';
import { MessageSquare, X } from 'lucide-vue-next';
import ChatMessage from './ChatMessage.vue';
import type { ChatMessage as AgentChatMessage } from '../protocol/types';

const props = defineProps<{
  labels: Record<string, string>;
  messages: AgentChatMessage[];
  subAgents: Array<{ name: string; count: number }>;
}>();

const emit = defineEmits<{
  resendUserMessage: [messageId: string];
  updateUserMessage: [messageId: string, content: string];
  deleteSubAgent: [agentName: string];
}>();

const selectedAgentName = ref<string | null>(null);
const isPanelOpen = ref(false);

const filteredMessages = computed(() => {
  if (!selectedAgentName.value) return [];
  return props.messages.filter((msg) => msg.senderName === selectedAgentName.value);
});

function selectAgent(agentName: string) {
  selectedAgentName.value = agentName;
  isPanelOpen.value = true;
}

function closePanel() {
  isPanelOpen.value = false;
}

function deleteSubAgent(agentName: string, event: MouseEvent) {
  event.stopPropagation();
  emit('deleteSubAgent', agentName);
  if (selectedAgentName.value === agentName) {
    isPanelOpen.value = false;
    selectedAgentName.value = null;
  }
}

function onResendUserMessage(messageId: string) {
  emit('resendUserMessage', messageId);
}

function onUpdateUserMessage(messageId: string, content: string) {
  emit('updateUserMessage', messageId, content);
}
</script>

<template>
  <div class="subagent-container">
    <div v-if="subAgents.length" class="subagent-tabs">
      <div
        v-for="agent in subAgents"
        :key="agent.name"
        class="subagent-tab-wrapper"
      >
        <button
          type="button"
          class="subagent-tab"
          :class="{ active: selectedAgentName === agent.name && isPanelOpen }"
          :title="agent.name"
          @click="selectAgent(agent.name)"
        >
          <MessageSquare :size="18" aria-hidden="true" />
          <span v-if="agent.count > 0" class="subagent-badge">{{ agent.count }}</span>
        </button>
        <button
          type="button"
          class="subagent-delete"
          :title="labels.deleteSession || 'Delete'"
          @click="deleteSubAgent(agent.name, $event)"
        >
          <X :size="12" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="isPanelOpen && selectedAgentName" class="subagent-panel">
      <div class="subagent-header">
        <div class="subagent-title">
          <MessageSquare :size="16" aria-hidden="true" />
          <span>{{ selectedAgentName }}</span>
        </div>
        <button type="button" class="icon-button" :title="labels.close || 'Close'" @click="closePanel">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
      <div class="subagent-messages">
        <div v-if="!filteredMessages.length" class="subagent-empty">
          {{ labels.noMessages || 'No messages' }}
        </div>
        <ChatMessage
          v-for="message in filteredMessages"
          :key="message.id"
          :labels="labels"
          :message="message"
          @resend-user-message="onResendUserMessage"
          @update-user-message="onUpdateUserMessage"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.subagent-container {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
  pointer-events: none;
}

.subagent-container > * {
  pointer-events: auto;
}

.subagent-tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 8px;
  background: var(--sidebar-bg);
  border-left: 1px solid var(--line);
}

.subagent-tab-wrapper {
  position: relative;
}

.subagent-tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s;
}

.subagent-tab:hover {
  background: var(--surface-raised);
  color: var(--text);
  border-color: var(--accent-soft);
}

.subagent-tab.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.subagent-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  background: var(--accent-strong);
  color: white;
  border-radius: 9px;
  border: 2px solid var(--sidebar-bg);
}

.subagent-delete {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--danger);
  color: white;
  border: 2px solid var(--sidebar-bg);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s;
  z-index: 10;
}

.subagent-tab-wrapper:hover .subagent-delete {
  opacity: 1;
}

.subagent-delete:hover {
  background: var(--danger);
  transform: scale(1.1);
}

.subagent-panel {
  position: absolute;
  right: 60px;
  top: 0;
  bottom: 0;
  width: 420px;
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.subagent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-soft);
}

.subagent-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text);
}

.subagent-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 100%;
}

.subagent-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 14px;
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s;
}

.icon-button:hover {
  background: var(--surface-raised);
  color: var(--text);
  border-color: var(--line);
}
</style>
