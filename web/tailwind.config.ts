import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    borderRadius: {
      none: "0",
      DEFAULT: "2px",
      sm: "2px",
      md: "3px",
      full: "9999px",
    },
    extend: {
      colors: {
        paper: "#f4f6f9",
        card: "#ffffff",
        ink: "#0f172a",
        mute: "#475569",
        line: "#cbd5e1",
        accent: { DEFAULT: "#b93800", dark: "#9a2e00" },
        ok: "#14532d",
        warn: "#78350f",
        bad: "#7f1d1d",
        stage: "#111318",
      },
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          "Pretendard",
          "-apple-system",
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          "sans-serif",
        ],
        mono: ['"SF Mono"', "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
