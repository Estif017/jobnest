"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { coachChat, fetchCoachHistory, fetchCoachSessions, deleteCoachSession, ChatSession } from "@/lib/api";

interface Message {
  role: "user" | "coach";
  text: string;
}

const SUGGESTIONS = [
  "How do I prepare for a behavioral interview?",
  "What skills should I add to my resume?",
  "How do I follow up after applying?",
  "Help me write a cold email to a recruiter.",
];

function CoachAvatar() {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
      style={{ background: "rgba(45,212,191,0.12)", border: "1px solid rgba(45,212,191,0.2)" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <CoachAvatar />
      <div
        className="px-4 py-3 rounded-2xl flex items-center gap-1.5"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", borderBottomLeftRadius: "4px" }}
      >
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-muted)", animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-muted)", animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-muted)", animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

function CoachPageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const sessionId    = searchParams.get("session") ?? undefined;

  const [sessions, setSessions]           = useState<ChatSession[]>([]);
  const [sessionsOpen, setSessionsOpen]   = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!sessionId) {
      const id = crypto.randomUUID();
      router.replace(`/coach?session=${id}`);
    }
  }, [sessionId, router]);

  useEffect(() => {
    if (!sessionsOpen) return;
    fetchCoachSessions().then(setSessions).catch(() => {});
  }, [sessionsOpen]);

  const handleNewChat = () => {
    setSessionsOpen(false);
    router.push(`/coach?session=${crypto.randomUUID()}`);
  };

  const handleDeleteSession = async (sid: string) => {
    await deleteCoachSession(sid);
    setSessions((prev) => prev.filter((s) => s.session_id !== sid));
    if (sid === sessionId) handleNewChat();
  };

  useEffect(() => {
    if (!sessionId) return;
    setHistoryLoading(true);
    setMessages([]);
    fetchCoachHistory(sessionId)
      .then((history) => {
        setMessages(
          history.map((m) => ({
            role: m.role === "assistant" ? "coach" : "user",
            text: m.message,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    setError("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      const { reply } = await coachChat(trimmed, undefined, sessionId);
      setMessages((prev) => [...prev, { role: "coach", text: reply }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 relative">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.2)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold font-heading tracking-tight" style={{ color: "var(--text-primary)" }}>AI Career Coach</h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Powered by Claude · Your personal career advisor</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full pulse-dot"
            style={{ background: "var(--green)", boxShadow: "0 0 6px rgba(52,211,153,0.5)" }}
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Online</span>
          <button
            onClick={() => setSessionsOpen((o) => !o)}
            className="btn-ghost text-xs py-1.5 px-3 ml-1"
          >
            Sessions
          </button>
          <button onClick={handleNewChat} className="btn-primary text-xs py-1.5 px-3">
            + New Chat
          </button>
        </div>

        {/* Sessions dropdown */}
        {sessionsOpen && (
          <div
            className="absolute top-full right-0 mt-2 w-[min(18rem,calc(100vw-2rem))] z-20 overflow-hidden rounded-2xl shadow-lg"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
          >
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--bg-border)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Chat History</p>
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs px-4 py-3" style={{ color: "var(--text-muted)" }}>No sessions yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {sessions.map((s) => (
                  <div
                    key={s.session_id}
                    className="flex items-center gap-2 px-3 py-2.5 transition-colors"
                    style={{
                      borderBottom: "1px solid var(--bg-border)",
                      background: s.session_id === sessionId ? "rgba(45,212,191,0.08)" : "",
                    }}
                    onMouseEnter={e => {
                      if (s.session_id !== sessionId)
                        (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background =
                        s.session_id === sessionId ? "rgba(45,212,191,0.08)" : "";
                    }}
                  >
                    <button
                      onClick={() => { setSessionsOpen(false); router.push(`/coach?session=${s.session_id}`); }}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{s.title}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.last_active.slice(0, 10)}</p>
                    </button>
                    <button
                      onClick={() => handleDeleteSession(s.session_id)}
                      className="shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors"
                      style={{ color: "var(--red)" }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.1)"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = ""}
                      title="Delete session"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-4">
        {historyLoading && (
          <div className="flex items-center justify-center h-32">
            <div
              className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--accent)" }}
            />
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center text-center pt-8 pb-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.15)" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold font-heading mb-1" style={{ color: "var(--text-primary)" }}>
              Your career coach is ready
            </h2>
            <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-muted)" }}>
              Ask anything about your job search — interview prep, resume tips, salary negotiation, or career strategy.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl transition-all"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = "rgba(45,212,191,0.4)";
                    el.style.color = "var(--accent)";
                    el.style.background = "rgba(45,212,191,0.06)";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = "var(--bg-border)";
                    el.style.color = "var(--text-secondary)";
                    el.style.background = "var(--bg-surface)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "coach" && <CoachAvatar />}
            <div
              className="max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={
                msg.role === "user"
                  ? { background: "var(--accent)", color: "#050C10", borderBottomRightRadius: "4px" }
                  : { background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-primary)", borderBottomLeftRadius: "4px" }
              }
            >
              {msg.role === "coach" && (
                <span
                  className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: "var(--accent)" }}
                >
                  Coach
                </span>
              )}
              {msg.role === "user" ? (
                msg.text
              ) : (
                <ReactMarkdown
                  components={{
                    p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-primary)" }}>{children}</strong>,
                    em:     ({ children }) => <em className="italic">{children}</em>,
                    ul:     ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                    ol:     ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                    li:     ({ children }) => <li className="text-sm">{children}</li>,
                    h2:     ({ children }) => <h2 className="font-semibold text-sm mb-1 mt-2" style={{ color: "var(--text-primary)" }}>{children}</h2>,
                    h3:     ({ children }) => <h3 className="font-semibold text-sm mb-1 mt-2" style={{ color: "var(--text-primary)" }}>{children}</h3>,
                    hr:     () => <hr className="my-2" style={{ borderColor: "var(--bg-border)" }} />,
                    code:   ({ children }) => (
                      <code className="px-1 py-0.5 rounded text-xs font-mono" style={{ background: "var(--bg-base)" }}>
                        {children}
                      </code>
                    ),
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {loading && <TypingIndicator />}

        {error && (
          <p
            className="text-center text-xs px-4 py-2 rounded-lg"
            style={{ color: "var(--red)", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)" }}
          >
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="pt-4" style={{ borderTop: "1px solid var(--bg-border)" }}>
        <div
          className="flex items-end gap-2 p-2 rounded-2xl"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask your career coach…"
            className="flex-1 bg-transparent text-sm px-2 py-1.5 resize-none focus:outline-none min-h-[36px] placeholder:opacity-40"
            style={{ color: "var(--text-primary)" }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="btn-primary shrink-0 py-2 px-4"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/>
            </svg>
            Send
          </button>
        </div>
        <p className="text-[11px] mt-2 text-center" style={{ color: "var(--text-muted)" }}>
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

export default function CoachPage() {
  return (
    <Suspense>
      <CoachPageInner />
    </Suspense>
  );
}
