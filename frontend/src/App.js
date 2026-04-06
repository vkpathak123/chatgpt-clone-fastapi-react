import { useState, useEffect, useRef } from "react";
import axios from "axios";
import vinandlogo from "./assets/vinandlogo.png";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css"; 



function App() {
  // 🔐 Auth state
  const [user, setUser] = useState(() => {
    return localStorage.getItem("user") || null;
  });

  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success" // success | error
  });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });

    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 10000); // 10 seconds
  };
  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);
  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };
  const isDark = theme === "dark";

  const colors = {
    bg: isDark ? "#343541" : "#f7f7f8",
    sidebar: isDark ? "#202123" : "#ffffff",
    text: isDark ? "#ffffff" : "#000000",
    subText: isDark ? "#ccc" : "#555",
    border: isDark ? "#555" : "#ddd",
    inputBg: isDark ? "#40414f" : "#ffffff",
    userMsg: "#8b5cf6",
    botMsg: isDark ? "#444" : "#e5e5ea"
  };
  
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard ✅");
  };

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // =========================
  // 🔐 LOGIN / SIGNUP
  // =========================

  const handleAuth = async () => {
    try {
      const endpoint = isLogin ? "login" : "signup";

      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/${endpoint}`,
        {
          username,
          password,
        }
      );

      const data = response.data;

      // 🔥 Handle success/failure properly
      if (!data.success) {
        showToast(data.message || "Something went wrong ❌", "error");
        return;
      }

      // ✅ Success case
      showToast(data.message || "Success ✅", "success");

      if (isLogin && data.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", username);
        setUser(username);
      }

      setUsername("");
      setPassword("");

    } catch (error) {
      console.error("Auth Error:", error);

      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        "Something went wrong ❌";

      showToast(errorMessage, "error");
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
  };

 

  useEffect(() => {
    if (chats.length > 0 && !activeChatId) {
      setActiveChatId(chats[0].id);
    }
  }, [chats]);


  useEffect(() => {
    if (user && chats.length === 0) {
      const newChat = {
        id: Date.now(),
        title: "New Chat",
        messages: []
      };

      setChats([newChat]);
      setActiveChatId(newChat.id);
    }
  }, [user]);

  const chatEndRef = useRef(null);
  const activeChat = chats.find((c) => c.id === activeChatId);
  useEffect(() => {
    if (activeChat?.messages?.length) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChat?.messages?.length]);

  const createNewChat = () => {
    const newChat = {
      id: Date.now(),
      title: "New Chat",
      messages: []
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };


  const deleteChat = async (id) => {
    try {
      const token = localStorage.getItem("token");

      await axios.delete(`${process.env.REACT_APP_API_URL}/delete_chat/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const updated = chats.filter((chat) => chat.id !== id);
      setChats(updated);

      if (id === activeChatId) {
        setActiveChatId(updated.length ? updated[0].id : null);
      }

    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  useEffect(() => {
    if (user) {
      axios
        .get(`${process.env.REACT_APP_API_URL}/get_chats/${user}`)
        .then((res) => {
          const dbChats = res.data;

          const formatted = Object.keys(dbChats).map((id) => {
            const chat = dbChats[id];

            return {
              id: Number(id),
              title: chat?.title || chat?.[0]?.text?.slice(0, 20) || "New Chat",
              messages: chat?.messages || chat || []
            };
          });

          setChats(formatted);

          if (formatted.length > 0) {
            setActiveChatId(formatted[0].id);
          }
        });
    }
  }, [user]);
  const sendMessage = async () => {
    if (!input.trim() || !activeChatId) return;

    const userMessage = { sender: "user", text: input };

    setChats((prevChats) =>
      prevChats.map((chat) =>
        chat.id === activeChatId
          ? {
            ...chat,
            messages: [...chat.messages, userMessage],
            title:
              chat.messages.length === 0
                ? input.slice(0, 20)
                : chat.title
          }
          : chat
      )
    );

    setLoading(true);

    try {
      const token = localStorage.getItem("token");

      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/chat`,
        {
          text: input,
          history: activeChat.messages,
          chat_id: String(activeChatId)
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );


      const botMessage = {
        sender: "bot",
        text: res.data.response
      };

      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === activeChatId
            ? {
              ...chat,
              messages: [...chat.messages, botMessage],
              title: chat.messages.length === 0
                ? res.data.title || chat.title
                : chat.title
            }
            : chat
        )
      );
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
    setInput("");
  };

  // console.log("API URL:", process.env.REACT_APP_API_URL);

  // if (!user) {
  //   return (

  //     <div
  //       style={{
  //         height: "100vh",
  //         display: "flex",
  //         justifyContent: "center",
  //         alignItems: "center",
  //         background: "linear-gradient(135deg, #0f172a, #1e293b)",
  //         position: "relative",
  //         overflow: "hidden"
  //       }}
  //     >
  //       {/* 🔥 Glow effect */}
  //       <div
  //         style={{
  //           position: "absolute",
  //           width: "400px",
  //           height: "400px",
  //           background: "radial-gradient(circle, rgba(99,102,241,0.4), transparent)",
  //           filter: "blur(100px)",
  //           top: "-100px",
  //           left: "-100px"
  //         }}
  //       />

  //       <div
  //         style={{
  //           background: "rgba(255,255,255,0.08)",
  //           backdropFilter: "blur(20px)",
  //           padding: "40px",
  //           borderRadius: "16px",
  //           width: "340px",
  //           boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
  //           textAlign: "center",
  //           border: "1px solid rgba(255,255,255,0.1)",
  //           color: "white"
  //         }}
  //       >
  //         {/* 🔥 Logo / Title */}
  //         <h2
  //           style={{
  //             marginBottom: "10px",
  //             fontSize: "24px",
  //             fontWeight: "700",
  //             background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  //             WebkitBackgroundClip: "text",
  //             color: "transparent",
  //             letterSpacing: "0.5px"
  //           }}
  //         >
  //           {isLogin ? "Welcome to Vinand AI" : "Create Account ✨"}
  //         </h2>

  //         <p style={{ fontSize: "13px", opacity: 0.7, marginBottom: "25px" }}>
  //           Your intelligent AI assistant
  //         </p>

  //         {/* Inputs */}
  //         <input
  //           placeholder="Username"
  //           onChange={(e) => setUsername(e.target.value)}
  //           style={{
  //             width: "100%",
  //             padding: "12px",
  //             marginBottom: "15px",
  //             borderRadius: "8px",
  //             border: "1px solid rgba(255,255,255,0.2)",
  //             background: "rgba(255,255,255,0.05)",
  //             color: "white",
  //             outline: "none"
  //           }}
  //         />

  //         <input
  //           type="password"
  //           placeholder="Password"
  //           onChange={(e) => setPassword(e.target.value)}
  //           style={{
  //             width: "100%",
  //             padding: "12px",
  //             marginBottom: "20px",
  //             borderRadius: "8px",
  //             border: "1px solid rgba(255,255,255,0.2)",
  //             background: "rgba(255,255,255,0.05)",
  //             color: "white",
  //             outline: "none"
  //           }}
  //         />

  //         {/* Button */}
  //         <button
  //           onClick={handleAuth}
  //           style={{
  //             width: "100%",
  //             padding: "12px",
  //             background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  //             color: "white",
  //             border: "none",
  //             borderRadius: "8px",
  //             cursor: "pointer",
  //             fontWeight: "bold",
  //             transition: "0.3s"
  //           }}
  //           onMouseEnter={(e) => (e.target.style.opacity = 0.85)}
  //           onMouseLeave={(e) => (e.target.style.opacity = 1)}
  //         >
  //           {isLogin ? "Login" : "Signup"}
  //         </button>

  //         {/* Toggle */}
  //         <p
  //           onClick={() => setIsLogin(!isLogin)}
  //           style={{
  //             marginTop: "18px",
  //             cursor: "pointer",
  //             color: "#a5b4fc",
  //             fontSize: "13px"
  //           }}
  //         >
  //           {isLogin
  //             ? "Don't have an account? Signup"
  //             : "Already have an account? Login"}
  //         </p>
  //       </div>
  //     </div>
  //   );
  // }



  return (
    <>
      {toast.show && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "12px 18px",
            borderRadius: "8px",
            background: toast.type === "error" ? "#ff4d4f" : "#22c55e",
            color: "white",
            fontSize: "14px",
            fontWeight: "500",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minWidth: "250px",
          }}
        >
          <span>{toast.message}</span>
          <span
            style={{
              marginLeft: "12px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
            onClick={() => setToast({ ...toast, show: false })}
          >
            &times; {/* This is the close "X" */}
          </span>
        </div>
      )}
      {!user ? (
      

        <div
          style={{
            height: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            background: "linear-gradient(135deg, #0f172a, #1e293b)",
            position: "relative",
            overflow: "hidden"
          }}
        >
          {/* 🔥 Glow effect */}
          <div
            style={{
              position: "absolute",
              width: "400px",
              height: "400px",
              background: "radial-gradient(circle, rgba(99,102,241,0.4), transparent)",
              filter: "blur(100px)",
              top: "-100px",
              left: "-100px"
            }}
          />

          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
              padding: "40px",
              borderRadius: "16px",
              width: "340px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "white"
            }}
          >
            {/* 🔥 Logo / Title */}
            <h2
              style={{
                marginBottom: "10px",
                fontSize: "24px",
                fontWeight: "700",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                WebkitBackgroundClip: "text",
                color: "transparent",
                letterSpacing: "0.5px"
              }}
            >
              {isLogin ? "Welcome to Vinand AI" : "Create Account ✨"}
            </h2>

            <p style={{ fontSize: "13px", opacity: 0.7, marginBottom: "25px" }}>
              Your intelligent AI assistant
            </p>

            {/* Inputs */}
            <input
              placeholder="Username"
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                marginBottom: "15px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                outline: "none"
              }}
            />

            <input
              type="password"
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                marginBottom: "20px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                outline: "none"
              }}
            />

            {/* Button */}
            <button
              onClick={handleAuth}
              style={{
                width: "100%",
                padding: "12px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                transition: "0.3s"
              }}
              onMouseEnter={(e) => (e.target.style.opacity = 0.85)}
              onMouseLeave={(e) => (e.target.style.opacity = 1)}
            >
              {isLogin ? "Login" : "Signup"}
            </button>

            {/* Toggle */}
            <p
              onClick={() => setIsLogin(!isLogin)}
              style={{
                marginTop: "18px",
                cursor: "pointer",
                color: "#a5b4fc",
                fontSize: "13px"
              }}
            >
              {isLogin
                ? "Don't have an account? Signup"
                : "Already have an account? Login"}
            </p>
          </div>
        </div>
      ) :(
        <div style={{ display: "flex", height: "100vh", background: colors.bg, transition: "all 0.3s ease" }}>
      
          {/* 🔥 SIDEBAR */}
          <div
            style={{
              width: "260px",
              background: colors.sidebar,
              color: colors.text,
              display: "flex",
              flexDirection: "column",
              padding: "10px",
              transition: "all 0.3s ease"
            }}
          >
            {/* New Chat */}
            <button
              onClick={createNewChat}
              style={{
                padding: "12px",
                marginBottom: "10px",
                background: colors.sidebar,
                color: colors.text,
                border: "1px solid #555",
                // color: "white",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              + New Chat
            </button>

            {/* Chat List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    marginBottom: "5px",
                    background:
                      chat.id === activeChatId ? "#343541" : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span style={{ fontSize: "14px" }}>{chat.title}</span>

                  <span
                    onClick={(e) => {
                      e.stopPropagation();

                      if (window.confirm("Delete this chat?")) {
                        deleteChat(chat.id);
                      }
                    }}
                    style={{ fontSize: "12px", opacity: 0.6 }}
                  >
                    ✖
                  </span>
                </div>
              ))}
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              style={{
                marginTop: "10px",
                padding: "10px",
                background: colors.sidebar,
                color: colors.text,
                border: "1px solid #555",
                // color: "white",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              Logout
            </button>
          </div>

          {/* 💬 CHAT AREA */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              color: colors.text
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${colors.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              {/* 🔥 LEFT: Logo + Name */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <img
                  src={vinandlogo}
                  alt="Vinand AI"
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    objectFit: "cover",
                    boxShadow: "0 0 10px rgba(99,102,241,0.6)"
                  }}
                />

                <span
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    WebkitBackgroundClip: "text",
                    color: "transparent"
                  }}
                >
                  Vinand AI
                </span>
              </div>

              {/* 🌗 RIGHT: Theme Toggle */}
              <button
                onClick={toggleTheme}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  background: isDark ? "#fff" : "#000",
                  color: isDark ? "#000" : "#fff",
                  fontSize: "12px"
                }}
              >
                {isDark ? "☀ Light" : "🌙 Dark"}
              </button>
            </div>
            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "15px",

              }}
            >
              {activeChat?.messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent:
                      msg.sender === "user" ? "flex-end" : "flex-start",

                  }}
                >
                  <div
                    style={{
                      maxWidth: "65%",
                      padding: "14px 16px",
                      borderRadius: "14px",
                      background: msg.sender === "user" ? colors.userMsg : colors.bg,
                      color: colors.text,
                      fontSize: "14px",
                      lineHeight: "1.6",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {msg.sender === "user" ? (
                      msg.text
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ fontSize: "14px", opacity: 0.7 }}>
                  AI is typing...
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div
              style={{
                padding: "15px",
                borderTop: "1px solid #555",
                display: "flex",
                gap: "10px"
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Send a message..."
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  outline: "none",
                  background: "#40414f",
                  color: "white"
                }}
              />

              <button
                onClick={sendMessage}
                style={{
                  padding: "12px 18px",
                  background: "#8b5cf6",
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
     )}
    </>
  );

}
export default App;