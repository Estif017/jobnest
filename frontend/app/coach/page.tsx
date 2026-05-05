"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { coachChat, fetchCoachHistory } from "@/lib/api";

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
    <div className="w-7 h-7 rounded-full bg-ai-50 border border-ai-100 flex items-center justify-center shrink-0">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ai-500">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <CoachAvatar />
      <div className="card px-4 py-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-muted animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-ink-muted animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-ink-muted animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

export default function CoachPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const sessionId    = searchParams.get("session") ?? undefined;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When no session param, redirect to the new-session flow immediately
  useEffect(() => {
    if (!sessionId) {
      const id = crypto.randomUUID();
      router.replace(`/coach?session=${id}`);
    }
  }, [sessionId, router]);

  // Load history whenever the session changes
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

    // Auto-resize textarea back down
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-ai-50 border border-ai-100 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ai-500">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink tracking-tight">AI Career Coach</h1>
          <p className="text-xs text-ink-muted">Powered by Claude · Your personal career advisor</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-ink-muted">Online</span>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-1 pb-4">
        {historyLoading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-border border-t-ai-500 rounded-full animate-spin" />
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center text-center pt-8 pb-4">
            <div className="w-16 h-16 rounded-2xl bg-ai-50 border border-ai-100 flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ai-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold text-ink mb-1">Your career coach is ready</h2>
            <p className="text-sm text-ink-muted mb-8 max-w-sm">
              Ask anything about your job search — interview prep, resume tips, salary negotiation, or career strategy.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm text-ink-secondary bg-surface border border-border rounded-xl px-4 py-3 hover:border-ai-200 hover:bg-ai-50 hover:text-ai-700 transition-all"
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
              className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent-600 text-white rounded-br-md"
                  : "card text-ink rounded-bl-md"
              }`}
            >
              {msg.role === "coach" && (
                <span className="block text-[10px] font-semibold text-ai-500 uppercase tracking-widest mb-1.5">
                  Coach
                </span>
              )}
              {msg.role === "user" ? (
                msg.text
              ) : (
                <ReactMarkdown
                  components={{
                    p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
                    em:     ({ children }) => <em className="italic">{children}</em>,
                    ul:     ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                    ol:     ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                    li:     ({ children }) => <li className="text-sm">{children}</li>,
                    h2:     ({ children }) => <h2 className="font-semibold text-ink text-sm mb-1 mt-2">{children}</h2>,
                    h3:     ({ children }) => <h3 className="font-semibold text-ink text-sm mb-1 mt-2">{children}</h3>,
                    hr:     () => <hr className="border-border my-2" />,
                    code:   ({ children }) => <code className="bg-elevated px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
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
          <p className="text-center text-xs text-rose-500 bg-rose-50 rounded-lg py-2 px-4">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="pt-4 border-t border-border">
        <div className="card p-2 flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask your career coach…"
            className="flex-1 bg-transparent text-ink text-sm px-2 py-1.5 resize-none focus:outline-none placeholder:text-ink-muted min-h-[36px]"
            style={{ height: "auto" }}
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
        <p className="text-[11px] text-ink-disabled mt-2 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
