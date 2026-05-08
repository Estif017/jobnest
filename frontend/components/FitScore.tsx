interface FitScoreProps {
  score?: number | null;
  size?: "sm" | "md" | "lg";
}

export default function FitScore({ score, size = "sm" }: FitScoreProps) {
  if (score == null || score === 0) {
    return <span style={{ color: "var(--text-muted)" }} className="font-medium text-sm">—</span>;
  }

  let bg: string;
  let color: string;
  if (score >= 7)      { bg = "rgba(52,211,153,0.15)";  color = "#34D399"; }
  else if (score >= 4) { bg = "rgba(251,191,36,0.15)";  color = "#FBBF24"; }
  else                 { bg = "rgba(248,113,113,0.15)"; color = "#F87171"; }

  const sizeClass =
    size === "lg" ? "text-2xl font-bold px-3 py-1.5 rounded-xl" :
    size === "md" ? "text-sm font-bold px-2.5 py-1 rounded-lg" :
                   "text-xs font-bold px-2 py-0.5 rounded-md";

  return (
    <span
      style={{ background: bg, color }}
      className={`inline-flex items-center gap-0.5 ${sizeClass}`}
    >
      {score}<span style={{ opacity: 0.5, fontWeight: 400 }}>/10</span>
    </span>
  );
}
