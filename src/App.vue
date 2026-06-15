<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw, watch } from 'vue';
import {
  ArrowDownToLine,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from 'lucide-vue-next';
import ChatMessage from './components/ChatMessage.vue';
import Composer from './components/Composer.vue';
import ConnectionPanel from './components/ConnectionPanel.vue';
import SettingsView from './components/SettingsView.vue';
import SessionList from './components/SessionList.vue';
import SystemLogGroup from './components/SystemLogGroup.vue';
import SubAgentPanel from './components/SubAgentPanel.vue';
import { useI18n } from './composables/useI18n';
import { useSessions } from './composables/useSessions';
import { useTheme } from './composables/useTheme';
import { useWebSocketAgent } from './composables/useWebSocketAgent';
import type { ChatMessage as AgentChatMessage, ClientAttachment, ClientSettingAct, ServerMessage } from './protocol/types';

interface BasicSettings {
  apiKey: string;
  apiUrl: string;
  inSandbox: boolean;
  modelName: string;
  workspacePath: string;
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
watch(() => agent.canSend.value, (canSend) => {
  if (canSend) {
    requestServerConfigIfNeeded();
    requestModels(true);
    return;
  }
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
    // 过滤掉子agent的消息，不在主聊天区显示
    if (message.isSubTalk === 1) {
      return;
    }

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

const subAgentMessages = computed(() => {
  const messages = sessions.activeSession.value?.messages || [];
  return messages.filter((msg) => msg.isSubTalk === 1);
});

const subAgents = computed(() => {
  const agents = new Map<string, { name: string; count: number }>();
  subAgentMessages.value.forEach((msg) => {
    const name = msg.senderName;
    if (name) {
      const existing = agents.get(name);
      if (existing) {
        existing.count += 1;
      } else {
        agents.set(name, {
          name,
          count: 1,
        });
      }
    }
  });
  return Array.from(agents.values());
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

function deleteSession(sessionId: string) {
  const deletedActiveSession = sessionId === sessions.activeSessionId.value;
  sessions.deleteSession(sessionId);
  if (deletedActiveSession) {
    agent.clearPendingTurns();
    scrollToLatestAfterRender();
  }
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
  const attachments: ClientAttachment[] = (message.attachments || []).map((attachment) => ({
    ...attachment,
  }));
  agent.sendText(message.content, attachments);
  maybeScrollAfterUpdate();
}

function deleteSubAgent(agentName: string) {
  const session = sessions.activeSession.value;
  if (!session) return;
  session.messages = session.messages.filter((msg) => msg.senderName !== agentName);
  sessions.saveSessions();
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

let settingsConfigRequested = false;
let refreshModelsAfterSave = false;
let reconnectAfterSave = false;
let requestModelsAfterNextConnect = false;

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
  inSandbox: readBoolean(agentConfig.value, ['sandbox_mode'], true),
  modelName: readString(agentConfig.value, ['agent_llm', 'model']),
  workspacePath: readString(agentConfig.value, ['workspace_path']),
}));

function updateBasicSetting(field: keyof BasicSettings, value: boolean | string) {
  const nextConfig = cloneConfig(agentConfig.value);
  if (field === 'apiUrl') setNestedValue(nextConfig, ['agent_llm', 'api_url'], String(value));
  if (field === 'apiKey') setNestedValue(nextConfig, ['agent_llm', 'api_key'], String(value));
  if (field === 'inSandbox') setNestedValue(nextConfig, ['sandbox_mode'], Boolean(value));
  if (field === 'modelName') setNestedValue(nextConfig, ['agent_llm', 'model'], String(value));
  if (field === 'workspacePath') setNestedValue(nextConfig, ['workspace_path'], String(value));
  applyAgentConfig(nextConfig, { syncJson: true });
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
    applyAgentConfig(parsed, { syncJson: false });
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
  saveAgentConfig(parsed);
}

function saveAgentConfig(
  config: Record<string, unknown>,
  options: { reconnect?: boolean; refreshModels?: boolean } = {},
) {
  const normalized = normalizeAgentConfig(config);
  applyAgentConfig(normalized, { syncJson: true });
  const sent = sendSettingRequest('saveConfig', normalized);
  if (!sent) return;
  refreshModelsAfterSave = options.refreshModels ?? true;
  reconnectAfterSave = options.reconnect ?? false;
}

function selectComposerModel(modelName: string) {
  if (!modelName || modelName === basicSettings.value.modelName) return;
  const nextConfig = cloneConfig(agentConfig.value);
  setNestedValue(nextConfig, ['agent_llm', 'model'], modelName);
  saveAgentConfig(nextConfig, { reconnect: true, refreshModels: true });
}

function requestModels(silent = false) {
  if (silent && !agent.canSend.value) return;
  const sent = agent.sendSystemAct('getModels');
  if (!sent) return;
  if (!silent) settingStatus.value = `${t.value.systemRequestSent}: getModels`;
}

function sendSettingRequest(act: ClientSettingAct, content?: unknown) {
  const sent = agent.sendSettingAct(act, content);
  if (!sent) return false;
  settingStatus.value = `${t.value.settingRequestSent}: ${act}`;
  return true;
}

function handleSettingMessage(act: string, content: unknown, msg: ServerMessage) {
  const config = parseSettingConfig(content);
  if (config && (act === 'getConfig' || act === 'getDefaultConfig' || !act)) {
    configJsonError.value = '';
    applyAgentConfig(config, { syncJson: true });
    settingStatus.value = act === 'getDefaultConfig'
      ? t.value.defaultConfigLoaded
      : t.value.serverConfigLoaded;
    return;
  }

  if (act === 'saveConfig') {
    settingStatus.value = t.value.serverConfigSaved;
    const shouldRefreshModels = refreshModelsAfterSave;
    const shouldReconnect = reconnectAfterSave;
    refreshModelsAfterSave = false;
    reconnectAfterSave = false;
    if (shouldReconnect) {
      if (shouldRefreshModels) requestModelsAfterNextConnect = true;
      agent.reconnect();
      return;
    }
    if (shouldRefreshModels) requestModels();
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

  function visit(node: unknown, depth = 0) {
    if (depth > 6 || node == null) return;
    if (typeof node === 'string') {
      models.add(node);
      return;
    }
    if (typeof node === 'object') {
      if (seen.has(node as object)) return;
      seen.add(node as object);
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    Object.entries(node).forEach(([entryKey, entryValue]) => {
      if (entryKey === 'id' && typeof entryValue === 'string') models.add(entryValue);
      if (Array.isArray(entryValue) || isRecord(entryValue)) visit(entryValue, depth + 1);
    });
  }

  visit(value);
  return Array.from(models);
}

onMounted(() => {
  scrollToLatestAfterRender();
  agent.startAutoConnect();
});

function readAgentConfig(): Record<string, unknown> {
  const defaults = createDefaultAgentConfig();
  try {
    const saved = JSON.parse(localStorage.getItem('agentbee.agentConfig') || 'null');
    if (isRecord(saved)) return normalizeAgentConfig(mergeAgentConfig(defaults, normalizeAgentConfig(saved)));
  } catch {
  }
  return defaults;
}

function applyAgentConfig(
  nextConfig: Record<string, unknown>,
  options: { syncJson?: boolean } = {},
) {
  const syncJson = options.syncJson ?? true;
  agentConfig.value = normalizeAgentConfig(cloneConfig(nextConfig));
  localStorage.setItem('agentbee.agentConfig', stringifyConfig(agentConfig.value));
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
    agent_llm: {
      api_url: 'http://127.0.0.1:1234/v1',
      api_key: 'sk-lm-:',
      model: 'qwen3.6-35b-a3b-apex',
      org_id: '',
      hw_hash: '',
      provider: 'modules/agent_openai',
      worker_name: 'procWorker',
      timeout: 7200,
      keep_reasons: true,
      params: {
        max_tokens: 65536,
        temperature: 0.8,
        min_p: 0,
        top_p: 0.95,
        top_k: 40,
        frequency_penalty: 0,
        presence_penalty: 1.0,
        repetition_penalty: 1.0,
        enable_thinking: false,
        stop: [
          '<|im_end|>',
          '<|endoftext|>',
        ],
        chat_template_kwargs: {
          enable_thinking: false,
        },
        extra_body: {
          enable_thinking: false,
        },
        thinking: {
          type: 'disabled',
        },
      },
    },
    agent_task: {
      provider: 'tools/Memory',
    },
    agent_memory: {
      provider: 'tools/Memory',
      max_history: 50,
    },
    workspace_path: '',
    sandbox_mode: true,
    memory_limit: '4G',
    agent_debug: 'trace',
    socket_debug: false,
  };
}

function normalizeAgentConfig(config: Record<string, unknown>): Record<string, unknown> {
  const nextConfig = clonePlainRecord(config);
  const toolsConfig = isRecord(nextConfig.agent_tools) ? nextConfig.agent_tools : null;
  const llmConfig = isRecord(nextConfig.agent_llm) ? nextConfig.agent_llm : null;

  if (!('workspace_path' in nextConfig) && toolsConfig && typeof toolsConfig.workspace_path === 'string') {
    nextConfig.workspace_path = toolsConfig.workspace_path;
  }
  if (!('sandbox_mode' in nextConfig) && toolsConfig && typeof toolsConfig.in_sandbox === 'boolean') {
    nextConfig.sandbox_mode = toolsConfig.in_sandbox;
  }
  if (llmConfig && typeof llmConfig.work_name === 'string') {
    llmConfig.worker_name = llmConfig.work_name;
  }

  delete nextConfig.agent_tools;
  delete nextConfig.agent_server;
  if (llmConfig) delete llmConfig.work_name;
  if ('debug' in nextConfig && !('agent_debug' in nextConfig)) {
    nextConfig.agent_debug = nextConfig.debug;
  }
  delete nextConfig.debug;

  return nextConfig;
}

function clonePlainRecord(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
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

function readBoolean(source: Record<string, unknown>, path: string[], fallback: boolean): boolean {
  const value = readNestedValue(source, path);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
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
        </div>

        <SessionList
          :labels="t"
          :sessions="sessions.sessions.value"
          :active-session-id="sessions.activeSessionId.value"
          @delete-session="deleteSession"
          @select="selectSession"
        />

        <ConnectionPanel
          :labels="t"
          :auto-connect-paused="agent.autoConnectPaused.value"
          :connected="agent.connected.value"
          :connecting="agent.connecting.value"
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
        <button
          v-if="currentView === 'settings'"
          type="button"
          class="topbar-close icon-button"
          :title="t.closeSettings"
          @click="closeSettings"
        >
          <X :size="17" aria-hidden="true" />
        </button>
      </header>

      <div v-if="currentView === 'chat'" class="chat-shell">
        <section ref="chatContainer" class="chat-area" @scroll="onScroll">
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
        <button
          v-if="!shouldAutoScroll"
          type="button"
          class="scroll-bottom-floating"
          :title="t.scrollToBottom"
          @click="scrollToBottom"
        >
          <ArrowDownToLine :size="18" aria-hidden="true" />
        </button>

        <SubAgentPanel
          :labels="t"
          :messages="subAgentMessages"
          :sub-agents="subAgents"
          @resend-user-message="resendUserMessage"
          @update-user-message="updateAndResendUserMessage"
          @delete-sub-agent="deleteSubAgent"
        />
      </div>

      <SettingsView
        v-else
        :basic-settings="basicSettings"
        :connected="agent.connected.value"
        :connecting="agent.connecting.value"
        :config-json="configJson"
        :config-json-error="configJsonError"
        :labels="t"
        :locale="locale"
        :setting-status="settingStatus"
        :theme="theme"
        :ws-url="agent.wsUrl.value"
        @connect="agent.connect"
        @disconnect="agent.disconnect"
        @get-config="requestServerConfig"
        @get-default-config="requestDefaultServerConfig"
        @save-config="saveServerConfig"
        @set-locale="setLocale"
        @set-theme="setTheme"
        @update:basic-setting="updateBasicSetting"
        @update:config-json="updateConfigJson"
        @update:ws-url="updateWsUrl"
      />

      <Composer
        v-if="currentView === 'chat'"
        :labels="t"
        :disabled="!agent.canSend.value"
        :available-models="availableModels"
        :model-name="basicSettings.modelName"
        @select-model="selectComposerModel"
        @send="onSend"
        @stop="agent.stopCurrent"
      />
    </main>
  </div>
</template>
