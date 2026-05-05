"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  fetchOnboardingData,
  saveOnboardingData,
  OnboardingData,
} from "@/lib/api";

const INDUSTRIES  = ["Tech", "Finance", "Healthcare", "Marketing", "Design", "Data", "Security", "Other"];
const SENIORITY   = ["Internship", "Entry", "Junior", "Mid", "Senior", "Lead", "Manager"];
const EMP_TYPES   = ["Full-time", "Part-time", "Contract", "Freelance"];
const WORK_MODELS = ["Remote", "Hybrid", "On-site", "Flexible"];
const EXP_LEVELS  = ["0-1 years", "1-3 years", "3-5 years", "5-10 years", "10+ years"];
const CURRENCIES  = ["USD", "EUR", "GBP", "CAD", "Other"];

type SectionKey = "links" | "career" | "location" | "skills";

export default function ProfilePage() {
  const { data: session } = useSession();
  const [data,    setData]    = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<SectionKey | null>(null);
  const [saved,   setSaved]   = useState<SectionKey | null>(null);
  const [error,   setError]   = useState("");

  // Password change state
  const [pwCurrent,  setPwCurrent]  = useState("");
  const [pwNew,      setPwNew]      = useState("");
  const [pwConfirm,  setPwConfirm]  = useState("");
  const [pwLoading,  setPwLoading]  = useState(false);
  const [pwMsg,      setPwMsg]      = useState("");

  useEffect(() => {
    fetchOnboardingData()
      .then(setData)
      .catch(() => setError("Could not load profile data."))
      .finally(() => setLoading(false));
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

  const handleChangePassword = async () => {
    if (!pwNew || pwNew !== pwConfirm) {
      setPwMsg("New passwords do not match.");
      return;
    }
    setPwLoading(true);
    setPwMsg("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/auth/change-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: Number(session?.user?.userId ?? 1),
            current: pwCurrent,
            new_password: pwNew,
          }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Failed");
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
        <p className="text-[#525252] text-sm">Loading profile...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400 text-sm">{error || "No profile data found."}</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isEmailProvider = (session?.user as any)?.provider === "email" || !(session?.user as any)?.provider;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <h1 className="text-white font-bold text-2xl">Your Profile</h1>

      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Account section */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6 space-y-3">
        <h2 className="text-white font-semibold text-base">Account</h2>
        <div className="flex items-center justify-between">
          <span className="text-[#a3a3a3] text-sm">Email</span>
          <span className="text-white text-sm">{session?.user?.email ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#a3a3a3] text-sm">Sign-in method</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isEmailProvider
              ? "bg-blue-900/40 text-blue-300 border border-blue-800"
              : "bg-green-900/40 text-green-300 border border-green-800"
          }`}>
            {isEmailProvider ? "Email" : "Google"}
          </span>
        </div>
        {data.name && (
          <div className="flex items-center justify-between">
            <span className="text-[#a3a3a3] text-sm">Name (from resume)</span>
            <span className="text-white text-sm">{data.name}</span>
          </div>
        )}
      </div>

      {/* Resume & Links */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6 space-y-4">
        <h2 className="text-white font-semibold text-base">Resume & Links</h2>
        {[
          { label: "GitHub Username", key: "github_username" as const, placeholder: "octocat" },
          { label: "LinkedIn URL",    key: "linkedin_url"    as const, placeholder: "https://linkedin.com/in/..." },
          { label: "Portfolio URL",   key: "portfolio_url"   as const, placeholder: "https://yoursite.com" },
        ].map(({ label, key, placeholder }) => (
          <div key={key} className="space-y-1">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">{label}</label>
            <input
              type="text"
              value={data[key] as string}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
            />
          </div>
        ))}
        <button
          onClick={() => saveSection("links", {
            github_username: data.github_username,
            linkedin_url:    data.linkedin_url,
            portfolio_url:   data.portfolio_url,
          })}
          disabled={saving === "links"}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          {saving === "links" ? "Saving..." : saved === "links" ? "Saved!" : "Save changes"}
        </button>
      </div>

      {/* Career Goals */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6 space-y-4">
        <h2 className="text-white font-semibold text-base">Career Goals</h2>

        <div className="space-y-1">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Target Job Title</label>
          <input
            type="text"
            value={data.target_role}
            onChange={(e) => set("target_role", e.target.value)}
            placeholder="e.g. Software Engineer"
            className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Target Industries</label>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((ind) => (
              <button
                key={ind}
                onClick={() => toggleList("target_industries", ind)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  data.target_industries.includes(ind)
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-[#2a2a2a] text-[#a3a3a3] hover:border-blue-500 hover:text-white"
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Seniority Level</label>
          <div className="flex flex-wrap gap-2">
            {SENIORITY.map((s) => (
              <button
                key={s}
                onClick={() => set("seniority_level", s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  data.seniority_level === s
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-[#2a2a2a] text-[#a3a3a3] hover:border-blue-500 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Employment Type</label>
          <div className="flex flex-wrap gap-2">
            {EMP_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => toggleList("employment_types", t)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  data.employment_types.includes(t)
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-[#2a2a2a] text-[#a3a3a3] hover:border-blue-500 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Work Model</label>
          <div className="flex flex-wrap gap-2">
            {WORK_MODELS.map((m) => (
              <button
                key={m}
                onClick={() => set("work_model", m)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  data.work_model === m
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-[#2a2a2a] text-[#a3a3a3] hover:border-blue-500 hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => saveSection("career", {
            target_role:       data.target_role,
            target_industries: data.target_industries,
            seniority_level:   data.seniority_level,
            employment_types:  data.employment_types,
            work_model:        data.work_model,
          })}
          disabled={saving === "career"}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          {saving === "career" ? "Saving..." : saved === "career" ? "Saved!" : "Save changes"}
        </button>
      </div>

      {/* Location & Salary */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6 space-y-4">
        <h2 className="text-white font-semibold text-base">Location & Salary</h2>

        <div className="space-y-1">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Current Location</label>
          <input
            type="text"
            value={data.current_location}
            onChange={(e) => set("current_location", e.target.value)}
            placeholder="e.g. New York, USA"
            className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[#a3a3a3] text-sm">Open to relocation</span>
          <button
            onClick={() => set("open_to_relocation", !data.open_to_relocation)}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              data.open_to_relocation ? "bg-blue-600" : "bg-[#2a2a2a]"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                data.open_to_relocation ? "translate-x-7" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Salary Min</label>
            <input
              type="number"
              value={data.salary_min || ""}
              onChange={(e) => set("salary_min", Number(e.target.value))}
              placeholder="50000"
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Salary Max</label>
            <input
              type="number"
              value={data.salary_max || ""}
              onChange={(e) => set("salary_max", Number(e.target.value))}
              placeholder="120000"
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Currency</label>
          <select
            value={data.salary_currency}
            onChange={(e) => set("salary_currency", e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <button
          onClick={() => saveSection("location", {
            current_location:   data.current_location,
            open_to_relocation: data.open_to_relocation,
            salary_min:         data.salary_min,
            salary_max:         data.salary_max,
            salary_currency:    data.salary_currency,
          })}
          disabled={saving === "location"}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          {saving === "location" ? "Saving..." : saved === "location" ? "Saved!" : "Save changes"}
        </button>
      </div>

      {/* Skills & Experience */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6 space-y-4">
        <h2 className="text-white font-semibold text-base">Skills & Experience</h2>

        <div className="space-y-1">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Years of Experience</label>
          <select
            value={data.years_experience}
            onChange={(e) => set("years_experience", e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
          >
            <option value="">Select...</option>
            {EXP_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Top 3 Skills</label>
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
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
            />
          ))}
        </div>

        <div className="space-y-1">
          <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">
            Certifications <span className="normal-case text-[#525252]">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={data.certifications}
            onChange={(e) => set("certifications", e.target.value)}
            placeholder="e.g. AWS Certified Solutions Architect, Google Cloud Professional..."
            className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {data.skills && data.skills.length > 0 && (
          <div className="space-y-2">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Skills from Resume</label>
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((s) => (
                <span key={s} className="text-xs px-2 py-1 bg-[#1f1f1f] text-[#a3a3a3] rounded">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => saveSection("skills", {
            years_experience:  data.years_experience,
            top_skills_manual: data.top_skills_manual,
            certifications:    data.certifications,
          })}
          disabled={saving === "skills"}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          {saving === "skills" ? "Saving..." : saved === "skills" ? "Saved!" : "Save changes"}
        </button>
      </div>

      {/* Change Password — email users only */}
      {isEmailProvider && (
        <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6 space-y-4">
          <h2 className="text-white font-semibold text-base">Change Password</h2>

          {pwMsg && (
            <p className={`text-sm px-3 py-2 rounded border ${
              pwMsg.toLowerCase().includes("updated")
                ? "text-green-400 bg-green-900/20 border-green-900/40"
                : "text-red-400 bg-red-900/20 border-red-900/40"
            }`}>
              {pwMsg}
            </p>
          )}

          <div className="space-y-1">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Current Password</label>
            <input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">New Password</label>
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Confirm New Password</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={pwLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
          >
            {pwLoading ? "Updating..." : "Update Password"}
          </button>
        </div>
      )}
    </div>
  );
}
