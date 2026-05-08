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
  OnboardingData,
  GitHubProfile,
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
      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
        active
          ? "bg-accent-600 border-accent-600 text-white"
          : "border-border text-ink-secondary hover:border-accent-300 hover:text-accent-700 hover:bg-accent-50"
      }`}
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
    <div className="card p-6 space-y-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
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
      // Refresh onboarding data so the skills panel updates
      fetchOnboardingData().then(setData).catch(() => {});
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
        <div className="w-5 h-5 border-2 border-border border-t-accent-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-rose-600 text-sm">{error || "No profile data found."}</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isEmailProvider = (session?.user as any)?.provider === "email" || !(session?.user as any)?.provider;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink tracking-tight">Profile</h1>
        <p className="text-sm text-ink-secondary mt-0.5">Manage your career preferences and account settings.</p>
      </div>

      {error && (
        <p className="text-rose-600 text-sm bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5">{error}</p>
      )}

      {/* Account */}
      <div className="card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Account</h2>
        <div className="flex items-center justify-between py-1 border-b border-border">
          <span className="text-xs text-ink-muted">Email</span>
          <span className="text-sm text-ink">{session?.user?.email ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-ink-muted">Sign-in method</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
            isEmailProvider
              ? "bg-accent-50 text-accent-700"
              : "bg-emerald-50 text-emerald-700"
          }`}>
            {isEmailProvider ? "Email" : "Google"}
          </span>
        </div>
        {data.name && (
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-ink-muted">Name (from resume)</span>
            <span className="text-sm text-ink">{data.name}</span>
          </div>
        )}

        <div className="pt-2 border-t border-border">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleResumeUpload}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-ink">Resume</p>
              <p className="text-xs text-ink-muted mt-0.5">PDF · updates your skills and name</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={resumeUploading}
              className="btn-ghost text-xs py-1.5 px-3"
            >
              {resumeUploading ? "Parsing…" : "Upload PDF"}
            </button>
          </div>
          {resumeMsg && (
            <p className={`text-xs mt-2 px-3 py-1.5 rounded-lg border ${
              resumeMsg.includes("parsed")
                ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                : "text-rose-600 bg-rose-50 border-rose-100"
            }`}>{resumeMsg}</p>
          )}
        </div>
      </div>

      {/* Resume & Links */}
      <Section title="Resume & Links" sectionKey="links" saving={saving} saved={saved}
        onSave={() => saveSection("links", {
          github_username: data.github_username,
          linkedin_url:    data.linkedin_url,
          portfolio_url:   data.portfolio_url,
        })}>
        {[
          { label: "LinkedIn URL",    key: "linkedin_url"    as const, placeholder: "https://linkedin.com/in/..." },
          { label: "Portfolio URL",   key: "portfolio_url"   as const, placeholder: "https://yoursite.com" },
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
              className="btn-ghost text-xs py-2 px-3 shrink-0"
            >
              {githubLoading ? "Syncing…" : "Sync"}
            </button>
          </div>
          {githubMsg && (
            <p className={`text-xs mt-1.5 ${githubMsg.includes("synced") ? "text-emerald-600" : "text-rose-500"}`}>
              {githubMsg}
            </p>
          )}
          {github && (
            <div className="mt-3 p-3 rounded-xl bg-elevated border border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink">@{github.username}</p>
                <span className="text-[10px] text-ink-muted">{github.repos.length} repos indexed</span>
              </div>
              {github.top_skills.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1.5">Top Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {github.top_skills.map((s) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 bg-ai-50 border border-ai-100 text-ai-700 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {github.languages.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1.5">Languages</p>
                  <div className="flex flex-wrap gap-1">
                    {github.languages.map((l) => (
                      <span key={l} className="text-[10px] px-2 py-0.5 bg-elevated border border-border text-ink-secondary rounded-full">{l}</span>
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
              <span className="text-amber-600 text-[10px] font-medium bg-amber-50 px-1.5 py-0.5 rounded-full">
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
            <span className="text-accent-600 font-semibold">{data.alert_threshold ?? 7}/10</span>
          </label>
          <p className="text-xs text-ink-muted mb-2">
            AI hunter only alerts you when a job scores at or above this fit score.
          </p>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={data.alert_threshold ?? 7}
            onChange={(e) => set("alert_threshold", Number(e.target.value))}
            className="w-full accent-accent-600"
          />
          <div className="flex justify-between text-[10px] text-ink-muted mt-1">
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
          <span className="text-sm text-ink-secondary">Open to relocation</span>
          <button
            onClick={() => set("open_to_relocation", !data.open_to_relocation)}
            className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
              data.open_to_relocation ? "bg-accent-600" : "bg-border"
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
              data.open_to_relocation ? "translate-x-6" : "translate-x-1"
            }`} />
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
            Certifications <span className="text-ink-muted font-normal normal-case">(optional)</span>
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
                <span key={s} className="text-xs px-2.5 py-0.5 bg-elevated border border-border text-ink-secondary rounded-full">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Change Password */}
      {isEmailProvider && (
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink">Change Password</h2>

          {pwMsg && (
            <p className={`text-sm px-3 py-2 rounded-xl border ${
              pwMsg.toLowerCase().includes("updated")
                ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                : "text-rose-600 bg-rose-50 border-rose-100"
            }`}>
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

          <button
            onClick={handleChangePassword}
            disabled={pwLoading}
            className="btn-primary text-xs py-1.5 px-4"
          >
            {pwLoading ? "Updating…" : "Update Password"}
          </button>
        </div>
      )}
    </div>
  );
}
