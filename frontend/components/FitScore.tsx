interface FitScoreProps {
  score?: number | null;
}

export default function FitScore({ score }: FitScoreProps) {
  if (score == null || score === 0) {
    return <span className="text-[#525252] font-bold">—</span>;
  }
  let color = "#ef4444";
  if (score >= 8) color = "#22c55e";
  else if (score >= 5) color = "#eab308";
  return (
    <span className="font-bold" style={{ color }}>
      {score}/10
    </span>
  );
}
