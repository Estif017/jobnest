"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRef } from "react";
import {
  fetchOnboardingData,
  saveOnboardingData,
  changePassword as apiChangePassword,
  uploadResume,
  fetchGitHub,
  fetchGitHubProfile,
  fetchResumeVersions,
  activateResumeVersion,
  OnboardingData,
  GitHubProfile,
  ResumeVersion,
} from "@/lib/api";

const INDUSTRIES  = ["Tech", "Finance", "Healthcare", "Marketing", "Design", "Data", "Security", "Other"];
const SENIORITY   = ["Internship", "Entry", "Junior", "Mid", "Senior", "Lead", "Manager"];
const EMP_TYPES   = ["Full-time", "Part-time", "Contract", "Freelance"];
const WORK_MODELS = ["Remote", "Hybrid", "On-site", "Flexible"];
const EXP_LEVELS  = ["0-1 years", "1-3 years", "3-5 years", "5-10 years", "10+ years"];
const CURRENCIES  = ["USD", "EUR", "GBP", "CAD", "Other"];

type SectionKey = "links" | "career" | "location" | "skills";

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
      style={
        active
          ? { background: "var(--accent)", border: "1px solid var(--accent)", color: "#050C10" }
          : { border: "1px solid var(--bg-border)", color: "var(--text-secondary)", background: "transparent" }
      }
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--bg-border)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
        }
      }}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  sectionKey,
  saving,
  saved,
  onSave,
  children,
}: {
  title: string;
  sectionKey: SectionKey;
  saving: SectionKey | null;
  saved: SectionKey | null;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-6 rounded-2xl space-y-4"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
    >
      <h2 className="font-semibold font-heading" style={{ color: "var(--text-primary)", fontSize: "16px" }}>{title}</h2>
      {children}
      <button
        onClick={onSave}
        disabled={saving === sectionKey}
        className="btn-primary text-xs py-1.5 px-4"
      >
        {saving === sectionKey ? "Saving…" : saved === sectionKey ? "Saved ✓" : "Save changes"}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const [data,    setData]    = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<SectionKey | null>(null);
  const [saved,   setSaved]   = useState<SectionKey | null>(null);
  const [error,   setError]   = useState("");

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew,     setPwNew]     = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg,     setPwMsg]     = useState("");

  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeMsg,       setResumeMsg]       = useState("");
  const [versions,        setVersions]        = useState<ResumeVersion[]>([]);
  const [activating,      setActivating]      = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [github,        setGithub]        = useState<GitHubProfile | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubMsg,     setGithubMsg]     = useState("");

  useEffect(() => {
    fetchOnboardingData()
      .then(setData)
      .catch(() => setError("Could not load profile data."))
      .finally(() => setLoading(false));
    fetchGitHub().then(setGithub).catch(() => {});
    fetchResumeVersions().then(setVersions).catch(() => {});
  }, []);

  const set = (key: keyof OnboardingData, val: unknown) =>
    setData((prev) => prev ? { ...prev, [key]: val } : prev);

  const toggleList = (key: keyof OnboardingData, val: string) => {
    if (!data) return;
    const cur = (data[key] as string[]) ?? [];
    set(key, cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]);
  };

  const saveSection = async (section: SectionKey, fields: Partial<OnboardingData>) => {
    setSaving(section);
    setError("");
    try {
      await saveOnboardingData(fields);
      setSaved(section);
      setTimeout(() => setSaved(null), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(null);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeUploading(true);
    setResumeMsg("");
    try {
      const result = await uploadResume(file);
      setResumeMsg(`Resume parsed — ${result.skills.length} skills extracted.`);
      fetchOnboardingData().then(setData).catch(() => {});
      fetchResumeVersions().then(setVersions).catch(() => {});
    } catch (err: unknown) {
      setResumeMsg(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setResumeUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSyncGitHub = async () => {
    if (!data?.github_username?.trim()) {
      setGithubMsg("Enter a GitHub username first.");
      return;
    }
    setGithubLoading(true);
    setGithubMsg("");
    try {
      const profile = await fetchGitHubProfile(data.github_username.trim());
      setGithub(profile);
      setGithubMsg("GitHub profile synced.");
    } catch (err: unknown) {
      setGithubMsg(err instanceof Error ? err.message : "Failed to fetch GitHub profile.");
    } finally {
      setGithubLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwNew || pwNew !== pwConfirm) {
      setPwMsg("New passwords do not match.");
      return;
    }
    setPwLoading(true);
    setPwMsg("");
    try {
      await apiChangePassword(pwCurrent, pwNew);
      setPwMsg("Password updated.");
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch (err: unknown) {
      setPwMsg(err instanceof Error ? err.message : "Error updating password.");
    } finally {
      setPwLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm" style={{ color: "var(--red)" }}>{error || "No profile data found."}</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isEmailProvider = (session?.user as any)?.provider === "email" || !(session?.user as any)?.provider;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight" style={{ color: "var(--text-primary)" }}>Profile</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Manage your career preferences and account settings.</p>
      </div>

      {error && (
        <p
          className="text-sm px-4 py-2.5 rounded-xl"
          style={{ color: "var(--red)", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)" }}
        >
          {error}
        </p>
      )}

      {/* Account */}
      <div className="p-6 rounded-2xl space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
        <h2 className="font-semibold font-heading" style={{ color: "var(--text-primary)", fontSize: "16px" }}>Account</h2>
        <div className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid var(--bg-border)" }}>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Email</span>
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>{session?.user?.email ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Sign-in method</span>
          <span
            className="text-xs px-2.5 py-0.5 rounded-full font-medium"
            style={
              isEmailProvider
                ? { background: "rgba(45,212,191,0.1)", color: "var(--accent)" }
                : { background: "rgba(52,211,153,0.1)", color: "var(--green)" }
            }
          >
            {isEmailProvider ? "Email" : "Google"}
          </span>
        </div>
        {data.name && (
          <div className="flex items-center justify-between py-1">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Name (from resume)</span>
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>{data.name}</span>
          </div>
        )}

        <div className="pt-2" style={{ borderTop: "1px solid var(--bg-border)" }}>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleResumeUpload} />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Resume</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>PDF · updates your skills and name</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={resumeUploading}
              className="text-xs py-1.5 px-3 rounded-lg transition-colors font-medium"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--bg-border)"}
            >
              {resumeUploading ? "Parsing…" : "Upload PDF"}
            </button>
          </div>
          {resumeMsg && (
            <p
              className="text-xs mt-2 px-3 py-1.5 rounded-lg"
              style={
                resumeMsg.includes("parsed")
                  ? { color: "var(--green)", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)" }
                  : { color: "var(--red)", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)" }
              }
            >
              {resumeMsg}
            </p>
          )}
        </div>
      </div>

      {/* Resume version history */}
      {versions.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
          <h2 className="text-sm font-semibold mb-3" style={{ fontSize: "16px", color: "var(--text-primary)" }}>Resume History</h2>
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "var(--bg-elevated)", border: `1px solid ${v.is_active ? "var(--accent)" : "var(--bg-border)"}` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>v{v.version}</span>
                    {v.is_active && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(45,212,191,0.15)", color: "var(--accent)" }}>Active</span>
                    )}
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {v.filename} · {v.skills_count} skills · {v.uploaded_at.slice(0, 10)}
                  </p>
                </div>
                {!v.is_active && (
                  <button
                    onClick={async () => {
                      setActivating(v.id);
                      try {
                        await activateResumeVersion(v.id);
                        setVersions((prev) => prev.map((r) => ({ ...r, is_active: r.id === v.id })));
                        fetchOnboardingData().then(setData).catch(() => {});
                      } catch { /* silent */ }
                      setActivating(null);
                    }}
                    disabled={activating === v.id}
                    className="text-xs px-2.5 py-1 rounded-lg shrink-0 transition-colors"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--bg-border)"}
                  >
                    {activating === v.id ? "Activating…" : "Activate"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume & Links */}
      <Section title="Resume & Links" sectionKey="links" saving={saving} saved={saved}
        onSave={() => saveSection("links", {
          github_username: data.github_username,
          linkedin_url:    data.linkedin_url,
          portfolio_url:   data.portfolio_url,
        })}>
        {[
          { label: "LinkedIn URL",  key: "linkedin_url"  as const, placeholder: "https://linkedin.com/in/..." },
          { label: "Portfolio URL", key: "portfolio_url" as const, placeholder: "https://yoursite.com" },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input
              type="text"
              value={data[key] as string}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              className="input mt-1"
            />
          </div>
        ))}

        <div>
          <label className="label">GitHub Username</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={data.github_username}
              onChange={(e) => set("github_username", e.target.value)}
              placeholder="octocat"
              className="input flex-1"
            />
            <button
              onClick={handleSyncGitHub}
              disabled={githubLoading}
              className="text-xs py-2 px-3 shrink-0 rounded-lg transition-colors font-medium"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--bg-border)"}
            >
              {githubLoading ? "Syncing…" : "Sync"}
            </button>
          </div>
          {githubMsg && (
            <p className="text-xs mt-1.5" style={{ color: githubMsg.includes("synced") ? "var(--green)" : "var(--red)" }}>
              {githubMsg}
            </p>
          )}
          {github && (
            <div
              className="mt-3 p-3 rounded-xl space-y-2.5"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>@{github.username}</p>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{github.repos.length} repos indexed</span>
              </div>
              {github.top_skills.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Top Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {github.top_skills.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.2)", color: "var(--accent)" }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {github.languages.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Languages</p>
                  <div className="flex flex-wrap gap-1">
                    {github.languages.map((l) => (
                      <span
                        key={l}
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Career Goals */}
      <Section title="Career Goals" sectionKey="career" saving={saving} saved={saved}
        onSave={() => saveSection("career", {
          target_role:       data.target_role,
          target_industries: data.target_industries,
          seniority_level:   data.seniority_level,
          employment_types:  data.employment_types,
          work_model:        data.work_model,
          alert_threshold:   data.alert_threshold,
        })}>
        <div>
          <label className="label flex items-center gap-2">
            Target Job Title
            {!data.target_role && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ color: "var(--yellow)", background: "rgba(251,191,36,0.1)" }}
              >
                Used by the AI hunter — fill this in
              </span>
            )}
          </label>
          <input
            type="text"
            value={data.target_role}
            onChange={(e) => set("target_role", e.target.value)}
            placeholder="e.g. Software Engineer"
            className="input mt-1"
          />
        </div>

        <div>
          <label className="label mb-2">Target Industries</label>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((ind) => (
              <PillButton key={ind} active={data.target_industries.includes(ind)} onClick={() => toggleList("target_industries", ind)}>
                {ind}
              </PillButton>
            ))}
          </div>
        </div>

        <div>
          <label className="label mb-2">Seniority Level</label>
          <div className="flex flex-wrap gap-2">
            {SENIORITY.map((s) => (
              <PillButton key={s} active={data.seniority_level === s} onClick={() => set("seniority_level", s)}>
                {s}
              </PillButton>
            ))}
          </div>
        </div>

        <div>
          <label className="label mb-2">Employment Type</label>
          <div className="flex flex-wrap gap-2">
            {EMP_TYPES.map((t) => (
              <PillButton key={t} active={data.employment_types.includes(t)} onClick={() => toggleList("employment_types", t)}>
                {t}
              </PillButton>
            ))}
          </div>
        </div>

        <div>
          <label className="label mb-2">Work Model</label>
          <div className="flex flex-wrap gap-2">
            {WORK_MODELS.map((m) => (
              <PillButton key={m} active={data.work_model === m} onClick={() => set("work_model", m)}>
                {m}
              </PillButton>
            ))}
          </div>
        </div>

        <div>
          <label className="label flex items-center justify-between">
            <span>Job Alert Threshold</span>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>{data.alert_threshold ?? 7}/10</span>
          </label>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            AI hunter only alerts you when a job scores at or above this fit score.
          </p>
          <input
            type="range"
            min={1} max={10} step={1}
            value={data.alert_threshold ?? 7}
            onChange={(e) => set("alert_threshold", Number(e.target.value))}
            className="w-full accent-teal-400"
          />
          <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            <span>1 — alert on everything</span>
            <span>10 — only perfect matches</span>
          </div>
        </div>
      </Section>

      {/* Location & Salary */}
      <Section title="Location & Salary" sectionKey="location" saving={saving} saved={saved}
        onSave={() => saveSection("location", {
          current_location:   data.current_location,
          open_to_relocation: data.open_to_relocation,
          salary_min:         data.salary_min,
          salary_max:         data.salary_max,
          salary_currency:    data.salary_currency,
        })}>
        <div>
          <label className="label">Current Location</label>
          <input
            type="text"
            value={data.current_location}
            onChange={(e) => set("current_location", e.target.value)}
            placeholder="e.g. New York, USA"
            className="input mt-1"
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Open to relocation</span>
          <button
            onClick={() => set("open_to_relocation", !data.open_to_relocation)}
            className="w-11 h-6 rounded-full transition-colors relative shrink-0"
            style={{ background: data.open_to_relocation ? "var(--accent)" : "var(--bg-border)" }}
          >
            <span
              className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform"
              style={{ transform: data.open_to_relocation ? "translateX(22px)" : "translateX(4px)" }}
            />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Salary Min</label>
            <input type="number" value={data.salary_min || ""} onChange={(e) => set("salary_min", Number(e.target.value))} placeholder="50000" className="input mt-1" />
          </div>
          <div>
            <label className="label">Salary Max</label>
            <input type="number" value={data.salary_max || ""} onChange={(e) => set("salary_max", Number(e.target.value))} placeholder="120000" className="input mt-1" />
          </div>
        </div>

        <div>
          <label className="label">Currency</label>
          <select value={data.salary_currency} onChange={(e) => set("salary_currency", e.target.value)} className="input mt-1">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </Section>

      {/* Skills & Experience */}
      <Section title="Skills & Experience" sectionKey="skills" saving={saving} saved={saved}
        onSave={() => saveSection("skills", {
          years_experience:  data.years_experience,
          top_skills_manual: data.top_skills_manual,
          certifications:    data.certifications,
        })}>
        <div>
          <label className="label">Years of Experience</label>
          <select value={data.years_experience} onChange={(e) => set("years_experience", e.target.value)} className="input mt-1">
            <option value="">Select…</option>
            {EXP_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="label">Top 3 Skills</label>
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              type="text"
              value={(data.top_skills_manual as string[])[i] ?? ""}
              onChange={(e) => {
                const updated = [...(data.top_skills_manual as string[])];
                updated[i] = e.target.value;
                set("top_skills_manual", updated);
              }}
              placeholder={`Skill ${i + 1}`}
              className="input"
            />
          ))}
        </div>

        <div>
          <label className="label">
            Certifications <span className="font-normal normal-case" style={{ color: "var(--text-muted)" }}>(optional)</span>
          </label>
          <textarea
            rows={3}
            value={data.certifications}
            onChange={(e) => set("certifications", e.target.value)}
            placeholder="e.g. AWS Certified Solutions Architect, Google Cloud Professional…"
            className="input mt-1 resize-none"
          />
        </div>

        {data.skills && data.skills.length > 0 && (
          <div>
            <label className="label mb-2">Skills from Resume</label>
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2.5 py-0.5 rounded-full"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Change Password */}
      {isEmailProvider && (
        <div className="p-6 rounded-2xl space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
          <h2 className="font-semibold font-heading" style={{ color: "var(--text-primary)", fontSize: "16px" }}>Change Password</h2>

          {pwMsg && (
            <p
              className="text-sm px-3 py-2 rounded-xl"
              style={
                pwMsg.toLowerCase().includes("updated")
                  ? { color: "var(--green)", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)" }
                  : { color: "var(--red)", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)" }
              }
            >
              {pwMsg}
            </p>
          )}

          {[
            { label: "Current Password", val: pwCurrent, set: setPwCurrent },
            { label: "New Password",     val: pwNew,     set: setPwNew },
            { label: "Confirm Password", val: pwConfirm, set: setPwConfirm },
          ].map(({ label, val, set: setter }) => (
            <div key={label}>
              <label className="label">{label}</label>
              <input
                type="password"
                value={val}
                onChange={(e) => setter(e.target.value)}
                placeholder="••••••••"
                className="input mt-1"
              />
            </div>
          ))}

          <button onClick={handleChangePassword} disabled={pwLoading} className="btn-primary text-xs py-1.5 px-4">
            {pwLoading ? "Updating…" : "Update Password"}
          </button>
        </div>
      )}
    </div>
  );
}
