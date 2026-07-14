import requests
import json

"""API 连通性测试脚本。运行前请确保已配置 .env 中的 DOUBAO_API_KEY。"""
import requests
import json
from config import API_KEY, API_URL, MODEL

if __name__ == "__main__":
    messages = [{"role": "user", "content": "你好，请介绍一下你自己"}]

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"}
    data = {"model": MODEL, "messages": messages, "temperature": 0.7}

    response = requests.post(API_URL, headers=headers, data=json.dumps(data))
    print(f"Status: {response.status_code}")
    print(response.text[:500] if len(response.text) > 500 else response.text)