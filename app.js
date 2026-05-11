const STORAGE_KEY = 'agentbee.sessions.v2';
const DEFAULT_TITLE = '新会话';

let ws = null;
let connected = false;
let sessions = [];
let activeSessionId = null;
let currentAssistantMessage = null;

const wsUrlInput = document.getElementById('wsUrl');
const sendModeInput = document.getElementById('sendMode');
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
    currentAssistantMessage = null;
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

function appendAssistantContent(text) {
    const session = getActiveSession() || createSession(false);
    if (!currentAssistantMessage) {
        currentAssistantMessage = {
            id: makeId(),
            role: 'assistant',
            content: '',
            think: '',
            time: nowTime()
        };
        session.messages.push(currentAssistantMessage);
    }
    currentAssistantMessage.content += text || '';
    touchSession(session);
    saveSessions();
    renderAll();
}

function appendAssistantThink(text) {
    const session = getActiveSession() || createSession(false);
    if (!currentAssistantMessage) {
        currentAssistantMessage = {
            id: makeId(),
            role: 'assistant',
            content: '',
            think: '',
            time: nowTime()
        };
        session.messages.push(currentAssistantMessage);
    }
    currentAssistantMessage.think = `${currentAssistantMessage.think || ''}${text || ''}`;
    touchSession(session);
    saveSessions();
    renderAll();
}

function finishAssistantMessage() {
    currentAssistantMessage = null;
    stopBtn.disabled = true;
    saveSessions();
    renderAll();
}

function normalizePayload(msg) {
    const data = msg.data ?? msg.text ?? msg.content ?? msg.delta ?? '';
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function handleServerMessage(raw) {
    let msg = null;
    if (typeof raw === 'string') {
        try {
            msg = JSON.parse(raw);
        } catch (e) {
            appendAssistantContent(raw);
            return;
        }
    }

    if (!msg || typeof msg !== 'object') return;

    const type = msg.type || msg.event || msg.role;
    if (type === 'content' || type === 'assistant' || type === 'message') {
        appendAssistantContent(normalizePayload(msg));
        return;
    }

    if (type === 'think' || type === 'thinking' || type === 'status') {
        appendAssistantThink(normalizePayload(msg));
        return;
    }

    if (type === 'tool_call' || type === 'tool') {
        addMessage('tool', JSON.stringify({
            name: msg.name || msg.tool || 'tool',
            args: msg.args || msg.arguments || msg.data || {}
        }, null, 2));
        return;
    }

    if (type === 'tool_result') {
        addMessage('tool', JSON.stringify({
            ok: msg.ok !== false,
            result: msg.result ?? msg.data ?? msg.content ?? ''
        }, null, 2));
        return;
    }

    if (type === 'error') {
        addMessage('error', msg.message || normalizePayload(msg) || '服务返回错误');
        finishAssistantMessage();
        return;
    }

    if (type === 'end' || type === 'done' || type === 'finish') {
        finishAssistantMessage();
        return;
    }

    appendAssistantContent(JSON.stringify(msg, null, 2));
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
    stopBtn.disabled = !connected || !currentAssistantMessage;
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
    updateTitleFromMessage(session, text);
    addMessage('user', text);

    const payload = sendModeInput.value === 'json'
        ? JSON.stringify({ type: 'user_message', sessionId: session.id, message: text })
        : text;

    ws.send(payload);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    currentAssistantMessage = null;
    stopBtn.disabled = false;
}

function stopCurrent() {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
    const session = getActiveSession();
    ws.send(JSON.stringify({ type: 'stop', sessionId: session ? session.id : null }));
    addMessage('system', '已发送停止请求');
    finishAssistantMessage();
}

function clearCurrentSession() {
    const session = getActiveSession();
    if (!session) return;
    session.messages = [];
    session.title = DEFAULT_TITLE;
    session.updatedAt = new Date().toISOString();
    currentAssistantMessage = null;
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
    currentAssistantMessage = null;
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
            currentAssistantMessage = null;
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

        row.innerHTML = `
            <div class="meta">${roleName} · ${message.time || ''}</div>
            <div class="bubble">${think}${escapeHtml(message.content || '')}</div>
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

sendModeInput.addEventListener('change', () => {
    localStorage.setItem('agentbee.sendMode', sendModeInput.value);
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
const lastMode = localStorage.getItem('agentbee.sendMode');
if (lastUrl) wsUrlInput.value = lastUrl;
if (lastMode) sendModeInput.value = lastMode;

loadSessions();
renderAll();
