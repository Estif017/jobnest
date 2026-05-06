"use client";

interface Props {
  password: string;
}

interface Criterion {
  label: string;
  met: boolean;
}

function getLevel(score: number): { bars: number; label: string; barClass: string; labelClass: string } {
  if (score < 3) return { bars: 1, label: "Weak",        barClass: "bg-red-500",    labelClass: "text-red-400"    };
  if (score === 3) return { bars: 2, label: "Fair",       barClass: "bg-orange-400", labelClass: "text-orange-400" };
  if (score === 4) return { bars: 3, label: "Strong",     barClass: "bg-blue-500",   labelClass: "text-blue-400"   };
  return            { bars: 4, label: "Very Strong", barClass: "bg-emerald-500", labelClass: "text-emerald-400" };
}

export default function PasswordStrengthMeter({ password }: Props) {
  if (!password) return null;

  const criteria: Criterion[] = [
    { label: "8+ characters",      met: password.length >= 8 },
    { label: "Uppercase letter",   met: /[A-Z]/.test(password) },
    { label: "Lowercase letter",   met: /[a-z]/.test(password) },
    { label: "Number",             met: /[0-9]/.test(password) },
    { label: "Special character",  met: /[!@#$%^&*()\-_=+\[\]{}|;:',.<>?/`~"\\]/.test(password) },
  ];

  const score = criteria.filter((c) => c.met).length;
  const { bars, label, barClass, labelClass } = getLevel(score);

  return (
    <div className="space-y-2 mt-1">
      {/* Bars */}
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= bars ? barClass : "bg-[#1e2640]"
            }`}
          />
        ))}
        <span className={`text-xs font-medium ml-1 w-20 text-right ${labelClass}`}>
          {label}
        </span>
      </div>

      {/* Criteria checklist */}
      <ul className="space-y-0.5">
        {criteria.map((c) => (
          <li
            key={c.label}
            className={`flex items-center gap-1.5 text-xs transition-colors duration-200 ${
              c.met ? "text-emerald-400" : "text-[#475569]"
            }`}
          >
            <span className="w-3 text-center">{c.met ? "✓" : "·"}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
