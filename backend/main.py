import os
import psycopg2
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
from dotenv import load_dotenv
from langchain_groq import ChatGroq
import hashlib
from jose import jwt
from datetime import datetime, timedelta

# =========================
# 🔐 ENV SETUP
# =========================
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not DATABASE_URL:
    raise ValueError("❌ DATABASE_URL not found")

if not GROQ_API_KEY:
    raise ValueError("❌ GROQ_API_KEY not found")

# =========================
# 🔗 DB CONNECTION
# =========================
conn = psycopg2.connect(DATABASE_URL, sslmode="require")
cursor = conn.cursor()

# =========================
# 🔐 AUTH CONFIG
# =========================
SECRET_KEY = "mysecretkey"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# =========================
# 🤖 LLM SETUP
# =========================
llm = ChatGroq(
    api_key=GROQ_API_KEY,
    model="llama-3.1-8b-instant",
    max_tokens=200,
)

# =========================
# 🚀 APP INIT
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# 🧱 CREATE TABLES
# =========================
cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    username TEXT,
    chat_id TEXT,
    sender TEXT,
    message TEXT,
    title TEXT
)
""")

conn.commit()

# =========================
# 🔐 TOKEN VERIFY
# =========================
def verify_token(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")

    token = authorization.split(" ")[1]

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload["sub"]
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

# =========================
# 📦 MODELS
# =========================
class Message(BaseModel):
    text: str
    history: List[Dict] = []
    chat_id: str

class User(BaseModel):
    username: str
    password: str

# =========================
# 🔐 HELPERS
# =========================
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# =========================
# 🏠 HOME
# =========================
@app.get("/")
def home():
    return {"message": "Backend is running 🚀"}

# =========================
# 🔐 SIGNUP
# =========================
@app.post("/signup")
def signup(user: User):
    try:
        hashed_password = hashlib.sha256(user.password.encode()).hexdigest()

        cursor.execute("SELECT * FROM users WHERE username=%s", (user.username,))
        if cursor.fetchone():
            return {"success": False, "message": "User already exists ❌"}

        cursor.execute(
            "INSERT INTO users (username, password) VALUES (%s, %s)",
            (user.username, hashed_password)
        )
        conn.commit()

        return {"success": True, "message": "User created ✅"}

    except Exception as e:
        print("SIGNUP ERROR:", e)
        return {"success": False, "message": "Signup failed ❌"}

# =========================
# 🔐 LOGIN
# =========================
@app.post("/login")
def login(user: User):
    cursor.execute(
        "SELECT password FROM users WHERE username=%s",
        (user.username,)
    )
    result = cursor.fetchone()

    if not result:
        return {"success": False, "message": "User not found ❌"}

    stored_password = result[0]
    hashed_input = hashlib.sha256(user.password.encode()).hexdigest()

    if hashed_input != stored_password:
        return {"success": False, "message": "Invalid password ❌"}

    token = create_access_token({"sub": user.username})

    return {
        "success": True,
        "token": token,
        "message": "Login successful ✅"
    }

# =========================
# 📂 GET CHATS
# =========================
@app.get("/get_chats/{username}")
def get_chats(username: str):
    cursor.execute(
        "SELECT chat_id, sender, message FROM chat_messages WHERE username=%s ORDER BY id ASC",
        (username,)
    )

    rows = cursor.fetchall()
    chats = {}

    for chat_id, sender, message in rows:
        if chat_id not in chats:
            chats[chat_id] = []

        chats[chat_id].append({
            "sender": sender,
            "text": message
        })

    return chats

# =========================
# ❌ DELETE CHAT
# =========================
@app.delete("/delete_chat/{chat_id}")
def delete_chat(chat_id: str, username: str = Depends(verify_token)):
    cursor.execute(
        "DELETE FROM chat_messages WHERE chat_id=%s AND username=%s",
        (chat_id, username)
    )
    conn.commit()

    return {"success": True, "message": "Chat deleted ✅"}

# =========================
# 🤖 CHAT
# =========================
@app.post("/chat")
def chat(message: Message, username: str = Depends(verify_token)):
    try:
        user_input = message.text
        history = message.history
        chat_id = message.chat_id

        title = None

        if len(history) == 0:
            title_prompt = [
                ("system", "Generate a short 3-5 word title."),
                ("human", user_input)
            ]
            title = llm.invoke(title_prompt).content.strip()

        messages = [("system", "You are a helpful assistant.")]

        for msg in history[-10:]:
            role = "human" if msg["sender"] == "user" else "ai"
            messages.append((role, msg["text"]))

        messages.append(("human", user_input))

        ai_msg = llm.invoke(messages)

        # Save messages
        cursor.execute(
            "INSERT INTO chat_messages (username, chat_id, sender, message, title) VALUES (%s, %s, %s, %s, %s)",
            (username, chat_id, "user", user_input, title)
        )

        cursor.execute(
            "INSERT INTO chat_messages (username, chat_id, sender, message, title) VALUES (%s, %s, %s, %s, %s)",
            (username, chat_id, "bot", ai_msg.content, title)
        )

        conn.commit()

        return {
            "response": ai_msg.content,
            "title": title
        }

    except Exception as e:
        print("CHAT ERROR:", e)
        return {"response": "Something went wrong ❌"}