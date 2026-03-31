"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/scan", label: "Scan" },
  { href: "/coach", label: "Coach" },
];

export default function Sidebar() {
  const pathname       = usePathname();
  const { data: session } = useSession();

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
      <div className="px-4 py-4 border-t border-[#1f1f1f] space-y-2">
        {session?.user?.email && (
          <p className="text-[#525252] text-xs truncate px-1">{session.user.email}</p>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full text-left text-xs text-[#a3a3a3] hover:text-white px-3 py-1.5 rounded hover:bg-[#1f1f1f] transition-colors"
        >
          Sign out
        </button>
        <span className="text-[#525252] text-xs px-1">v3.0.0</span>
      </div>
    </aside>
  );
}
