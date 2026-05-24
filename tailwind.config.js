/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1D4ED8",
          dark: "#1E40AF",
          light: "#DBEAFE",
        },
        border: "#E5E7EB",
        error: "#DC2626",
        success: "#16A34A",
        muted: "#6B7280",
        background: "#F9FAFB",
      },
    },
  },
  plugins: [],
};
