"use client";

import { useState } from "react";

interface Props {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  className?: string;
}

export default function ConfirmButton({
  onConfirm,
  label = "Delete",
  confirmLabel = "Yes, delete",
  className = "text-xs px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors",
}: Props) {
  const [pending, setPending] = useState(false);

  if (pending) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-xs text-ink-muted">Sure?</span>
        <button
          onClick={() => { setPending(false); onConfirm(); }}
          className="text-xs px-2 py-0.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 transition-colors"
        >
          {confirmLabel}
        </button>
        <button
          onClick={() => setPending(false)}
          className="text-xs px-2 py-0.5 rounded-md text-ink-muted hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setPending(true)} className={className}>
      {label}
    </button>
  );
}
