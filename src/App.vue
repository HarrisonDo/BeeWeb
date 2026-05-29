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
import type { ClientAttachment, ClientSettingAct, ServerMessage } from './protocol/types';

interface BasicSettings {
  apiKey: string;
  apiUrl: string;
  modelName: string;
  wsUrl: string;
}

const chatContainer = ref<HTMLElement | null>(null);
const shouldAutoScroll = ref(true);
const sidebarCollapsed = ref(false);
const currentView = ref<'chat' | 'settings'>('chat');
const agentConfig = ref<Record<string, unknown>>(readAgentConfig());
const configJson = ref(JSON.stringify(agentConfig.value, null, 2));
const configJsonError = ref('');
const settingStatus = ref('');
const availableModels = ref<string[]>([]);

const { locale, setLocale, t } = useI18n();
const { theme, toggleTheme } = useTheme();

const sessions = useSessions();
sessions.loadSessions();

const agent = useWebSocketAgent({
  activeSession: () => sessions.activeSession.value,
  addMessage: sessions.addMessage,
  onSettingMessage: handleSettingMessage,
  onSystemMessage: handleSystemMessage,
  saveSessions: sessions.saveSessions,
  touchSession: sessions.touchSession,
  updateTitleFromMessage: sessions.updateTitleFromMessage,
});
syncWsUrlFromConfig(agentConfig.value);

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

function updateWsUrl(value: string) {
  agent.wsUrl.value = value;
  localStorage.setItem('agentbee.lastUrl', value);
}

const basicSettings = computed<BasicSettings>(() => ({
  apiKey: readString(agentConfig.value, ['agent_llm', 'api_key']),
  apiUrl: readString(agentConfig.value, ['agent_llm', 'api_url']),
  modelName: readString(agentConfig.value, ['agent_llm', 'model']),
  wsUrl: agent.wsUrl.value,
}));

function updateBasicSetting(field: keyof BasicSettings, value: string) {
  const nextConfig = structuredClone(agentConfig.value);
  if (field === 'wsUrl') {
    updateAgentServerFromWsUrl(nextConfig, value);
    updateWsUrl(value);
  }
  if (field === 'apiUrl') setNestedValue(nextConfig, ['agent_llm', 'api_url'], value);
  if (field === 'apiKey') setNestedValue(nextConfig, ['agent_llm', 'api_key'], value);
  if (field === 'modelName') setNestedValue(nextConfig, ['agent_llm', 'model'], value);
  persistAgentConfig(nextConfig);
}

function updateConfigJson(value: string) {
  configJson.value = value;
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) {
      configJsonError.value = t.value.configJsonObjectError;
      return;
    }
    configJsonError.value = '';
    persistAgentConfig(parsed, false);
    syncWsUrlFromConfig(parsed);
  } catch (error) {
    configJsonError.value = error instanceof Error ? error.message : t.value.configJsonParseError;
  }
}

function requestServerConfig() {
  sendSettingRequest('getConfig');
}

function requestDefaultServerConfig() {
  sendSettingRequest('getDefaultConfig');
}

function saveServerConfig() {
  const parsed = parseConfigJson(configJson.value);
  if (!parsed) return;
  persistAgentConfig(parsed, false);
  syncWsUrlFromConfig(parsed);
  sendSettingRequest('saveConfig', parsed);
}

function requestModels() {
  const sent = agent.sendSystemAct('getModels');
  if (!sent) return;
  settingStatus.value = `${t.value.systemRequestSent}: getModels`;
}

function sendSettingRequest(act: ClientSettingAct, content?: unknown) {
  const sent = agent.sendSettingAct(act, content);
  if (!sent) return;
  settingStatus.value = `${t.value.settingRequestSent}: ${act}`;
}

function handleSettingMessage(act: string, content: unknown, msg: ServerMessage) {
  const config = parseSettingConfig(content);
  if (config && (act === 'getConfig' || act === 'getDefaultConfig' || !act)) {
    configJsonError.value = '';
    persistAgentConfig(mergeAgentConfig(createDefaultAgentConfig(), config));
    syncWsUrlFromConfig(agentConfig.value);
    settingStatus.value = act === 'getDefaultConfig'
      ? t.value.defaultConfigLoaded
      : t.value.serverConfigLoaded;
    return;
  }

  if (act === 'saveConfig') {
    settingStatus.value = t.value.serverConfigSaved;
    return;
  }

  settingStatus.value = msg.message || t.value.settingResponseReceived;
}

function handleSystemMessage(act: string, content: unknown, msg: ServerMessage) {
  if (act === 'getModels') {
    const models = parseModels(content);
    if (models.length) {
      availableModels.value = models;
      settingStatus.value = `${t.value.modelsLoaded}: ${models.length}`;
      return;
    }
  }

  settingStatus.value = msg.message || t.value.systemResponseReceived;
}

function parseConfigJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) {
      configJsonError.value = t.value.configJsonObjectError;
      return null;
    }
    configJsonError.value = '';
    return parsed;
  } catch (error) {
    configJsonError.value = error instanceof Error ? error.message : t.value.configJsonParseError;
    return null;
  }
}

function parseSettingConfig(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseModels(value: unknown): string[] {
  const rawModels = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.models)
      ? value.models
      : isRecord(value) && Array.isArray(value.data)
        ? value.data
        : [];

  return rawModels
    .map((item) => {
      if (typeof item === 'string') return item;
      if (isRecord(item) && typeof item.id === 'string') return item.id;
      if (isRecord(item) && typeof item.name === 'string') return item.name;
      if (isRecord(item) && typeof item.model === 'string') return item.model;
      return '';
    })
    .filter((item, index, all) => item && all.indexOf(item) === index);
}

function syncWsUrlFromConfig(config: Record<string, unknown>) {
  const host = readString(config, ['agent_server', 'host']) || '127.0.0.1';
  const port = readNumber(config, ['agent_server', 'port'], 8686);
  updateWsUrl(`ws://${host}:${port}`);
}

function updateAgentServerFromWsUrl(config: Record<string, unknown>, value: string) {
  try {
    const parsed = new URL(value);
    setNestedValue(config, ['agent_server', 'host'], parsed.hostname || '127.0.0.1');
    setNestedValue(config, ['agent_server', 'port'], parsed.port ? Number(parsed.port) : 8686);
  } catch {
    const trimmed = value.replace(/^wss?:\/\//, '');
    const [host, port] = trimmed.split(':');
    setNestedValue(config, ['agent_server', 'host'], host || '127.0.0.1');
    setNestedValue(config, ['agent_server', 'port'], port ? Number(port) : 8686);
  }
}

onMounted(() => {
  scrollToLatestAfterRender();
  agent.startAutoConnect();
});

function readAgentConfig(): Record<string, unknown> {
  const defaults = createDefaultAgentConfig();
  try {
    const saved = JSON.parse(localStorage.getItem('agentbee.agentConfig') || 'null');
    if (isRecord(saved)) return mergeAgentConfig(defaults, saved);
  } catch {
  }
  return defaults;
}

function persistAgentConfig(nextConfig: Record<string, unknown>, syncJson = true) {
  agentConfig.value = nextConfig;
  localStorage.setItem('agentbee.agentConfig', JSON.stringify(nextConfig));
  if (syncJson) configJson.value = JSON.stringify(nextConfig, null, 2);
}

function createDefaultAgentConfig(): Record<string, unknown> {
  return {
    agent_server: {
      host: '127.0.0.1',
      port: 8686,
      ping_interval: 60,
    },
    agent_llm: {
      provider: 'agent_openai',
      work_name: 'procWorker',
      api_url: 'http://127.0.0.1:1234/v1',
      api_key: 'sk-lm-J78sqMgX:IUMBn3qsotGyfViPMaRS',
      model: 'qwen3.6-35b-a3b-mtp-apex',
      org_id: '',
      timeout: 7200,
      keep_reasons: false,
      params: {
        max_tokens: 32768,
        temperature: 0.8,
        min_p: 0.05,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0.5,
        stop: [],
        extra_body: {
          thinking: false,
          chat_template_kwargs: {
            enable_thinking: false,
          },
        },
        thinking: {
          type: 'disabled',
        },
      },
    },
    agent_task: {
      provider: 'agent_mem_db',
    },
    agent_memory: {
      provider: 'agent_mem_db',
      max_history: 30,
    },
    agent_tools: {
      enabled: true,
      in_sandbox: true,
      workspace_path: '',
      list: [
        { name: 'agent_mem_db' },
        { name: 'agent_tools' },
        { name: 'agent_claw' },
      ],
    },
    memory_limit: '4G',
    debug: false,
  };
}

function mergeAgentConfig(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value)
      ? mergeAgentConfig(current, value)
      : value;
  });
  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(source: Record<string, unknown>, path: string[]): string {
  const value = readNestedValue(source, path);
  return typeof value === 'string' ? value : '';
}

function readNumber(source: Record<string, unknown>, path: string[], fallback: number): number {
  const value = readNestedValue(source, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readNestedValue(source: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (
    isRecord(current) ? current[key] : undefined
  ), source);
}

function setNestedValue(source: Record<string, unknown>, path: string[], value: unknown) {
  let current = source;
  path.slice(0, -1).forEach((key) => {
    if (!isRecord(current[key])) current[key] = {};
    current = current[key] as Record<string, unknown>;
  });
  current[path[path.length - 1]] = value;
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
        :basic-settings="basicSettings"
        :available-models="availableModels"
        :connected="agent.connected.value"
        :config-json="configJson"
        :config-json-error="configJsonError"
        :labels="t"
        :setting-status="settingStatus"
        @get-models="requestModels"
        @get-config="requestServerConfig"
        @get-default-config="requestDefaultServerConfig"
        @save-config="saveServerConfig"
        @update:basic-setting="updateBasicSetting"
        @update:config-json="updateConfigJson"
      />

      <Composer
        v-if="currentView === 'chat'"
        :labels="t"
        :disabled="!agent.canSend.value"
        @send="onSend"
        @stop="agent.stopCurrent"
      />
    </main>
  </div>
</template>
