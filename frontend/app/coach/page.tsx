"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import LoadingSpinner from "@/components/LoadingSpinner";
import { coachChat } from "@/lib/api";

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

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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

    try {
      const { reply } = await coachChat(trimmed);
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

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <Header title="AI Career Coach" />

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {messages.length === 0 && (
          <div className="mt-6">
            <p className="text-[#525252] text-sm mb-4">Ask anything about your job search:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm text-[#a3a3a3] bg-[#111111] border border-[#1f1f1f] rounded-lg px-4 py-3 hover:border-blue-500 hover:text-white transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-[#111111] border border-[#1f1f1f] text-[#d4d4d4]"
              }`}
            >
              {msg.role === "coach" && (
                <span className="block text-xs text-[#525252] mb-1 font-medium uppercase tracking-wider">
                  Coach
                </span>
              )}
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg px-4 py-3">
              <LoadingSpinner />
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-xs text-red-400">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="pt-4 border-t border-[#1f1f1f]">
        <div className="flex gap-3 items-end">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your career coach... (Enter to send)"
            className="flex-1 bg-[#111111] border border-[#1f1f1f] text-white text-sm rounded-lg px-4 py-3 resize-none focus:outline-none focus:border-blue-500 placeholder-[#525252]"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-[#525252] mt-2">
          Shift+Enter for new line. Powered by Claude.
        </p>
      </div>
    </div>
  );
}
