import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark navy base surfaces
        base:    "#0A0E1A",
        surface: "#111827",
        elevated:"#1A2235",

        // Primary accent — teal
        accent: {
          DEFAULT: "#2DD4BF",
          50:  "#0C1F28",
          100: "#0F2A35",
          200: "#1E3D3A",
          400: "#2DD4BF",
          500: "#2DD4BF",
          600: "#2DD4BF",
          700: "#0F766E",
        },

        // AI / coach secondary accent — indigo
        ai: {
          DEFAULT: "#818CF8",
          50:  "#1A1B3D",
          100: "#1E1F45",
          500: "#818CF8",
          600: "#6366F1",
        },

        // Semantic borders
        border: {
          DEFAULT: "#1E2D45",
          subtle: "#111827",
        },

        // Text scale — inverted for dark bg
        ink: {
          DEFAULT:   "#F1F5F9",
          secondary: "#94A3B8",
          muted:     "#475569",
          disabled:  "#334155",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card:  "0 1px 4px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        md:    "0 4px 16px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)",
        lg:    "0 8px 32px rgba(0,0,0,0.6), 0 4px 10px rgba(0,0,0,0.3)",
        focus: "0 0 0 3px rgba(45,212,191,0.20)",
        glow:  "0 4px 20px rgba(45,212,191,0.18)",
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-space)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
