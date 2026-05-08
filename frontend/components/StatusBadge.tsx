interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, { bg: string; color: string }> = {
  Saved:        { bg: "rgba(100,116,139,0.15)", color: "#94A3B8" },
  Applied:      { bg: "rgba(96,165,250,0.12)",  color: "#60A5FA" },
  Interviewing: { bg: "rgba(251,191,36,0.12)",  color: "#FBBF24" },
  Rejected:     { bg: "rgba(248,113,113,0.12)", color: "#F87171" },
  Offer:        { bg: "rgba(52,211,153,0.12)",  color: "#34D399"  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const s = statusStyles[status] ?? statusStyles["Saved"];
  return (
    <span
      style={{ background: s.bg, color: s.color }}
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
    >
      {status}
    </span>
  );
}
