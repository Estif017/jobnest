import { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  action?: ReactNode;
}

export default function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="text-4xl text-[#525252]">○</div>
      <p className="text-[#a3a3a3] text-sm">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
