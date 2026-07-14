# config.py — 配置管理
import os
from dotenv import load_dotenv

# 自动加载项目根目录的 .env 文件
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

API_KEY = os.getenv("Your-api-key-here")
API_URL = os.getenv("Your_API_URL")
MODEL = os.getenv("Your_MODEL" )

SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-in-production")
DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat_history.db")
