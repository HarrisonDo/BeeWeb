const STORAGE_KEY = 'agentbee.sessions.v2';
const DEFAULT_TITLE = '新会话';

let ws = null;
let connected = false;
let sessions = [];
let activeSessionId = null;
let pendingTurns = new Map();

const wsUrlInput = document.getElementById('wsUrl');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusLabel = document.getElementById('statusLabel');
const statusDot = document.getElementById('statusDot');
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const scrollBtn = document.getElementById('scrollBtn');
const newSessionBtn = document.getElementById('newSessionBtn');
const clearSessionBtn = document.getElementById('clearSessionBtn');
const deleteSessionBtn = document.getElementById('deleteSessionBtn');
const exportBtn = document.getElementById('exportBtn');
const sessionList = document.getElementById('sessionList');
const activeTitle = document.getElementById('activeTitle');
const activeMeta = document.getElementById('activeMeta');

function nowTime() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function makeId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadSessions() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        sessions = Array.isArray(saved) ? saved : [];
    } catch (e) {
        sessions = [];
    }

    if (!sessions.length) {
        createSession(false);
    } else {
        activeSessionId = sessions[0].id;
    }
}

function saveSessions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function getActiveSession() {
    return sessions.find((session) => session.id === activeSessionId) || sessions[0];
}

function createSession(render = true) {
    const session = {
        id: makeId(),
        title: DEFAULT_TITLE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: []
    };
    sessions.unshift(session);
    activeSessionId = session.id;
    pendingTurns.clear();
    saveSessions();
    if (render) renderAll();
    return session;
}

function touchSession(session) {
    session.updatedAt = new Date().toISOString();
    sessions = [session, ...sessions.filter((item) => item.id !== session.id)];
    activeSessionId = session.id;
}

function updateTitleFromMessage(session, text) {
    if (session.title !== DEFAULT_TITLE) return;
    const compact = text.replace(/\s+/g, ' ').trim();
    session.title = compact.slice(0, 24) || DEFAULT_TITLE;
}

function addMessage(role, content, extra = {}) {
    const session = getActiveSession() || createSession(false);
    const message = {
        id: makeId(),
        role,
        content: content || '',
        time: nowTime(),
        ...extra
    };
    session.messages.push(message);
    touchSession(session);
    saveSessions();
    renderAll();
    return message;
}

function getLatestPendingMessageId() {
    const ids = Array.from(pendingTurns.keys());
    return ids.length ? ids[ids.length - 1] : null;
}

function ensureAssistantMessage(messageId) {
    const session = getActiveSession() || createSession(false);
    const resolvedMessageId = messageId || getLatestPendingMessageId() || makeId();
    let assistant = session.messages.find((message) => (
        message.role === 'assistant' &&
        message.messageId === resolvedMessageId
    ));

    if (!assistant) {
        assistant = {
            id: makeId(),
            role: 'assistant',
            messageId: resolvedMessageId,
            content: '',
            think: '',
            status: 'loading',
            time: nowTime()
        };
        session.messages.push(assistant);
    }

    pendingTurns.set(resolvedMessageId, assistant.id);
    return { session, assistant, messageId: resolvedMessageId };
}

function appendAssistantContent(messageId, text) {
    const { session, assistant } = ensureAssistantMessage(messageId);
    assistant.content += text || '';
    assistant.status = 'loading';
    touchSession(session);
    saveSessions();
    renderAll();
}

function appendAssistantThink(messageId, text) {
    const { session, assistant } = ensureAssistantMessage(messageId);
    assistant.think = `${assistant.think || ''}${text || ''}`;
    assistant.status = 'loading';
    touchSession(session);
    saveSessions();
    renderAll();
}

function finishAssistantMessage(messageId, status = 'done') {
    const resolvedMessageId = messageId || getLatestPendingMessageId();
    const session = getActiveSession();
    if (session && resolvedMessageId) {
        const assistant = session.messages.find((message) => (
            message.role === 'assistant' &&
            message.messageId === resolvedMessageId
        ));
        if (assistant) assistant.status = status;
    }
    if (resolvedMessageId) pendingTurns.delete(resolvedMessageId);
    stopBtn.disabled = !connected || pendingTurns.size === 0;
    saveSessions();
    renderAll();
}

function closeAssistantMessage(messageId) {
    const resolvedMessageId = messageId || getLatestPendingMessageId();
    const session = getActiveSession();
    if (!session || !resolvedMessageId) return;

    session.messages = session.messages.filter((message) => !(
        message.role === 'assistant' &&
        message.messageId === resolvedMessageId
    ));
    pendingTurns.delete(resolvedMessageId);
    stopBtn.disabled = !connected || pendingTurns.size === 0;
    session.updatedAt = new Date().toISOString();
    saveSessions();
    renderAll();
}

function normalizePayload(msg) {
    const data = msg.data ?? msg.text ?? msg.content ?? msg.delta ?? '';
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function sendJson(payload) {
    ws.send(`${JSON.stringify(payload)}\n`);
}

function requestHistory() {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    const session = getActiveSession() || createSession(false);
    sendJson({
        type: 'history_request',
        sessionId: session.id
    });
}

function applyHistory(msg) {
    const session = getActiveSession() || createSession(false);
    const records = Array.isArray(msg.messages) ? msg.messages : [];

    session.messages = records.map((item) => ({
        id: item.id || makeId(),
        role: item.role || 'assistant',
        messageId: item.messageId || item.turnId || item.requestId || makeId(),
        content: item.content || item.data || item.text || '',
        think: item.think || item.statusText || '',
        status: item.status || 'done',
        time: item.time || item.createdAt || nowTime()
    }));
    session.updatedAt = new Date().toISOString();
    pendingTurns.clear();
    saveSessions();
    renderAll();
}

function handleServerMessage(raw) {
    let msg = null;
    if (typeof raw === 'string') {
        try {
            msg = JSON.parse(raw);
        } catch (e) {
            appendAssistantContent(null, raw);
            return;
        }
    }

    if (!msg || typeof msg !== 'object') return;

    const type = msg.type || msg.event || msg.role;
    const messageId = msg.messageId || msg.turnId || msg.requestId || null;

    if (type === 'history') {
        applyHistory(msg);
        return;
    }

    if (type === 'content' || type === 'assistant' || type === 'message') {
        appendAssistantContent(messageId, normalizePayload(msg));
        return;
    }

    if (type === 'think' || type === 'thinking' || type === 'status') {
        appendAssistantThink(messageId, normalizePayload(msg));
        return;
    }

    if (type === 'tool_call' || type === 'tool') {
        addMessage('tool', JSON.stringify({
            messageId: messageId || getLatestPendingMessageId(),
            name: msg.name || msg.tool || 'tool',
            args: msg.args || msg.arguments || msg.data || {}
        }, null, 2));
        return;
    }

    if (type === 'tool_result') {
        addMessage('tool', JSON.stringify({
            messageId: messageId || getLatestPendingMessageId(),
            ok: msg.ok !== false,
            result: msg.result ?? msg.data ?? msg.content ?? ''
        }, null, 2));
        return;
    }

    if (type === 'error') {
        addMessage('error', msg.message || normalizePayload(msg) || '服务返回错误');
        finishAssistantMessage(messageId, 'error');
        return;
    }

    if (type === 'end' || type === 'done' || type === 'finish') {
        finishAssistantMessage(messageId, 'done');
        return;
    }

    if (type === 'close') {
        closeAssistantMessage(messageId);
        return;
    }

    appendAssistantContent(messageId, JSON.stringify(msg, null, 2));
}

function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        addMessage('system', '已有连接，请先断开');
        return;
    }

    const url = wsUrlInput.value.trim();
    if (!/^wss?:\/\//.test(url)) {
        addMessage('error', 'WebSocket 地址必须以 ws:// 或 wss:// 开头');
        return;
    }

    addMessage('system', `正在连接 ${url}`);
    ws = new WebSocket(url);

    ws.onopen = () => {
        setConnected(true);
        localStorage.setItem('agentbee.lastUrl', url);
        addMessage('system', 'WebSocket 连接已建立');
        requestHistory();
        messageInput.focus();
    };

    ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
            handleServerMessage(event.data);
        }
    };

    ws.onerror = () => {
        addMessage('error', 'WebSocket 连接错误，请查看浏览器控制台');
    };

    ws.onclose = (event) => {
        setConnected(false);
        const reason = event.reason ? `，原因：${event.reason}` : '';
        addMessage('system', `连接已关闭 code=${event.code}${reason}`);
        ws = null;
    };
}

function disconnectWebSocket() {
    if (ws) {
        ws.close(1000, '用户主动断开');
    } else {
        setConnected(false);
    }
}

function setConnected(nextConnected) {
    connected = nextConnected;
    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
    messageInput.disabled = !connected;
    sendBtn.disabled = !connected;
    stopBtn.disabled = !connected || pendingTurns.size === 0;
    wsUrlInput.disabled = connected;
    statusDot.classList.toggle('connected', connected);
    statusLabel.textContent = connected ? '已连接' : '未连接';
    updateActiveMeta();
}

function sendMessage() {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
        addMessage('error', '未连接，无法发送消息');
        return;
    }

    const text = messageInput.value.trim();
    if (!text) return;

    const session = getActiveSession() || createSession(false);
    const messageId = makeId();
    updateTitleFromMessage(session, text);
    addMessage('user', text, { messageId });

    pendingTurns.set(messageId, null);
    ensureAssistantMessage(messageId);

    const payload = {
        type: 'text',
        sessionId: session.id,
        messageId,
        message: text,
        createdAt: new Date().toISOString()
    };

    sendJson(payload);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    stopBtn.disabled = false;
}

function stopCurrent() {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    const session = getActiveSession();
    const messageId = getLatestPendingMessageId();
    sendJson({ type: 'stop', sessionId: session ? session.id : null, messageId });
    addMessage('system', '已发送停止请求');
    finishAssistantMessage(messageId, 'stopped');
}

function clearCurrentSession() {
    const session = getActiveSession();
    if (!session) return;
    session.messages = [];
    session.title = DEFAULT_TITLE;
    session.updatedAt = new Date().toISOString();
    pendingTurns.clear();
    saveSessions();
    renderAll();
}

function deleteCurrentSession() {
    if (!sessions.length) return;
    sessions = sessions.filter((session) => session.id !== activeSessionId);
    if (!sessions.length) {
        createSession(false);
    } else {
        activeSessionId = sessions[0].id;
    }
    pendingTurns.clear();
    saveSessions();
    renderAll();
}

function exportCurrentSession() {
    const session = getActiveSession();
    if (!session) return;
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${session.title || 'agentbee-session'}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function renderSessions() {
    sessionList.innerHTML = '';
    sessions.forEach((session) => {
        const btn = document.createElement('button');
        btn.className = `session-item${session.id === activeSessionId ? ' active' : ''}`;
        btn.title = session.title;
        btn.innerHTML = `
            <span class="session-title">${escapeHtml(session.title)}</span>
            <span class="session-meta">${session.messages.length} 条 · ${formatDate(session.updatedAt)}</span>
        `;
        btn.addEventListener('click', () => {
            activeSessionId = session.id;
            pendingTurns.clear();
            renderAll();
        });
        sessionList.appendChild(btn);
    });
}

function renderMessages() {
    const session = getActiveSession();
    chatContainer.innerHTML = '';

    if (!session || !session.messages.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '连接后即可开始对话。当前页面会在浏览器本地保存聊天记录。';
        chatContainer.appendChild(empty);
        return;
    }

    session.messages.forEach((message) => {
        const row = document.createElement('article');
        row.className = `message ${message.role}`;
        const roleName = {
            user: '我',
            assistant: 'AgentBee',
            system: '系统',
            error: '错误',
            tool: '工具'
        }[message.role] || message.role;

        const think = message.think
            ? `<div class="think">${escapeHtml(message.think)}</div>`
            : '';
        const content = message.role === 'assistant'
            ? renderMarkdown(message.content || '')
            : escapeHtml(message.content || '');

        row.innerHTML = `
            <div class="meta">${roleName} · ${message.time || ''}</div>
            <div class="bubble">${think}<div class="markdown-body">${content}</div></div>
        `;
        chatContainer.appendChild(row);
    });

    scrollToBottom();
}

function renderAll() {
    renderSessions();
    renderMessages();
    updateActiveMeta();
}

function updateActiveMeta() {
    const session = getActiveSession();
    activeTitle.textContent = session ? session.title : DEFAULT_TITLE;
    const url = wsUrlInput.value.trim();
    activeMeta.textContent = `${connected ? '已连接' : '等待连接'} · ${url || '未设置 URL'}`;
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let paragraph = [];
    let listType = null;
    let inCode = false;
    let codeLines = [];

    function flushParagraph() {
        if (!paragraph.length) return;
        html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
        paragraph = [];
    }

    function closeList() {
        if (!listType) return;
        html.push(`</${listType}>`);
        listType = null;
    }

    lines.forEach((line) => {
        const codeFence = line.match(/^```(.*)$/);
        if (codeFence) {
            if (inCode) {
                html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                codeLines = [];
                inCode = false;
            } else {
                flushParagraph();
                closeList();
                inCode = true;
            }
            return;
        }

        if (inCode) {
            codeLines.push(line);
            return;
        }

        if (!line.trim()) {
            flushParagraph();
            closeList();
            return;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            flushParagraph();
            closeList();
            const level = heading[1].length;
            html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
            return;
        }

        const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
        const unordered = line.match(/^\s*[-*]\s+(.+)$/);
        if (ordered || unordered) {
            flushParagraph();
            const nextType = ordered ? 'ol' : 'ul';
            if (listType !== nextType) {
                closeList();
                listType = nextType;
                html.push(`<${listType}>`);
            }
            html.push(`<li>${renderInlineMarkdown((ordered || unordered)[1])}</li>`);
            return;
        }

        const quote = line.match(/^>\s?(.+)$/);
        if (quote) {
            flushParagraph();
            closeList();
            html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
            return;
        }

        paragraph.push(line.trim());
    });

    if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }
    flushParagraph();
    closeList();

    return html.join('');
}

function renderInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return html;
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = `${Math.min(150, this.scrollHeight)}px`;
});

messageInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

wsUrlInput.addEventListener('input', () => {
    localStorage.setItem('agentbee.lastUrl', wsUrlInput.value.trim());
    updateActiveMeta();
});

connectBtn.addEventListener('click', connectWebSocket);
disconnectBtn.addEventListener('click', disconnectWebSocket);
sendBtn.addEventListener('click', sendMessage);
stopBtn.addEventListener('click', stopCurrent);
scrollBtn.addEventListener('click', scrollToBottom);
newSessionBtn.addEventListener('click', () => createSession(true));
clearSessionBtn.addEventListener('click', clearCurrentSession);
deleteSessionBtn.addEventListener('click', deleteCurrentSession);
exportBtn.addEventListener('click', exportCurrentSession);

const lastUrl = localStorage.getItem('agentbee.lastUrl');
if (lastUrl) wsUrlInput.value = lastUrl;

loadSessions();
renderAll();
