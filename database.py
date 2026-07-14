# database.py — SQLite 数据库操作
import sqlite3
import os
from config import DATABASE_PATH


def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """初始化数据库表结构"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            mode        TEXT NOT NULL DEFAULT 'private',
            title       TEXT DEFAULT '',
            debate_topic TEXT DEFAULT '',
            personalities TEXT DEFAULT '',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            speaker         TEXT NOT NULL,
            content         TEXT NOT NULL,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_msg_conv
            ON messages(conversation_id);
    """)

    conn.commit()
    conn.close()


def create_conversation(mode, title="", debate_topic="", personalities=""):
    """创建新对话，返回 conversation_id"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO conversations (mode, title, debate_topic, personalities) VALUES (?, ?, ?, ?)",
        (mode, title, debate_topic, personalities)
    )
    conn.commit()
    cid = cursor.lastrowid
    conn.close()
    return cid


def save_message(conversation_id, speaker, content):
    """保存一条消息"""
    conn = get_db()
    conn.execute(
        "INSERT INTO messages (conversation_id, speaker, content) VALUES (?, ?, ?)",
        (conversation_id, speaker, content)
    )
    conn.commit()
    conn.close()


def get_messages(conversation_id, limit=50):
    """获取某个对话的消息历史"""
    conn = get_db()
    rows = conn.execute(
        "SELECT speaker, content, created_at FROM messages "
        "WHERE conversation_id = ? ORDER BY id ASC LIMIT ?",
        (conversation_id, limit)
    ).fetchall()
    conn.close()
    return [{"role": "assistant" if r["speaker"] != "user" else "user",
             "speaker": r["speaker"],
             "content": r["content"]}
            for r in rows]


def get_recent_conversations(limit=20):
    """获取最近的对话列表"""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, mode, title, debate_topic, personalities, created_at "
        "FROM conversations ORDER BY created_at DESC LIMIT ?",
        (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_conversation(conversation_id):
    """删除对话及其消息"""
    conn = get_db()
    conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
    conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
    conn.commit()
    conn.close()
