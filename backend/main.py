import sqlite3
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi import Header, HTTPException, Depends
from typing import List, Dict
# from passlib.context import CryptContext
from dotenv import load_dotenv
load_dotenv()
from langchain_groq import ChatGroq
import hashlib
from jose import jwt
from datetime import datetime, timedelta

SECRET_KEY = "mysecretkey"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    raise ValueError("❌ GROQ_API_KEY not found in .env")

# ✅ GLOBAL LLM (only created once)
llm = ChatGroq(
    api_key=api_key,
    model="llama-3.1-8b-instant",
    max_tokens=200,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_token(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="No token")

    token = authorization.split(" ")[1]

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload["sub"]  # username
    except:
        raise HTTPException(status_code=401, detail="Invalid token")
conn = sqlite3.connect("chat.db", check_same_thread=False)
cursor = conn.cursor()

# Chat table
cursor.execute("""
CREATE TABLE IF NOT EXISTS chat (
    question TEXT,
    answer TEXT
)
""")

# Users table
cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    chat_id TEXT,
    sender TEXT,
    message TEXT
)
""")
conn.commit()
try:
    cursor.execute("ALTER TABLE chat_messages ADD COLUMN title TEXT")
    conn.commit()
except:
    pass
# 🔐 PASSWORD HASHING
# =========================
# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# =========================
# 📦 MODELS
# =========================
class Message(BaseModel):
    text: str
    history: List[Dict] = []
    chat_id: str

class TrainData(BaseModel):
    question: str
    answer: str

class User(BaseModel):
    username: str
    password: str

# =========================
# 🧠 HELPER
# =========================
def clean_text(text):
    return text.lower().replace("?", "").strip()

def create_access_token(data: dict):
    to_encode = data.copy()

    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt
# =========================
# 🏠 HOME
# =========================
@app.get("/")
def home():
    return {"message": "Backend is running 🚀"}

# =========================
# 🔐 SIGNUP
# =========================

@app.delete("/delete_chat/{chat_id}")
def delete_chat(chat_id: str, username: str = Depends(verify_token)):
    try:
        cursor.execute(
            "DELETE FROM chat_messages WHERE chat_id=? AND username=?",
            (chat_id, username)
        )
        conn.commit()

        return {"success": True, "message": "Chat deleted ✅"}

    except Exception as e:
        print("DELETE ERROR:", e)
        return {"success": False, "message": "Delete failed ❌"}
        
@app.post("/signup")
def signup(user: User):
    try:
        if not user.username or not user.password:
            return {"success": False, "message": "Fields required"}

        # 🔐 hash password
        hashed_password = hashlib.sha256(user.password.encode()).hexdigest()

        cursor.execute("SELECT * FROM users WHERE username=?", (user.username,))
        if cursor.fetchone():
            return {"success": False, "message": "User already exists ❌"}

        cursor.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (user.username, hashed_password)
        )
        conn.commit()

        return {"success": True, "message": "User created ✅"}

    except Exception as e:
        print("❌ SIGNUP ERROR:", e)
        return {"success": False, "message": "Signup failed ❌"}
# =========================
# 🔐 LOGIN
# =========================
@app.post("/login")
def login(user: User):
    cursor.execute(
        "SELECT password FROM users WHERE username=?",
        (user.username,)
    )
    result = cursor.fetchone()

    if not result:
        return {"success": False, "message": "User not found ❌"}

    stored_password = result[0]

    hashed_input = hashlib.sha256(user.password.encode()).hexdigest()

    if hashed_input != stored_password:
        return {"success": False, "message": "Invalid password ❌"}

    # 🔐 Generate JWT token
    token = create_access_token({"sub": user.username})

    return {
        "success": True,
        "token": token,
        "message": "Login successful ✅"
    }

# =========================
# 🧠 TRAIN (optional)
@app.get("/get_chats/{username}")
def get_chats(username: str):
    cursor.execute(
        "SELECT chat_id, sender, message FROM chat_messages WHERE username=? ORDER BY id ASC",
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
@app.post("/train")
def train(data: TrainData):
    cursor.execute(
        "INSERT INTO chat (question, answer) VALUES (?, ?)",
        (clean_text(data.question), data.answer)
    )
    conn.commit()

    return {"message": "Trained successfully ✅"}
    
# =========================
# 🤖 CHAT (Groq AI)
# =========================
@app.post("/chat")
def chat(message: Message, username: str = Depends(verify_token)):
    try:
        user_input = message.text
        history = message.history
        # username = token_user
        chat_id = message.chat_id

        # ✅ INSIDE try block (correct)
        title = None

        if len(history) == 0:
            title_prompt = [
                ("system", "Generate a short 3-5 word title for this conversation."),
                ("human", user_input)
            ]

            title_response = llm.invoke(title_prompt)
            title = title_response.content.strip()
        messages = [
            ("system", "You are a helpful assistant.")
        ]

        # 🧠 context
        for msg in history[-10:]:
            if msg["sender"] == "user":
                messages.append(("human", msg["text"]))
            else:
                messages.append(("ai", msg["text"]))

        messages.append(("human", user_input))

        ai_msg = llm.invoke(messages)

        # 💾 SAVE USER MESSAGE
 
        cursor.execute(
    "INSERT INTO chat_messages (username, chat_id, sender, message, title) VALUES (?, ?, ?, ?, ?)",
    (username, chat_id, "user", user_input, title)
)

# 💾 SAVE BOT MESSAGE
        cursor.execute(
    "INSERT INTO chat_messages (username, chat_id, sender, message, title) VALUES (?, ?, ?, ?, ?)",
    (username, chat_id, "bot", ai_msg.content, title)
)

        conn.commit()

        return {
    "response": ai_msg.content,
    "title": title
}
                
    except Exception as e:
        print("ERROR:", e)
        return {"response": "Something went wrong ❌"}

        
        