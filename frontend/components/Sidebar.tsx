"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  fetchCoachSessions,
  AppNotification,
  ChatSession,
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

const AUTH_PATHS = new Set([
  "/login", "/signup",
  "/auth/verify-email-sent", "/auth/verify-email",
  "/auth/forgot-password", "/auth/reset-password",
]);

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { data: session } = useSession();
  const { theme, toggle: toggleTheme } = useTheme();

  const userId   = session?.user?.userId;
  const isAuth   = AUTH_PATHS.has(pathname);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [panelOpen, setPanelOpen]         = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);

  const loadSessions = useCallback(() => {
    if (!userId || isAuth) return;
    fetchCoachSessions().then(setChatSessions).catch(() => {});
  }, [userId, isAuth]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Poll notifications only when authenticated and not on auth pages
  useEffect(() => {
    if (!userId || isAuth) return;
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
  }, [userId, isAuth]);

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

  // Don't render on auth pages — MUST be after all hooks
  if (isAuth) return null;

  const initials = session?.user?.email
    ? session.user.email.slice(0, 2).toUpperCase()
    : "JN";

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

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile backdrop — dims main content when sidebar is open */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Hamburger button — only visible on mobile when sidebar is closed */}
      <button
        className="fixed top-3.5 left-3.5 z-40 md:hidden w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-60 flex flex-col z-30 transition-transform duration-300 ease-in-out md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--bg-border)" }}
      >
        {/* Logo + close button (close only visible on mobile) */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--accent)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#050C10" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div>
              <span className="font-bold text-base tracking-tight font-heading" style={{ color: "var(--text-primary)" }}>JobNest</span>
              <p className="text-[11px] leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>Career Copilot</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Bell */}
            <button
              onClick={() => setPanelOpen(o => !o)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ""; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
              aria-label="Notifications"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Close button — mobile only */}
            <button
              onClick={closeMobile}
              className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ""; }}
              aria-label="Close menu"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 overflow-y-auto">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Menu
          </p>
          <div className="space-y-0.5">
            {links.map(({ href, label, icon }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
              const isCoach  = href === "/coach";

              return (
                <div key={href}>
                  <div
                    className="flex items-center gap-1 rounded-lg overflow-hidden"
                    style={isActive ? {
                      background: "var(--accent-glow)",
                      borderLeft: "3px solid var(--accent)",
                    } : { borderLeft: "3px solid transparent" }}
                  >
                    <Link
                      href={href}
                      onClick={closeMobile}
                      className="flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors"
                      style={{ color: isActive ? "var(--accent)" : "var(--text-secondary)" }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = ""; }}
                    >
                      <span style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}>{icon}</span>
                      {label}
                    </Link>

                    {isCoach && (
                      <button
                        onClick={() => { router.push(`/coach?session=${crypto.randomUUID()}`); closeMobile(); }}
                        title="New chat"
                        className="mr-2 w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-glow)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12h14"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {isCoach && chatSessions.length > 0 && (
                    <div className="ml-5 mt-0.5 mb-1 space-y-0.5 pl-3" style={{ borderLeft: "1px solid var(--bg-border)" }}>
                      {chatSessions.slice(0, 6).map((s) => {
                        const sessionActive = pathname.startsWith("/coach") &&
                          (typeof window !== "undefined"
                            ? new URLSearchParams(window.location.search).get("session") === s.session_id
                            : false);
                        return (
                          <Link
                            key={s.session_id}
                            href={`/coach?session=${s.session_id}`}
                            onClick={closeMobile}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors truncate"
                            style={{
                              color: sessionActive ? "var(--accent)" : "var(--text-muted)",
                              background: sessionActive ? "var(--accent-glow)" : "transparent",
                            }}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            <span className="truncate">{s.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* User footer */}
        <div className="px-3 py-4" style={{ borderTop: "1px solid var(--bg-border)" }}>
          <div
            className="flex items-center gap-3 px-2 py-2 rounded-lg transition-colors cursor-default"
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
              style={{ background: "var(--accent-glow)", color: "var(--accent)", border: "1px solid rgba(45,212,191,0.3)" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              {session?.user?.email && (
                <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{session.user.email}</p>
              )}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex-1 text-left text-xs px-3 py-2 rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}
            >
              Sign out
            </button>
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.background = ""; }}
            >
              {theme === "dark" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Notification panel — fixed so it stays on screen regardless of sidebar translation */}
      {panelOpen && (
        <div
          ref={panelRef}
          className="fixed top-0 left-0 md:left-60 h-screen w-full sm:w-80 flex flex-col z-50"
          style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--bg-border)", boxShadow: "4px 0 24px rgba(0,0,0,0.4)" }}
        >
          <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--bg-border)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Notifications</p>
              {unreadCount > 0 && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{unreadCount} unread</p>}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium transition-colors"
                  style={{ color: "var(--accent)" }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setPanelOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                aria-label="Close notifications"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--text-muted)" }}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>No notifications yet. The AI hunter will alert you when it finds strong matches.</p>
              </div>
            ) : (
              <ul>
                {notifications.map(n => (
                  <li
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className="px-4 py-3.5 cursor-pointer transition-colors"
                    style={{ borderBottom: "1px solid var(--bg-border)", background: !n.read ? "var(--accent-glow)" : "transparent" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLLIElement).style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLLIElement).style.background = !n.read ? "var(--accent-glow)" : "transparent"; }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: !n.read ? "var(--accent)" : "transparent" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-snug" style={{ color: "var(--text-primary)", fontWeight: !n.read ? 600 : 400 }}>{n.title}</p>
                        {n.body && <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>{n.body}</p>}
                        <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
