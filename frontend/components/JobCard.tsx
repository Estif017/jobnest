import Link from "next/link";
import { ScoredJob } from "@/lib/api";
import FitScore from "./FitScore";

interface JobCardProps {
  job: ScoredJob;
  onSave?: (job: ScoredJob) => void;
}

const verdictStyle: Record<string, string> = {
  APPLY:      "text-emerald-700 bg-emerald-50 border-emerald-200",
  SKIP:       "text-amber-700 bg-amber-50 border-amber-200",
  "RED FLAG": "text-rose-700 bg-rose-50 border-rose-200",
};

export default function JobCard({ job, onSave }: JobCardProps) {
  const hasVerdict = job.verdict && job.verdict !== "PENDING";
  const style = verdictStyle[job.verdict] ?? "text-ink-secondary bg-elevated border-border";

  return (
    <div className="card p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink text-sm leading-snug truncate">{job.job.title}</p>
          <p className="text-ink-muted text-xs mt-0.5 truncate">{job.job.company}</p>
        </div>
        <FitScore score={job.fit_score || null} />
      </div>

      {hasVerdict ? (
        <span className={`self-start px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
          {job.verdict}
        </span>
      ) : (
        <span className="self-start px-2.5 py-0.5 rounded-full text-xs font-medium border text-ink-muted bg-elevated border-border">
          Not scored
        </span>
      )}

      <div className="flex gap-2 mt-auto pt-1">
        {onSave && (
          <button onClick={() => onSave(job)} className="btn-primary text-xs py-1.5 px-3">
            Save
          </button>
        )}
        {/* Use job.job.id — job.id is the ScoredJob wrapper id (0 when unscored) */}
        <Link href={`/jobs/${job.job.id}`} className="btn-ghost text-xs py-1.5 px-3">
          View Detail
        </Link>
      </div>
    </div>
  );
}
