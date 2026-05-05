interface FitScoreProps {
  score?: number | null;
  size?: "sm" | "md" | "lg";
}

export default function FitScore({ score, size = "sm" }: FitScoreProps) {
  if (score == null || score === 0) {
    return <span className="text-ink-muted font-medium text-sm">—</span>;
  }

  let colorClass = "text-rose-700 bg-rose-100";
  if (score >= 8)      colorClass = "text-emerald-700 bg-emerald-100";
  else if (score >= 5) colorClass = "text-amber-800 bg-amber-100";

  const sizeClass = size === "lg"
    ? "text-2xl font-bold px-3 py-1.5 rounded-xl"
    : size === "md"
    ? "text-base font-semibold px-2.5 py-1 rounded-lg"
    : "text-xs font-semibold px-2 py-0.5 rounded-lg";

  return (
    <span className={`inline-flex items-center ${colorClass} ${sizeClass}`}>
      {score}<span className="opacity-50 font-normal">/10</span>
    </span>
  );
}
