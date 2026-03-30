import sqlite3

conn = sqlite3.connect("chat.db")
cursor = conn.cursor()

cursor.execute("SELECT * FROM chat_messages")
rows = cursor.fetchall()

print("📦 DB Data:\n")

for row in rows:
    print(row)

conn.close()