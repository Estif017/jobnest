interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  Saved: "bg-[#737373] text-white",
  Applied: "bg-[#1d4ed8] text-white",
  Interviewing: "bg-[#15803d] text-white",
  Rejected: "bg-[#991b1b] text-white",
  Offer: "bg-[#92400e] text-white",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] ?? "bg-[#737373] text-white";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}
