<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import ChatMessage from './components/ChatMessage.vue';
import Composer from './components/Composer.vue';
import ConnectionPanel from './components/ConnectionPanel.vue';
import SessionList from './components/SessionList.vue';
import { useSessions } from './composables/useSessions';
import { useWebSocketAgent } from './composables/useWebSocketAgent';

const chatContainer = ref<HTMLElement | null>(null);
const shouldAutoScroll = ref(true);

const sessions = useSessions();
sessions.loadSessions();

const agent = useWebSocketAgent({
  activeSession: () => sessions.activeSession.value,
  addMessage: sessions.addMessage,
  replaceMessages: sessions.replaceMessages,
  saveSessions: sessions.saveSessions,
  touchSession: sessions.touchSession,
  updateTitleFromMessage: sessions.updateTitleFromMessage,
});

const activeMeta = computed(() => {
  const url = agent.wsUrl.value.trim() || 'No URL';
  return `${agent.connected.value ? 'Connected' : 'Waiting'} · ${url}`;
});

function onSend(text: string) {
  agent.sendText(text);
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
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <h1>AgentBee Web</h1>
        <p>Vibe Anything</p>
      </div>

      <div class="side-actions">
        <button type="button" title="New session" @click="sessions.createSession()">New</button>
        <button type="button" title="Clear session" @click="clearSession">Clear</button>
        <button type="button" title="Export session" @click="exportSession">Export</button>
        <button type="button" title="Delete session" @click="deleteSession">Delete</button>
      </div>

      <SessionList
        :sessions="sessions.sessions.value"
        :active-session-id="sessions.activeSessionId.value"
        @select="selectSession"
      />

      <ConnectionPanel
        v-model:url="agent.wsUrl.value"
        :connected="agent.connected.value"
        @connect="agent.connect"
        @disconnect="agent.disconnect"
      />
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar-title">
          <strong>{{ sessions.activeSession.value?.title || 'New conversation' }}</strong>
          <span>{{ activeMeta }}</span>
        </div>
        <div class="topbar-actions">
          <button type="button" title="Stop generation" :disabled="!agent.hasPendingTurns.value" @click="agent.stopCurrent">
            Stop
          </button>
          <button
            type="button"
            title="Scroll to bottom"
            :class="{ attention: !shouldAutoScroll }"
            @click="scrollToBottom"
          >
            End
          </button>
        </div>
      </header>

      <section ref="chatContainer" class="chat-area" @scroll="onScroll">
        <div v-if="!sessions.activeSession.value?.messages.length" class="empty">
          Connect to start chatting. Sessions are saved in this browser.
        </div>
        <ChatMessage
          v-for="message in sessions.activeSession.value?.messages || []"
          :key="message.id"
          :message="message"
        />
      </section>

      <Composer :disabled="!agent.canSend.value" @send="onSend" />
    </main>
  </div>
</template>
