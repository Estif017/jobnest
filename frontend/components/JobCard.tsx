import Link from "next/link";
import { ScoredJob } from "@/lib/api";
import FitScore from "./FitScore";

interface JobCardProps {
  job: ScoredJob;
  onSave?: (job: ScoredJob) => void;
}

const verdictColor: Record<string, { bg: string; color: string }> = {
  APPLY:      { bg: "rgba(52,211,153,0.12)",  color: "#34D399" },
  SKIP:       { bg: "rgba(251,191,36,0.12)",  color: "#FBBF24" },
  "RED FLAG": { bg: "rgba(248,113,113,0.12)", color: "#F87171" },
};

export default function JobCard({ job, onSave }: JobCardProps) {
  const hasVerdict = job.verdict && job.verdict !== "PENDING";
  const vs = verdictColor[job.verdict] ?? null;
  const isUnscored = !hasVerdict;

  return (
    <div
      className="flex flex-col gap-4 p-5 transition-all duration-200"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--bg-border)",
        borderRadius: "var(--radius-lg)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px var(--accent-glow)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--bg-border)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug truncate" style={{ color: "var(--text-primary)" }}>
            {job.job.title}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
            {job.job.company}
          </p>
        </div>
        <FitScore score={job.fit_score || null} />
      </div>

      {/* Verdict / unscored badge */}
      {hasVerdict && vs ? (
        <span
          className="self-start px-2.5 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: vs.bg, color: vs.color }}
        >
          {job.verdict}
        </span>
      ) : isUnscored ? (
        <span
          className="self-start px-2.5 py-0.5 rounded-full text-xs font-medium shimmer-card"
          style={{
            border: "1px dashed var(--text-muted)",
            color: "var(--text-muted)",
            background: "transparent",
          }}
        >
          Unanalyzed
        </span>
      ) : null}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        {onSave && (
          <button onClick={() => onSave(job)} className="btn-primary text-xs py-1.5 px-3">
            Save
          </button>
        )}
        <Link
          href={`/jobs/${job.job.id}`}
          className="inline-flex items-center gap-1 text-xs py-1.5 px-3 rounded-lg font-medium transition-colors"
          style={{ color: "var(--accent)" }}
        >
          View Detail
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
          </svg>
        </Link>
      </div>
    </div>
  );
}
