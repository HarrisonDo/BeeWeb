import { computed, ref } from 'vue';

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'beeweb.locale';

const messages = {
  zh: {
    activeWaiting: '等待连接',
    activeConnected: '已连接',
    noUrl: '未设置 URL',
    newConversation: '新会话',
    tagline: '轻盈的 AgentBee Web 控制台',
    newSession: '新建会话',
    clearSession: '清空会话',
    exportSession: '导出会话',
    deleteSession: '删除会话',
    stopGeneration: '停止生成',
    collapseSidebar: '收起侧栏',
    expandSidebar: '展开侧栏',
    scrollToBottom: '滚动到底部',
    empty: '连接后即可开始对话。聊天记录会保存在当前浏览器中。',
    wsUrl: 'WebSocket URL',
    connect: '连接',
    disconnect: '断开',
    connected: '已连接',
    notConnected: '未连接',
    composerPlaceholder: '输入消息。Windows: Ctrl+Enter 换行；Mac: Command+Enter 换行。',
    send: '发送',
    items: '条',
    roleUser: '你',
    roleAssistant: 'AgentBee',
    roleSystem: '系统',
    roleError: '错误',
    roleTool: '工具',
    thinking: '思考中',
    thinkingProcess: '思考过程',
    waitingForResponse: '等待响应',
    noResponseEnded: '未收到回复，对话已结束。',
    tools: '工具',
    toolCalls: '工具调用',
    toolResults: '工具结果',
    event: '条事件',
    events: '条事件',
    failed: '失败',
    toolEvent: '工具事件',
    collapse: '收起',
    expand: '展开',
    copyMessage: '复制',
    copied: '已复制',
    editMessage: '编辑',
    resendMessage: '重新发送',
    saveEdit: '保存',
    cancelEdit: '取消',
    attachFiles: '上传文件',
    removeFile: '移除文件',
    attachedFiles: '附件',
    fileTooLarge: '文件过大',
    unsupportedFile: '不支持的文件类型',
    themeLight: '浅色',
    themeDark: '深色',
    language: '语言',
  },
  en: {
    activeWaiting: 'Waiting',
    activeConnected: 'Connected',
    noUrl: 'No URL',
    newConversation: 'New conversation',
    tagline: 'A quiet AgentBee web console',
    newSession: 'New session',
    clearSession: 'Clear session',
    exportSession: 'Export session',
    deleteSession: 'Delete session',
    stopGeneration: 'Stop generation',
    collapseSidebar: 'Collapse sidebar',
    expandSidebar: 'Expand sidebar',
    scrollToBottom: 'Scroll to bottom',
    empty: 'Connect to start chatting. Sessions are saved in this browser.',
    wsUrl: 'WebSocket URL',
    connect: 'Connect',
    disconnect: 'Disconnect',
    connected: 'Connected',
    notConnected: 'Not connected',
    composerPlaceholder: 'Type a message. Windows: Ctrl+Enter newline; Mac: Command+Enter newline.',
    send: 'Send',
    items: 'items',
    roleUser: 'User',
    roleAssistant: 'AgentBee',
    roleSystem: 'System',
    roleError: 'Error',
    roleTool: 'Tool',
    thinking: 'Thinking',
    thinkingProcess: 'Thinking process',
    waitingForResponse: 'Waiting for response',
    noResponseEnded: 'No response received. Conversation ended.',
    tools: 'Tools',
    toolCalls: 'Tool calls',
    toolResults: 'Tool results',
    event: 'event',
    events: 'events',
    failed: 'failed',
    toolEvent: 'Tool event',
    collapse: 'Collapse',
    expand: 'Expand',
    copyMessage: 'Copy',
    copied: 'Copied',
    editMessage: 'Edit',
    resendMessage: 'Resend',
    saveEdit: 'Save',
    cancelEdit: 'Cancel',
    attachFiles: 'Upload files',
    removeFile: 'Remove file',
    attachedFiles: 'Attachments',
    fileTooLarge: 'File too large',
    unsupportedFile: 'Unsupported file type',
    themeLight: 'Light',
    themeDark: 'Dark',
    language: 'Language',
  },
} satisfies Record<Locale, Record<string, string>>;

const locale = ref<Locale>(readLocale());

export function useI18n() {
  applyLocale(locale.value);
  const t = computed(() => messages[locale.value]);

  function setLocale(nextLocale: Locale) {
    locale.value = nextLocale;
    localStorage.setItem(STORAGE_KEY, nextLocale);
    applyLocale(nextLocale);
  }

  return {
    locale,
    setLocale,
    t,
  };
}

function readLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'zh' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function applyLocale(nextLocale: Locale) {
  document.documentElement.lang = nextLocale === 'zh' ? 'zh-CN' : 'en';
}
