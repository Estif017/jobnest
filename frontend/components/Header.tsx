import { ReactNode } from "react";

interface HeaderProps {
  title: string;
  actions?: ReactNode;
}

export default function Header({ title, actions }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
