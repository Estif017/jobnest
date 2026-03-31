import Link from "next/link";
import { ScoredJob } from "@/lib/api";
import FitScore from "./FitScore";

interface JobCardProps {
  job: ScoredJob;
  onSave?: (job: ScoredJob) => void;
}

const verdictStyle: Record<string, string> = {
  APPLY: "text-green-400 bg-green-400/10",
  SKIP: "text-yellow-400 bg-yellow-400/10",
  "RED FLAG": "text-red-400 bg-red-400/10",
};

export default function JobCard({ job, onSave }: JobCardProps) {
  const style = verdictStyle[job.verdict] ?? "text-[#a3a3a3] bg-[#1f1f1f]";
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-white font-semibold text-sm leading-snug">{job.job.title}</p>
          <p className="text-[#a3a3a3] text-xs mt-0.5">{job.job.company}</p>
        </div>
        <FitScore score={job.fit_score} />
      </div>
      <span className={`self-start px-2 py-0.5 rounded text-xs font-medium ${style}`}>
        {job.verdict}
      </span>
      <div className="flex gap-2 mt-auto">
        {onSave && (
          <button
            onClick={() => onSave(job)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition-colors"
          >
            Save
          </button>
        )}
        <Link
          href={`/jobs/${job.id}`}
          className="text-xs bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white px-3 py-1.5 rounded transition-colors"
        >
          View Detail
        </Link>
      </div>
    </div>
  );
}
