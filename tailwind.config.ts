import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";

// Tailwind CSS v4: Theme configuration is now done in CSS using @theme directive
// See app/globals.css for theme configuration
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
  plugins: [
    animate,
    plugin(function ({ addUtilities }) {
      addUtilities({
        ".line-clamp-2": {
          display: "-webkit-box",
          overflow: "hidden",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: "2",
        },
      });
    }),
  ],
};

export default config;
