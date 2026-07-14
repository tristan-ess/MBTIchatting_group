# chat_engine.py — 豆包 API 调用核心
import requests
import json
import sys
from config import API_KEY, API_URL, MODEL

# Windows 控制台 GBK 编码下 emoji 会报错，安全处理
def _safe_print(*args, **kwargs):
    try:
        print(*args, **kwargs)
    except UnicodeEncodeError:
        print(*(str(a).encode('ascii', errors='replace').decode('ascii') for a in args), **kwargs)


def call_doubao_api(messages, temperature=0.8):
    """调用豆包API的底层函数

    Args:
        messages: OpenAI格式的消息列表 [{"role":..., "content":...}]
        temperature: 生成温度 (0-1)

    Returns:
        dict or None: API返回的完整JSON，失败返回None
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    data = {
        "model": MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    try:
        response = requests.post(
            API_URL, headers=headers, data=json.dumps(data),
            timeout=(5, 120)
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        _safe_print("[Timeout] API request timed out")
        return None
    except requests.exceptions.RequestException as e:
        _safe_print("[Error] API request failed:", str(e)[:200])
        return None


def call_doubao(system_prompt, user_message, history=None, temperature=0.8):
    """供 Flask app.py 调用的高层接口

    Args:
        system_prompt: 系统提示词（定义AI人格）
        user_message: 用户当前消息
        history: 可选，对话历史 [{"role":"user","content":"..."}, ...]
        temperature: 生成温度

    Returns:
        str or None: AI回复文本，失败返回None
    """
    messages = [{"role": "system", "content": system_prompt}]

    # 拼接历史上下文（保留最近10轮，避免token过长）
    if history:
        messages.extend(history[-20:])  # 最多10轮用户+10轮AI
    else:
        messages.append({"role": "user", "content": user_message})

    # 如果传了history，当前消息可能已在history末尾，也可能需要追加
    if history:
        messages.append({"role": "user", "content": user_message})

    result = call_doubao_api(messages, temperature=temperature)
    if result:
        return result["choices"][0]["message"]["content"]
    return None


def call_doubao_batch(personalities, user_message, histories=None, temperature=0.8):
    """批量调用多个AI人格（用于群聊），每个AI独立上下文

    控制并发数避免触发API限流，失败自动重试。

    Args:
        personalities: dict {mbti_type: system_prompt}
        user_message: 用户消息
        histories: dict {mbti_type: [history]}  各人格的独立对话历史
        temperature: 生成温度

    Returns:
        dict: {mbti_type: reply_text}  成功的人格→回复
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import time

    results = {}
    if histories is None:
        histories = {}

    def _call_one_with_retry(mbti_type, system_prompt):
        hist = histories.get(mbti_type, [])
        for attempt in range(3):  # 最多3次尝试
            reply = call_doubao(system_prompt, user_message, hist, temperature)
            if reply:
                return mbti_type, reply
            if attempt < 2:
                time.sleep(1.5)  # 等1.5秒后重试
        return mbti_type, None

    # 最多3个并发，避免触发API限流
    max_workers = min(len(personalities), 3)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_call_one_with_retry, mbti, prompt): mbti
            for mbti, prompt in personalities.items()
        }
        for future in as_completed(futures):
            mbti, reply = future.result()
            if reply:
                results[mbti] = reply

    return results
