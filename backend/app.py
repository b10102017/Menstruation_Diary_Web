from datetime import date
from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from pathlib import Path

app = Flask(__name__)
CORS(app) #允許跨來源請求

DB_PATH = Path(__file__).with_name("diary.db") # 將資料庫 diary.db 放在目前 Python 程式所在的資料夾。

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# 建立資料表，並檢查 flow_amount 欄位是否存在，若不存在則新增該欄位。
def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_date TEXT NOT NULL UNIQUE,
                flow_amount TEXT NOT NULL DEFAULT 'N/A' CHECK(flow_amount IN ('N/A', 'none', 'light', 'medium', 'heavy')),
                mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
                note TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(entries)")}
        if "flow_amount" not in columns:
            conn.execute(
                "ALTER TABLE entries ADD COLUMN flow_amount TEXT NOT NULL DEFAULT 'N/A' "
                "CHECK(flow_amount IN ('N/A', 'none', 'light', 'medium', 'heavy'))"
            )
        else:
            schema = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entries'"
            ).fetchone()["sql"]
            if "'N/A'" not in schema:
                conn.execute("""
                    CREATE TABLE entries_migration (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        entry_date TEXT NOT NULL UNIQUE,
                        flow_amount TEXT NOT NULL DEFAULT 'N/A'
                            CHECK(flow_amount IN ('N/A', 'none', 'light', 'medium', 'heavy')),
                        mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
                        note TEXT DEFAULT '',
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.execute("""
                    INSERT INTO entries_migration (id, entry_date, flow_amount, mood, note, created_at)
                    SELECT id, entry_date, flow_amount, mood, note, created_at FROM entries
                """)
                conn.execute("DROP TABLE entries")
                conn.execute("ALTER TABLE entries_migration RENAME TO entries")

# 用來確認後端伺服器是否正常運作
@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})

# 讓前端取得使用者過去的日記紀錄
@app.get("/api/entries")
def get_entries():
    query = "SELECT id, entry_date, flow_amount, mood, note, created_at FROM entries"
    query += " ORDER BY entry_date DESC"
    with get_db() as conn:
        rows = conn.execute(query).fetchall()
    return jsonify([dict(row) for row in rows])

# 讓前端新增一筆日記紀錄
@app.post("/api/entries")
def create_entry():
    data = request.get_json(silent=True) or {}
    entry_date = data.get("entry_date")
    flow_amount = data.get("flow_amount", "N/A")
    mood = data.get("mood")
    note = (data.get("note") or "").strip()

    try:
        date.fromisoformat(entry_date)
        if flow_amount not in ("N/A", "none", "light", "medium", "heavy"):
            raise ValueError()
        mood = int(mood)
        if mood < 1 or mood > 5:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"error": "請提供有效日期、經血量，以及 1 到 5 的心情指數。"}), 400

    try:
        with get_db() as conn:
            cursor = conn.execute(
                "INSERT INTO entries (entry_date, flow_amount, mood, note) VALUES (?, ?, ?, ?)",
                (entry_date, flow_amount, mood, note)
            )
            row = conn.execute(
                "SELECT id, entry_date, flow_amount, mood, note, created_at FROM entries WHERE id = ?",
                (cursor.lastrowid,)
            ).fetchone()
        return jsonify(dict(row)), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "這一天已經有紀錄囉！可以到「看紀錄」查看。"}), 409

@app.delete("/api/entries/<int:entry_id>")
def delete_entry(entry_id):
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    if cursor.rowcount == 0:
        return jsonify({"error": "找不到這筆紀錄。"}), 404
    return jsonify({"message": "紀錄已刪除。"})

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)