// chat.js — AI 多人格聊天室 前端逻辑

// ========== 全局状态 ==========
let currentMode = 'single';          // 'single' | 'group' | 'debate'
let currentConversationId = null;
let currentSingleMbti = 'ENFP';
let singleHistory = [];
let groupHistory = {};               // {mbti: [{role, content}, ...]}
let debateState = null;              // {topic, personality_a, personality_b, round, history}
let isWaiting = false;

// ========== 初始化 ==========
function init() {
    renderPersonalitySelectors();
    switchTab('single');
    loadHistoryList();
}

// ========== 渲染人格选择器 ==========
function renderPersonalitySelectors() {
    const categories = {};
    Object.entries(PERSONALITIES).forEach(([key, info]) => {
        const cat = info.category || '其他';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({key, ...info});
    });

    // 单人模式选择器 - 按类别分组
    const singleDiv = document.getElementById('singlePersonalityList');
    singleDiv.innerHTML = '';
    Object.entries(categories).forEach(([catName, members]) => {
        const label = document.createElement('span');
        label.style.cssText = 'font-size:11px;color:#666;width:100%;margin-top:4px;';
        label.textContent = catName;
        singleDiv.appendChild(label);
        members.forEach(({key, emoji, name}) => {
            const btn = document.createElement('button');
            btn.textContent = `${emoji} ${key}`;
            btn.title = name;
            btn.dataset.mbti = key;
            if (key === currentSingleMbti) btn.classList.add('active');
            btn.onclick = () => switchSinglePersonality(key);
            singleDiv.appendChild(btn);
        });
    });

    // 群聊模式选择器 - 按类别分组
    const groupDiv = document.getElementById('groupPersonalityList');
    groupDiv.innerHTML = '';
    const allKeys = Object.keys(PERSONALITIES);
    const defaults = allKeys.slice(0, 3);
    Object.entries(categories).forEach(([catName, members]) => {
        const label = document.createElement('span');
        label.style.cssText = 'font-size:11px;color:#666;width:100%;margin-top:4px;';
        label.textContent = catName;
        groupDiv.appendChild(label);
        members.forEach(({key, emoji, name}) => {
            const btn = document.createElement('button');
            btn.textContent = `${emoji} ${key}`;
            btn.title = name;
            btn.dataset.mbti = key;
            if (defaults.includes(key)) btn.classList.add('active');
            btn.onclick = () => btn.classList.toggle('active');
            groupDiv.appendChild(btn);
        });
    });
    // 初始化群聊历史
    allKeys.forEach(k => { groupHistory[k] = []; });
    loadGroupWelcome();

    // 辩论模式选择器
    const selectA = document.getElementById('debatePersonalityA');
    const selectB = document.getElementById('debatePersonalityB');
    if (selectA && selectB) {
        [selectA, selectB].forEach(sel => {
            sel.innerHTML = Object.entries(PERSONALITIES)
                .map(([key, info]) => `<option value="${key}">${info.emoji} ${key} - ${info.name}</option>`)
                .join('');
        });
        // 默认选两个对立人格
        selectA.value = 'ENTP';
        selectB.value = 'INTJ';
    }
}

// ========== 切换单人模式的人格 ==========
function switchSinglePersonality(mbti) {
    currentSingleMbti = mbti;
    singleHistory = [];
    document.querySelectorAll('#singlePersonalityList button').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`#singlePersonalityList button[data-mbti="${mbti}"]`);
    if (btn) btn.classList.add('active');
    document.getElementById('singleChatBox').innerHTML = '';
    addSystemMsg(`🔄 已切换到 ${PERSONALITIES[mbti].emoji} ${PERSONALITIES[mbti].name}，开始新对话吧！`, 'singleChatBox');
    // 创建新对话
    createConversation('private', PERSONALITIES[mbti].name);
}

// ========== 通用函数 ==========
function addMessage(role, content, boxId, speakerLabel) {
    const box = document.getElementById(boxId);
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (speakerLabel) {
        div.innerHTML = `<span class="speaker-label">${speakerLabel}</span>${escapeHtml(content)}`;
    } else {
        div.textContent = content;
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
}

function addSystemMsg(content, boxId) {
    const box = document.getElementById(boxId);
    const div = document.createElement('div');
    div.className = 'message system-msg';
    div.textContent = content;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function showTyping(boxId) {
    const box = document.getElementById(boxId);
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.id = `typing-${boxId}`;
    div.textContent = '🤔 思考中...';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
}

function removeTyping(boxId) {
    const el = document.getElementById(`typing-${boxId}`);
    if (el) el.remove();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setInputEnabled(enabled) {
    isWaiting = !enabled;
    ['singleSendBtn', 'groupSendBtn', 'debateSendBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !enabled;
    });
}

// ========== API 调用 ==========
async function apiCall(endpoint, body) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
}

async function createConversation(mode, title) {
    try {
        const data = await apiCall('/conversation/create', { mode, title });
        currentConversationId = data.conversation_id;
        loadHistoryList();
    } catch (e) {
        console.warn('创建对话失败:', e);
    }
}

async function loadHistoryList() {
    try {
        const response = await fetch('/conversations');
        const data = await response.json();
        const listDiv = document.getElementById('historyList');
        if (!listDiv) return;
        listDiv.innerHTML = data.conversations.map(c => `
            <div class="history-item" onclick="loadConversation(${c.id})" data-id="${c.id}">
                <span class="mode-badge">${modeLabel(c.mode)}</span>${c.title || '未命名对话'}
            </div>
        `).join('') || '<div style="color:#555;font-size:12px;padding:8px;">暂无历史对话</div>';
    } catch (e) {
        console.warn('加载历史失败:', e);
    }
}

function modeLabel(mode) {
    return { 'private': '💬', 'group': '👥', 'debate': '⚔️' }[mode] || mode;
}

async function loadConversation(cid) {
    try {
        const response = await fetch(`/conversation/${cid}/messages`);
        const data = await response.json();
        const conv = data.conversation;
        currentConversationId = cid;

        // 切换到对应模式
        switchTab(conv.mode);

        if (conv.mode === 'private') {
            const box = document.getElementById('singleChatBox');
            box.innerHTML = '';
            data.messages.forEach(m => {
                if (m.speaker === 'user') {
                    addMessage('user', m.content, 'singleChatBox');
                } else {
                    const info = PERSONALITIES[m.speaker];
                    const label = info ? `${info.emoji} ${info.name}` : m.speaker;
                    addMessage('ai', m.content, 'singleChatBox', label);
                }
            });
            singleHistory = data.messages.map(m => ({ role: m.role, content: m.content }));
            if (data.messages.length > 0) {
                const lastAi = data.messages.filter(m => m.speaker !== 'user').pop();
                if (lastAi) currentSingleMbti = lastAi.speaker;
            }
        } else if (conv.mode === 'group') {
            const box = document.getElementById('groupChatBox');
            box.innerHTML = '';
            data.messages.forEach(m => {
                if (m.speaker === 'user') {
                    addMessage('user', m.content, 'groupChatBox', '👤 我');
                } else {
                    const info = PERSONALITIES[m.speaker];
                    const label = info ? `${info.emoji} ${info.name}` : m.speaker;
                    addMessage('ai', m.content, 'groupChatBox', label);
                }
            });
            Object.keys(groupHistory).forEach(k => { groupHistory[k] = []; });
            data.messages.forEach(m => {
                if (m.speaker !== 'user' && groupHistory[m.speaker]) {
                    groupHistory[m.speaker].push({ role: m.role, content: m.content });
                }
            });
        } else if (conv.mode === 'debate') {
            const personalities = conv.personalities.split(',');
            initDebateUI(conv.debate_topic, personalities);
            const box = document.getElementById('debateChatBox');
            box.innerHTML = '';
            data.messages.forEach(m => {
                if (m.speaker === 'user') {
                    addMessage('user', m.content, 'debateChatBox', '👤 裁判');
                } else {
                    const info = PERSONALITIES[m.speaker];
                    const stance = m.speaker === personalities[0] ? '正方 ✅' : '反方 ❌';
                    const label = info ? `${info.emoji} ${info.name}【${stance}】` : m.speaker;
                    addMessage('ai', m.content, 'debateChatBox', label);
                }
            });
        }

        // 高亮选中项
        document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
        const target = document.querySelector(`.history-item[data-id="${cid}"]`);
        if (target) target.classList.add('active');

    } catch (e) {
        console.warn('加载对话失败:', e);
    }
}

// ========== 单人模式 ==========
async function sendSingle() {
    if (isWaiting) return;
    const input = document.getElementById('singleInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    addMessage('user', msg, 'singleChatBox');
    singleHistory.push({ role: 'user', content: msg });

    if (!currentConversationId) {
        await createConversation('private', PERSONALITIES[currentSingleMbti].name);
    }

    setInputEnabled(false);
    showTyping('singleChatBox');

    try {
        const data = await apiCall('/chat', {
            mbti: currentSingleMbti,
            message: msg,
            history: singleHistory.slice(0, -1),
            conversation_id: currentConversationId
        });
        removeTyping('singleChatBox');
        const info = PERSONALITIES[currentSingleMbti];
        addMessage('ai', data.reply, 'singleChatBox', `${info.emoji} ${info.name}`);
        singleHistory.push({ role: 'assistant', content: data.reply });
    } catch (e) {
        removeTyping('singleChatBox');
        addSystemMsg(`❌ 错误: ${e.message}`, 'singleChatBox');
    } finally {
        setInputEnabled(true);
    }
}

// ========== 群聊模式 ==========
function loadGroupWelcome() {
    const box = document.getElementById('groupChatBox');
    if (box.children.length === 0) {
        addSystemMsg('👋 群聊已就绪！选择上方人格（高亮为参与），发送消息后所有AI将同时回复。', 'groupChatBox');
    }
}

async function sendGroup() {
    if (isWaiting) return;
    const input = document.getElementById('groupInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const selectedBtns = document.querySelectorAll('#groupPersonalityList button.active');
    if (selectedBtns.length === 0) {
        addSystemMsg('⚠️ 请至少选择一个AI人格参与群聊！', 'groupChatBox');
        return;
    }

    addMessage('user', msg, 'groupChatBox', '👤 我');

    const selectedMbtis = Array.from(selectedBtns).map(b => b.dataset.mbti);
    const selectedNames = selectedMbtis.map(k => PERSONALITIES[k].name).join('、');

    if (!currentConversationId) {
        await createConversation('group', `群聊: ${selectedNames}`);
    }

    // 为每个选中的AI准备历史
    const requestHistories = {};
    selectedMbtis.forEach(k => {
        if (!groupHistory[k]) groupHistory[k] = [];
        requestHistories[k] = groupHistory[k].slice();
    });

    setInputEnabled(false);

    // 显示所有AI的思考状态
    const typingDivs = {};
    selectedMbtis.forEach(k => {
        const info = PERSONALITIES[k];
        const div = addMessage('ai', '...', 'groupChatBox', `${info.emoji} ${info.name}`);
        div.style.opacity = '0.5';
        typingDivs[k] = div;
    });

    try {
        const data = await apiCall('/chat/group', {
            personalities: selectedMbtis,
            message: msg,
            histories: requestHistories,
            conversation_id: currentConversationId
        });

        // 移除所有占位，显示实际回复
        Object.entries(typingDivs).forEach(([k, div]) => {
            if (data.replies[k]) {
                const info = PERSONALITIES[k];
                div.innerHTML = `<span class="speaker-label">${info.emoji} ${info.name}</span>${escapeHtml(data.replies[k])}`;
                div.style.opacity = '1';
                // 更新历史
                if (!groupHistory[k]) groupHistory[k] = [];
                groupHistory[k].push({ role: 'user', content: msg });
                groupHistory[k].push({ role: 'assistant', content: data.replies[k] });
            } else {
                div.textContent = `${PERSONALITIES[k].emoji} ${k}: ⚠️ 暂时无法回复`;
                div.style.opacity = '1';
            }
        });
    } catch (e) {
        Object.values(typingDivs).forEach(d => { d.textContent = `❌ ${e.message}`; d.style.opacity = '1'; });
    } finally {
        setInputEnabled(true);
    }
}

// ========== 辩论模式 ==========
function initDebateUI(topic, personalities) {
    debateState = {
        topic: topic,
        personality_a: personalities[0],
        personality_b: personalities[1],
        round: 0,
        history_a: [],
        history_b: []
    };
    document.getElementById('debateSetup').style.display = 'none';
    document.getElementById('debateActive').style.display = 'flex';
    document.getElementById('debateTopicDisplay').innerHTML =
        `${PERSONALITIES[personalities[0]].emoji} ${personalities[0]} <span style="color:#4ecb71;">正方</span>`
        + ` VS `
        + `${PERSONALITIES[personalities[1]].emoji} ${personalities[1]} <span style="color:#e94560;">反方</span>`
        + ` | 辩题: ${topic}`;
    document.getElementById('debateRound').textContent = '准备开始...';
}

function startDebate() {
    const topic = document.getElementById('debateTopic').value.trim();
    const pa = document.getElementById('debatePersonalityA').value;
    const pb = document.getElementById('debatePersonalityB').value;

    if (!topic) {
        alert('请输入辩题！');
        return;
    }
    if (pa === pb) {
        alert('请选择两个不同的人格！');
        return;
    }

    const infoA = PERSONALITIES[pa];
    const infoB = PERSONALITIES[pb];
    initDebateUI(topic, [pa, pb]);

    addSystemMsg(`🔔 ${infoA.emoji} ${infoA.name} (正方)  VS  ${infoB.emoji} ${infoB.name} (反方)`, 'debateChatBox');
    addSystemMsg(`📋 辩题: ${topic}`, 'debateChatBox');

    createConversation('debate', `辩论: ${topic}`, topic, [pa, pb].join(','));

    // 开始第一轮
    nextDebateRound();
}

async function nextDebateRound() {
    if (!debateState || isWaiting) return;

    // 选择当前发言方
    const isA = debateState.round % 2 === 0;
    const mbti = isA ? debateState.personality_a : debateState.personality_b;
    const opponent = isA ? debateState.personality_b : debateState.personality_a;
    const info = PERSONALITIES[mbti];
    const oppInfo = PERSONALITIES[opponent];
    const history = isA ? debateState.history_a : debateState.history_b;

    debateState.round++;
    document.getElementById('debateRound').textContent = `第 ${Math.ceil(debateState.round / 2)} 回合`;

    setInputEnabled(false);
    showTyping('debateChatBox');

    try {
        // 正方=personality_a, 反方=personality_b
        const stance = isA ? '正方 ✅' : '反方 ❌';
        const data = await apiCall('/chat/debate', {
            mbti: mbti,
            opponent: opponent,
            topic: debateState.topic,
            round: debateState.round,
            history: history,
            conversation_id: currentConversationId,
            pro_mbti: debateState.personality_a
        });

        removeTyping('debateChatBox');
        addMessage('ai', data.reply, 'debateChatBox',
            `${info.emoji} ${info.name}【${stance}】 (第${Math.ceil(debateState.round / 2)}回合)`);

        // 更新历史
        const side = isA ? 'history_a' : 'history_b';
        debateState[side].push({
            role: 'user',
            content: `辩论第${Math.ceil(debateState.round / 2)}回合，辩题：${debateState.topic}。`
                + `你的对手(${oppInfo.name})上一轮说了：${history.length > 0 ? history[history.length - 1].content : '尚未发言'}。请继续辩论。`
        });
        debateState[side].push({ role: 'assistant', content: data.reply });

    } catch (e) {
        removeTyping('debateChatBox');
        addSystemMsg(`❌ ${e.message}`, 'debateChatBox');
    } finally {
        setInputEnabled(true);
    }
}

function resetDebate() {
    debateState = null;
    document.getElementById('debateSetup').style.display = '';
    document.getElementById('debateActive').style.display = 'none';
    document.getElementById('debateChatBox').innerHTML = '';
    currentConversationId = null;
}

// ========== Tab 切换 ==========
function switchTab(tab) {
    // 数据库mode 'private' 映射到前端tab 'single'
    if (tab === 'private') tab = 'single';

    currentMode = tab;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tabs button').forEach(el => el.classList.remove('active'));

    if (tab === 'single') {
        document.getElementById('singleTab').classList.add('active');
        document.querySelector('.tabs button:nth-child(1)').classList.add('active');
    } else if (tab === 'group') {
        document.getElementById('groupTab').classList.add('active');
        document.querySelector('.tabs button:nth-child(2)').classList.add('active');
    } else if (tab === 'debate') {
        document.getElementById('debateTab').classList.add('active');
        document.querySelector('.tabs button:nth-child(3)').classList.add('active');
    }
}

function newChat() {
    currentConversationId = null;
    singleHistory = [];
    Object.keys(PERSONALITIES).forEach(k => { groupHistory[k] = []; });
    debateState = null;

    document.getElementById('singleChatBox').innerHTML = '';
    document.getElementById('groupChatBox').innerHTML = '';
    document.getElementById('debateChatBox').innerHTML = '';
    document.getElementById('debateSetup').style.display = '';
    document.getElementById('debateActive').style.display = 'none';

    addSystemMsg('👋 开始新对话！', 'singleChatBox');
    loadGroupWelcome();
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);
