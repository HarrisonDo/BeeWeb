import { computed, ref } from 'vue';
import type { ChatAttachment, ChatMessage, ChatSession, ClientAttachment, ClientMessage, ServerMessage } from '../protocol/types';
import {
  getMessageId,
  getServerType,
  normalizePayload,
  normalizeToolEvent,
  parseServerMessage,
} from '../protocol/normalizers';
import { makeId, nowTime } from './useSessions';

const NO_RESPONSE_TIMEOUT_MS = 5 * 60_000;
const AUTO_CONNECT_MAX_ATTEMPTS = 3;
const AUTO_CONNECT_RETRY_MS = 1500;

interface UseWebSocketAgentOptions {
  activeSession: () => ChatSession | null;
  addMessage: (role: ChatMessage['role'], content: string, extra?: Partial<ChatMessage>) => ChatMessage;
  saveSessions: () => void;
  touchSession: (session: ChatSession) => void;
  updateTitleFromMessage: (session: ChatSession, text: string) => void;
}

export function useWebSocketAgent(options: UseWebSocketAgentOptions) {
  const wsUrl = ref(localStorage.getItem('agentbee.lastUrl') || 'ws://127.0.0.1:8686');
  const connected = ref(false);
  const connecting = ref(false);
  const autoConnectPaused = ref(false);
  const pendingTurns = ref(new Map<string, string | null>());
  const socket = ref<WebSocket | null>(null);
  const noResponseTimers = new Map<string, number>();
  let autoRetryTimer: number | null = null;
  let manualDisconnect = false;
  let currentConnectIsAuto = false;
  let autoConnectAttempts = 0;

  const canSend = computed(() => connected.value && socket.value?.readyState === WebSocket.OPEN);
  const hasPendingTurns = computed(() => pendingTurns.value.size > 0);

  function connect(automatic = false) {
    if (
      socket.value &&
      (socket.value.readyState === WebSocket.OPEN || socket.value.readyState === WebSocket.CONNECTING)
    ) {
      if (!automatic) options.addMessage('system', 'A connection is already active.');
      return;
    }

    const url = wsUrl.value.trim();
    if (!/^wss?:\/\//.test(url)) {
      options.addMessage('error', 'WebSocket URL must start with ws:// or wss://.');
      if (automatic) autoConnectPaused.value = true;
      return;
    }

    clearAutoRetryTimer();
    manualDisconnect = false;
    currentConnectIsAuto = automatic;
    connecting.value = true;
    if (!automatic) {
      autoConnectPaused.value = false;
      autoConnectAttempts = 0;
    }
    options.addMessage('system', `Connecting to ${url}`);
    socket.value = new WebSocket(url);

    socket.value.onopen = () => {
      connected.value = true;
      connecting.value = false;
      autoConnectPaused.value = false;
      autoConnectAttempts = 0;
      localStorage.setItem('agentbee.lastUrl', url);
      options.addMessage('system', 'WebSocket connected.');
    };

    socket.value.onmessage = (event) => {
      if (typeof event.data === 'string') handleServerMessage(event.data);
    };

    socket.value.onerror = () => {
      if (!currentConnectIsAuto) {
        options.addMessage('error', 'WebSocket connection error. Check the browser console.');
      }
    };

    socket.value.onclose = (event) => {
      connected.value = false;
      connecting.value = false;
      const reason = event.reason ? `, reason: ${event.reason}` : '';
      finishAllPendingWithoutResponse();
      const wasAuto = currentConnectIsAuto;
      if (!wasAuto || manualDisconnect) {
        options.addMessage('system', `Connection closed. code=${event.code}${reason}`);
      }
      socket.value = null;
      if (wasAuto && !manualDisconnect) {
        scheduleAutoReconnect();
      }
    };
  }

  function disconnect() {
    manualDisconnect = true;
    autoConnectPaused.value = true;
    clearAutoRetryTimer();
    if (socket.value) {
      socket.value.close(1000, 'User disconnected');
    } else {
      connected.value = false;
      connecting.value = false;
    }
  }

  function startAutoConnect() {
    if (autoConnectPaused.value || connected.value || connecting.value) return;
    autoConnectAttempts = 0;
    scheduleAutoReconnect(0);
  }

  function sendText(text: string, attachments: ClientAttachment[] = []) {
    if (!canSend.value) {
      options.addMessage('error', 'Not connected, message was not sent.');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed && !attachments.length) return;

    const session = options.activeSession();
    if (!session) return;

    const messageId = makeId();
    options.updateTitleFromMessage(session, trimmed || attachments[0]?.name || '');
    options.addMessage('user', trimmed, {
      attachments: toChatAttachments(attachments),
      messageId,
    });
    pendingTurns.value.set(messageId, null);
    ensureAssistantMessage(messageId);
    startNoResponseTimer(messageId);

    sendJson({
      sessionId: session.id,
      messageId,
      createdAt: new Date().toISOString(),
      ...createClientContentPayload(trimmed, attachments),
    });
  }

  function resendEditedText(userMessageId: string, text: string) {
    if (!canSend.value) {
      options.addMessage('error', 'Not connected, edited message was not sent.');
      return;
    }

    const trimmed = text.trim();

    const session = options.activeSession();
    if (!session) return;

    const userMessage = session.messages.find((message) => (
      message.id === userMessageId &&
      message.role === 'user'
    ));
    if (!userMessage) return;

    const attachments = toClientAttachments(userMessage.attachments || []);
    if (!trimmed && !attachments.length) return;

    const previousMessageId = userMessage.messageId || null;
    const messageId = makeId();
    if (previousMessageId) {
      removeAssistantForMessage(session, previousMessageId);
    }
    userMessage.messageId = messageId;
    pendingTurns.value.set(messageId, null);
    ensureAssistantMessage(messageId);
    startNoResponseTimer(messageId);
    options.touchSession(session);
    options.saveSessions();

    sendJson({
      sessionId: session.id,
      messageId,
      createdAt: new Date().toISOString(),
      ...createClientContentPayload(trimmed, attachments),
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
    clearAllNoResponseTimers();
    pendingTurns.value.clear();
  }

  function sendJson(payload: ClientMessage) {
    socket.value?.send(`${JSON.stringify(payload)}\n`);
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

    if (type === 'history') return;
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
    clearNoResponseTimer(turn.messageId);
    turn.assistant.content += text || '';
    turn.assistant.status = 'loading';
    options.touchSession(turn.session);
    options.saveSessions();
  }

  function appendAssistantThink(messageId: string | null, text: string) {
    const turn = ensureAssistantMessage(messageId);
    if (!turn) return;
    clearNoResponseTimer(turn.messageId);
    turn.assistant.think = `${turn.assistant.think || ''}${text || ''}`;
    turn.assistant.status = 'loading';
    options.touchSession(turn.session);
    options.saveSessions();
  }

  function appendAssistantToolEvent(messageId: string | null, kind: 'tool_calls' | 'tool_result', msg: ServerMessage) {
    const turn = ensureAssistantMessage(messageId);
    if (!turn) return;
    clearNoResponseTimer(turn.messageId);
    turn.assistant.toolEvents ||= [];
    turn.assistant.toolEvents.push(normalizeToolEvent(kind, msg, makeId, nowTime));
    turn.assistant.status = 'loading';
    options.touchSession(turn.session);
    options.saveSessions();
  }

  function finishAssistantMessage(messageId: string | null, status: 'done' | 'error' | 'stopped') {
    const resolvedMessageId = messageId || getLatestPendingMessageId();
    if (resolvedMessageId) clearNoResponseTimer(resolvedMessageId);
    const session = options.activeSession();
    if (session && resolvedMessageId) {
      const assistant = session.messages.find((message) => (
        message.role === 'assistant' && message.messageId === resolvedMessageId
      ));
      if (assistant) {
        assistant.status = status;
      }
    }
    if (resolvedMessageId) pendingTurns.value.delete(resolvedMessageId);
    options.saveSessions();
  }

  function finishAllPendingWithoutResponse() {
    const session = options.activeSession();
    if (!session || !pendingTurns.value.size) return;

    pendingTurns.value.forEach((_, messageId) => {
      clearNoResponseTimer(messageId);
      const assistant = session.messages.find((message) => (
        message.role === 'assistant' && message.messageId === messageId
      ));
      if (assistant && !hasAssistantOutput(assistant)) {
        assistant.status = 'done';
      }
    });
    pendingTurns.value.clear();
    options.saveSessions();
  }

  function closeAssistantMessage(messageId: string | null) {
    const resolvedMessageId = messageId || getLatestPendingMessageId();
    if (resolvedMessageId) clearNoResponseTimer(resolvedMessageId);
    const session = options.activeSession();
    if (!session || !resolvedMessageId) return;

    session.messages = session.messages.filter((message) => !(
      message.role === 'assistant' && message.messageId === resolvedMessageId
    ));
    pendingTurns.value.delete(resolvedMessageId);
    options.saveSessions();
  }

  function removeAssistantForMessage(session: ChatSession, messageId: string) {
    clearNoResponseTimer(messageId);
    pendingTurns.value.delete(messageId);
    session.messages = session.messages.filter((message) => !(
      message.role === 'assistant' &&
      message.messageId === messageId
    ));
  }

  function startNoResponseTimer(messageId: string) {
    clearNoResponseTimer(messageId);
    const timerId = window.setTimeout(() => {
      const session = options.activeSession();
      const assistant = session?.messages.find((message) => (
        message.role === 'assistant' && message.messageId === messageId
      ));

      if (assistant && assistant.status === 'loading' && !hasAssistantOutput(assistant)) {
        assistant.status = 'done';
        pendingTurns.value.delete(messageId);
        options.saveSessions();
      }
      noResponseTimers.delete(messageId);
    }, NO_RESPONSE_TIMEOUT_MS);

    noResponseTimers.set(messageId, timerId);
  }

  function clearNoResponseTimer(messageId: string) {
    const timerId = noResponseTimers.get(messageId);
    if (timerId === undefined) return;
    window.clearTimeout(timerId);
    noResponseTimers.delete(messageId);
  }

  function clearAllNoResponseTimers() {
    noResponseTimers.forEach((timerId) => window.clearTimeout(timerId));
    noResponseTimers.clear();
  }

  function scheduleAutoReconnect(delay = AUTO_CONNECT_RETRY_MS) {
    clearAutoRetryTimer();
    if (manualDisconnect || autoConnectPaused.value) return;
    if (autoConnectAttempts >= AUTO_CONNECT_MAX_ATTEMPTS) {
      autoConnectPaused.value = true;
      options.addMessage('system', 'Auto connection stopped after repeated failures. Waiting for manual connection.');
      return;
    }
    autoRetryTimer = window.setTimeout(() => {
      autoRetryTimer = null;
      autoConnectAttempts += 1;
      connect(true);
    }, delay);
  }

  function clearAutoRetryTimer() {
    if (autoRetryTimer === null) return;
    window.clearTimeout(autoRetryTimer);
    autoRetryTimer = null;
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
    connecting,
    disconnect,
    autoConnectPaused,
    hasPendingTurns,
    resendEditedText,
    sendText,
    startAutoConnect,
    stopCurrent,
    wsUrl,
  };
}

function hasAssistantOutput(message: ChatMessage): boolean {
  return Boolean(
    message.content?.trim() ||
    message.think?.trim() ||
    message.toolEvents?.length,
  );
}

function toChatAttachments(attachments: ClientAttachment[]): ChatAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
    text: attachment.text,
    base64: attachment.base64,
  }));
}

function toClientAttachments(attachments: ChatAttachment[]): ClientAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
    text: attachment.text,
    base64: attachment.base64,
  }));
}

function createClientContentPayload(
  text: string,
  attachments: ClientAttachment[],
): {
  type: 'chat';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'file'; file: { filename: string; mimeType: string; content: string } }
  >;
} {
  const content = [
    ...(text ? [{ type: 'text' as const, text }] : []),
    ...attachments
      .filter((attachment) => attachment.kind === 'text' && attachment.text !== undefined)
      .map((attachment) => ({
        type: 'file' as const,
        file: {
          filename: attachment.name,
          mimeType: attachment.type,
          content: attachment.text || '',
        },
      })),
    ...attachments
      .filter((attachment) => attachment.kind === 'image' && attachment.base64)
      .map((attachment) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:${attachment.type};base64,${attachment.base64}`,
        },
      })),
  ];

  return {
    type: 'chat',
    content,
  };
}
