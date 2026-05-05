"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  AppNotification,
} from "@/lib/api";

const links = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    href: "/jobs",
    label: "Jobs",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      </svg>
    ),
  },
  {
    href: "/scan",
    label: "Scan",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
  },
  {
    href: "/coach",
    label: "AI Coach",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
  },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { data: session } = useSession();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [panelOpen, setPanelOpen]         = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const initials = session?.user?.email
    ? session.user.email.slice(0, 2).toUpperCase()
    : "JN";

  // Load notifications and poll every 30 s
  useEffect(() => {
    const load = () => {
      fetchNotifications()
        .then(({ notifications: items, unread_count }) => {
          setNotifications(items);
          setUnreadCount(unread_count);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.read) {
      await markNotificationRead(n.id).catch(() => {});
      setNotifications(prev =>
        prev.map(x => x.id === n.id ? { ...x, read: true } : x)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (n.job_id) {
      setPanelOpen(false);
      router.push(`/jobs/${n.job_id}`);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead().catch(() => {});
    setNotifications(prev => prev.map(x => ({ ...x, read: true })));
    setUnreadCount(0);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-surface border-r border-border flex flex-col z-20 shadow-card">
      {/* Logo */}
      <div className="px-5 py-5 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-600 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight text-ink">JobNest</span>
          </div>
          <p className="text-xs text-ink-muted mt-1 ml-10.5 pl-0.5">Career Copilot</p>
        </div>

        {/* Bell button */}
        <button
          onClick={() => setPanelOpen(o => !o)}
          className="relative mt-1 w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-elevated transition-colors"
          aria-label="Notifications"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        <p className="text-[10px] font-semibold text-ink-disabled uppercase tracking-widest px-3 mb-2">Navigation</p>
        {links.map(({ href, label, icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-accent-50 text-accent-700 shadow-sm"
                  : "text-ink-secondary hover:text-ink hover:bg-elevated"
              }`}
            >
              <span className={isActive ? "text-accent-600" : "text-ink-muted"}>{icon}</span>
              {label}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-500" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-elevated transition-colors">
          <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-accent-700">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            {session?.user?.email && (
              <p className="text-xs text-ink-secondary truncate">{session.user.email}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-1 w-full text-left text-xs text-ink-muted hover:text-ink px-3 py-2 rounded-lg hover:bg-elevated transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Notification panel — slides out to the right of the sidebar */}
      {panelOpen && (
        <div
          ref={panelRef}
          className="absolute left-full top-0 h-screen w-80 bg-surface border-r border-border shadow-lg flex flex-col z-30"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
            <div>
              <p className="text-sm font-semibold text-ink">Notifications</p>
              {unreadCount > 0 && (
                <p className="text-[11px] text-ink-muted">{unreadCount} unread</p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-accent-600 hover:text-accent-700 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-muted">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <p className="text-sm text-ink-muted">No notifications yet.</p>
                <p className="text-xs text-ink-muted">The hunter will alert you here when it finds strong matches.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map(n => (
                  <li
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`px-4 py-3.5 cursor-pointer hover:bg-elevated transition-colors ${
                      !n.read ? "bg-accent-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Unread dot */}
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        !n.read ? "bg-accent-500" : "bg-transparent"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs leading-snug ${!n.read ? "font-semibold text-ink" : "text-ink-secondary"}`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <p className="text-[10px] text-ink-muted mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {n.job_id && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-muted shrink-0 mt-1">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
