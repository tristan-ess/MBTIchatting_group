# config.py — 配置管理
import os
from dotenv import load_dotenv

# 自动加载项目根目录的 .env 文件
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# 豆包 (Doubao) API 配置
# 在 .env 文件中设置 DOUBAO_API_KEY=你的密钥
API_KEY = os.getenv("DOUBAO_API_KEY", "your-api-key-here")
API_URL = os.getenv("DOUBAO_API_URL", "https://ark.cn-beijing.volces.com/api/v3/chat/completions")
MODEL = os.getenv("DOUBAO_MODEL", "ep-20260708131049-kzcfv")

# 应用配置
SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-in-production")
DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat_history.db")
