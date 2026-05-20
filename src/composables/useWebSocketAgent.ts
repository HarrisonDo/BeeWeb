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

interface UseWebSocketAgentOptions {
  activeSession: () => ChatSession | null;
  addMessage: (role: ChatMessage['role'], content: string, extra?: Partial<ChatMessage>) => ChatMessage;
  saveSessions: () => void;
  touchSession: (session: ChatSession) => void;
  updateTitleFromMessage: (session: ChatSession, text: string) => void;
}

export function useWebSocketAgent(options: UseWebSocketAgentOptions) {
  const wsUrl = ref(localStorage.getItem('agentbee.lastUrl') || 'ws://192.168.254.10:8686');
  const connected = ref(false);
  const pendingTurns = ref(new Map<string, string | null>());
  const socket = ref<WebSocket | null>(null);
  const noResponseTimers = new Map<string, number>();

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
      finishAllPendingWithoutResponse();
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
    if (!trimmed) return;

    const session = options.activeSession();
    if (!session) return;

    const userMessage = session.messages.find((message) => (
      message.id === userMessageId &&
      message.role === 'user'
    ));
    if (!userMessage) return;

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
    resendEditedText,
    sendText,
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
  }));
}

function createClientContentPayload(
  text: string,
  attachments: ClientAttachment[],
): (
  | {
    type: 'text';
    message: string;
  }
  | {
    type: 'chat';
    text: string;
    images: Array<string | { name: string; mime: string; data: string }>;
    files: Array<{ name: string; mime: string; content: string }>;
  }
) {
  if (!attachments.length) {
    return {
      type: 'text',
      message: text,
    };
  }

  return {
    type: 'chat',
    text,
    images: attachments
      .filter((attachment) => attachment.kind === 'image' && attachment.base64)
      .map((attachment) => `data:${attachment.type};base64,${attachment.base64}`),
    files: attachments
      .filter((attachment) => attachment.kind === 'text' && attachment.text !== undefined)
      .map((attachment) => ({
        name: attachment.name,
        mime: attachment.type,
        content: attachment.text || '',
      })),
  };
}
