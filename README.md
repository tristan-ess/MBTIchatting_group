# 🧠 AI 多人格聊天室 (MBTI Chatroom)

基于豆包 (Doubao) LLM API 的 AI 多人格聊天应用，支持 16 种 MBTI 人格类型。

## 功能

- **💬 单人私聊**：选择任意 MBTI 人格进行 1 对 1 对话
- **👥 群聊模式**：同时与多个 AI 人格聊天（并行回复）
- **⚔️ 辩论场**：选择两个对立人格就指定话题进行辩论
- **📜 对话历史**：自动保存所有对话，可随时回顾

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置 API 密钥

```bash
# 复制配置模板
copy .env.example .env

# 编辑 .env 填入豆包 API 密钥
# DOUBAO_API_KEY=你的密钥
# DOUBAO_MODEL=你的endpoint-id
```

### 3. 启动应用

```bash
python app.py
```

访问 `http://localhost:5000`

### 4. 测试 API 连接（可选）

```bash
python test.py
```

## 项目结构

```
├── app.py              # Flask 主应用（路由和 API）
├── chat_engine.py      # 豆包 API 调用核心
├── personalities.py    # 16 种 MBTI 人格定义
├── database.py         # SQLite 数据持久化
├── config.py           # 配置管理（环境变量）
├── templates/
│   └── index.html      # 聊天界面
├── static/
│   ├── css/style.css   # 样式
│   └── js/chat.js      # 前端交互
├── requirements.txt
├── .env.example        # API Key 模板
└── test.py             # API 连通性测试
```

## 16 种 MBTI 人格

| 类别 | 类型 | 名称 |
|------|------|------|
| 分析家 | INTJ, INTP, ENTJ, ENTP | 战略家、逻辑学家、指挥官、辩论家 |
| 外交家 | ENFP, INFP, INFJ, ENFJ | 快乐小狗、调停者、提倡者、主人公 |
| 守护者 | ISTJ, ISFJ, ESTJ, ESFJ | 物流师、守护者、总经理、执政官 |
| 探险家 | ISTP, ISFP, ESTP, ESFP | 鉴赏家、探险家、企业家、表演者 |

## 技术栈

- **后端**：Flask 3.x
- **前端**：原生 HTML/CSS/JS（Jinja2 模板渲染）
- **数据库**：SQLite
- **AI 接口**：豆包 API（OpenAI 兼容格式）
- **并行**：concurrent.futures.ThreadPoolExecutor
