export type MessageRole = 'user' | 'assistant' | 'system' | 'error' | 'tool';
export type AssistantStatus = 'loading' | 'done' | 'error' | 'stopped';
export type ServerEventType =
  | 'history'
  | 'content'
  | 'assistant'
  | 'message'
  | 'think'
  | 'thinking'
  | 'status'
  | 'tool_calls'
  | 'tool_call'
  | 'tool'
  | 'tool_result'
  | 'error'
  | 'end'
  | 'done'
  | 'finish'
  | 'close';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  time: string;
  attachments?: ChatAttachment[];
  messageId?: string;
  think?: string;
  toolEvents?: ToolEvent[];
  status?: AssistantStatus;
}

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: 'text' | 'image' | 'binary';
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ToolEvent {
  id: string;
  kind: 'tool_calls' | 'tool_result';
  name: string;
  ok?: boolean;
  summary: string;
  data: string;
  time: string;
}

export interface ClientTextMessage {
  type: 'text';
  sessionId: string;
  messageId: string;
  message: string;
  createdAt: string;
}

export interface ClientAttachment extends ChatAttachment {
  text?: string;
  base64?: string;
}

export interface ClientChatMessage {
  type: 'chat';
  sessionId: string;
  messageId: string;
  content: ClientChatContentPart[];
  createdAt: string;
}

export type ClientChatContentPart =
  | {
    type: 'text';
    text: string;
  }
  | {
    type: 'image_url';
    image_url: {
      url: string;
    };
  };

export interface ClientHistoryRequest {
  type: 'history_request';
  sessionId: string;
}

export interface ClientStopRequest {
  type: 'stop';
  sessionId: string | null;
  messageId: string | null;
}

export type ClientMessage = ClientTextMessage | ClientChatMessage | ClientHistoryRequest | ClientStopRequest;

export interface ServerMessage {
  type?: ServerEventType | string;
  event?: string;
  role?: string;
  sessionId?: string;
  messageId?: string;
  turnId?: string;
  requestId?: string;
  message?: string;
  data?: unknown;
  text?: unknown;
  content?: unknown;
  delta?: unknown;
  messages?: Array<Record<string, unknown>>;
  toolCallId?: string;
  name?: string;
  tool?: string;
  ok?: boolean;
  result?: unknown;
}
