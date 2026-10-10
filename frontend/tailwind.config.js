/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        xs: "0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)",
        sm: "0 2px 6px -1px rgba(15, 23, 42, 0.07), 0 1px 3px -1px rgba(15, 23, 42, 0.05)",
        DEFAULT: "0 3px 10px -2px rgba(15, 23, 42, 0.08), 0 1px 4px -1px rgba(15, 23, 42, 0.06)",
        md: "0 6px 16px -2px rgba(15, 23, 42, 0.09), 0 2px 6px -2px rgba(15, 23, 42, 0.05)",
        lg: "0 10px 24px -3px rgba(15, 23, 42, 0.1), 0 4px 8px -4px rgba(15, 23, 42, 0.05)",
        xl: "0 20px 32px -4px rgba(15, 23, 42, 0.12), 0 8px 12px -4px rgba(15, 23, 42, 0.06)",
        card: "0 2px 8px 0 rgba(15, 23, 42, 0.06), 0 1px 3px 0 rgba(15, 23, 42, 0.04)",
        "card-hover": "0 6px 20px -2px rgba(15, 23, 42, 0.1), 0 2px 6px -1px rgba(15, 23, 42, 0.05)",
      },
      colors: {
        primary: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e", // Restrained teal primary token
          800: "#115e59",
          900: "#134e4a",
        },
        brand: {
          50: "#f0fdfa",
          100: "#ccfbf1",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        alert: {
          critical: "#dc2626",
          warning: "#d97706",
          success: "#15803d",
        },
      },
    },
  },
  plugins: [],
};
