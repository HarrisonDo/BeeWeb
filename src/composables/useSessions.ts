import { computed, ref } from 'vue';
import type { ChatMessage, ChatSession, MessageRole } from '../protocol/types';

const STORAGE_KEY = 'agentbee.sessions.v2';
const DEFAULT_TITLE = 'New conversation';

export function useSessions() {
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref<string | null>(null);

  const activeSession = computed(() => (
    sessions.value.find((session) => session.id === activeSessionId.value) || sessions.value[0] || null
  ));

  function loadSessions() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      sessions.value = Array.isArray(saved) ? saved : [];
    } catch {
      sessions.value = [];
    }

    if (!sessions.value.length) {
      createSession(false);
    } else {
      activeSessionId.value = sessions.value[0].id;
    }
  }

  function saveSessions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.value));
  }

  function createSession(save = true): ChatSession {
    const session: ChatSession = {
      id: makeId(),
      title: DEFAULT_TITLE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    sessions.value = [session, ...sessions.value];
    activeSessionId.value = session.id;
    if (save) saveSessions();
    return session;
  }

  function touchSession(session: ChatSession) {
    session.updatedAt = new Date().toISOString();
    sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)];
    activeSessionId.value = session.id;
  }

  function setActiveSession(sessionId: string) {
    activeSessionId.value = sessionId;
  }

  function addMessage(role: MessageRole, content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
    const session = activeSession.value || createSession(false);
    const message: ChatMessage = {
      id: makeId(),
      role,
      content: content || '',
      time: nowTime(),
      ...extra,
    };
    session.messages.push(message);
    touchSession(session);
    saveSessions();
    return message;
  }

  function updateTitleFromMessage(session: ChatSession, text: string) {
    if (session.title !== DEFAULT_TITLE) return;
    const compact = text.replace(/\s+/g, ' ').trim();
    session.title = compact.slice(0, 24) || DEFAULT_TITLE;
  }

  function clearCurrentSession() {
    const session = activeSession.value;
    if (!session) return;
    session.messages = [];
    session.title = DEFAULT_TITLE;
    session.updatedAt = new Date().toISOString();
    saveSessions();
  }

  function deleteCurrentSession() {
    if (!sessions.value.length) return;
    sessions.value = sessions.value.filter((session) => session.id !== activeSessionId.value);
    if (!sessions.value.length) {
      createSession(false);
    } else {
      activeSessionId.value = sessions.value[0].id;
    }
    saveSessions();
  }

  function replaceMessages(session: ChatSession, messages: ChatMessage[]) {
    session.messages = messages;
    session.updatedAt = new Date().toISOString();
    saveSessions();
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    addMessage,
    clearCurrentSession,
    createSession,
    deleteCurrentSession,
    loadSessions,
    replaceMessages,
    saveSessions,
    setActiveSession,
    touchSession,
    updateTitleFromMessage,
  };
}

export function makeId(): string {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}
