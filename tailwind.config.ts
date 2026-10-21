import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/client/**/*.{ts,tsx,html}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: { sans: ["Plus Jakarta Sans", ...fontFamily.sans] },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Themed: see --felt / --felt-light in index.css.
        felt: { DEFAULT: "rgb(var(--felt) / <alpha-value>)", dark: "#08382a", light: "rgb(var(--felt-light) / <alpha-value>)" },
        gold: { DEFAULT: "#f5b83d", light: "#f7c45a", dark: "#eba52a" },
      },
      boxShadow: {
        card: "0 1px 1px rgba(0,0,0,.25), 0 3px 8px rgba(0,0,0,.28)",
        lift: "0 10px 24px rgba(0,0,0,.45), 0 2px 4px rgba(0,0,0,.3)",
        panel: "0 20px 50px -20px rgba(0,0,0,.7)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "card-in": {
          from: { opacity: "0", transform: "translateY(28px) scale(.92)" },
          to: { opacity: "1", transform: "none" },
        },
        "card-drop": {
          from: { opacity: "0", transform: "translateY(-26px) rotate(-10deg) scale(1.06)" },
          to: { opacity: "1", transform: "none" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--ring) / 0.45)" },
          "70%": { boxShadow: "0 0 0 8px hsl(var(--ring) / 0)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--ring) / 0)" },
        },
        "rotate-hint": {
          "0%, 20%": { transform: "rotate(0deg)" },
          "50%, 80%": { transform: "rotate(-90deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
        "card-in": "card-in .38s cubic-bezier(.2,.8,.2,1) both",
        "card-drop": "card-drop .32s cubic-bezier(.2,.8,.2,1) both",
        "rotate-hint": "rotate-hint 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
