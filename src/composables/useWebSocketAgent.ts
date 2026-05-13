import { computed, ref } from 'vue';
import type { ChatMessage, ChatSession, ClientMessage, ServerMessage } from '../protocol/types';
import {
  getMessageId,
  getServerType,
  normalizePayload,
  normalizeToolEvent,
  parseServerMessage,
} from '../protocol/normalizers';
import { makeId, nowTime } from './useSessions';

interface UseWebSocketAgentOptions {
  activeSession: () => ChatSession | null;
  addMessage: (role: ChatMessage['role'], content: string, extra?: Partial<ChatMessage>) => ChatMessage;
  replaceMessages: (session: ChatSession, messages: ChatMessage[]) => void;
  saveSessions: () => void;
  touchSession: (session: ChatSession) => void;
  updateTitleFromMessage: (session: ChatSession, text: string) => void;
}

export function useWebSocketAgent(options: UseWebSocketAgentOptions) {
  const wsUrl = ref(localStorage.getItem('agentbee.lastUrl') || 'ws://192.168.254.10:8686');
  const connected = ref(false);
  const pendingTurns = ref(new Map<string, string | null>());
  const socket = ref<WebSocket | null>(null);

  const canSend = computed(() => connected.value && socket.value?.readyState === WebSocket.OPEN);
  const hasPendingTurns = computed(() => pendingTurns.value.size > 0);

  function connect() {
    if (
      socket.value &&
      (socket.value.readyState === WebSocket.OPEN || socket.value.readyState === WebSocket.CONNECTING)
    ) {
      options.addMessage('system', 'A connection is already active.');
      return;
    }

    const url = wsUrl.value.trim();
    if (!/^wss?:\/\//.test(url)) {
      options.addMessage('error', 'WebSocket URL must start with ws:// or wss://.');
      return;
    }

    options.addMessage('system', `Connecting to ${url}`);
    socket.value = new WebSocket(url);

    socket.value.onopen = () => {
      connected.value = true;
      localStorage.setItem('agentbee.lastUrl', url);
      options.addMessage('system', 'WebSocket connected.');
      requestHistory();
    };

    socket.value.onmessage = (event) => {
      if (typeof event.data === 'string') handleServerMessage(event.data);
    };

    socket.value.onerror = () => {
      options.addMessage('error', 'WebSocket connection error. Check the browser console.');
    };

    socket.value.onclose = (event) => {
      connected.value = false;
      const reason = event.reason ? `, reason: ${event.reason}` : '';
      options.addMessage('system', `Connection closed. code=${event.code}${reason}`);
      socket.value = null;
    };
  }

  function disconnect() {
    if (socket.value) {
      socket.value.close(1000, 'User disconnected');
    } else {
      connected.value = false;
    }
  }

  function sendText(text: string) {
    if (!canSend.value) {
      options.addMessage('error', 'Not connected, message was not sent.');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    const session = options.activeSession();
    if (!session) return;

    const messageId = makeId();
    options.updateTitleFromMessage(session, trimmed);
    options.addMessage('user', trimmed, { messageId });
    pendingTurns.value.set(messageId, null);
    ensureAssistantMessage(messageId);

    sendJson({
      type: 'text',
      sessionId: session.id,
      messageId,
      message: trimmed,
      createdAt: new Date().toISOString(),
    });
  }

  function stopCurrent() {
    if (!canSend.value) return;
    const session = options.activeSession();
    const messageId = getLatestPendingMessageId();
    sendJson({ type: 'stop', sessionId: session ? session.id : null, messageId });
    options.addMessage('system', 'Stop request sent.');
    finishAssistantMessage(messageId, 'stopped');
  }

  function clearPendingTurns() {
    pendingTurns.value.clear();
  }

  function sendJson(payload: ClientMessage) {
    socket.value?.send(`${JSON.stringify(payload)}\n`);
  }

  function requestHistory() {
    const session = options.activeSession();
    if (!canSend.value || !session) return;
    sendJson({ type: 'history_request', sessionId: session.id });
  }

  function handleServerMessage(raw: string) {
    const parsed = parseServerMessage(raw);
    if (typeof parsed === 'string') {
      appendAssistantContent(null, parsed);
      return;
    }

    const msg = parsed as ServerMessage;
    const type = getServerType(msg);
    const messageId = getMessageId(msg);

    if (type === 'history') return applyHistory(msg);
    if (['content', 'assistant', 'message'].includes(type)) return appendAssistantContent(messageId, normalizePayload(msg));
    if (['think', 'thinking', 'status'].includes(type)) return appendAssistantThink(messageId, normalizePayload(msg));
    if (['tool_calls', 'tool_call', 'tool'].includes(type)) return appendAssistantToolEvent(messageId, 'tool_calls', msg);
    if (type === 'tool_result') return appendAssistantToolEvent(messageId, 'tool_result', msg);
    if (type === 'error') {
      options.addMessage('error', msg.message || normalizePayload(msg) || 'Server returned an error.');
      return finishAssistantMessage(messageId, 'error');
    }
    if (['end', 'done', 'finish'].includes(type)) return finishAssistantMessage(messageId, 'done');
    if (type === 'close') return closeAssistantMessage(messageId);

    appendAssistantContent(messageId, JSON.stringify(msg, null, 2));
  }

  function ensureAssistantMessage(messageId: string | null) {
    const session = options.activeSession();
    if (!session) return null;
    const resolvedMessageId = messageId || getLatestPendingMessageId() || makeId();
    let assistant = session.messages.find((message) => (
      message.role === 'assistant' && message.messageId === resolvedMessageId
    ));

    if (!assistant) {
      assistant = {
        id: makeId(),
        role: 'assistant',
        messageId: resolvedMessageId,
        content: '',
        think: '',
        toolEvents: [],
        status: 'loading',
        time: nowTime(),
      };
      session.messages.push(assistant);
    }

    pendingTurns.value.set(resolvedMessageId, assistant.id);
    return { session, assistant, messageId: resolvedMessageId };
  }

  function appendAssistantContent(messageId: string | null, text: string) {
    const turn = ensureAssistantMessage(messageId);
    if (!turn) return;
    turn.assistant.content += text || '';
    turn.assistant.status = 'loading';
    options.touchSession(turn.session);
    options.saveSessions();
  }

  function appendAssistantThink(messageId: string | null, text: string) {
    const turn = ensureAssistantMessage(messageId);
    if (!turn) return;
    turn.assistant.think = `${turn.assistant.think || ''}${text || ''}`;
    turn.assistant.status = 'loading';
    options.touchSession(turn.session);
    options.saveSessions();
  }

  function appendAssistantToolEvent(messageId: string | null, kind: 'tool_calls' | 'tool_result', msg: ServerMessage) {
    const turn = ensureAssistantMessage(messageId);
    if (!turn) return;
    turn.assistant.toolEvents ||= [];
    turn.assistant.toolEvents.push(normalizeToolEvent(kind, msg, makeId, nowTime));
    turn.assistant.status = 'loading';
    options.touchSession(turn.session);
    options.saveSessions();
  }

  function finishAssistantMessage(messageId: string | null, status: 'done' | 'error' | 'stopped') {
    const resolvedMessageId = messageId || getLatestPendingMessageId();
    const session = options.activeSession();
    if (session && resolvedMessageId) {
      const assistant = session.messages.find((message) => (
        message.role === 'assistant' && message.messageId === resolvedMessageId
      ));
      if (assistant) assistant.status = status;
    }
    if (resolvedMessageId) pendingTurns.value.delete(resolvedMessageId);
    options.saveSessions();
  }

  function closeAssistantMessage(messageId: string | null) {
    const resolvedMessageId = messageId || getLatestPendingMessageId();
    const session = options.activeSession();
    if (!session || !resolvedMessageId) return;

    session.messages = session.messages.filter((message) => !(
      message.role === 'assistant' && message.messageId === resolvedMessageId
    ));
    pendingTurns.value.delete(resolvedMessageId);
    options.saveSessions();
  }

  function applyHistory(msg: ServerMessage) {
    const session = options.activeSession();
    if (!session) return;
    const records = Array.isArray(msg.messages) ? msg.messages : [];
    const messages = records.map((item): ChatMessage => ({
      id: asString(item.id) || makeId(),
      role: asChatRole(item.role),
      messageId: asString(item.messageId) || asString(item.turnId) || asString(item.requestId) || makeId(),
      content: asString(item.content) || asString(item.data) || asString(item.text) || '',
      think: asString(item.think) || asString(item.statusText) || '',
      toolEvents: Array.isArray(item.toolEvents) ? item.toolEvents : [],
      status: asAssistantStatus(item.status),
      time: asString(item.time) || asString(item.createdAt) || nowTime(),
    }));
    pendingTurns.value.clear();
    options.replaceMessages(session, messages);
  }

  function getLatestPendingMessageId(): string | null {
    const ids = Array.from(pendingTurns.value.keys());
    return ids.length ? ids[ids.length - 1] : null;
  }

  return {
    canSend,
    clearPendingTurns,
    connect,
    connected,
    disconnect,
    hasPendingTurns,
    sendText,
    stopCurrent,
    wsUrl,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asChatRole(value: unknown): ChatMessage['role'] {
  return ['user', 'assistant', 'system', 'error', 'tool'].includes(String(value))
    ? (value as ChatMessage['role'])
    : 'assistant';
}

function asAssistantStatus(value: unknown): ChatMessage['status'] {
  return ['loading', 'done', 'error', 'stopped'].includes(String(value))
    ? (value as ChatMessage['status'])
    : 'done';
}
