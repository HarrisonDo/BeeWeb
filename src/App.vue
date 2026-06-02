<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw, watch } from 'vue';
import {
  ArrowDownToLine,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import ChatMessage from './components/ChatMessage.vue';
import Composer from './components/Composer.vue';
import ConnectionPanel from './components/ConnectionPanel.vue';
import SettingsView from './components/SettingsView.vue';
import SessionList from './components/SessionList.vue';
import SystemLogGroup from './components/SystemLogGroup.vue';
import { useI18n } from './composables/useI18n';
import { useSessions } from './composables/useSessions';
import { useTheme } from './composables/useTheme';
import { useWebSocketAgent } from './composables/useWebSocketAgent';
import type { ChatMessage as AgentChatMessage, ClientAttachment, ClientSettingAct, ServerMessage } from './protocol/types';

interface BasicSettings {
  apiKey: string;
  apiUrl: string;
  modelName: string;
  wsUrl: string;
}

type VisibleChatItem =
  | {
    key: string;
    message: AgentChatMessage;
    type: 'message';
  }
  | {
    key: string;
    messages: AgentChatMessage[];
    type: 'system-group';
  };

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
const { setTheme, theme } = useTheme();

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
watch(() => agent.canSend.value, (canSend) => {
  if (canSend) requestServerConfigIfNeeded();
});

const activeMeta = computed(() => {
  const url = agent.wsUrl.value.trim() || t.value.noUrl;
  return `${agent.connected.value ? t.value.activeConnected : t.value.activeWaiting} · ${url}`;
});

const visibleChatItems = computed<VisibleChatItem[]>(() => {
  const messages = sessions.activeSession.value?.messages || [];
  const items: VisibleChatItem[] = [];
  let pendingSystemMessages: AgentChatMessage[] = [];

  function flushSystemMessages() {
    if (!pendingSystemMessages.length) return;
    items.push({
      key: `system-${pendingSystemMessages[0].id}`,
      messages: pendingSystemMessages,
      type: 'system-group',
    });
    pendingSystemMessages = [];
  }

  messages.forEach((message) => {
    if (message.role === 'system') {
      pendingSystemMessages.push(message);
      return;
    }

    flushSystemMessages();
    items.push({
      key: message.id,
      message,
      type: 'message',
    });
  });

  flushSystemMessages();
  return items;
});

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

let settingsConfigRequested = false;

function openSettings() {
  refreshConfigJson();
  configJsonError.value = '';
  settingStatus.value = '';
  settingsConfigRequested = false;
  currentView.value = 'settings';
  requestServerConfigIfNeeded();
}

function closeSettings() {
  currentView.value = 'chat';
  scrollToLatestAfterRender();
}

function updateWsUrl(value: string) {
  agent.wsUrl.value = value;
  localStorage.setItem('agentbee.lastUrl', value);
}

const basicSettings = computed<BasicSettings>(() => ({
  apiKey: readString(agentConfig.value, ['agent_llm', 'api_key']),
  apiUrl: readString(agentConfig.value, ['agent_llm', 'api_url']),
  modelName: readString(agentConfig.value, ['agent_llm', 'model']),
  wsUrl: getWsUrlFromConfig(agentConfig.value),
}));

function updateBasicSetting(field: keyof BasicSettings, value: string) {
  const nextConfig = cloneConfig(agentConfig.value);
  if (field === 'wsUrl') {
    updateAgentServerFromWsUrl(nextConfig, value);
  }
  if (field === 'apiUrl') setNestedValue(nextConfig, ['agent_llm', 'api_url'], value);
  if (field === 'apiKey') setNestedValue(nextConfig, ['agent_llm', 'api_key'], value);
  if (field === 'modelName') setNestedValue(nextConfig, ['agent_llm', 'model'], value);
  applyAgentConfig(nextConfig, { syncJson: true, syncWs: true });
  configJsonError.value = '';
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
    applyAgentConfig(parsed, { syncJson: false, syncWs: true });
  } catch (error) {
    configJsonError.value = error instanceof Error ? error.message : t.value.configJsonParseError;
  }
}

function requestServerConfig() {
  sendSettingRequest('getConfig');
}

function requestServerConfigIfNeeded() {
  if (currentView.value !== 'settings' || settingsConfigRequested || !agent.canSend.value) return;
  settingsConfigRequested = true;
  requestServerConfig();
}

function requestDefaultServerConfig() {
  sendSettingRequest('getDefaultConfig');
}

function saveServerConfig() {
  const parsed = parseConfigJson(configJson.value);
  if (!parsed) return;
  applyAgentConfig(parsed, { syncJson: false, syncWs: true });
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
    applyAgentConfig(config, { syncJson: true, syncWs: true });
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
  const models = new Set<string>();
  const seen = new WeakSet<object>();

  function visit(node: unknown, key = '', depth = 0) {
    if (depth > 6 || node == null) return;
    if (typeof node === 'object') {
      if (seen.has(node as object)) return;
      seen.add(node as object);
    }
    if (typeof node === 'string') {
      if (!key || isModelKey(key) || looksLikeModelName(node)) models.add(node);
      return;
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, key, depth + 1));
      return;
    }
    Object.entries(node).forEach(([entryKey, entryValue]) => {
      if (typeof entryValue === 'string' && isModelKey(entryKey)) {
        models.add(entryValue);
      }
      if (Array.isArray(entryValue) || isRecord(entryValue)) {
        visit(entryValue, entryKey, depth + 1);
      } else if (typeof entryValue === 'string' && !isModelKey(entryKey)) {
        if (looksLikeModelName(entryValue)) models.add(entryValue);
      }
    });
  }

  visit(value);
  return Array.from(models);
}

function isModelKey(key: string) {
  const normalized = key.toLowerCase();
  return ['id', 'name', 'model', 'model_name', 'modelname', 'value', 'label', 'title'].includes(normalized);
}

function looksLikeModelName(value: string) {
  return /^[\w.-]{2,}$/.test(value) && /[a-z0-9]/i.test(value);
}

function syncWsUrlFromConfig(config: Record<string, unknown>) {
  updateWsUrl(getWsUrlFromConfig(config));
}

function getWsUrlFromConfig(config: Record<string, unknown>) {
  const host = readString(config, ['agent_server', 'host']) || '127.0.0.1';
  const port = readPort(config, ['agent_server', 'port'], '8686');
  return port ? `ws://${host}:${port}` : `ws://${host}`;
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

function applyAgentConfig(
  nextConfig: Record<string, unknown>,
  options: { syncJson?: boolean; syncWs?: boolean } = {},
) {
  const syncJson = options.syncJson ?? true;
  const syncWs = options.syncWs ?? true;
  agentConfig.value = cloneConfig(nextConfig);
  localStorage.setItem('agentbee.agentConfig', stringifyConfig(agentConfig.value));
  if (syncWs) syncWsUrlFromConfig(agentConfig.value);
  if (syncJson) refreshConfigJson();
}

function refreshConfigJson() {
  configJson.value = stringifyConfig(agentConfig.value);
}

function stringifyConfig(config: Record<string, unknown>) {
  return JSON.stringify(toRaw(config), null, 2);
}

function cloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(stringifyConfig(config)) as Record<string, unknown>;
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

function readPort(source: Record<string, unknown>, path: string[], fallback: string): string {
  const value = readNestedValue(source, path);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value.trim();
  return fallback;
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
        </div>
      </div>

      <div class="sidebar-body">
        <div class="side-actions">
          <button type="button" class="icon-text-button" :title="t.newSession" @click="createSession">
            <Plus :size="16" aria-hidden="true" />
            <span>{{ t.newSession }}</span>
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
        <template v-for="item in visibleChatItems" :key="item.key">
          <SystemLogGroup
            v-if="item.type === 'system-group'"
            :labels="t"
            :messages="item.messages"
          />
          <ChatMessage
            v-else
            :labels="t"
            :message="item.message"
            @resend-user-message="resendUserMessage"
            @update-user-message="updateAndResendUserMessage"
          />
        </template>
      </section>

      <SettingsView
        v-else
        :basic-settings="basicSettings"
        :available-models="availableModels"
        :connected="agent.connected.value"
        :config-json="configJson"
        :config-json-error="configJsonError"
        :labels="t"
        :locale="locale"
        :setting-status="settingStatus"
        :theme="theme"
        @get-models="requestModels"
        @close="closeSettings"
        @get-config="requestServerConfig"
        @get-default-config="requestDefaultServerConfig"
        @save-config="saveServerConfig"
        @set-locale="setLocale"
        @set-theme="setTheme"
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
