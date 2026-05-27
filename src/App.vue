<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import {
  ArrowDownToLine,
  Download,
  Eraser,
  Languages,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sun,
  Trash2,
} from 'lucide-vue-next';
import ChatMessage from './components/ChatMessage.vue';
import Composer from './components/Composer.vue';
import ConnectionPanel from './components/ConnectionPanel.vue';
import SettingsView from './components/SettingsView.vue';
import SessionList from './components/SessionList.vue';
import { useI18n } from './composables/useI18n';
import { useSessions } from './composables/useSessions';
import { useTheme } from './composables/useTheme';
import { useWebSocketAgent } from './composables/useWebSocketAgent';
import type { ClientAttachment } from './protocol/types';

interface CustomModelSettings {
  apiKey: string;
  apiUrl: string;
  modelName: string;
}

const chatContainer = ref<HTMLElement | null>(null);
const shouldAutoScroll = ref(true);
const sidebarCollapsed = ref(false);
const currentView = ref<'chat' | 'settings'>('chat');
const customModel = ref<CustomModelSettings>(readCustomModelSettings());

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
  currentView.value = 'chat';
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

function scrollToLatestAfterRender() {
  nextTick(() => {
    window.requestAnimationFrame(() => {
      scrollToBottom();
    });
  });
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
  currentView.value = 'chat';
  sessions.setActiveSession(sessionId);
  agent.clearPendingTurns();
  scrollToLatestAfterRender();
}

function createSession() {
  currentView.value = 'chat';
  sessions.createSession();
  scrollToLatestAfterRender();
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

function resendUserMessage(messageId: string) {
  const message = sessions.activeSession.value?.messages.find((item) => (
    item.id === messageId &&
    item.role === 'user'
  ));
  if (!message || (!message.content.trim() && !message.attachments?.length)) return;
  agent.resendEditedText(messageId, message.content);
  maybeScrollAfterUpdate();
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

function openSettings() {
  currentView.value = 'settings';
}

function updateCustomModel(field: keyof CustomModelSettings, value: string) {
  customModel.value = {
    ...customModel.value,
    [field]: value,
  };
  localStorage.setItem('agentbee.customModel', JSON.stringify(customModel.value));
}

function updateWsUrl(value: string) {
  agent.wsUrl.value = value;
  localStorage.setItem('agentbee.lastUrl', value);
}

onMounted(() => {
  scrollToLatestAfterRender();
  agent.startAutoConnect();
});

function readCustomModelSettings(): CustomModelSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('agentbee.customModel') || '{}');
    return {
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '',
      apiUrl: typeof saved.apiUrl === 'string' ? saved.apiUrl : '',
      modelName: typeof saved.modelName === 'string' ? saved.modelName : '',
    };
  } catch {
    return {
      apiKey: '',
      apiUrl: '',
      modelName: '',
    };
  }
}
</script>

<template>
  <div class="app" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-copy">
          <h1>AgentBee Web</h1>
          <p>{{ t.tagline }}</p>
        </div>
        <div class="brand-controls">
          <button
            type="button"
            class="icon-button"
            :title="sidebarCollapsed ? t.expandSidebar : t.collapseSidebar"
            @click="toggleSidebar"
          >
            <PanelLeftOpen v-if="sidebarCollapsed" :size="17" aria-hidden="true" />
            <PanelLeftClose v-else :size="17" aria-hidden="true" />
          </button>
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

      <div class="sidebar-body">
        <div class="side-actions">
          <button type="button" class="icon-text-button" :title="t.newSession" @click="createSession">
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
          :labels="t"
          :auto-connect-paused="agent.autoConnectPaused.value"
          :connected="agent.connected.value"
          :connecting="agent.connecting.value"
          @connect="agent.connect"
          @disconnect="agent.disconnect"
          @open-settings="openSettings"
        />
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar-title">
          <strong>{{ currentView === 'settings' ? t.settings : (sessions.activeSession.value?.title || t.newConversation) }}</strong>
          <span>{{ activeMeta }}</span>
        </div>
        <div v-if="currentView === 'chat'" class="topbar-actions">
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

      <section v-if="currentView === 'chat'" ref="chatContainer" class="chat-area" @scroll="onScroll">
        <div v-if="!sessions.activeSession.value?.messages.length" class="empty">
          {{ t.empty }}
        </div>
        <ChatMessage
          v-for="message in sessions.activeSession.value?.messages || []"
          :key="message.id"
          :labels="t"
          :message="message"
          @resend-user-message="resendUserMessage"
          @update-user-message="updateAndResendUserMessage"
        />
      </section>

      <SettingsView
        v-else
        :ws-url="agent.wsUrl.value"
        :connected="agent.connected.value"
        :custom-model="customModel"
        :labels="t"
        @update:custom-model="updateCustomModel"
        @update:ws-url="updateWsUrl"
      />

      <Composer
        v-if="currentView === 'chat'"
        :labels="t"
        :disabled="!agent.canSend.value"
        :has-pending-turns="agent.hasPendingTurns.value"
        @send="onSend"
        @stop="agent.stopCurrent"
      />
    </main>
  </div>
</template>
