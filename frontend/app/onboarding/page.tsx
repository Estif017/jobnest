"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  uploadResume,
  saveOnboardingData,
  markOnboardingComplete,
  OnboardingData,
} from "@/lib/api";

const INDUSTRIES = ["Tech", "Finance", "Healthcare", "Marketing", "Design", "Data", "Security", "Other"];
const SENIORITY  = ["Internship", "Entry", "Junior", "Mid", "Senior", "Lead", "Manager"];
const EMP_TYPES  = ["Full-time", "Part-time", "Contract", "Freelance"];
const WORK_MODELS = ["Remote", "Hybrid", "On-site", "Flexible"];
const EXP_LEVELS = ["0-1 years", "1-3 years", "3-5 years", "5-10 years", "10+ years"];
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "Other"];

const EMPTY: OnboardingData = {
  target_role: "", target_industries: [], seniority_level: "",
  employment_types: [], work_model: "", current_location: "",
  open_to_relocation: false, salary_min: 0, salary_max: 0,
  salary_currency: "USD", years_experience: "", top_skills_manual: ["", "", ""],
  certifications: "", linkedin_url: "", portfolio_url: "", github_username: "",
};

export default function OnboardingPage() {
  const router           = useRouter();
  const { data: session, update } = useSession();
  const [step,    setStep]    = useState(1);
  const [data,    setData]    = useState<OnboardingData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [resumeMsg, setResumeMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const userId = session?.user?.userId ?? "1";

  const set = (key: keyof OnboardingData, val: unknown) =>
    setData((prev) => ({ ...prev, [key]: val }));

  const toggleList = (key: keyof OnboardingData, val: string) => {
    const cur = (data[key] as string[]) ?? [];
    set(key, cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]);
  };

  const handleResumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await uploadResume(file);
      setResumeMsg(`Parsed: ${result.name} — ${result.skills.length} skills found`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Resume upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    setLoading(true);
    setError("");
    try {
      await saveOnboardingData(data);
      await markOnboardingComplete(userId);
      await update({ onboarding_complete: true });
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const next = () => { if (step < 4) setStep(step + 1); else finish(); };
  const skip = () => { if (step < 4) setStep(step + 1); else finish(); };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-white font-bold text-3xl tracking-tight">JobNest</span>
          <p className="text-[#525252] text-sm mt-2">Set up your profile — takes about 2 minutes</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-blue-500" : "bg-[#1f1f1f]"
              }`}
            />
          ))}
        </div>

        <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-8 space-y-6">
          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Step 1: Resume & Links */}
          {step === 1 && (
            <>
              <h2 className="text-white font-semibold text-lg">Resume & Links</h2>

              <div className="space-y-2">
                <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Resume (PDF)</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="w-full bg-[#0a0a0a] border border-dashed border-[#2a2a2a] hover:border-blue-500 text-[#525252] hover:text-white text-sm rounded-lg px-4 py-6 cursor-pointer text-center transition-colors"
                >
                  {resumeMsg || "Click to upload PDF"}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleResumeChange}
                  className="hidden"
                />
              </div>

              {[
                { label: "GitHub Username", key: "github_username" as const, placeholder: "e.g. octocat" },
                { label: "LinkedIn URL", key: "linkedin_url" as const, placeholder: "https://linkedin.com/in/..." },
                { label: "Portfolio URL", key: "portfolio_url" as const, placeholder: "https://yoursite.com" },
              ].map(({ label, key, placeholder }) => (
                <div key={key} className="space-y-1">
                  <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">
                    {label} <span className="normal-case text-[#525252]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={data[key] as string}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </>
          )}

          {/* Step 2: Career Goals */}
          {step === 2 && (
            <>
              <h2 className="text-white font-semibold text-lg">Career Goals</h2>

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

              <div className="space-y-1">
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

              <div className="space-y-1">
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
            </>
          )}

          {/* Step 3: Location & Salary */}
          {step === 3 && (
            <>
              <h2 className="text-white font-semibold text-lg">Location & Salary</h2>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </>
          )}

          {/* Step 4: Skills & Experience */}
          {step === 4 && (
            <>
              <h2 className="text-white font-semibold text-lg">Skills & Experience</h2>

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
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="text-sm text-[#a3a3a3] hover:text-white transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-4">
              {step > 1 && (
                <button
                  onClick={skip}
                  disabled={loading}
                  className="text-sm text-[#525252] hover:text-[#a3a3a3] transition-colors"
                >
                  {step === 4 ? "Skip & Finish" : "Skip"}
                </button>
              )}
              <button
                onClick={next}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-6 py-2.5 rounded transition-colors"
              >
                {loading ? "Saving..." : step === 4 ? "Save & Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#525252] mt-4">
          Step {step} of 4 — You can update this anytime from your Profile
        </p>
      </div>
    </div>
  );
}
