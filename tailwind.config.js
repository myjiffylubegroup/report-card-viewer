/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'jl-red': '#e31837',
        'jl-red-dark': '#b71c1c',
      }
    },
  },
  plugins: [],
}
