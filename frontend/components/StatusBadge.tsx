interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  Saved:        "bg-slate-100 text-slate-600",
  Applied:      "bg-blue-50 text-blue-700",
  Interviewing: "bg-accent-50 text-accent-700",
  Rejected:     "bg-rose-50 text-rose-700",
  Offer:        "bg-emerald-50 text-emerald-700",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}
