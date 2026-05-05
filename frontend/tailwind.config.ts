import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base surfaces
        base: "#F8FAFB",
        surface: "#FFFFFF",
        elevated: "#F1F5F9",

        // Primary accent — teal
        accent: {
          DEFAULT: "#0D9488",
          50:  "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
        },

        // AI / coach secondary accent — indigo
        ai: {
          DEFAULT: "#6366F1",
          50:  "#EEF2FF",
          100: "#E0E7FF",
          500: "#6366F1",
          600: "#4F46E5",
        },

        // Semantic borders
        border: {
          DEFAULT: "#E2E8F0",
          subtle: "#F1F5F9",
        },

        // Text scale
        ink: {
          DEFAULT: "#0F172A",
          secondary: "#475569",
          muted: "#94A3B8",
          disabled: "#CBD5E1",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card:  "0 1px 4px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
        md:    "0 4px 16px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.04)",
        lg:    "0 8px 32px rgba(15,23,42,0.10), 0 4px 10px rgba(15,23,42,0.04)",
        focus: "0 0 0 3px rgba(13,148,136,0.20)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
