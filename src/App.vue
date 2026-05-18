<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import {
  ArrowDownToLine,
  Download,
  Eraser,
  Languages,
  Moon,
  Plus,
  Square,
  Sun,
  Trash2,
} from 'lucide-vue-next';
import ChatMessage from './components/ChatMessage.vue';
import Composer from './components/Composer.vue';
import ConnectionPanel from './components/ConnectionPanel.vue';
import SessionList from './components/SessionList.vue';
import { useI18n } from './composables/useI18n';
import { useSessions } from './composables/useSessions';
import { useTheme } from './composables/useTheme';
import { useWebSocketAgent } from './composables/useWebSocketAgent';
import type { ClientAttachment } from './protocol/types';

const chatContainer = ref<HTMLElement | null>(null);
const shouldAutoScroll = ref(true);

const { locale, setLocale, t } = useI18n();
const { theme, toggleTheme } = useTheme();

const sessions = useSessions();
sessions.loadSessions();

const agent = useWebSocketAgent({
  activeSession: () => sessions.activeSession.value,
  addMessage: sessions.addMessage,
  saveSessions: sessions.saveSessions,
  touchSession: sessions.touchSession,
  updateTitleFromMessage: sessions.updateTitleFromMessage,
});

const activeMeta = computed(() => {
  const url = agent.wsUrl.value.trim() || t.value.noUrl;
  return `${agent.connected.value ? t.value.activeConnected : t.value.activeWaiting} · ${url}`;
});

const themeLabel = computed(() => (
  theme.value === 'dark' ? t.value.themeLight : t.value.themeDark
));

function onSend(text: string, attachments: ClientAttachment[]) {
  agent.sendText(text, attachments);
  maybeScrollAfterUpdate();
}

function maybeScrollAfterUpdate() {
  nextTick(() => {
    if (shouldAutoScroll.value) scrollToBottom();
  });
}

function scrollToBottom() {
  if (!chatContainer.value) return;
  chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  shouldAutoScroll.value = true;
}

function onScroll() {
  const el = chatContainer.value;
  if (!el) return;
  shouldAutoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function clearSession() {
  sessions.clearCurrentSession();
  agent.clearPendingTurns();
}

function deleteSession() {
  sessions.deleteCurrentSession();
  agent.clearPendingTurns();
}

function selectSession(sessionId: string) {
  sessions.setActiveSession(sessionId);
  agent.clearPendingTurns();
}

function exportSession() {
  const session = sessions.activeSession.value;
  if (!session) return;
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${session.title || 'agentbee-session'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function updateAndResendUserMessage(messageId: string, content: string) {
  const updated = sessions.updateMessageContent(messageId, content);
  if (!updated) return;
  agent.resendEditedText(messageId, content);
  maybeScrollAfterUpdate();
}
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div>
          <h1>AgentBee Web</h1>
          <p>{{ t.tagline }}</p>
        </div>
        <div class="brand-controls">
          <button type="button" class="icon-button" :title="themeLabel" @click="toggleTheme">
            <Sun v-if="theme === 'dark'" :size="17" aria-hidden="true" />
            <Moon v-else :size="17" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="icon-button language-button"
            :title="t.language"
            @click="setLocale(locale === 'zh' ? 'en' : 'zh')"
          >
            <Languages :size="16" aria-hidden="true" />
            <span>{{ locale === 'zh' ? 'EN' : '中' }}</span>
          </button>
        </div>
      </div>

      <div class="side-actions">
        <button type="button" class="icon-text-button" :title="t.newSession" @click="sessions.createSession()">
          <Plus :size="16" aria-hidden="true" />
          <span>{{ t.newSession }}</span>
        </button>
        <button type="button" class="icon-text-button" :title="t.clearSession" @click="clearSession">
          <Eraser :size="16" aria-hidden="true" />
          <span>{{ t.clearSession }}</span>
        </button>
        <button type="button" class="icon-text-button" :title="t.exportSession" @click="exportSession">
          <Download :size="16" aria-hidden="true" />
          <span>{{ t.exportSession }}</span>
        </button>
        <button type="button" class="icon-text-button danger-action" :title="t.deleteSession" @click="deleteSession">
          <Trash2 :size="16" aria-hidden="true" />
          <span>{{ t.deleteSession }}</span>
        </button>
      </div>

      <SessionList
        :labels="t"
        :sessions="sessions.sessions.value"
        :active-session-id="sessions.activeSessionId.value"
        @select="selectSession"
      />

      <ConnectionPanel
        v-model:url="agent.wsUrl.value"
        :labels="t"
        :connected="agent.connected.value"
        @connect="agent.connect"
        @disconnect="agent.disconnect"
      />
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar-title">
          <strong>{{ sessions.activeSession.value?.title || t.newConversation }}</strong>
          <span>{{ activeMeta }}</span>
        </div>
        <div class="topbar-actions">
          <button
            type="button"
            class="icon-button"
            :title="t.stopGeneration"
            :disabled="!agent.hasPendingTurns.value"
            @click="agent.stopCurrent"
          >
            <Square :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="icon-button"
            :title="t.scrollToBottom"
            :class="{ attention: !shouldAutoScroll }"
            @click="scrollToBottom"
          >
            <ArrowDownToLine :size="17" aria-hidden="true" />
          </button>
        </div>
      </header>

      <section ref="chatContainer" class="chat-area" @scroll="onScroll">
        <div v-if="!sessions.activeSession.value?.messages.length" class="empty">
          {{ t.empty }}
        </div>
        <ChatMessage
          v-for="message in sessions.activeSession.value?.messages || []"
          :key="message.id"
          :labels="t"
          :message="message"
          @update-user-message="updateAndResendUserMessage"
        />
      </section>

      <Composer :labels="t" :disabled="!agent.canSend.value" @send="onSend" />
    </main>
  </div>
</template>
