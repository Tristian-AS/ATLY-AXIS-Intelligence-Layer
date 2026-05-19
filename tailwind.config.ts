import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ATLY cinematic palette — deep, filmic, restrained.
        ink: {
          950: "#07080A",
          900: "#0B0D10",
          850: "#0F1216",
          800: "#13171C",
          700: "#1A1F26",
          600: "#252B33",
          500: "#3A424C",
          400: "#5B6470",
          300: "#8A93A0",
          200: "#B8BFC9",
          100: "#E2E6EC",
        },
        signal: {
          DEFAULT: "#E8E2D4", // warm bone — ATLY's signature off-white
          dim: "#A89F8B",
          accent: "#C9A86A", // muted gold
        },
        flag: {
          danger: "#D45A52",
          warn: "#E6B854",
          ok: "#6FB58A",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica", "Arial"],
        display: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        film: "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 60px -20px rgba(0,0,0,0.8)",
      },
    },
  },
  plugins: [],
};

export default config;
