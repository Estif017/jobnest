"use client";

import { useState } from "react";

interface Props {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ConfirmButton({
  onConfirm,
  label = "Delete",
  confirmLabel = "Yes, delete",
  className = "text-xs px-2.5 py-1 rounded-lg transition-colors",
  style,
}: Props) {
  const [pending, setPending] = useState(false);

  if (pending) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Sure?</span>
        <button
          onClick={() => { setPending(false); onConfirm(); }}
          className="text-xs px-2 py-0.5 rounded-md font-medium transition-colors"
          style={{ background: "var(--red)", color: "#050C10" }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.filter = ""}
        >
          {confirmLabel}
        </button>
        <button
          onClick={() => setPending(false)}
          className="text-xs px-2 py-0.5 rounded-md transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setPending(true)}
      className={className}
      style={style ?? { color: "var(--red)" }}
      onMouseEnter={e => {
        if (!style) (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.1)";
      }}
      onMouseLeave={e => {
        if (!style) (e.currentTarget as HTMLButtonElement).style.background = "";
      }}
    >
      {label}
    </button>
  );
}
