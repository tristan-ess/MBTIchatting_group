# app.py — Flask 主应用
from flask import Flask, render_template, request, jsonify
from chat_engine import call_doubao, call_doubao_batch
from personalities import MBTI_PROMPTS, get_personality, get_personality_system_prompt
from database import init_db, create_conversation, save_message, get_messages, get_recent_conversations

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dev-secret-change-in-production'

# 启动时初始化数据库
init_db()


# ==================== 页面路由 ====================

@app.route('/')
def index():
    """返回聊天页面，注入人格数据"""
    return render_template('index.html', personalities=MBTI_PROMPTS)


# ==================== 对话管理 API ====================

@app.route('/conversation/create', methods=['POST'])
def create_conv():
    """创建新对话"""
    data = request.get_json()
    mode = data.get('mode', 'private')
    title = data.get('title', '')
    debate_topic = data.get('debate_topic', '')
    personalities = data.get('personalities', '')
    cid = create_conversation(mode, title, debate_topic, personalities)
    return jsonify({"conversation_id": cid, "status": "ok"})


@app.route('/conversations', methods=['GET'])
def list_conversations():
    """获取历史对话列表"""
    conversations = get_recent_conversations()
    return jsonify({"conversations": conversations})


@app.route('/conversation/<int:cid>/messages', methods=['GET'])
def get_conv_messages(cid):
    """获取某个对话的消息历史"""
    from database import get_db
    conn = get_db()
    conv = conn.execute(
        "SELECT * FROM conversations WHERE id = ?", (cid,)
    ).fetchone()
    conn.close()
    if not conv:
        return jsonify({"error": "对话不存在"}), 404

    messages = get_messages(cid)
    return jsonify({
        "conversation": dict(conv),
        "messages": messages
    })


# ==================== 聊天 API ====================

@app.route('/chat', methods=['POST'])
def chat():
    """
    单人私聊 API
    请求: {mbti, message, history, conversation_id?}
    响应: {reply}
    """
    data = request.get_json()
    mbti_type = data.get('mbti', '').upper()
    user_message = data.get('message', '')
    history = data.get('history', [])
    conversation_id = data.get('conversation_id')

    personality = get_personality(mbti_type)
    if not personality:
        return jsonify({"error": f"未知人格类型: {mbti_type}"}), 400
    if not user_message:
        return jsonify({"error": "消息不能为空"}), 400

    reply = call_doubao(
        system_prompt=personality["system_prompt"],
        user_message=user_message,
        history=history
    )

    if reply:
        # 保存到数据库
        if conversation_id:
            save_message(conversation_id, "user", user_message)
            save_message(conversation_id, mbti_type, reply)
        return jsonify({"reply": reply, "mbti": mbti_type})
    else:
        return jsonify({"error": "AI 暂时没有回复，请重试"}), 500


@app.route('/chat/group', methods=['POST'])
def chat_group():
    """
    群聊 API（并行调用多个 AI 人格）
    请求: {personalities: ["ENFP","INTJ",...], message, histories: {mbti:[history]}, conversation_id?}
    响应: {replies: {mbti: reply, ...}}
    """
    data = request.get_json()
    selected_mbtis = data.get('personalities', [])
    user_message = data.get('message', '')
    histories = data.get('histories', {})
    conversation_id = data.get('conversation_id')

    if not selected_mbtis:
        return jsonify({"error": "请至少选择一个AI人格"}), 400
    if not user_message:
        return jsonify({"error": "消息不能为空"}), 400

    # 获取每个人格的 system_prompt
    personality_prompts = {}
    for mbti in selected_mbtis:
        prompt = get_personality_system_prompt(mbti)
        if prompt:
            personality_prompts[mbti] = prompt

    if not personality_prompts:
        return jsonify({"error": "没有有效的人格"}), 400

    # 保存用户消息
    if conversation_id:
        save_message(conversation_id, "user", user_message)

    # 并行调用
    replies = call_doubao_batch(personality_prompts, user_message, histories)

    # 保存AI回复
    if conversation_id:
        for mbti, reply in replies.items():
            save_message(conversation_id, mbti, reply)

    if not replies:
        return jsonify({"error": "所有AI暂时都无法回复，请检查API配置后重试"}), 500

    return jsonify({"replies": replies, "status": "ok"})


@app.route('/chat/debate', methods=['POST'])
def chat_debate():
    """
    辩论 API（控制双方轮流发言）
    请求: {mbti, opponent, topic, round, history, conversation_id?}
    响应: {reply}
    """
    data = request.get_json()
    mbti = data.get('mbti', '').upper()
    opponent = data.get('opponent', '').upper()
    topic = data.get('topic', '')
    round_num = data.get('round', 1)
    history = data.get('history', [])
    conversation_id = data.get('conversation_id')

    personality = get_personality(mbti)
    opp_personality = get_personality(opponent)

    if not personality or not opp_personality:
        return jsonify({"error": "无效的人格类型"}), 400
    if not topic:
        return jsonify({"error": "辩题不能为空"}), 400

    # 判断当前发言者是正方还是反方
    # personality_a（先选中的）永远是正方，personality_b 是反方
    # 从 conversation 中读取双方信息
    is_pro = (mbti == data.get('pro_mbti', '').upper())
    stance = "正方（支持论题）" if is_pro else "反方（反对论题）"
    opp_stance = "反方（反对论题）" if is_pro else "正方（支持论题）"

    # 构建辩论专用 system prompt
    debate_prompt = (
        f"{personality['system_prompt']}\n\n"
        f"===== 辩论模式 =====\n"
        f"你正在参加一场正式辩论。\n"
        f"辩题：「{topic}」\n"
        f"你的立场：{stance}\n"
        f"你的对手：{opp_personality['name']}（{opponent}型人格），对方立场：{opp_stance}\n"
        f"当前是第{round_num}回合。\n\n"
        f"辩论规则：\n"
        f"1. 你必须坚定维护你的立场，绝不动摇\n"
        f"2. 针对对手上一轮的具体论点进行反驳，指出其逻辑漏洞\n"
        f"3. 用事实、逻辑或价值观支撑你的观点\n"
        f"4. 保持你的人格特质，但辩论要有攻击性\n"
        f"5. 每轮发言控制在150字以内，简洁有力\n"
        f"6. 你的立场是固定的，不要被对手说服或转向"
    )

    # 构建消息
    if round_num <= 1:
        user_message = (
            f"辩题是「{topic}」，你的立场是{stance}。\n"
            f"请发表开场陈述：明确你的立场，给出你的核心论据！"
        )
    else:
        user_message = (
            f"第{round_num}回合。你的立场仍然是{stance}。\n"
            f"请针对对手上一轮的论点进行有力反驳，并进一步强化你的立场。\n"
            f"辩题：「{topic}」"
        )

    reply = call_doubao(
        system_prompt=debate_prompt,
        user_message=user_message,
        history=history,
        temperature=0.85  # 辩论时稍微提高温度以增加创造性
    )

    if reply:
        if conversation_id:
            save_message(conversation_id, mbti, reply)
        return jsonify({"reply": reply, "mbti": mbti, "round": round_num})
    else:
        return jsonify({"error": "AI 暂时没有回复"}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
