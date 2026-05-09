"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Props {
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
}

export default function MarkdownEditor({ value, onChange, onBlur, placeholder = "Add notes… (markdown supported)", rows = 6 }: Props) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === "edit") textareaRef.current?.focus();
  }, [mode]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--bg-border)" }}>
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
          style={mode === "edit"
            ? { background: "var(--accent)", color: "#050C10" }
            : { color: "var(--text-muted)" }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
          style={mode === "preview"
            ? { background: "var(--accent)", color: "#050C10" }
            : { color: "var(--text-muted)" }}
        >
          Preview
        </button>
        <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>Markdown</span>
      </div>

      {/* Body */}
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={rows}
          className="w-full bg-transparent resize-none text-sm p-3 outline-none"
          style={{ color: "var(--text-primary)", fontFamily: "inherit" }}
        />
      ) : (
        <div
          className="p-3 min-h-[8rem] text-sm prose-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {value.trim() ? (
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                    {children}
                  </a>
                ),
                strong: ({ children }) => <strong style={{ color: "var(--text-primary)" }}>{children}</strong>,
                code: ({ children }) => (
                  <code className="text-xs px-1 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--accent)" }}>
                    {children}
                  </code>
                ),
                li: ({ children }) => <li style={{ color: "var(--text-secondary)" }}>{children}</li>,
              }}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Nothing to preview yet.</span>
          )}
        </div>
      )}
    </div>
  );
}
