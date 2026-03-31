"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/scan", label: "Scan" },
  { href: "/coach", label: "Coach" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-[#111111] border-r border-[#1f1f1f] flex flex-col z-10">
      <div className="px-6 py-5 border-b border-[#1f1f1f]">
        <span className="text-white font-bold text-xl tracking-tight">JobNest</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ href, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-[#a3a3a3] hover:text-white hover:bg-[#1f1f1f]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-4 border-t border-[#1f1f1f]">
        <span className="text-[#525252] text-xs">v3.0.0</span>
      </div>
    </aside>
  );
}
